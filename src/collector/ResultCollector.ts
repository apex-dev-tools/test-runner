/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */

import { Connection } from '@salesforce/core';
import { TableUserConfig, table } from 'table';
import { Logger } from '../log/Logger';
import {
  ApexCodeCoverage,
  ApexCodeCoverageAggregate,
  ApexCodeCoverageAggregateFields,
  ApexCodeCoverageFields,
  CoverageReport,
} from '../model/ApexCodeCoverage';
import { ApexTestResult, ApexTestResultFields } from '../model/ApexTestResult';
import { QueryHelper } from '../query/QueryHelper';
import { TestError, TestErrorKind } from '../runner/TestError';
import { TestResultMatcher } from './TestResultMatcher';
import { chunk } from '../query/Chunk';

const config: TableUserConfig = {
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

export interface ResultsByType {
  rerun: ApexTestResult[];
  failed: ApexTestResult[];
  passed: ApexTestResult[];
}

export class ResultCollector {
  private static RECORD_QUERY_LIMIT = 500;

  static async gatherResults(
    connection: Connection,
    testRunId: string
  ): Promise<ApexTestResult[]> {
    return await QueryHelper.instance(connection).query<ApexTestResult>(
      'ApexTestResult',
      `AsyncApexJobId='${testRunId}' AND IsTestSetup=FALSE`,
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

  static async getCoverageReport(
    connection: Connection,
    tests: ApexTestResult[]
  ): Promise<CoverageReport> {
    const helper = QueryHelper.instance(connection);
    const aggregate: ApexCodeCoverageAggregate[] =
      await ResultCollector.gatherCoverage(helper, tests)
        .then(coverage =>
          ResultCollector.gatherCodeCoverageAggregate(helper, coverage)
        )
        .catch(e => {
          throw TestError.wrapError(
            e,
            TestErrorKind.Query,
            'Failed getting coverage data:'
          );
        });
    ResultCollector.formatForApexAggregate(aggregate);

    if (aggregate.length) {
      return {
        table: table(ResultCollector.formatForApexAggregate(aggregate), config),
        data: aggregate,
      };
    } else {
      return { table: undefined, data: [] };
    }
  }

  private static async gatherCoverage(
    helper: QueryHelper,
    tests: ApexTestResult[]
  ): Promise<ApexCodeCoverage[]> {
    const ids = [...new Set(tests.map(t => `'${t.ApexClass.Id}'`))];
    if (ids.length <= 0) {
      return Promise.resolve([]);
    }
    const chunked = chunk<string>(ids, this.RECORD_QUERY_LIMIT);
    const promises = chunked.map(async chunk => {
      return helper.query<ApexCodeCoverage[]>(
        'ApexCodeCoverage',
        `ApexTestClassId IN (${chunk.join(', ')})`,
        ApexCodeCoverageFields.join(', ')
      );
    });
    return (await Promise.all(promises)).flat(3);
  }

  private static async gatherCodeCoverageAggregate(
    helper: QueryHelper,
    coverage: ApexCodeCoverage[]
  ): Promise<ApexCodeCoverageAggregate[]> {
    const ids = [...new Set(coverage.map(t => `'${t.ApexClassOrTrigger.Id}'`))];
    if (ids.length <= 0) {
      return Promise.resolve([]);
    }
    const chunked = chunk<string>(ids, this.RECORD_QUERY_LIMIT);

    const promises = chunked.map(chunk => {
      return helper.query<ApexCodeCoverageAggregate[]>(
        'ApexCodeCoverageAggregate',
        `ApexClassorTriggerId IN (${chunk.join(', ')})`,
        ApexCodeCoverageAggregateFields.join(', ')
      );
    });
    return (await Promise.all(promises)).flat(3);
  }

  private static formatForApexAggregate(
    aggregate: ApexCodeCoverageAggregate[]
  ) {
    const MAX_LINES_PER_ROW = 5;

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

      const uncoveredLines = ag.Coverage.uncoveredLines
        .slice(0, MAX_LINES_PER_ROW)
        .join(',');
      const uncoveredLinesStr =
        ag.Coverage.uncoveredLines.length < MAX_LINES_PER_ROW
          ? uncoveredLines
          : `${uncoveredLines}...`;
      return [ag.ApexClassOrTrigger.Name, pct, uncoveredLinesStr];
    });
    return [header, ...data];
  }
}
