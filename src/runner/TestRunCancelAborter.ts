/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */

import { Logger } from '../log/Logger';
import { Connection, PollingClient } from '@apexdevtools/sfdx-auth-helper';
import { ExecuteService } from '@salesforce/apex-node';
import {
  CancelTestRunOptions,
  getCancelPollIntervalMs,
  getCancelPollTimeoutMins,
  TestRunAborter,
} from './TestOptions';
import { QueryHelper } from '../query/QueryHelper';

export class TestRunCancelAborter implements TestRunAborter {
  async abortRun(
    logger: Logger,
    connection: Connection,
    testRunId: string,
    options: CancelTestRunOptions = {}
  ): Promise<void> {
    logger.logRunCancelling(testRunId);
    const apexQueueItems = await QueryHelper.instance(
      connection
    ).query<IdObject>(
      'ApexTestQueueItem',
      `Status IN ('Holding', 'Queued', 'Preparing', 'Processing') AND ParentJobId='${testRunId}'`,
      'Id'
    );
    const chunks = this.chunk(apexQueueItems, 1000);
    for (const chunk of chunks) {
      const ids = chunk.map(item => `'${item.Id}'`).join(',');

      const executeService = new ExecuteService(connection);
      const result = await executeService.executeAnonymous({
        apexCode: `
          List<ApexTestQueueItem> nonExecutedTests = [SELECT Id, Status FROM ApexTestQueueItem 
              WHERE Id in (${ids})];
          for (ApexTestQueueItem nonExecutedTest : nonExecutedTests) {
              nonExecutedTest.Status = 'Aborted';
          }
          update nonExecutedTests;
        `,
      });
      if (!result.success) {
        throw new Error(
          `Anon apex to abort tests did not succeed, result='${JSON.stringify({
            success: result.success,
            compiled: result.compiled,
            diagnostic: result.diagnostic,
          })}'`
        );
      }
    }

    await this.waitForTestRunToCancel(logger, connection, testRunId, options);
  }

  private async waitForTestRunToCancel(
    logger: Logger,
    connection: Connection,
    testRunId: string,
    options: CancelTestRunOptions
  ): Promise<void> {
    const client = await PollingClient.create({
      poll: async () => {
        const testRunResults = await QueryHelper.instance(connection).query(
          'ApexTestQueueItem',
          `Status IN ('Holding', 'Queued', 'Preparing', 'Processing') AND ParentJobId='${testRunId}'`,
          'Status'
        );

        const numberOfTestsAwaitingCancellation = testRunResults.length;
        if (numberOfTestsAwaitingCancellation > 0) {
          logger.logWaitingForCancel(
            testRunId,
            numberOfTestsAwaitingCancellation
          );
        }

        return Promise.resolve({
          completed: numberOfTestsAwaitingCancellation === 0,
        });
      },
      frequency: getCancelPollIntervalMs(options),
      timeout: getCancelPollTimeoutMins(options),
    });

    try {
      await client.subscribe();
      logger.logRunCancelled(testRunId);
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === 'The client has timed out.') {
          throw new Error(
            `Cancel of test run '${testRunId}' has exceed max allowed time of ${getCancelPollTimeoutMins(
              options
            ).toString()}`
          );
        }
      }
      throw err;
    }
  }

  private chunk<A>(xs: Array<A>, chunkSize: number): A[][] {
    const accum = [];
    for (let i = 0; i < xs.length; i += chunkSize)
      accum.push(xs.slice(i, i + chunkSize));
    return accum;
  }
}

interface IdObject {
  Id: string;
}
