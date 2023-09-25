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
  TestRunnerOptions,
} from './TestOptions';
import TestStats from './TestStats';
import { ResultCollector } from '../collector/ResultCollector';
import { QueryHelper } from '../query/QueryHelper';
import { ApexTestQueueItem } from '../model/ApexTestQueueItem';
import { TestError, TestErrorKind } from './TestError';
import { Pollable, poll } from './Poll';
import { ApexTestResult } from '../model/ApexTestResult';

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
}

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
  private readonly _testItems: TestItem[];
  private readonly _options: TestRunnerOptions;
  private readonly _testService: TestService;
  private _stats;

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
    if (this.hasHitMaxNumberOfTestRunRetries()) {
      throw new TestError(
        `Max number of test run retries reached, max allowed retries: ${getMaxTestRunRetries(
          this._options
        )}`,
        TestErrorKind.Timeout
      );
    }

    const payload = this.testClassPayload() || (await this.testAllPayload());

    const testRunIdResult = (await this._testService.runTestAsynchronous(
      payload,
      false,
      true
    )) as TestRunIdResult;

    this._options.callbacks?.onRunStarted?.(testRunIdResult.testRunId);
    this._logger.logRunStarted(testRunIdResult.testRunId);

    const result = await this.waitForTestRunCompletion(
      testRunIdResult.testRunId,
      token
    );

    if (token?.isCancellationRequested) {
      await this.abortTestRun(result.run.AsyncApexJobId);
      return result;
    }

    if (result.run.Status == 'Processing' && this._stats.isTestRunHanging()) {
      this._logger.logNoProgress(testRunIdResult.testRunId);
      this._stats = this._stats.reset();
      await this.abortTestRun(result.run.AsyncApexJobId);
      return await this.run(token);
    }

    return result;
  }

  private hasHitMaxNumberOfTestRunRetries(): boolean {
    // The number of resets is one less than the number of retries, i.e. 2 resets === 3 runs
    const maxNumberOfResets = getMaxTestRunRetries(this._options) - 1;
    return this._stats.getNumberOfTimesReset() > maxNumberOfResets;
  }

  private testClassPayload(): null | AsyncTestArrayConfiguration {
    if (this._testItems.length > 0) {
      const config: AsyncTestArrayConfiguration = {
        tests: this._testItems,
        testLevel: TestLevel.RunSpecifiedTests,
        skipCodeCoverage: this.skipCollectCoverage(),
      };
      return config;
    } else {
      return null;
    }
  }

  private async testAllPayload(): Promise<
    AsyncTestConfiguration | AsyncTestArrayConfiguration
  > {
    const payload = await this._testService.buildAsyncPayload(
      TestLevel.RunLocalTests
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
      poll: async () => {
        const run = await this.testRunResult(testRunId);
        const tests = await ResultCollector.gatherResults(
          this._connection,
          run.AsyncApexJobId
        );

        await this.updateProgress(run, tests);
        seenTests = this.notifyNewResults(tests, seenTests);

        lastResult = {
          run,
          tests,
        };

        return lastResult;
      },
      pollUntil: result =>
        token?.isCancellationRequested ||
        this.hasTestRunComplete(result.run.Status) ||
        this._stats.isTestRunHanging(),
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      pollRetryIf: error => {
        // will throw the error from poll() if false
        if (token?.isCancellationRequested) {
          return false;
        }

        // Can abort polling based on error
        return true;
      },
    };

    try {
      return await poll(testRunStatus);
    } catch (err) {
      return this.doPartialResult(testRunId, err, lastResult);
    }
  }

  private hasTestRunComplete(status: string): boolean {
    return (
      status === 'Completed' || status === 'Aborted' || status === 'Failed'
    );
  }

  private async abortTestRun(testRunId: string): Promise<string[]> {
    return getTestRunAborter(this._options).abortRun(
      this._logger,
      this._connection,
      testRunId,
      this._options
    );
  }

  private doPartialResult(
    testRunId: string,
    err: unknown,
    last?: TestRunnerResult
  ): TestRunnerResult {
    if (!last) {
      throw TestError.wrapError(
        err,
        TestErrorKind.General,
        `Could not get any results for test run '${testRunId}'.`
      );
    }

    let error: TestError;
    if (err instanceof Error && err.message.startsWith('Timeout')) {
      error = new TestError(
        `Test run '${testRunId}' has exceeded test runner max allowed run time of ${getTestRunTimeout(
          this._options
        ).toString()}`,
        TestErrorKind.Timeout
      );
    } else {
      error = TestError.wrapError(err);
    }

    return {
      error,
      ...last,
    };
  }

  private async testRunResult(testRunId: string): Promise<ApexTestRunResult> {
    const testRunResults = await QueryHelper.instance(
      this._connection
    ).query<ApexTestRunResult>(
      'ApexTestRunResult',
      `AsyncApexJobId = '${testRunId}'`,
      ApexTestRunResultFields.join(', ')
    );
    if (testRunResults.length != 1)
      throw new TestError(
        `Wrong number of ApexTestRunResult records found for '${testRunId}', found ${testRunResults.length}, expected 1`,
        TestErrorKind.Query
      );
    return testRunResults[0];
  }

  private async updateProgress(
    testRunResult: ApexTestRunResult,
    results: ApexTestResult[]
  ): Promise<void> {
    this._logger.logStatus(testRunResult, results);
    this._stats = this._stats.update(results.length);

    if (this._logger.verbose) {
      await this.reportQueueItems(testRunResult.AsyncApexJobId);
    }
  }

  private notifyNewResults(
    results: ApexTestResult[],
    seen: Set<string>
  ): Set<string> {
    const newResults = results.filter(x => !seen.has(x.Id));
    this._options.callbacks?.onPoll?.([...newResults]);

    return new Set([...seen, ...newResults.map(r => r.Id)]);
  }

  private async reportQueueItems(testRunId: string): Promise<void> {
    const apexQueueItems = await QueryHelper.instance(
      this._connection
    ).query<ApexTestQueueItem>(
      'ApexTestQueueItem',
      `ParentJobId='${testRunId}'`,
      'Id, ApexClassId, ExtendedStatus, Status, TestRunResultID, ShouldSkipCodeCoverage'
    );
    this._logger.logOutputFile(
      `testqueue-${new Date().toISOString()}.json`,
      JSON.stringify(apexQueueItems, undefined, 2)
    );
  }
}
