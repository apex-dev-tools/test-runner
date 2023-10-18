/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */

import path from 'path';
import { TestallOptions, getMaxErrorsForReRun } from '../command/Testall';
import { ApexTestResult, BaseTestResult } from '../model/ApexTestResult';
import { ApexTestRunResult } from '../model/ApexTestRunResult';
import { MaybeError } from '../runner/TestError';
import { Logger } from './Logger';
import { getClassName, groupByOutcome } from '../results/TestResultUtils';
import { TestRunSummary } from '../results/OutputGenerator';

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
    let msg = 'No matching test failures to re-run';

    if (tests.length > 0) {
      msg = `Running ${tests.length} failed tests sequentially`;

      if (matches == tests.length) {
        msg += ' (matched patterns)';
      } else {
        msg += ` (${matches} tests matched patterns)`;
      }
    }

    this.logMessage(msg);
  }

  logTestRerun(
    name: string,
    result: BaseTestResult,
    otherResult: BaseTestResult
  ): void {
    const firstMsg = result.Message;
    const rerunMsg = otherResult.Message;
    this.logMessage(
      `${name} re-run complete, outcome = ${otherResult.Outcome}`
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

  logTestReports(summary: TestRunSummary): void {
    const { testResults, reruns } = summary;

    let msg = `Generated reports for ${testResults.length} tests`;
    if (reruns.length) {
      msg += ` with ${reruns.length} re-runs`;
    }
    this.logMessage(msg);
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
    const total = testRunResult.MethodsEnqueued;
    const complete = total > 0 ? Math.floor((completed * 100) / total) : 0;

    this.logMessage(
      `[${status}] Passed: ${passed} | Failed: ${failed} | ${completed}/${total} Complete (${complete}%)`
    );
  }

  logTestFailures(newResults: ApexTestResult[]): void {
    const failedResultsByClassId = newResults.reduce((classes, test) => {
      const id = test.ApexClass.Id;
      if (test.Outcome === 'Fail' || test.Outcome === 'CompileFail') {
        classes[id] = [...(classes[id] || []), test];
      }
      return classes;
    }, {} as Record<string, ApexTestResult[]>);

    Object.entries(failedResultsByClassId).forEach(([, results]) => {
      const tests = results.slice(0, 2);

      this.logMessage(`  Failing Tests: ${getClassName(tests[0])}]`);

      tests.forEach(t => {
        const msg = t.Message ? ` - ${t.Message}` : '';
        this.logMessage(`    * ${t.MethodName}${msg}`);
      });

      results.length > 2 &&
        this.logMessage(`    (and ${results.length - 2} more...)`);
    });
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
