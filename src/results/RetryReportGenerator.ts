/*
 * Copyright (c) 2023, FinancialForce.com, inc. All rights reserved.
 */

import { SfDate } from 'jsforce';
import path from 'path';
import { Logger } from '../log/Logger';
import { ApexClass, ApexTestResult } from '../model/ApexTestResult';
import { OutputGenerator, TestRetry, TestRunSummary } from './OutputGenerator';

type RequiredNotNull<T> = {
  [P in keyof T]: NonNullable<T[P]>;
};

interface ReportTestRetry {
  name: string;
  before: ReportTestResult;
  after: ReportTestResult;
}

type ReportTestResult = Omit<ApexTestResult, 'ApexClass' | 'TestTimestamp'> & {
  ApexClass: RequiredNotNull<ApexClass>;
  StartTime: number;
};

export class RetryReportGenerator implements OutputGenerator {
  public generate(
    logger: Logger,
    outputDirBase: string,
    fileName: string,
    summary: TestRunSummary
  ): void {
    logger.logOutputFile(
      path.join(outputDirBase, fileName + '-retries.json'),
      this.generateJson(summary.retries)
    );
  }

  private generateJson(retries: TestRetry[]): string {
    const report: ReportTestRetry[] = retries.map(r => ({
      name: r.name,
      before: this.convertTestResult(r.before),
      after: this.convertTestResult(r.after),
    }));

    return JSON.stringify(report, undefined, 2);
  }

  private convertTestResult(r: ApexTestResult): ReportTestResult {
    const { ApexClass: ac, TestTimestamp: ts, ...copy } = r;
    return {
      ...copy,
      ApexClass: {
        Id: ac.Id,
        Name: ac.Name,
        NamespacePrefix: ac.NamespacePrefix ? ac.NamespacePrefix : '',
      },
      StartTime: SfDate.parseDate(ts).getTime(),
    };
  }
}
