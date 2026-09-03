/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */

import { Logger } from '../log/Logger';
import { Connection } from '@salesforce/core';
import { ExecuteService } from '@salesforce/apex-node';
import {
  CancelTestRunOptions,
  TestRunAborter,
  getCancelPollInterval,
  getCancelPollTimeout,
} from './TestOptions';
import { QueryHelper } from '../query/QueryHelper';
import { chunk } from '../query/Chunk';
import { TestError } from './TestError';
import { ApexTestQueueItem } from '../model/ApexTestQueueItem';
import { Pollable, poll, retry } from './Poll';

const PENDING_STATUSES = "'Holding', 'Queued', 'Preparing', 'Processing'";

export class TestRunCancelAborter implements TestRunAborter {
  async abortRun(
    logger: Logger,
    connection: Connection,
    testRunId: string,
    options: CancelTestRunOptions = {}
  ): Promise<string[]> {
    logger.logRunCancelling(testRunId);

    const executeService = new ExecuteService(connection);
    const apexQueueItems = await this.queryPendingQueueItems(
      connection,
      logger,
      testRunId
    );

    const chunks = chunk(apexQueueItems, 1000);
    for (const chunk of chunks) {
      const ids = chunk.map(item => `'${item.Id}'`).join(',');

      const result = await retry(
        () =>
          executeService.executeAnonymous({
            apexCode: `
          List<ApexTestQueueItem> nonExecutedTests = [SELECT Id, Status FROM ApexTestQueueItem 
              WHERE Id in (${ids})];
          for (ApexTestQueueItem nonExecutedTest : nonExecutedTests) {
              nonExecutedTest.Status = 'Aborted';
          }
          update nonExecutedTests;
        `,
          }),
        logger,
        {
          retries: 2,
        }
      );

      if (!result.success) {
        throw new TestError(
          `Anon apex to abort tests did not succeed, result='${JSON.stringify({
            success: result.success,
            compiled: result.compiled,
            diagnostic: result.diagnostic,
          })}'`
        );
      }
    }

    if (!options.skipCancelConfirmation) {
      await this.waitForCancelConfirmation(
        logger,
        connection,
        testRunId,
        options
      );
    }

    logger.logRunCancelled(testRunId);

    return apexQueueItems.map(x => x.Id);
  }

  private async queryPendingQueueItems(
    connection: Connection,
    logger: Logger,
    testRunId: string
  ): Promise<ApexTestQueueItem[]> {
    return QueryHelper.instance(connection, logger).query<ApexTestQueueItem>(
      'ApexTestQueueItem',
      `Status IN (${PENDING_STATUSES}) AND ParentJobId='${testRunId}'`,
      'Id'
    );
  }

  // The abort DML above only requests cancellation; the org can take a moment
  // to actually stop processing the queue items. Poll for confirmation so a
  // caller that resubmits the same classes doesn't race the still-live run
  // (ALREADY_IN_PROCESS) - callers that resubmit nothing can skip this.
  // Best-effort: on timeout or error, warn and return rather than throw.
  private async waitForCancelConfirmation(
    logger: Logger,
    connection: Connection,
    testRunId: string,
    options: CancelTestRunOptions
  ): Promise<void> {
    const confirmation: Pollable<number> = {
      pollDelay: getCancelPollInterval(options).milliseconds,
      pollTimeout: getCancelPollTimeout(options).milliseconds,
      pollTimeoutMessage: `Timed out waiting for test run '${testRunId}' to finish cancelling`,

      poll: async () => {
        const outstanding = await this.queryPendingQueueItems(
          connection,
          logger,
          testRunId
        );
        if (outstanding.length > 0) {
          logger.logWaitingForCancel(testRunId, outstanding.length);
        }
        return outstanding.length;
      },

      pollUntil: outstandingCount => outstandingCount === 0,
      pollRetryIf: () => true,
    };

    try {
      await poll(confirmation, logger);
    } catch (err) {
      logger.logWarning(
        `Could not confirm test run '${testRunId}' finished cancelling: ${
          TestError.wrapError(err).message
        }`
      );
    }
  }
}
