/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */

import path from 'path';
import { TestallOptions, getMaxErrorsForReRun } from '../command/Testall';
import { ApexTestResult } from '../model/ApexTestResult';
import { ApexTestRunResult } from '../model/ApexTestRunResult';
import { groupByOutcome } from '../results/OutputGenerator';
import { MaybeError } from '../runner/TestError';
import { Logger } from './Logger';

export abstract class BaseLogger implements Logger {
  readonly logDirPath: string;
  readonly verbose: boolean;

  constructor(logDirectory: string, verbose: boolean) {
    this.logDirPath = logDirectory;
    this.verbose = verbose;
  }

  abstract logMessage(message: string): void;
  protected abstract logFile(path: string, contents: string): void;

  logError(error: MaybeError): void {
    if (error instanceof Error) {
      if (error.name == 'ALREADY_IN_PROCESS') {
        this.logMessage(
          "One or more of the tests is already queued to run, they can't be requeued"
        );
      } else {
        this.logMessage(error.message);
        if (error.stack !== undefined)
          this.logMessage('Error stack: ' + error.stack);
      }
    } else {
      this.logMessage('Error: ' + JSON.stringify(error));
    }

    if (error.data !== undefined) {
      this.logMessage('Additional data: ' + JSON.stringify(error.data));
    }
  }

  logWarning(message: string): void {
    this.logMessage('Warning: ' + message);
  }

  logOutputFile(filepath: string, contents: string): void {
    // if filepath is absolute it will be used instead
    // given resolve() right to left logic
    this.logFile(path.resolve(this.logDirPath, filepath), contents);
  }

  logTestallStart(options: TestallOptions): void {
    this.logMessage(
      `Starting test run, with max failing tests for re-run ${getMaxErrorsForReRun(
        options
      )}`
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  logTestallAbort(options: TestallOptions): void {
    this.logMessage(
      'Initial test run was aborted, no results will be generated'
    );
  }

  logTestallRerun(missing: Map<string, Set<string>>): void {
    const methodCount = Array.from(missing.values())
      .map(methods => methods.size)
      .reduce((p, a) => p + a, 0);
    this.logMessage(
      `Found ${methodCount} methods in ${missing.size} classes were not run, trying again...`
    );
  }

  logMaxErrorAbort(failed: ApexTestResult[]): void {
    this.logMessage(
      `Aborting missing test check as ${failed.length} failed - max re-run limit exceeded`
    );
  }

  logTestWillRerun(tests: ApexTestResult[], matches: number): void {
    if (tests.length > 0) {
      let msg = `Running ${tests.length} failed tests sequentially`;

      if (matches == tests.length) {
        msg += ' (matched patterns)';
      } else {
        msg += ` (${matches} tests matched patterns)`;
      }

      this.logMessage(msg);
    }
  }

  logTestRerun(result: ApexTestResult, otherResult: ApexTestResult): void {
    const firstMsg = result.Message;
    const rerunMsg = otherResult.Message;
    this.logMessage(
      `${result.ApexClass.Name}.${result.MethodName} re-run complete, outcome = ${otherResult.Outcome}`
    );

    // i.e its failed with a different message, show what happened
    if (rerunMsg && firstMsg) {
      if (rerunMsg !== firstMsg) {
        this.logMessage(` [Before] ${firstMsg}`);
        this.logMessage(` [After] ${rerunMsg}`);
      } else {
        this.logMessage(` [Before and After] ${rerunMsg}`);
      }
    }
  }

  logRunStarted(testRunId: string): void {
    this.logMessage(`Test run started with AsyncApexJob Id: ${testRunId}`);
  }

  logNoProgress(testRunId: string): void {
    this.logMessage(
      `Test run '${testRunId}' was not progressing, cancelling and retrying...`
    );
  }

  logStatus(testRunResult: ApexTestRunResult, tests: ApexTestResult[]): void {
    const status = testRunResult.Status;
    const outcomes = groupByOutcome(tests);
    const completed = tests.length;
    const passed = outcomes.Pass.length;
    const failed = outcomes.Fail.length + outcomes.CompileFail.length;

    const complete =
      testRunResult.MethodsEnqueued > 0
        ? Math.round((completed * 100) / testRunResult.MethodsEnqueued)
        : 0;

    this.logMessage(
      `[${status}] Passed: ${passed} | Failed: ${failed} | ${complete}% Complete`
    );
  }

  logRunCancelling(testRunId: string): void {
    this.logMessage(`Cancelling test run '${testRunId}'`);
  }

  logWaitingForCancel(testRunId: string, outstandingTests: number): void {
    this.logMessage(
      `Waiting for test run '${testRunId}' to cancel... ${outstandingTests} tests queued`
    );
  }

  logRunCancelled(testRunId: string): void {
    this.logMessage(`Test run '${testRunId}' has been cancelled`);
  }
}
