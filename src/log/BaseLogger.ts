/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */

import { Connection } from '@apexdevtools/sfdx-auth-helper';
import { getMaxErrorsForReRun, TestallOptions } from '../command/Testall';
import { ApexTestResult } from '../model/ApexTestResult';
import { ApexTestRunResult } from '../model/ApexTestRunResult';
import { QueryHelper } from '../query/QueryHelper';
import { Logger } from './Logger';

export interface MaybeError {
  message?: string;
  data?: any;
}

export abstract class BaseLogger implements Logger {
  verbose: boolean;
  connection: Connection;

  constructor(connection: Connection, verbose: boolean) {
    this.connection = connection;
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

  logOutputFile(path: string, contents: string): void {
    this.logFile(path, contents);
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
      `Aborting re-testing as ${failed.length} failed (excluding for locking) which is above the max limit`
    );
  }

  logTestRetry(result: ApexTestResult): void {
    const name = `${result.ApexClass.Name}.${result.MethodName}`;
    this.logMessage(
      `${name} re-run sequentially due to locking, outcome=${result.Outcome}`
    );
  }

  logRunStarted(testRunId: string): void {
    this.logMessage(`Test run started with AsyncApexJob Id: ${testRunId}`);
  }

  logNoProgress(testRunId: string): void {
    this.logMessage(
      `Test run '${testRunId}' was not progressing, cancelling and retrying...`
    );
  }

  async logStatus(testRunResult: ApexTestRunResult): Promise<void> {
    // We can't rely on MethodsCompleted (it under reports) so generate our own
    const aggComplete = await QueryHelper.instance(
      this.connection
    ).query<AggResult>(
      'ApexTestResult',
      `AsyncApexJobId='${testRunResult.AsyncApexJobId}'`,
      'Count(Id)'
    );
    const countComplete = aggComplete[0].expr0;

    const testRunId = testRunResult.AsyncApexJobId;
    const status = testRunResult.Status;
    const numberFailed = testRunResult.MethodsFailed;
    const complete =
      testRunResult.MethodsEnqueued > 0
        ? Math.round((countComplete * 100) / testRunResult.MethodsEnqueued)
        : 0;
    this.logMessage(
      `${numberFailed} have failed, ${complete}% run, job is ${status}`
    );

    if (this.verbose) {
      const apexQueueItems = await QueryHelper.instance(this.connection).query(
        'ApexTestQueueItem',
        `ParentJobId='${testRunId}'`,
        'Id, ApexClassId, ExtendedStatus, Status, TestRunResultID, ShouldSkipCodeCoverage'
      );
      this.logFile(
        `testqueue-${new Date().toISOString()}.json`,
        JSON.stringify(apexQueueItems)
      );
    }
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

export interface AggResult {
  expr0: number;
}
