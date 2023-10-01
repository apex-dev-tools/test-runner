/*
 * Copyright (c) 2023, Certinia Inc. All rights reserved.
 */

import {
  RetryConfig,
  RetryError,
  retry as retryPromise,
} from 'ts-retry-promise';
import { Logger } from '../log/Logger';
import { TestError, TestErrorKind } from './TestError';

export interface Pollable<T> {
  // wait in ms
  pollDelay: number;

  // overall timeout ms
  pollTimeout: number;
  pollTimeoutMessage?: string;

  poll(): Promise<T>;
  pollUntil(result: T): boolean;
  pollRetryIf(error: unknown): boolean;
}

export async function poll<T>(
  pollable: Pollable<T>,
  logger?: Logger
): Promise<T> {
  try {
    return await retryPromise(() => pollable.poll(), {
      retries: 'INFINITELY',
      delay: pollable.pollDelay,
      timeout: pollable.pollTimeout,
      until: r => pollable.pollUntil(r),
      retryIf: error => {
        logger?.logMessage(`Poll failed: ${getErrorCause(error)}`);
        return pollable.pollRetryIf(error);
      },
    });
  } catch (error) {
    throw wrapPollError(
      error,
      pollable.pollTimeoutMessage ||
        `Polling has exceeded timeout of ${pollable.pollTimeout} ms.`
    );
  }
}

export async function retry<T>(
  fn: () => Promise<T>,
  logger?: Logger,
  opts?: Partial<RetryConfig<T>>
): Promise<T> {
  try {
    return await retryPromise(fn, {
      retries: 4,
      delay: 15000,
      timeout: 'INFINITELY',
      backoff: (attempt, delay) => {
        const newDelay = delay * 2;
        logger?.logWarning(
          `Retrying failed request, waiting ${
            newDelay / 1000
          } seconds (attempt: ${attempt})`
        );
        return newDelay;
      },
      retryIf: error => {
        logger?.logMessage(`Request failed: ${getErrorCause(error)}`);
        return true;
      },
      ...opts,
    });
  } catch (error) {
    throw unwrapRetryError(error);
  }
}

function getErrorCause(err: unknown): string {
  let cause = 'Unknown';
  if (err instanceof Error) {
    cause = err.message;
  } else if (typeof err == 'string') {
    cause = err;
  }
  return cause;
}

function unwrapRetryError(error: unknown) {
  if (error instanceof RetryError) {
    return error.lastError;
  }
  return error;
}

function wrapPollError(error: unknown, timeoutMsg: string): TestError {
  const retryErr = unwrapRetryError(error);
  let err: TestError;
  if (retryErr instanceof Error && retryErr.message.startsWith('Timeout')) {
    err = new TestError(timeoutMsg, TestErrorKind.Timeout);
  } else {
    err = TestError.wrapError(retryErr);
  }

  return err;
}
