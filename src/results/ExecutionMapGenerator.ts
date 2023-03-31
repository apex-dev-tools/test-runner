/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */

import { OutputGenerator, TestRunSummary } from './OutputGenerator';
import { Logger } from '../log/Logger';
import { SfDate } from 'jsforce';
import path from 'path';

/*
 * Create a report (CSV) of summary stats for each test class. The report can be useful in finding long running
 * test which are delaying the completion of a test run.
 */
export class ExecutionMapGenerator implements OutputGenerator {
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
    const { testResults: testResults } = summary;
    let startTime = SfDate.parseDate(testResults[0].TestTimestamp).getTime();
    let endTime = startTime + testResults[0].RunTime;
    const classStartMap = new Map<string, number>();
    testResults.forEach(test => {
      const className = test.ApexClass.Name;
      const timeStamp = SfDate.parseDate(test.TestTimestamp).getTime();
      startTime = Math.min(startTime, timeStamp);
      endTime = Math.max(endTime, timeStamp + test.RunTime);
      const existingStart = classStartMap.get(className);
      classStartMap.set(
        className,
        Math.min(timeStamp, existingStart || timeStamp)
      );
    });

    const classStart = Array.from(classStartMap.keys());
    classStart.sort(function (a, b) {
      const aStart = classStartMap.get(a) as number;
      const bStart = classStartMap.get(b) as number;
      return aStart - bStart;
    });

    const startSeconds = startTime / 1000;
    const length = Math.ceil((endTime - startTime) / 1000);
    const classesOrdered = Array.from(classStartMap.keys());
    const results: boolean[][] = [];
    for (let i = 0; i < classesOrdered.length; i++)
      results.push(Array(length).fill(false));

    testResults.forEach(test => {
      const idx = classStart.findIndex(v => v == test.ApexClass.Name);
      if (idx) {
        const testMap = results[idx];
        const startIdx =
          SfDate.parseDate(test.TestTimestamp).getTime() / 1000 - startSeconds;
        const endIdx = startIdx + test.RunTime / 1000;
        for (let cellIdx = startIdx; cellIdx <= endIdx; cellIdx++) {
          testMap[cellIdx] = true;
        }
      }
    });

    // Report results as PPM image with 0-7 RGB values
    const lines: string[] = [];
    lines.push('P3');
    lines.push(`${length} ${results.length}`);
    lines.push('7');
    results.forEach(classResult => {
      let imageBits = '';
      const first = classResult.findIndex(v => v == true);
      const last = classResult.lastIndexOf(true);
      let hasGap = false;
      classResult.forEach((on, idx) => {
        if (on) {
          if (hasGap) imageBits += '0 0 7 ';
          else imageBits += '0 0 0 ';
        } else if (idx >= first && idx < last) {
          hasGap = true;
          imageBits += '7 0 0 ';
        } else {
          imageBits += '7 7 7 ';
        }
      });
      lines.push(imageBits);
    });
    lines.push('');
    logger.logOutputFile(
      path.join(outputDirBase, fileName + '-time.ppm'),
      lines.join('\n')
    );
  }
}
