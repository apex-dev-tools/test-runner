/*
 * Copyright (c) 2019, FinancialForce.com, inc. All rights reserved.
 */
import { ApexTestResult } from '../model/ApexTestResult';
import { ApexTestRunResult } from '../model/ApexTestRunResult';
import { Logger } from '../log/Logger';

export interface OutputGenerator {
  generate(
    logger: Logger,
    outputFileBase: string,
    startTime: Date,
    tests: ApexTestResult[],
    runResultSummary: ApexTestRunResult
  ): void;
}
