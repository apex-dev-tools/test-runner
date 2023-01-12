/*
 * Copyright (c) 2019, FinancialForce.com, inc. All rights reserved.
 */

import { Connection, PollingClient } from '@apexdevtools/sfdx-auth-helper';
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
import { ApexTestResult } from '../model/ApexTestResult';
import {
  getMaxTestRunRetries,
  getStatusPollIntervalMs,
  getTestRunAborter,
  getTestRunTimeoutMins,
  TestRunnerOptions,
} from './TestOptions';
import TestStats from './TestStats';
import { ResultCollector } from '../collector/ResultCollector';

/**
 * Parallel unit test runner that includes the ability to cancel & restart a run should it not make sufficient progress
 * within some period and to terminate should a run take to long overall.
 *
 * This builds over the @salesforce/apex-node test running capabilities so there are some similarities to how
 * force:apex:test:run operates. You can select between running specific classes, methods or all local tests.
 * See TestRunnerOptions for specifying configurable parameters.
 */

export interface TestRunner {
  getTestClasses(): string[];
  run(token?: CancellationToken): Promise<ApexTestRunResult>;
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

  public async run(token?: CancellationToken): Promise<ApexTestRunResult> {
    if (this.hasHitMaxNumberOfTestRunRetries()) {
      throw new Error(
        `Max number of test run retries reached, max allowed retries: ${getMaxTestRunRetries(
          this._options
        )}`
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

    await this.waitForTestRunCompletion(testRunIdResult.testRunId, token);

    const result = await this.testRunResult(testRunIdResult.testRunId);
    if (result.Status == 'Processing' && this._stats.isTestRunHanging()) {
      this._logger.logNoProgress(testRunIdResult.testRunId);
      this._stats = this._stats.reset();
      await getTestRunAborter(this._options).abortRun(
        this._logger,
        this._connection,
        testRunIdResult.testRunId,
        this._options
      );
      return await this.run();
    } else {
      return result;
    }
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
  ): Promise<void> {
    let polledTests: Set<ApexTestResult> = new Set();
    const options: PollingClient.Options = {
      poll: async () => {
        const testRunResult = await this.testRunResult(testRunId);

        // Update progress
        this._logger.logStatus(testRunResult);
        this._stats = this._stats.update(testRunResult.MethodsCompleted);
        polledTests = await this.getCompletedTests(testRunId, polledTests).then(
          unSeenTests => {
            this._options.callbacks?.onPoll?.([...unSeenTests]);
            return new Set([...polledTests, ...unSeenTests]);
          }
        );

        if (token?.isCancellationRequested) {
          await getTestRunAborter(this._options).abortRun(
            this._logger,
            this._connection,
            testRunId,
            this._options
          );
          return Promise.resolve({ completed: true });
        }

        // Bail out if we reach a completion state
        if (this.hasTestRunComplete(testRunResult.Status))
          return Promise.resolve({ completed: true });

        // Continue polling while we are making some progress
        return Promise.resolve({ completed: this._stats.isTestRunHanging() });
      },
      frequency: getStatusPollIntervalMs(this._options),
      timeout: getTestRunTimeoutMins(this._options),
    };

    const client = await PollingClient.create(options);
    try {
      await client.subscribe();
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === 'The client has timed out.') {
          throw new Error(
            `Test run '${testRunId}' has exceed test runner max allowed run time of ${getTestRunTimeoutMins(
              this._options
            ).toString()}`
          );
        }
      }
      throw err;
    }
  }

  private hasTestRunComplete(status: string): boolean {
    return (
      status === 'Completed' || status === 'Aborted' || status === 'Failed'
    );
  }

  private async testRunResult(testRunId: string): Promise<ApexTestRunResult> {
    const testRunResults = await this._connection.tooling.query<ApexTestRunResult>(
      `SELECT ${ApexTestRunResultFields.join(
        ', '
      )} FROM ApexTestRunResult WHERE AsyncApexJobId = '${testRunId}'`
    );
    const records = testRunResults.records;
    if (records.length != 1)
      throw new Error(
        `Wrong number of ApexTestRunResult records found for '${testRunId}', found ${records.length}, expected 1`
      );
    return records[0];
  }

  private async getCompletedTests(
    testRunId: string,
    seen: Set<ApexTestResult>
  ): Promise<Array<ApexTestResult>> {
    return ResultCollector.gatherResults(this._connection, testRunId).then(
      res => {
        const newItems = res.filter(x => !seen.has(x));
        return newItems;
      }
    );
  }
}
