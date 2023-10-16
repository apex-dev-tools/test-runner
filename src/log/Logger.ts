/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */

import { TestallOptions } from '../command/Testall';
import { ApexTestResult, BaseTestResult } from '../model/ApexTestResult';
import { ApexTestRunResult } from '../model/ApexTestRunResult';
import { TestRunSummary } from '../results/OutputGenerator';

export interface Logger {
  readonly logDirPath: string;
  readonly verbose: boolean;

  // For general use
  logError(error: any): void;
  logWarning(message: any): void;
  logMessage(message: any): void;

  // Additonal output
  logOutputFile(path: string, contents: string): void;

  // Testall main flow
  logTestallStart(options: TestallOptions): void;
  logTestallRerun(missing: Map<string, Set<string>>): void;
  logMaxErrorAbort(failed: ApexTestResult[]): void;
  logTestWillRerun(tests: ApexTestResult[], matches: number): void;
  logTestRerun(
    name: string,
    result: BaseTestResult,
    otherResult: BaseTestResult
  ): void;
  logTestReports(summary: TestRunSummary): void;

  // Test runner
  logRunStarted(testRunId: string): void;
  logNoProgress(testRunId: string): void;
  logStatus(status: ApexTestRunResult, tests: ApexTestResult[]): void;
  logTestFailures(
    seenResults: ApexTestResult[],
    newResultsByClassId: Record<string, ApexTestResult[]>
  ): void;

  // Test job cancelling
  logRunCancelling(testRunId: string): void;
  logWaitingForCancel(testRunId: string, outstandingTests: number): void;
  logRunCancelled(testRunId: string): void;
}
