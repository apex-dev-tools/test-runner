/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */

import { Connection } from '@apexdevtools/sfdx-auth-helper';
import { ApexTestResult } from '../model/ApexTestResult';
import { QueryHelper } from '../query/QueryHelper';

export interface ResultsByType {
  locked: ApexTestResult[];
  failed: ApexTestResult[];
  passed: ApexTestResult[];
}

export class ResultCollector {
  static async gatherResults(
    connection: Connection,
    testRunId: string
  ): Promise<ApexTestResult[]> {
    return await QueryHelper.instance(connection).query<ApexTestResult>(
      'ApexTestResult',
      `AsyncApexJobId='${testRunId}'`,
      `Id, QueueItemId, StackTrace, Message, AsyncApexJobId, MethodName, Outcome, RunTime, 
        ApexClass.Id, ApexClass.Name, ApexClass.NamespacePrefix`
    );
  }

  static reGroupRecords(results: ResultsByType): ResultsByType {
    const all = results.passed.concat(results.locked, results.failed);
    return this.groupRecords(all);
  }

  static groupRecords(records: ApexTestResult[]): ResultsByType {
    const results: ResultsByType = {
      locked: [],
      failed: [],
      passed: [],
    };
    records.filter(testDetail => {
      const testMessage = testDetail.Message ? testDetail.Message : '';
      if (testDetail.Outcome === 'Pass') {
        results.passed.push(testDetail);
      } else if (
        testDetail.Outcome !== 'Pass' &&
        testDetail.Outcome !== 'Skip' &&
        (testMessage.search(/UNABLE_TO_LOCK_ROW/) !== -1 ||
          testMessage.search(/deadlock detected while waiting for resource/) !==
            -1)
      ) {
        results.locked.push(testDetail);
      } else {
        results.failed.push(testDetail);
      }
    });
    return results;
  }
}
