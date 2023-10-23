/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */

import { SfDate } from 'jsforce';
import { Connection } from '@salesforce/core';
import {
  TestItem,
  TestResult,
  TestRunIdResult,
  TestService,
} from '@salesforce/apex-node';
import { ResultCollector } from '../collector/ResultCollector';
import { TestMethodCollector } from '../collector/TestMethodCollector';
import { Logger } from '../log/Logger';
import { ApexTestResult, BaseTestResult } from '../model/ApexTestResult';
import { QueryOptions } from '../query/QueryHelper';
import {
  OutputGenerator,
  TestRerun,
  TestRunSummary,
} from '../results/OutputGenerator';
import { TestRunnerOptions } from '../runner/TestOptions';
import { TestRunner } from '../runner/TestRunner';
import { formatTestName, getTestName } from '../results/TestResultUtils';
import { TestResultStore } from '../results/TestResultStore';
import { retry } from '../runner/Poll';

/**
 * Parallel unit test runner that can hide intermitant failures caused by UNABLE_TO_LOCK_ROW, deadlock errors and
 * missing test results.
 *
 * The stratagy here is to run a pre-defined set of tests and then selectively re-run tests to determine
 * if a failure is genuine. Failures due to UNABLE_TO_LOCK_ROW/deadlock are always re-run, other failures will be
 * re-run if there are less than a limit to avoid lots of failures causing long run times.
 *
 * The test runs are executed using a TestRunner which provides the ability to cancel & restart and run should it not
 * make progress.
 *
 * JUnit style test result files can be automatically generated for the run (along with other formats) by providing
 * OutputGenerators to post-process the test run results.
 */

export interface TestallOptions extends TestRunnerOptions, QueryOptions {
  maxErrorsForReRun?: number; // Don't re-run if > failed tests (excluding pattern matched tests), default 10
  outputDirBase?: string; // Base for junit and other output files, default 'test-result*'
  outputFileName?: string; //File name base
  disableCoverageReport?: boolean; // if enabled disables coverage collection
  rerunOption?: RerunOption; // see RerunOption - default 'pattern'
}

export enum RerunOption {
  Pattern = 'pattern', // only rerun from defined patterns (default)
  Limit = 'limit', // rerun patterns + fails when <= maxErrorsForReRun limit
  All = 'all', // always rerun all
}

const DEFAULT_MAX_ERRORS_FOR_RERUN = 10;
const DEFAULT_OUTPUT_FILE_BASE = 'test-result';
const DEFAULT_RERUN_OPTION = RerunOption.Pattern;

export function getMaxErrorsForReRun(options: TestallOptions): number {
  if (options.maxErrorsForReRun !== undefined && options.maxErrorsForReRun >= 0)
    return options.maxErrorsForReRun;
  else return DEFAULT_MAX_ERRORS_FOR_RERUN;
}

export function getOutputFileBase(options: TestallOptions): {
  fileName: string;
  outputDir: string;
} {
  if (options.outputDirBase && options.outputFileName)
    return {
      outputDir: options.outputDirBase,
      fileName: options.outputFileName,
    };
  else return { outputDir: '', fileName: DEFAULT_OUTPUT_FILE_BASE };
}

export function getReRunOption(options: TestallOptions): RerunOption {
  const opt = options.rerunOption;
  if (opt && Object.values(RerunOption).find(v => v === opt)) return opt;
  return DEFAULT_RERUN_OPTION;
}

export class Testall {
  _logger: Logger;
  _connection: Connection;
  _namespace: string;
  _options: TestallOptions;

  public static async run(
    logger: Logger,
    connection: Connection,
    namespace: string,
    methodCollector: TestMethodCollector,
    runner: TestRunner,
    outputGenerators: OutputGenerator[],
    options: TestallOptions
  ): Promise<TestRunSummary> {
    try {
      logger.logTestallStart(options);
      const cmd = new Testall(logger, connection, namespace, options);
      return await cmd.run(runner, methodCollector, outputGenerators);
    } catch (e) {
      logger.logError(e);
      throw e;
    }
  }

  private constructor(
    logger: Logger,
    connection: Connection,
    namespace: string,
    options: TestallOptions
  ) {
    this._logger = logger;
    this._connection = connection;
    this._namespace = namespace;
    this._options = options;
  }

  public async run(
    runner: TestRunner,
    methodCollector: TestMethodCollector,
    outputGenerators: OutputGenerator[]
  ): Promise<TestRunSummary> {
    let abortTestMethodCollection = false;

    // Create promise for test methods we expect to run
    // We pass the promise to avoid delaying the start of the test run
    const testMethodMap = methodCollector.gatherTestMethods(
      () => abortTestMethodCollection
    );

    const store = new TestResultStore();
    try {
      // To support partial results, we delay the first async error
      await this.asyncRun(0, runner, testMethodMap, store);

      // Ensure test collection stopped
      abortTestMethodCollection = true;

      // Early exit on error / abort
      if (store.asyncError) {
        throw store.asyncError;
      }
      if (store.hasAborted()) {
        return this.reportResults(store, outputGenerators);
      }

      // Do sequential re-runs to try and get more passes
      await this.syncRun(store);

      if (this._options.codeCoverage && !this._options.disableCoverageReport) {
        await this.getCoverage(store);
      }

      return this.reportResults(store, outputGenerators);
    } catch (err) {
      // Terminate gathering test methods
      abortTestMethodCollection = true;

      // Make attempt to report what we've got
      this.reportResults(store, outputGenerators, err);
      throw err;
    }
  }

  public async asyncRun(
    priorFailures: number,
    runner: TestRunner,
    expectedTestsPromise: Promise<Map<string, Set<string>>>,
    store: TestResultStore
  ): Promise<void> {
    const result = await runner.run();

    // Update rolling results for tests that did run
    store.saveAsyncResult(result);

    if (store.asyncError || store.hasAborted()) {
      this._logger.logMessage(
        'Async test run has aborted, trying to report results'
      );
      return;
    }

    // If we have too many genuine failures then give up
    const { failed } = ResultCollector.groupRecords(this._logger, result.tests);
    if (priorFailures + failed.length > getMaxErrorsForReRun(this._options)) {
      this._logger.logMaxErrorAbort(failed);
      return;
    }

    // Filter expected by actual results to find residual
    // Try again if something was missed
    const missingTests = await this.resolveMissingTests(
      expectedTestsPromise,
      store.tests
    );

    if (missingTests.size > 0) {
      this._logger.logTestallRerun(missingTests);

      const testItems: TestItem[] = Array.from(
        missingTests,
        ([className, methods]) => ({
          className,
          testMethods: Array.from(methods),
        })
      );

      await this.asyncRun(
        priorFailures + failed.length,
        runner.newRunner(testItems),
        Promise.resolve(missingTests),
        store
      );
    }
  }

  private async resolveMissingTests(
    expectedTestsPromise: Promise<Map<string, Set<string>>>,
    results: Map<string, ApexTestResult>
  ): Promise<Map<string, Set<string>>> {
    const expectedTests = await expectedTestsPromise;
    const missingTests = new Map<string, Set<string>>();

    expectedTests.forEach((methods, className) => {
      methods.forEach(methodName => {
        const testName = formatTestName(className, methodName, this._namespace);

        if (!results.has(testName)) {
          let missingMethods = missingTests.get(className);
          if (missingMethods === undefined) missingMethods = new Set();
          missingMethods.add(methodName);
          missingTests.set(className, missingMethods);
        }
      });
    });

    return missingTests;
  }

  private async syncRun(store: TestResultStore): Promise<void> {
    const testService = new TestService(this._connection);
    const reruns: TestRerun[] = [];
    const tests = this.getTestsToRerun(store.resultsArray);

    for (const test of tests) {
      const syncTest = await this.runSingleTest(testService, test);

      if (syncTest) {
        const fullName = getTestName(test);
        this._logger.logTestRerun(fullName, test, syncTest);

        reruns.push({ fullName, before: test, after: syncTest });
      }
    }

    store.saveSyncResult(reruns);
  }

  private getTestsToRerun(results: ApexTestResult[]): ApexTestResult[] {
    const { rerun, failed } = ResultCollector.groupRecords(
      this._logger,
      results
    );
    const runOption = getReRunOption(this._options);
    let tests = rerun;

    switch (runOption) {
      case RerunOption.Pattern:
        break;
      case RerunOption.Limit:
        if (failed.length <= getMaxErrorsForReRun(this._options)) {
          // max count is rerun + 10 (by default)
          tests = rerun.concat(failed);
        } else {
          this._logger.logMessage(
            'Max re-run limit exceeded, running pattern matched tests only'
          );
        }
        break;
      case RerunOption.All:
        tests = rerun.concat(failed);
        break;
    }

    this._logger.logTestWillRerun(tests, rerun.length);

    return tests;
  }

  private async runSingleTest(
    testService: TestService,
    currentResult: ApexTestResult
  ): Promise<BaseTestResult | undefined> {
    const item: TestItem = {
      classId: currentResult.ApexClass.Id,
      testMethods: [currentResult.MethodName],
    };

    try {
      const timestamp = SfDate.toDateTimeLiteral(new Date()).toString();
      const result = await retry(
        () =>
          testService.runTestSynchronous({
            tests: [item],
            skipCodeCoverage: !(this._options.codeCoverage == true),
          }),
        this._logger
      );

      return this.convertToSyncResult(result, timestamp);
    } catch (err) {
      this._logger.logMessage(
        `${getTestName(currentResult)} re-run failed. ${this.getErrorMsg(err)}`
      );
    }

    return undefined;
  }

  private convertToSyncResult(
    result: TestResult | TestRunIdResult,
    timestamp: string
  ): BaseTestResult | undefined {
    const test = !('testRunId' in result) ? result.tests[0] : undefined;
    return test
      ? {
          Outcome: test.outcome,
          ApexClass: {
            Id: test.apexClass?.id,
            Name: test.apexClass?.name,
            NamespacePrefix: test.apexClass?.namespacePrefix,
          },
          MethodName: test.methodName,
          Message: test.message,
          StackTrace: test.stackTrace,
          RunTime: test.runTime,
          TestTimestamp: timestamp,
        }
      : test;
  }

  private reportResults(
    store: TestResultStore,
    outputGenerators: OutputGenerator[],
    error?: unknown
  ): TestRunSummary {
    let summary: TestRunSummary;
    try {
      summary = store.toRunSummary(error);
    } catch (err) {
      this._logger.logWarning('Test result reports were not generated');
      throw err;
    }

    outputGenerators.forEach(outputGenerator => {
      const { fileName, outputDir } = getOutputFileBase(this._options);
      outputGenerator.generate(this._logger, outputDir, fileName, summary);
    });

    this._logger.logTestReports(summary);

    return summary;
  }

  private async getCoverage(store: TestResultStore): Promise<void> {
    if (store.runIds.length > 1 || store.reruns) {
      this._logger.logWarning(
        'Test run has reruns, so coverage report may not be complete'
      );
    }

    try {
      const coverage = await ResultCollector.getCoverageReport(
        this._connection,
        store.resultsArray
      );
      this._logger.logMessage(coverage.table);

      store.saveCoverage(coverage);
    } catch (err) {
      this._logger.logMessage(
        `Failed to get coverage: ${this.getErrorMsg(err)}`
      );
    }
  }

  private getErrorMsg(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }
}
