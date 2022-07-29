/*
 * Copyright (c) 2019, FinancialForce.com, inc. All rights reserved.
 */
import { ApexTestResult } from '../model/ApexTestResult';
import { ApexTestRunResult } from '../model/ApexTestRunResult';
import { Moment } from 'moment';
import { Logger } from '../log/Logger';

export interface OutputGenerator {
  generate(
    logger: Logger,
    outputFileBase: string,
    startTime: Moment,
    tests: ApexTestResult[],
    runResultSummary: ApexTestRunResult
  ): void;
}
