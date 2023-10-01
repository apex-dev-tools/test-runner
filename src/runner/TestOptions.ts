/*
 * Copyright (c) 2019, FinancialForce.com, inc. All rights reserved.
 */

import { Connection } from '@salesforce/core';
import { Duration } from '@salesforce/kit';
import { Logger } from '../log/Logger';
import { TestRunCancelAborter } from './TestRunCancelAborter';
import { ApexTestResult } from '../model/ApexTestResult';

const DEFAULT_POLL_INTERVAL_MS = 30000;
const DEFAULT_POLL_TIMEOUT_MINS = 10;

export interface CancelTestRunOptions {
  cancelPollIntervalMs?: number; // ms between polling for cancelled test queue items, default 30 secs
  cancelPollTimoutMins?: number; // mins for timeout when waiting for cancelled test queue items, default 10 minutes
}

export function getCancelPollInterval(options: CancelTestRunOptions): Duration {
  if (
    options.cancelPollIntervalMs !== undefined &&
    options.cancelPollIntervalMs >= 0
  )
    return Duration.milliseconds(options.cancelPollIntervalMs);
  else return Duration.milliseconds(DEFAULT_POLL_INTERVAL_MS);
}

export function getCancelPollTimeout(options: CancelTestRunOptions): Duration {
  if (
    options.cancelPollTimoutMins !== undefined &&
    options.cancelPollTimoutMins >= 0
  )
    return Duration.minutes(options.cancelPollTimoutMins);
  else return Duration.minutes(DEFAULT_POLL_TIMEOUT_MINS);
}

const DEFAULT_STATUS_POLL_INTERVAL_MS = 30000;
const DEFAULT_TEST_RUN_TIMEOUT_MINS = 120;
const DEFAULT_MAX_TEST_RUN_RETRIES = 3;
const DEFAULT_POLL_LIMIT_TO_ASSUME_TESTS_HANGING = 60;

export interface TestRunAborter {
  /**
   * Aborts the run given a run id.
   * @returns the QueueItem Ids of the items that has been canceled
   */
  abortRun(
    logger: Logger,
    connection: Connection,
    testRunId: string,
    options: CancelTestRunOptions
  ): Promise<string[]>;
}

export interface TestRunnerCallbacks {
  onRunStarted?: (jobId: string) => void;
  onPoll?: (testsResults: Array<ApexTestResult>) => void;
}

export interface TestRunnerOptions extends CancelTestRunOptions {
  aborter?: TestRunAborter; // Instance to handler aborting run, defaults to TestRunCancelAborter
  maxTestRunRetries?: number; // Maximum Number of times to try to complete a test run, default 3
  testRunTimeoutMins?: number; // Maximum time for a single test run to execute, default 120 mins
  statusPollIntervalMs?: number; // Time to wait between checking test run status, default 30 secs
  pollLimitToAssumeHangingTests?: number; // Number polls without test progress before a hang is assumed, default 60
  callbacks?: TestRunnerCallbacks; // Callbacks for events in test runner
  codeCoverage?: boolean; // Collect code coverage data, defaults false
}

export function getTestRunAborter(options: TestRunnerOptions): TestRunAborter {
  if (options.aborter) return options.aborter;
  else return new TestRunCancelAborter();
}

export function getMaxTestRunRetries(options: TestRunnerOptions): number {
  if (options.maxTestRunRetries !== undefined && options.maxTestRunRetries >= 0)
    return options.maxTestRunRetries;
  else return DEFAULT_MAX_TEST_RUN_RETRIES;
}

export function getStatusPollInterval(options: TestRunnerOptions): Duration {
  if (
    options.statusPollIntervalMs !== undefined &&
    options.statusPollIntervalMs >= 0
  )
    return Duration.milliseconds(options.statusPollIntervalMs);
  else return Duration.milliseconds(DEFAULT_STATUS_POLL_INTERVAL_MS);
}

export function getTestRunTimeout(options: TestRunnerOptions): Duration {
  if (
    options.testRunTimeoutMins !== undefined &&
    options.testRunTimeoutMins >= 0
  )
    return Duration.minutes(options.testRunTimeoutMins);
  else return Duration.minutes(DEFAULT_TEST_RUN_TIMEOUT_MINS);
}

export function getTestRunTimeoutMessage(
  id: string,
  options: TestRunnerOptions
): string {
  return `Test run '${id}' has exceeded test runner max allowed run time of ${getTestRunTimeout(
    options
  ).toString()}`;
}

export function getPollLimitToAssumeHangingTests(
  options: TestRunnerOptions
): number {
  if (
    options.pollLimitToAssumeHangingTests !== undefined &&
    options.pollLimitToAssumeHangingTests >= 0
  )
    return options.pollLimitToAssumeHangingTests;
  else return DEFAULT_POLL_LIMIT_TO_ASSUME_TESTS_HANGING;
}
