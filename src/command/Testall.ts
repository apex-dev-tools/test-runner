/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */

import {
  TestItem,
  TestResult,
  TestRunIdResult,
  TestService,
} from '@salesforce/apex-node';
import { Connection } from '@apexdevtools/sfdx-auth-helper';
import { ResultCollector } from '../collector/ResultCollector';
import { TestMethodCollector } from '../collector/TestMethodCollector';
import { Logger } from '../log/Logger';
import { ApexTestResult } from '../model/ApexTestResult';
import { TestRunnerOptions } from '../runner/TestOptions';
import { TestRunner } from '../runner/TestRunner';
import { OutputGenerator, TestRunSummary } from '../results/OutputGenerator';
import { ApexTestRunResult } from '../model/ApexTestRunResult';
import { QueryOptions } from '../query/QueryHelper';

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
  maxErrorsForReRun?: number; // Don't re-run if > failed tests (excluding locking/missed tests), default 10
  outputDirBase?: string; // Base for junit and other output files, default 'test-result*'
  outputFileName?: string; //File name base
  disableCoverageReport?: boolean; // if enabled disables coverage collection
}

const DEFAULT_MAX_ERRORS_FOR_RERUN = 10;
const DEFAULT_OUTPUT_FILE_BASE = 'test-result';

export function getMaxErrorsForReRun(options: TestallOptions): number {
  if (options.maxErrorsForReRun !== undefined && options.maxErrorsForReRun >= 0)
    return options.maxErrorsForReRun;
  else return DEFAULT_MAX_ERRORS_FOR_RERUN;
}

export function getOutputFileBase(
  options: TestallOptions
): { fileName: string; outputDir: string } {
  if (options.outputDirBase && options.outputFileName)
    return {
      outputDir: options.outputDirBase,
      fileName: options.outputFileName,
    };
  else return { outputDir: '', fileName: DEFAULT_OUTPUT_FILE_BASE };
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
    const runAccum: Array<ApexTestRunResult> = [];
    try {
      runResult = await this.asyncRun(
        0,
        runner,
        testMethodMap,
        null,
        results,
        runAccum
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

    // Do sequential re-run of matched patterns to try and get more passes
    const testResults = ResultCollector.groupRecords(
      this._logger,
      Array.from(results.values())
    );
    await this.runSequentially(testResults.rerun, results, runResult);

    // Reporting
    const summary: TestRunSummary = {
      startTime,
      testResults: Array.from(results.values()),
      runResult,
      coverageResult: undefined,
      hasReRuns: !!testResults.rerun.length || runAccum.length > 1,
    };

    if (this._options.codeCoverage && !this._options.disableCoverageReport) {
      if (summary.hasReRuns) {
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
    testRunAcc?: Array<ApexTestRunResult>
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
    testRunAcc?.push(runResult);
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
        if (!results.has(`${className}.${methodName}`)) {
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
        testRunAcc
      );
      if (newResults == null) {
        return null;
      }
    }

    return activeRunResult;
  }

  private async runSequentially(
    testsToRetry: ApexTestResult[],
    results: Map<string, ApexTestResult>,
    parentRunResult: ApexTestRunResult
  ): Promise<void> {
    const testService = new TestService(this._connection);
    this._logger.logTestWillRetry(testsToRetry);

    const retries = [];
    for (const test of testsToRetry) {
      const retry = await this.retrySingleTest(testService, test);

      if (retry) {
        this._logger.logTestRetry(test, retry);

        // replace original test in final results
        results.set(this.getTestName(retry), retry);
        retries.push(retry);
      }
    }

    const time = retries.reduce((a, c) => a + c.RunTime, 0);
    const passed = retries.filter(r => r.Outcome === 'Pass').length;

    // totalTime can now exceed sum of run times in summary
    // since it includes original + retry time
    parentRunResult.TestTime += time;
    parentRunResult.MethodsFailed -= passed;
  }

  private async retrySingleTest(
    testService: TestService,
    currentResult: ApexTestResult
  ): Promise<ApexTestResult | undefined> {
    const item: TestItem = {
      classId: currentResult.ApexClass.Id,
      testMethods: [currentResult.MethodName],
    };
    const name = this.getTestName(currentResult);

    try {
      const result = await testService.runTestSynchronous({
        tests: [item],
        skipCodeCoverage: !(this._options.codeCoverage == true),
      });

      return this.convertSyncResult(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this._logger.logMessage(`${name} re-run failed, cause: ${msg}`);
    }

    return undefined;
  }

  private getTestName(test: ApexTestResult): string {
    return `${test.ApexClass.Name}.${test.MethodName}`;
  }

  private convertSyncResult(
    result: TestResult | TestRunIdResult
  ): ApexTestResult | undefined {
    const test = !('testRunId' in result) ? result.tests[0] : undefined;
    return test
      ? {
          Id: test.id,
          QueueItemId: test.queueItemId,
          AsyncApexJobId: test.asyncApexJobId,
          Outcome: test.outcome,
          ApexClass: {
            Id: test.apexClass.id,
            Name: test.apexClass.name,
            NamespacePrefix: test.apexClass.namespacePrefix,
          },
          MethodName: test.methodName,
          Message: test.message,
          StackTrace: test.stackTrace,
          RunTime: test.runTime,
          TestTimestamp: test.testTimestamp,
        }
      : test;
  }
}
