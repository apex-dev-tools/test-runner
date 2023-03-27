/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */

import { Connection } from '@apexdevtools/sfdx-auth-helper';
import { Logger } from '../log/Logger';
import {
  ApexTestResult,
  ApexTestResultFields,
  ApexCodeCoverage,
  ApexCodeCoverageFields,
  ApexCodeCoverageAggregate,
  ApexCodeCoverageAggregateFields,
} from '../model/ApexTestResult';
import { QueryHelper, QueryOptions } from '../query/QueryHelper';
import { TestResultMatcher } from './TestResultMatcher';
import { table } from 'table';

export interface ResultsByType {
  rerun: ApexTestResult[];
  failed: ApexTestResult[];
  passed: ApexTestResult[];
}

const config = {
  border: {
    topBody: '',
    topJoin: '',
    topLeft: '',
    topRight: '',

    bottomBody: '',
    bottomJoin: '',
    bottomLeft: '',
    bottomRight: '',

    bodyLeft: '',
    bodyRight: '',
    bodyJoin: '',

    joinBody: '',
    joinLeft: '',
    joinRight: '',
    joinJoin: '',
  },
  singleLine: true,
};

export class ResultCollector {
  static async gatherResults(
    connection: Connection,
    testRunId: string
  ): Promise<ApexTestResult[]> {
    return await QueryHelper.instance(connection.tooling).query<ApexTestResult>(
      'ApexTestResult',
      `AsyncApexJobId='${testRunId}'`,
      ApexTestResultFields.join(', ')
    );
  }

  static async gatherResultsWithRetry(
    connection: Connection,
    testRunId: string,
    logger: Logger,
    options: QueryOptions
  ): Promise<ApexTestResult[]> {
    return await QueryHelper.instance(
      connection.tooling
    ).queryWithRetry<ApexTestResult>(logger, options)(
      'ApexTestResult',
      `AsyncApexJobId='${testRunId}'`,
      ApexTestResultFields.join(', ')
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

  static async gatherCoverage(
    connection: Connection,
    tests: ApexTestResult[]
  ): Promise<ApexCodeCoverage[]> {
    const ids = tests.map(t => `'${t.ApexClass.Id}'`).join(', ');
    return await QueryHelper.instance(
      connection.tooling
    ).query<ApexCodeCoverage>(
      'ApexCodeCoverage',
      `ApexTestClassId IN (${ids})`,
      ApexCodeCoverageFields.join(', ')
    );
  }

  static async gatherCodeCoverageAggregate(
    connection: Connection,
    coverage: ApexCodeCoverage[]
  ): Promise<ApexCodeCoverageAggregate[]> {
    const ids = [
      ...new Set(coverage.map(t => `'${t.ApexClassOrTrigger.Id}'`)),
    ].join(', ');
    return await QueryHelper.instance(
      connection.tooling
    ).query<ApexCodeCoverageAggregate>(
      'ApexCodeCoverageAggregate',
      `ApexClassorTriggerId IN (${ids})`,
      ApexCodeCoverageAggregateFields.join(', ')
    );
  }

  static async getCoverageTextReport(
    connection: Connection,
    testRunId: string
  ): Promise<string> {
    const res = await ResultCollector.gatherResults(connection, testRunId);
    const coverage = await ResultCollector.gatherCoverage(connection, res);
    const aggregate = await ResultCollector.gatherCodeCoverageAggregate(
      connection,
      coverage
    );
    const header = ['CLASSES', 'PERCENT', 'UNCOVERED LINES'];
    const data = aggregate.map(ag => {
      const pct =
        ag.NumLinesUncovered + ag.NumLinesCovered > 0
          ? (
              ag.NumLinesCovered /
              (ag.NumLinesUncovered + ag.NumLinesCovered)
            ).toLocaleString(undefined, {
              style: 'percent',
              minimumFractionDigits: 0,
            })
          : '-';

      const uncoveredLines = ag.Coverage.uncoveredLines.slice(0, 5).join(','); //take 5
      const uncoveredLinesStr =
        ag.Coverage.uncoveredLines.length < 5
          ? uncoveredLines
          : `${uncoveredLines}...`;
      return [ag.ApexClassOrTrigger.Name, pct, uncoveredLinesStr];
    });
    return table([header, ...data], config);
  }
}
