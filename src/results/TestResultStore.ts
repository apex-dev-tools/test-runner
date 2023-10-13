/*
 * Copyright (c) 2023, Certinia Inc. All rights reserved.
 */

import { CoverageReport } from '../model/ApexCodeCoverage';
import { ApexTestResult, BaseTestResult } from '../model/ApexTestResult';
import { ApexTestRunResult } from '../model/ApexTestRunResult';
import { TestError } from '../runner/TestError';
import { TestRunnerResult } from '../runner/TestRunner';
import { TestRerun, TestRunSummary } from './OutputGenerator';
import { getTestName } from './TestResultUtils';

// internal store for saving test progress
// and generating into final summary

export class TestResultStore {
  startTime: Date;
  run?: ApexTestRunResult;
  runIds: string[];
  tests: Map<string, ApexTestResult>;
  asyncError?: TestError;
  reruns: TestRerun[];
  coverage?: CoverageReport;

  get resultsArray() {
    return Array.from(this.tests.values());
  }

  constructor(startTime?: Date) {
    this.startTime = startTime || new Date();
    this.runIds = [];
    this.tests = new Map<string, ApexTestResult>();
    this.reruns = [];
  }

  public saveAsyncResult(res: TestRunnerResult): void {
    this.updateRunResult(res.run);

    this.runIds.push(res.run.AsyncApexJobId);

    res.tests.forEach(test => {
      this.tests.set(getTestName(test), test);
    });

    this.asyncError = res.error;
  }

  public saveSyncResult(reruns: TestRerun[]): void {
    this.reruns = reruns;

    // replace original test in final results
    reruns.forEach(({ fullName, before, after }) => {
      this.tests.set(fullName, this.mergeSyncResult(before, after));
    });

    if (this.run) {
      const time = reruns.reduce((a, c) => a + c.after.RunTime, 0);
      const passed = reruns.filter(r => r.after.Outcome === 'Pass').length;

      // totalTime can now exceed sum of run times in summary
      // since it includes original + rerun time
      this.run.TestTime += time;
      this.run.MethodsFailed -= passed;
    }
  }

  public saveCoverage(report: CoverageReport): void {
    this.coverage = report;
  }

  public hasError() {
    const status = this.run?.Status;
    return status === 'Aborted' || status === 'Failed' || this.asyncError;
  }

  public hasAborted() {
    return this.run?.Status === 'Aborted';
  }

  public toRunSummary(error?: unknown): TestRunSummary {
    if (!this.run) {
      throw (
        this.asyncError ||
        error ||
        new TestError('Failed to generate results, no async run record')
      );
    }

    return {
      startTime: this.startTime,
      testResults: this.resultsArray,
      runResult: this.run,
      runIds: this.runIds,
      reruns: this.reruns,
      coverageResult: this.coverage,
    };
  }

  private updateRunResult(newRun: ApexTestRunResult): void {
    if (this.run != null) {
      this.run.Status = newRun.Status;
      this.run.EndTime = newRun.EndTime;
      this.run.TestTime += newRun.TestTime;
      this.run.ClassesCompleted += newRun.ClassesCompleted;
      this.run.ClassesEnqueued += newRun.ClassesEnqueued;
      this.run.MethodsCompleted += newRun.MethodsCompleted;
      this.run.MethodsEnqueued += newRun.MethodsEnqueued;
      this.run.MethodsFailed += newRun.MethodsFailed;
    } else {
      this.run = newRun;
    }
  }

  private mergeSyncResult(
    before: ApexTestResult,
    after: BaseTestResult
  ): ApexTestResult {
    return {
      ...before,
      Outcome: after.Outcome,
      Message: after.Message,
      StackTrace: after.StackTrace,
      RunTime: after.RunTime,
      TestTimestamp: after.TestTimestamp,
    };
  }
}
