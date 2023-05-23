/*
 * Copyright (c) 2019, FinancialForce.com, inc. All rights reserved.
 */
import { Logger } from '../log/Logger';
import { CoverageReport } from '../model/ApexCodeCoverage';
import {
  ApexTestResult,
  BaseTestResult,
  OutcomeMap,
} from '../model/ApexTestResult';
import { ApexTestRunResult } from '../model/ApexTestRunResult';

export interface TestRerun {
  fullName: string;
  before: ApexTestResult;
  after: BaseTestResult;
}

export interface TestRunSummary {
  startTime: Date;
  testResults: ApexTestResult[];
  runResult: ApexTestRunResult;
  runIds: string[];
  reruns: TestRerun[];
  coverageResult?: CoverageReport;
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
