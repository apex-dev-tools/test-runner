/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */

import { OutputGenerator, TestRunSummary } from './OutputGenerator';
import { Logger } from '../log/Logger';
import { SfDate } from 'jsforce';
import path from 'path';

/*
 * Create a report (CSV/JSON) of summary stats for each test class. The report can be useful in finding long running
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
    outputDirBase: string,
    fileName: string,
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
      path.join(outputDirBase, fileName + '-time.csv'),
      'ClassName,StartTime,EndTime,TotalTime\n' +
        `# ${this.instanceUrl} ${this.orgId} ${this.username}\n` +
        lines.join('\n')
    );

    // Report results as json
    const json: {
      className: string;
      startTime: number;
      endTime: number;
      totalTime: number;
    }[] = [];
    classRanges.forEach((v, k) => {
      json.push({
        className: k,
        startTime: v[0],
        endTime: v[1],
        totalTime: v[2],
      });
    });
    logger.logOutputFile(
      path.join(outputDirBase, fileName + '-time.json'),
      JSON.stringify(json, undefined, 2)
    );
  }
}
