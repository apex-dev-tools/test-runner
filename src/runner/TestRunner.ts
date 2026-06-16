/*
 * Copyright (c) 2019, FinancialForce.com, inc. All rights reserved.
 */

import { Connection } from '@salesforce/core';
import {
  TestRunIdResult,
  TestService,
  TestLevel,
  AsyncTestConfiguration,
  AsyncTestArrayConfiguration,
  TestItem,
} from '@salesforce/apex-node';
import { Logger } from '../log/Logger';
import {
  ApexTestRunResult,
  ApexTestRunResultFields,
} from '../model/ApexTestRunResult';
import {
  getMaxTestRunRetries,
  getStatusPollInterval,
  getTestRunAborter,
  getTestRunTimeout,
  getTestRunTimeoutMessage,
  TestRunnerOptions,
} from './TestOptions';
import TestStats from './TestStats';
import { QueryHelper } from '../query/QueryHelper';
import { ApexTestQueueItem, QueueItemStatus } from '../model/ApexTestQueueItem';
import { TestError, TestErrorKind } from './TestError';
import { Pollable, poll, retry } from './Poll';
import { ApexTestResult, ApexTestResultFields } from '../model/ApexTestResult';
import { getTestName, groupByOutcome } from '../results/TestResultUtils';

/**
 * Parallel unit test runner that includes the ability to cancel & restart a run should it not make sufficient progress
 * within some period and to terminate should a run take to long overall.
 *
 * This builds over the @salesforce/apex-node test running capabilities so there are some similarities to how
 * force:apex:test:run operates. You can select between running specific classes, methods or all local tests.
 * See TestRunnerOptions for specifying configurable parameters.
 */

export interface TestRunnerResult {
  run: ApexTestRunResult;
  tests: ApexTestResult[];
  error?: TestError;
  numberOfResets: number; // Track the number of times the test run has been reset due to hanging or cancellation
}

// Queue item statuses for tests that have not finished running. After a reset
// these are the classes we re-run; classes that finished keep their results
// (mirrors the statuses the aborter cancels). Note this is only the async
// re-run - failed tests in finished classes are still re-run afterwards by
// Testall.syncRun, which applies the configurable rerun filter and runs them
// sequentially to avoid the row-lock contention that may have caused
// them.
const PENDING_QUEUE_STATUSES: QueueItemStatus[] = [
  'Holding',
  'Queued',
  'Preparing',
  'Processing',
];

export interface TestRunner {
  getTestClasses(): string[];
  run(token?: CancellationToken): Promise<TestRunnerResult>;
  newRunner(testItems: TestItem[]): TestRunner;
}

export interface CancellationToken {
  /**
   * Is `true` when the token has been cancelled, `false` otherwise.
   */
  isCancellationRequested: boolean;
}

export class AsyncTestRunner implements TestRunner {
  private readonly _logger: Logger;
  private readonly _connection: Connection;
  private readonly _queryHelper: QueryHelper;
  private readonly _testItems: TestItem[];
  private readonly _options: TestRunnerOptions;
  private readonly _testService: TestService;
  private _stats: TestStats;
  // Results from classes that finished before a reset, kept so they are not
  // re-run. Keyed by full test name and reset at the start of each run().
  private _completedResults: Map<string, ApexTestResult> = new Map();

  static forClasses(
    logger: Logger,
    connection: Connection,
    namespace: string,
    testClasses: string[],
    options: TestRunnerOptions
  ): AsyncTestRunner {
    return new AsyncTestRunner(
      logger,
      connection,
      testClasses.map(className => {
        return {
          namespace: namespace == '' ? undefined : namespace,
          className: className,
        };
      }),
      options
    );
  }

  constructor(
    logger: Logger,
    connection: Connection,
    testItems: TestItem[], // Pass [] to run all local tests
    options: TestRunnerOptions
  ) {
    this._logger = logger;
    this._connection = connection;
    this._queryHelper = QueryHelper.instance(connection, logger);
    this._testItems = testItems;
    this._options = options;
    this._testService = new TestService(this._connection);
    this._stats = TestStats.instance(this._options);
  }

  newRunner(testItems: TestItem[]): TestRunner {
    return new AsyncTestRunner(
      this._logger,
      this._connection,
      testItems,
      this._options
    );
  }

  public getTestClasses(): string[] {
    return this._testItems.map(item => item.className as string);
  }

  public async run(token?: CancellationToken): Promise<TestRunnerResult> {
    this._completedResults = new Map();
    const result = await this.runInternal(token);
    return this.mergeCompletedResults(result);
  }

  /**
   * Runs (or re-runs) the tests. On a restart following a hang, `restartItems`
   * carries the subset of tests still to run so we don't re-run ones that have
   * already completed.
   */
  private async runInternal(
    token?: CancellationToken,
    restartItems?: TestItem[]
  ): Promise<TestRunnerResult> {
    if (this.hasHitMaxNumberOfTestRunRetries()) {
      throw new TestError(
        `Max number of test run retries reached, max allowed retries: ${getMaxTestRunRetries(
          this._options
        )}`,
        TestErrorKind.Timeout
      );
    }

    const payload = restartItems
      ? this.getSpecifiedTestsPayload(restartItems)
      : this.getTestClassPayload() || (await this.getTestAllPayload());

    const testRunIdResult = (await retry(
      () => this._testService.runTestAsynchronous(payload, false, true),
      this._logger
    )) as TestRunIdResult;

    this._options.callbacks?.onRunStarted?.(testRunIdResult.testRunId);
    this._logger.logRunStarted(testRunIdResult.testRunId);

    const result = await this.waitForTestRunCompletion(
      testRunIdResult.testRunId,
      token
    );

    // Add numberOfResets to the result object
    result.numberOfResets = this._stats.getNumberOfTimesReset();

    // Ensure result for partial reporting
    try {
      if (token?.isCancellationRequested) {
        await this.abortTestRun(result.run.AsyncApexJobId);
        return result;
      }

      if (result.run.Status == 'Processing' && this._stats.isTestRunHanging()) {
        this._logger.logNoProgress(testRunIdResult.testRunId);
        const restartItems = await this.prepareRestart(
          testRunIdResult.testRunId,
          result
        );
        this._stats = this._stats.reset();
        await this.abortTestRun(result.run.AsyncApexJobId);
        return await this.runInternal(token, restartItems);
      }
    } catch (err) {
      // error may already be defined from wait()
      if (!result.error) {
        return { ...result, error: TestError.wrapError(err) };
      }
    }

    return result;
  }

  private hasHitMaxNumberOfTestRunRetries(): boolean {
    // The number of resets is one less than the number of retries, i.e. 2 resets === 3 runs
    const maxNumberOfResets = getMaxTestRunRetries(this._options) - 1;
    return this._stats.getNumberOfTimesReset() > maxNumberOfResets;
  }

  /**
   * After a hang, work out which classes still need running so the restart only
   * re-runs those. Results from classes that already finished are kept (in
   * _completedResults) rather than thrown away and re-run. Returns the test
   * items to re-run, or undefined to fall back to a full re-run (e.g. if we
   * can't determine progress) so a reset is never worse than before.
   */
  private async prepareRestart(
    testRunId: string,
    result: TestRunnerResult
  ): Promise<TestItem[] | undefined> {
    try {
      const queueItems = await this.getQueueItems(testRunId);

      const pendingClassIds = this.uniqueClassIds(
        queueItems.filter(item => PENDING_QUEUE_STATUSES.includes(item.Status))
      );
      const completedClassIds = new Set(
        this.uniqueClassIds(
          queueItems.filter(
            item => !PENDING_QUEUE_STATUSES.includes(item.Status)
          )
        )
      );

      // Keep results from classes that finished; drop the rest so the restart
      // re-runs them cleanly.
      result.tests
        .filter(test => completedClassIds.has(test.ApexClass.Id))
        .forEach(test => this._completedResults.set(getTestName(test), test));

      // Keep a per-reset diagnostic snapshot of what the org looked like when
      // the run stalled, so resets can be investigated after the fact.
      this.writeResetSnapshot(
        testRunId,
        queueItems,
        completedClassIds,
        pendingClassIds,
        result
      );

      if (pendingClassIds.length === 0) {
        // Nothing identified to re-run - fall back to a full re-run.
        return undefined;
      }

      const remainingTests =
        result.run.MethodsEnqueued - result.run.MethodsCompleted;
      this._logger.logRunReset(
        this._completedResults.size,
        completedClassIds.size,
        remainingTests,
        pendingClassIds.length
      );

      return pendingClassIds.map(classId => ({ classId }));
    } catch (err) {
      // Be defensive: a reset should never be worse than a full re-run.
      this._logger.logWarning(
        `Could not determine completed tests for restart, re-running all: ${
          TestError.wrapError(err).message
        }`
      );
      return undefined;
    }
  }

  private async getQueueItems(testRunId: string): Promise<ApexTestQueueItem[]> {
    return this._queryHelper.query<ApexTestQueueItem>(
      'ApexTestQueueItem',
      `ParentJobId='${testRunId}'`,
      'Id, ApexClassId, Status'
    );
  }

  private uniqueClassIds(queueItems: ApexTestQueueItem[]): string[] {
    return Array.from(new Set(queueItems.map(item => item.ApexClassId)));
  }

  private writeResetSnapshot(
    testRunId: string,
    queueItems: ApexTestQueueItem[],
    completedClassIds: Set<string>,
    pendingClassIds: string[],
    result: TestRunnerResult
  ): void {
    const resetNumber = this._stats.getNumberOfTimesReset() + 1;
    const outcomes = groupByOutcome(result.tests);
    const snapshot = {
      testRunId,
      resetNumber,
      completedClasses: completedClassIds.size,
      pendingClasses: pendingClassIds.length,
      reusedTests: this._completedResults.size,
      results: {
        total: result.tests.length,
        passed: outcomes.Pass.length,
        failed: outcomes.Fail.length + outcomes.CompileFail.length,
        skipped: outcomes.Skip.length,
      },
      queueItems,
    };
    this._logger.logOutputFile(
      `reset-${resetNumber}-${testRunId}.json`,
      JSON.stringify(snapshot, undefined, 2)
    );
  }

  /**
   * Merge the results kept from completed classes with the final attempt's
   * results so the returned result covers every test that ran across attempts.
   * The run-level counts (which otherwise only reflect the final restart
   * subset) are recomputed from the merged set so the summary stays consistent.
   */
  private mergeCompletedResults(result: TestRunnerResult): TestRunnerResult {
    if (this._completedResults.size === 0) {
      return result;
    }

    const merged = new Map<string, ApexTestResult>(this._completedResults);
    result.tests.forEach(test => merged.set(getTestName(test), test));
    const tests = Array.from(merged.values());

    return {
      ...result,
      tests,
      run: this.recomputeRunCounts(result.run, tests),
    };
  }

  private recomputeRunCounts(
    run: ApexTestRunResult,
    tests: ApexTestResult[]
  ): ApexTestRunResult {
    const classes = new Set(tests.map(test => test.ApexClass.Id));
    const failed = tests.filter(
      test => test.Outcome !== 'Pass' && test.Outcome !== 'Skip'
    ).length;
    const testTime = tests.reduce((total, test) => total + test.RunTime, 0);

    return {
      ...run,
      ClassesCompleted: classes.size,
      ClassesEnqueued: classes.size,
      MethodsCompleted: tests.length,
      MethodsEnqueued: tests.length,
      MethodsFailed: failed,
      TestTime: testTime,
    };
  }

  private getTestClassPayload(): null | AsyncTestArrayConfiguration {
    return this._testItems.length > 0
      ? this.getSpecifiedTestsPayload(this._testItems)
      : null;
  }

  private getSpecifiedTestsPayload(
    testItems: TestItem[]
  ): AsyncTestArrayConfiguration {
    return {
      tests: testItems,
      testLevel: TestLevel.RunSpecifiedTests,
      skipCodeCoverage: this.skipCollectCoverage(),
    };
  }

  private async getTestAllPayload(): Promise<
    AsyncTestConfiguration | AsyncTestArrayConfiguration
  > {
    const payload = await retry(
      () => this._testService.buildAsyncPayload(TestLevel.RunLocalTests),
      this._logger
    );
    payload.skipCodeCoverage = this.skipCollectCoverage();
    return payload;
  }

  private skipCollectCoverage(): boolean {
    return !(this._options.codeCoverage == true);
  }

  private async waitForTestRunCompletion(
    testRunId: string,
    token?: CancellationToken
  ): Promise<TestRunnerResult> {
    let seenTests: Set<string> = new Set();
    let lastResult: TestRunnerResult | undefined;

    const testRunStatus: Pollable<TestRunnerResult> = {
      pollDelay: getStatusPollInterval(this._options).milliseconds,
      pollTimeout: getTestRunTimeout(this._options).milliseconds,
      pollTimeoutMessage: getTestRunTimeoutMessage(testRunId, this._options),

      poll: async elapsedTime => {
        const run = await this.testRunResult(testRunId);
        const tests = await this.testResults(testRunId);

        await this.updateProgress(run, tests, elapsedTime);
        seenTests = this.notifyNewResults(tests, seenTests);

        return (lastResult = {
          run,
          tests,
          numberOfResets: this._stats.getNumberOfTimesReset(),
        });
      },

      pollUntil: result =>
        token?.isCancellationRequested ||
        this.hasTestRunComplete(result.run.Status) ||
        this._stats.isTestRunHanging(),

      pollRetryIf: (/*error*/) => {
        // will throw the error from poll() if false
        if (token?.isCancellationRequested) {
          return false;
        }

        // Can abort polling based on error
        return true;
      },
    };

    try {
      return await poll(testRunStatus, this._logger);
    } catch (err) {
      return this.preparePartialResult(err, lastResult);
    }
  }

  private async testRunResult(testRunId: string): Promise<ApexTestRunResult> {
    const testRunResults = await this._queryHelper.query<ApexTestRunResult>(
      'ApexTestRunResult',
      `AsyncApexJobId='${testRunId}'`,
      ApexTestRunResultFields.join(', ')
    );
    if (testRunResults.length != 1) {
      throw new TestError(
        `Wrong number of ApexTestRunResult records found for '${testRunId}', found ${testRunResults.length}, expected 1`,
        TestErrorKind.Query
      );
    }
    return testRunResults[0];
  }

  private async testResults(testRunId: string): Promise<ApexTestResult[]> {
    return this._queryHelper.query<ApexTestResult>(
      'ApexTestResult',
      `AsyncApexJobId='${testRunId}' AND IsTestSetup=FALSE`,
      ApexTestResultFields.join(', ')
    );
  }

  private async updateProgress(
    testRunResult: ApexTestRunResult,
    results: ApexTestResult[],
    time: string
  ): Promise<void> {
    this._stats = this._stats.update(results.length);

    // No-progress count is only meaningful while the run is still in flight.
    const noProgressPolls = this.hasTestRunComplete(testRunResult.Status)
      ? 0
      : this._stats.getNoProgressPollCount();
    this._logger.logStatus(
      testRunResult,
      results,
      time,
      noProgressPolls,
      this._stats.getNoProgressPollLimit()
    );

    if (this._logger.verbose) {
      await this.reportQueueItems(testRunResult.AsyncApexJobId);
    }
  }

  private async reportQueueItems(testRunId: string): Promise<void> {
    const apexQueueItems = await this._queryHelper.query<ApexTestQueueItem>(
      'ApexTestQueueItem',
      `ParentJobId='${testRunId}'`,
      'Id, ApexClassId, ExtendedStatus, Status, TestRunResultID, ShouldSkipCodeCoverage'
    );
    this._logger.logOutputFile(
      `testqueue-${new Date().toISOString()}.json`,
      JSON.stringify(apexQueueItems, undefined, 2)
    );
  }

  private notifyNewResults(
    results: ApexTestResult[],
    seen: Set<string>
  ): Set<string> {
    const newResults = results.filter(x => !seen.has(x.Id));

    this._logger.logTestFailures(newResults);
    this._options.callbacks?.onPoll?.([...newResults]);

    return new Set([...seen, ...newResults.map(r => r.Id)]);
  }

  private hasTestRunComplete(status: string): boolean {
    return (
      status === 'Completed' || status === 'Aborted' || status === 'Failed'
    );
  }

  private preparePartialResult(
    err: unknown,
    last?: TestRunnerResult
  ): TestRunnerResult {
    const wrappedErr = TestError.wrapError(err);
    if (!last) {
      throw wrappedErr;
    }

    return {
      error: wrappedErr,
      ...last,
    };
  }

  private async abortTestRun(testRunId: string): Promise<string[]> {
    return getTestRunAborter(this._options).abortRun(
      this._logger,
      this._connection,
      testRunId,
      this._options
    );
  }
}
