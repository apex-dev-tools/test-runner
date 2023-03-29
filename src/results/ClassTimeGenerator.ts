/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */

import { OutputGenerator, TestRunSummary } from './OutputGenerator';
import { Logger } from '../log/Logger';
import { SfDate } from 'jsforce';

/*
 * Create a report (CSV) of summary stats for each test class. The report can be useful in finding long running
 * test which are delaying the completion of a test run.
 */
export class ClassTimeGenerator implements OutputGenerator {
  private instanceUrl: string;
  private orgId: string;
  private username: string;

  constructor(instanceUrl: string, orgId: string, username: string) {
    this.instanceUrl = instanceUrl;
    this.orgId = orgId;
    this.username = username;
  }

  generate(
    logger: Logger,
    outputFileBase: string,
    summary: TestRunSummary
  ): void {
    // Collate start, end and 'sum of' times for each test class
    const classRanges = new Map<string, [number, number, number]>();
    summary.testResults.forEach(test => {
      const className = test.ApexClass.Name;
      const timeStamp = SfDate.parseDate(test.TestTimestamp).getTime();
      if (!classRanges.has(className)) {
        classRanges.set(className, [
          timeStamp,
          timeStamp + test.RunTime,
          test.RunTime,
        ]);
      } else {
        const range = classRanges.get(className) as [number, number, number];
        classRanges.set(className, [
          Math.min(range[0], timeStamp),
          Math.max(range[1], timeStamp + test.RunTime),
          range[2] + test.RunTime,
        ]);
      }
    });

    // Report results as CSV
    const lines: string[] = [];
    classRanges.forEach((v, k) => {
      lines.push(`${k}, ${v[0]}, ${v[1]}, ${v[2]}`);
    });
    logger.logOutputFile(
      outputFileBase + '-time.csv',
      'ClassName, StartTime, EndTime, TotalTime\n' +
        `# ${this.instanceUrl} ${this.orgId} ${this.username}\n` +
        lines.join('\n')
    );
  }
}
