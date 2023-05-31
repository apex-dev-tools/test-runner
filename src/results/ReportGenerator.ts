// The below code is reconstructed from salesform-alm TestResult.js
// It generates the JUnit xml report ouput.

/*
 * Copyright (c) 2016, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root  or https://opensource.org/licenses/BSD-3-Clause
 */

import { Moment } from 'moment';
import _ from 'lodash';

import { ApexTestRunResult } from '../model/ApexTestRunResult';
import { ApexTestResult } from '../model/ApexTestResult';
import { OutputGenerator, TestRunSummary } from './OutputGenerator';
import moment from 'moment';
import { Logger } from '../log/Logger';
import { SfDate } from 'jsforce';
import path from 'path';

export class ReportGenerator implements OutputGenerator {
  private instanceUrl: string;
  private orgId: string;
  private username: string;
  private suitename: string;

  constructor(
    instanceUrl: string,
    orgId: string,
    username: string,
    suitename: string
  ) {
    this.instanceUrl = instanceUrl;
    this.orgId = orgId;
    this.username = username;
    this.suitename = suitename;
  }

  generate(
    logger: Logger,
    outputDirBase: string,
    fileName: string,
    runSummary: TestRunSummary
  ): void {
    const { startTime, testResults, runResult } = runSummary;
    const results = testResults as ExtendedApexTestResult[];
    const summary = this.summary(startTime, results, runResult);
    logger.logOutputFile(
      path.join(outputDirBase, fileName + '.xml'),
      this.generateJunit(summary, results)
    );
    logger.logOutputFile(
      path.join(outputDirBase, fileName + '.json'),
      this.generateJson(summary, results)
    );
  }

  summary(
    startTime: Date,
    testResults: ExtendedApexTestResult[],
    runResults: ApexTestRunResult
  ): SummaryData {
    // combine test and method names for fullname
    testResults.forEach(test => {
      if (!test.FullName) {
        const className = test.ApexClass.Name;
        test.FullName = `${className}.${test.MethodName}`;
      }
    });

    // sort by fullname
    testResults.sort((test1, test2) => {
      const testName1 = test1.FullName.toUpperCase();
      const testName2 = test2.FullName.toUpperCase();
      if (testName1 < testName2) {
        return -1;
      }
      if (testName1 > testName2) {
        return 1;
      }
      return 0;
    });

    const failures = testResults.filter(
      test => test.Outcome !== 'Pass' && test.Outcome !== 'Skip'
    );
    const totalFailed = failures.length;
    const skips = testResults.filter(test => test.Outcome === 'Skip');
    const totalSkipped = skips.length;
    const total = testResults.length;
    const outcome = totalFailed > 0 ? 'Failed' : 'Passed';
    const totalPassed = total - totalFailed - totalSkipped;
    const passRate = `${((totalPassed / (total - totalSkipped)) * 100).toFixed(
      2
    )}%`;
    const failRate = `${((totalFailed / (total - totalSkipped)) * 100).toFixed(
      2
    )}%`;

    // time of cmd invocation
    const commandTime = moment().diff(moment(startTime), 'millisecond', true);

    // start time per run summary
    const testStartTime = moment.parseZone(runResults.StartTime).local();

    // total time per run summary
    const testTotalTime = runResults.TestTime;

    // sum of all test.RunTime
    const testExecutionTime = testResults.reduce(
      (result, test) => result + test.RunTime,
      0
    );

    return {
      outcome: outcome,
      testsRan: total,
      passing: totalPassed,
      failing: totalFailed,
      skipped: totalSkipped,
      passRate: passRate,
      failRate: failRate,
      testStartTime: testStartTime,
      testExecutionTime: testExecutionTime,
      testTotalTime: testTotalTime,
      commandTime: commandTime,
      hostname: this.instanceUrl,
      orgId: this.orgId,
      username: this.username,
      testRunId: runResults.AsyncApexJobId,
      userId: runResults.UserId,
    };
  }

  public generateJunit(
    summary: SummaryData,
    testResults: ExtendedApexTestResult[]
  ): string {
    function msToSeconds(ms: number): number {
      return _.round(ms / 1000, 2);
    }
    // reference schema https://github.com/windyroad/JUnit-Schema/blob/master/JUnit.xsd
    let junit = '<?xml version="1.0" encoding="UTF-8"?>\n';
    junit += '<testsuites>\n';
    // REVIEWME: attempt to replace "(root)" via name and classname
    junit += `    <testsuite name="${this.suitename}" `;
    junit += `timestamp="${summary.testStartTime.format()}" `;
    junit += `hostname="${this.instanceUrl}" `;
    junit += `tests="${summary.testsRan}" `;
    junit += `failures="${summary.failing}"  `;
    junit += 'errors="0"  '; // FIXME
    junit += `time="${msToSeconds(summary.testExecutionTime)}"`;
    junit += '>\n';
    junit += '        <properties>\n';
    junit += `            <property name="outcome" value="${summary.outcome}"/>\n`;
    junit += `            <property name="testsRan" value="${summary.testsRan}"/>\n`;
    junit += `            <property name="passing" value="${summary.passing}"/>\n`;
    junit += `            <property name="failing" value="${summary.failing}"/>\n`;
    junit += `            <property name="skipped" value="${summary.skipped}"/>\n`;
    junit += `            <property name="passRate" value="${summary.passRate}"/>\n`;
    junit += `            <property name="failRate" value="${summary.failRate}"/>\n`;
    junit += `            <property name="testStartTime" value="${summary.testStartTime.format(
      'lll'
    )}"/>\n`;
    junit += `            <property name="testExecutionTime" value="${msToSeconds(
      summary.testExecutionTime
    )} s"/>\n`;
    junit += `            <property name="testTotalTime" value="${msToSeconds(
      summary.testTotalTime
    )} s"/>\n`;
    junit += `            <property name="commandTime" value="${msToSeconds(
      summary.commandTime
    )} s"/>\n`;
    junit += `            <property name="hostname" value="${summary.hostname}"/>\n`;
    junit += `            <property name="orgId" value="${summary.orgId}"/>\n`;
    junit += `            <property name="username" value="${summary.username}"/>\n`;
    junit += `            <property name="testRunId" value="${summary.testRunId}"/>\n`;
    junit += `            <property name="userId" value="${summary.userId}"/>\n`;
    junit += '        </properties>\n';
    testResults.forEach(test => {
      const success = test.Outcome === 'Pass';
      let classname = _.escape(test.ApexClass.Name);
      if (test.ApexClass.NamespacePrefix) {
        classname = test.ApexClass.NamespacePrefix + '.' + classname;
      }
      const methodName = _.escape(test.MethodName);
      junit += `        <testcase name="${methodName}" classname="${classname}" time="${msToSeconds(
        test.RunTime
      )}">\n`;
      if (!success) {
        const message = test.Message ? test.Message : 'No failure message!';
        junit += `            <failure message="${_.escape(message)}">`;
        if (test.StackTrace) {
          junit += `<![CDATA[${test.StackTrace}]]>`;
        }
        junit += '</failure>\n';
      }
      junit += '        </testcase>\n';
    });
    junit += '    </testsuite>\n';
    junit += '</testsuites>\n';
    return junit;
  }

  public generateJson(
    summary: SummaryData,
    testResults: ExtendedApexTestResult[]
  ): string {
    let json = '{\n';
    json += '  "summary": {\n';

    json += `    "outcome": "${summary.outcome}",\n`;
    json += `    "testsRan": "${summary.testsRan}",\n`;
    json += `    "passing": "${summary.passing}",\n`;
    json += `    "failing": "${summary.failing}",\n`;
    json += `    "skipped": "${summary.skipped}",\n`;
    json += `    "passRate": "${summary.passRate}",\n`;
    json += `    "failRate": "${summary.failRate}",\n`;
    json += `    "testStartTime": "${summary.testStartTime.format('lll')}",\n`;
    json += `    "testExecutionTime": "${summary.testExecutionTime} ms",\n`;
    json += `    "testTotalTime": "${summary.testTotalTime} ms",\n`;
    json += `    "commandTime": "${summary.commandTime} ms",\n`;
    json += `    "hostname": "${summary.hostname}",\n`;
    json += `    "orgId": "${summary.orgId}",\n`;
    json += `    "username": "${summary.username}",\n`;
    json += `    "testRunId": "${summary.testRunId}",\n`;
    json += `    "userId": "${summary.userId}"\n`;
    json += '  },\n';
    json += '  "tests": [\n';

    testResults.forEach(test => {
      const success = test.Outcome === 'Pass';
      json += '  {\n';
      json += `   "attributes": { "type": "ApexTestResult", "url": "/services/data/v43.0/tooling/sobjects/ApexTestResult/${test.Id}"},\n`;
      json += `   "Id": "${test.Id}",\n`;
      json += `   "QueueItemId": "${test.QueueItemId}",\n`;
      if (test.StackTrace && !success) {
        const stk = test.StackTrace.replace(/"/g, "'").replace(/\n/g, ' ');
        json += `   "StackTrace": "${stk}",\n`;
      } else {
        json += '   "StackTrace": null,\n';
      }
      if (test.Message && !success) {
        const msg = test.Message.replace(/"/g, "'").replace(/\n/g, ' ');
        json += `   "Message": "${msg}",\n`;
      } else {
        json += '   "Message": null,\n';
      }
      json += `   "AsyncApexJobId": "${test.AsyncApexJobId}",\n`;
      json += `   "MethodName": "${test.MethodName}",\n`;
      json += `   "Outcome": "${test.Outcome}",\n`;
      json += '   "ApexClass": {\n';
      json += `     "attributes": { "type": "ApexClass", "url": "/services/data/v43.0/tooling/sobjects/ApexClass/${test.ApexClass.Id}"},\n`;
      json += `     "Id": "${test.ApexClass.Id}",\n`;
      json += `     "Name": "${test.ApexClass.Name}",\n`;
      json += `     "NamespacePrefix": "${
        test.ApexClass.NamespacePrefix ? test.ApexClass.NamespacePrefix : ''
      }"\n`;
      json += '   },\n';
      json += `   "StartTime": ${SfDate.parseDate(
        test.TestTimestamp
      ).getTime()},\n`;
      json += `   "RunTime": ${test.RunTime},\n`;
      json += `   "FullName": "${test.ApexClass.Name}.${test.MethodName}"\n`;
      json += '  },\n';
    });
    json = json.substring(0, json.length - 2) + '\n'; // Remove last ","
    json += '    ]\n';
    json += '}\n';
    return json;
  }
}

interface ExtendedApexTestResult extends ApexTestResult {
  FullName: string;
}

interface SummaryData {
  outcome: string;
  testsRan: number;
  passing: number;
  failing: number;
  skipped: number;
  passRate: string;
  failRate: string;
  testStartTime: Moment;
  testExecutionTime: number; // ms
  testTotalTime: number; // ms
  commandTime: number; //ms
  hostname: string;
  orgId: string;
  username: string;
  testRunId: string;
  userId: string;
}
