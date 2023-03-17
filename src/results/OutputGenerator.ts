/*
 * Copyright (c) 2019, FinancialForce.com, inc. All rights reserved.
 */
import { ApexTestResult, OutcomeMap } from '../model/ApexTestResult';
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
