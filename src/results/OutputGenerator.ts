/*
 * Copyright (c) 2019, FinancialForce.com, inc. All rights reserved.
 */
import {
  ApexTestResult,
  OutcomeMap,
  CoverageReport,
} from '../model/ApexTestResult';
import { ApexTestRunResult } from '../model/ApexTestRunResult';
import { Logger } from '../log/Logger';

export interface TestRunSummary {
  startTime: Date;
  testResults: ApexTestResult[];
  runResult: ApexTestRunResult;
  coverageResult?: CoverageReport;
  hasReRuns?: boolean;
}
export interface OutputGenerator {
  generate(
    logger: Logger,
    outputDirBase: string,
    fileName: string,
    summary: TestRunSummary
  ): void;
}

export function groupByOutcome(
  results: ApexTestResult[]
): OutcomeMap<ApexTestResult[]> {
  return results.reduce(
    (acc, current) => {
      const outcome = current.Outcome;
      acc[outcome].push(current);
      return acc;
    },
    {
      Pass: [],
      Fail: [],
      CompileFail: [],
      Skip: [],
    } as OutcomeMap<ApexTestResult[]>
  );
}
