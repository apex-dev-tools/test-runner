/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */

import { TestallOptions } from '../command/Testall';
import { ApexTestResult } from '../model/ApexTestResult';
import { ApexTestRunResult } from '../model/ApexTestRunResult';

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
  logTestallAbort(options: TestallOptions): void;
  logTestallRerun(missing: Map<string, Set<string>>): void;
  logMaxErrorAbort(failed: ApexTestResult[]): void;
  logTestWillRerun(tests: ApexTestResult[], matches: number): void;
  logTestRerun(result: ApexTestResult, otherResult: ApexTestResult): void;

  // Test runner
  logRunStarted(testRunId: string): void;
  logNoProgress(testRunId: string): void;
  logStatus(status: ApexTestRunResult, tests: ApexTestResult[]): void;

  // Test job cancelling
  logRunCancelling(testRunId: string): void;
  logWaitingForCancel(testRunId: string, outstandingTests: number): void;
  logRunCancelled(testRunId: string): void;
}
