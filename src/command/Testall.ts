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
import { ApexTestRunResult } from '../model/ApexTestRunResult';
import { QueryOptions } from '../query/QueryHelper';
import {
  OutputGenerator,
  TestRerun,
  TestRunSummary,
} from '../results/OutputGenerator';
import { TestRunnerOptions } from '../runner/TestOptions';
import { TestRunner } from '../runner/TestRunner';

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
  ): Promise<TestRunSummary | undefined> {
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
  ): Promise<TestRunSummary | undefined> {
    const startTime = new Date();
    let abortTestMethodCollection = false;

    // Create promise for test methods we expect to run
    // We pass the promise to avoid delaying the start of the test run
    const testMethodMap = methodCollector.gatherTestMethods(
      () => abortTestMethodCollection
    );

    // Run them ;-)
    const results = new Map<string, ApexTestResult>();
    let runResult: ApexTestRunResult | null = null;
    const runIds: string[] = [];
    try {
      runResult = await this.asyncRun(
        0,
        runner,
        testMethodMap,
        null,
        results,
        runIds
      );
    } catch (err) {
      // Terminate gathering test methods, its failed
      abortTestMethodCollection = true;
      throw err;
    }
    if (runResult == null) {
      abortTestMethodCollection = true;
      this._logger.logTestallAbort(this._options);
      return;
    }

    // Do sequential re-runs to try and get more passes
    const reruns = await this.syncRun(results, runResult);

    // Reporting
    const summary: TestRunSummary = {
      startTime,
      testResults: Array.from(results.values()),
      runResult,
      runIds,
      reruns,
      coverageResult: undefined,
    };

    if (this._options.codeCoverage && !this._options.disableCoverageReport) {
      if (runIds.length > 1) {
        this._logger.logWarning(
          'Test run has reruns, so coverage report may not be complete'
        );
      }
      const coverage = await ResultCollector.getCoverageReport(
        this._connection,
        summary.testResults
      );
      summary.coverageResult = coverage;
      this._logger.logMessage(coverage.table);
    }

    outputGenerators.forEach(outputGenerator => {
      const { fileName, outputDir } = getOutputFileBase(this._options);
      outputGenerator.generate(this._logger, outputDir, fileName, summary);
    });

    return summary;
  }

  public async asyncRun(
    priorFailures: number,
    runner: TestRunner,
    expectedTests: Promise<Map<string, Set<string>>>,
    parentRunResult: null | ApexTestRunResult,
    results: Map<string, ApexTestResult>,
    runIds: string[]
  ): Promise<ApexTestRunResult | null> {
    // Do a run of everything requested
    const runResult = await runner.run();

    // Get all the test results for analysis
    const rawTestResults = await ResultCollector.gatherResultsWithRetry(
      this._connection,
      runResult.AsyncApexJobId,
      this._logger,
      this._options
    );

    // Update rolling results for tests that did run
    rawTestResults.forEach(test => {
      results.set(this.getTestName(test), test);
    });

    // If run aborted, don't try continue
    if (runResult.Status == 'Aborted') return null;

    // Keep track of new test run ids
    runIds.push(runResult.AsyncApexJobId);

    // Merge results into parent record to give aggregate for reporting
    let activeRunResult = runResult;
    if (parentRunResult != null) {
      activeRunResult = parentRunResult;
      parentRunResult.Status = runResult.Status;
      parentRunResult.EndTime = runResult.EndTime;
      parentRunResult.TestTime += runResult.TestTime;
      parentRunResult.ClassesCompleted += runResult.ClassesCompleted;
      parentRunResult.ClassesEnqueued += runResult.ClassesEnqueued;
      parentRunResult.MethodsCompleted += runResult.MethodsCompleted;
      parentRunResult.MethodsEnqueued += runResult.MethodsEnqueued;
      parentRunResult.MethodsFailed += runResult.MethodsFailed;
    }

    // If we have too many genuine failures then give up
    const testResults = ResultCollector.groupRecords(
      this._logger,
      rawTestResults
    );
    if (
      priorFailures + testResults.failed.length >
      getMaxErrorsForReRun(this._options)
    ) {
      this._logger.logMaxErrorAbort(testResults.failed);
      return activeRunResult;
    }

    // Filter expected by actual results to find residual
    const missingTests = new Map<string, Set<string>>();
    (await expectedTests).forEach((methods, className) => {
      methods.forEach(methodName => {
        const testName = this.formatTestName(
          className,
          methodName,
          this._namespace
        );

        if (!results.has(testName)) {
          let missingMethods = missingTests.get(className);
          if (missingMethods === undefined) missingMethods = new Set();
          missingMethods.add(methodName);
          missingTests.set(className, missingMethods);
        }
      });
    });

    // Try again if something was missed
    if (missingTests.size > 0) {
      this._logger.logTestallRerun(missingTests);

      const testItems: TestItem[] = [];
      missingTests.forEach((methods, className) => {
        testItems.push({
          className: className,
          testMethods: Array.from(methods),
        });
      });

      const newRunner = runner.newRunner(testItems);
      const newResults = await this.asyncRun(
        priorFailures + testResults.failed.length,
        newRunner,
        Promise.resolve(missingTests),
        activeRunResult,
        results,
        runIds
      );
      if (newResults == null) {
        return null;
      }
    }

    return activeRunResult;
  }

  private async syncRun(
    results: Map<string, ApexTestResult>,
    parentRunResult: ApexTestRunResult
  ): Promise<TestRerun[]> {
    const testService = new TestService(this._connection);
    const reruns: TestRerun[] = [];
    const tests = this.getTestsToRerun(Array.from(results.values()));

    for (const test of tests) {
      const syncTest = await this.runSingleTest(testService, test);

      if (syncTest) {
        const fullName = this.getTestName(test);
        this._logger.logTestRerun(fullName, test, syncTest);

        // replace original test in final results
        results.set(fullName, this.mergeSyncResult(test, syncTest));

        reruns.push({ fullName, before: test, after: syncTest });
      }
    }

    const time = reruns.reduce((a, c) => a + c.after.RunTime, 0);
    const passed = reruns.filter(r => r.after.Outcome === 'Pass').length;

    // totalTime can now exceed sum of run times in summary
    // since it includes original + rerun time
    parentRunResult.TestTime += time;
    parentRunResult.MethodsFailed -= passed;

    return reruns;
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
      const result = await testService.runTestSynchronous({
        tests: [item],
        skipCodeCoverage: !(this._options.codeCoverage == true),
      });

      return this.convertToSyncResult(result, timestamp);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this._logger.logMessage(
        `${this.getTestName(currentResult)} re-run failed, cause: ${msg}`
      );
    }

    return undefined;
  }

  private getTestName(test: BaseTestResult): string {
    return this.formatTestName(
      test.ApexClass.Name,
      test.MethodName,
      test.ApexClass.NamespacePrefix
    );
  }

  private formatTestName(
    className: string,
    methodName: string,
    ns: string | null
  ): string {
    const namespace = ns ? (ns.endsWith('__') ? ns : `${ns}__`) : '';
    return `${namespace}${className}.${methodName}`;
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

  private mergeSyncResult(
    before: ApexTestResult,
    after: BaseTestResult
  ): ApexTestResult {
    return {
      ...before,
      Outcome: after.Outcome,
      Message: after.Message,
      StackTrace: after.StackTrace,
      RunTime: after.RunTime,
      TestTimestamp: after.TestTimestamp,
    };
  }
}
