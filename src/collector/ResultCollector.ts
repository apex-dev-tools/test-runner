/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */

import { Connection } from '@apexdevtools/sfdx-auth-helper';
import { Logger } from '../log/Logger';
import { ApexTestResult } from '../model/ApexTestResult';
import { QueryHelper } from '../query/QueryHelper';
import { TestResultMatcher } from './TestResultMatcher';

export interface ResultsByType {
  rerun: ApexTestResult[];
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
      `Id, QueueItemId, StackTrace, Message, AsyncApexJobId, MethodName, Outcome, RunTime, TestTimestamp,
        ApexClass.Id, ApexClass.Name, ApexClass.NamespacePrefix`
    );
  }

  static reGroupRecords(logger: Logger, results: ResultsByType): ResultsByType {
    const all = results.passed.concat(results.rerun, results.failed);
    return this.groupRecords(logger, all);
  }

  static groupRecords(
    logger: Logger,
    records: ApexTestResult[]
  ): ResultsByType {
    const results: ResultsByType = {
      rerun: [],
      failed: [],
      passed: [],
    };
    const matcher = TestResultMatcher.create(logger);
    records.filter(testDetail => {
      const testMessage = testDetail.Message ? testDetail.Message : '';
      if (testDetail.Outcome === 'Pass') {
        results.passed.push(testDetail);
      } else if (
        testDetail.Outcome !== 'Pass' &&
        testDetail.Outcome !== 'Skip' &&
        matcher.doesMatchAny(testMessage)
      ) {
        results.rerun.push(testDetail);
      } else {
        results.failed.push(testDetail);
      }
    });
    return results;
  }
}
