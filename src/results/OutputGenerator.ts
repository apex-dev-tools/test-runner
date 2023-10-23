/*
 * Copyright (c) 2019, FinancialForce.com, inc. All rights reserved.
 */
import { Logger } from '../log/Logger';
import { CoverageReport } from '../model/ApexCodeCoverage';
import { ApexTestResult, BaseTestResult } from '../model/ApexTestResult';
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
