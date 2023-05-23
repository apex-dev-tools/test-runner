/*
 * Copyright (c) 2023, FinancialForce.com, inc. All rights reserved.
 */

import { SfDate } from 'jsforce';
import path from 'path';
import { Logger } from '../log/Logger';
import { BaseTestResult, Outcome } from '../model/ApexTestResult';
import { OutputGenerator, TestRerun, TestRunSummary } from './OutputGenerator';

interface ReportTestResult {
  outcome: Outcome;
  message: string | null;
  stackTrace: string | null;
  runTime: number;
  startTime: number;
}

interface RerunReport {
  fullName: string;
  apexClass: {
    id: string;
    name: string;
    namespacePrefix: string;
  };
  methodName: string;
  results: ReportTestResult[];
}

export class RerunReportGenerator implements OutputGenerator {
  public generate(
    logger: Logger,
    outputDirBase: string,
    fileName: string,
    summary: TestRunSummary
  ): void {
    logger.logOutputFile(
      path.join(outputDirBase, fileName + '-reruns'),
      this.generateJson(summary.reruns)
    );
  }

  private generateJson(reruns: TestRerun[]): string {
    const report: RerunReport[] = reruns.map(r => {
      const cls = r.before.ApexClass;

      return {
        fullName: r.fullName,
        apexClass: {
          id: cls.Id,
          name: cls.Name,
          namespacePrefix: cls.NamespacePrefix ? cls.NamespacePrefix : '',
        },
        methodName: r.before.MethodName,
        results: [this.convertResult(r.before), this.convertResult(r.after)],
      };
    });

    return JSON.stringify(report, undefined, 2);
  }

  private convertResult(r: BaseTestResult): ReportTestResult {
    return {
      outcome: r.Outcome,
      message: r.Message,
      stackTrace: r.StackTrace,
      runTime: r.RunTime,
      startTime: SfDate.parseDate(r.TestTimestamp).getTime(),
    };
  }
}
