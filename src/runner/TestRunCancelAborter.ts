/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */

import { Logger } from '../log/Logger';
import { Connection } from '@salesforce/core';
import { ExecuteService } from '@salesforce/apex-node';
import { CancelTestRunOptions, TestRunAborter } from './TestOptions';
import { QueryHelper } from '../query/QueryHelper';
import { chunk } from '../query/Chunk';
import { TestError } from './TestError';
import { ApexTestQueueItem } from '../model/ApexTestQueueItem';
import { retry } from './Poll';

export class TestRunCancelAborter implements TestRunAborter {
  async abortRun(
    logger: Logger,
    connection: Connection,
    testRunId: string,
    options: CancelTestRunOptions = {}
  ): Promise<string[]> {
    logger.logRunCancelling(testRunId);

    const executeService = new ExecuteService(connection);
    const apexQueueItems = await QueryHelper.instance(
      connection,
      logger
    ).query<ApexTestQueueItem>(
      'ApexTestQueueItem',
      `Status IN ('Holding', 'Queued', 'Preparing', 'Processing') AND ParentJobId='${testRunId}'`,
      'Id'
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

    logger.logRunCancelled(testRunId);

    return apexQueueItems.map(x => x.Id);
  }
}
