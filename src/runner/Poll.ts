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
    // explicit undefined values will override/break the options
    cleanOptions(opts);

    const retries = opts?.retries || 3;
    const effectiveOpts: Partial<RetryConfig<T>> = {
      retries,
      delay: 15000,
      timeout: 'INFINITELY',
      backoff: (attempt, delay) => {
        // WORKAROUND: ts-retry-promise has a bug, it will do the delay after
        // the last retry even though it is not going to attempt another
        if (retries !== 'INFINITELY' && attempt === retries + 1) {
          return 0;
        }

        // backoff multiply last by 2
        const newDelay =
          attempt <= 1 ? delay : delay * Math.pow(2, attempt - 1);

        logger?.logMessage(
          `Waiting ${newDelay / 1000} seconds to retry (attempts: ${attempt})`
        );
        return newDelay;
      },
      retryIf: error => {
        logger?.logWarning(`Request failed. Cause: ${getErrorCause(error)}`);
        return true;
      },
      ...opts,
    };

    return await retryPromise(fn, effectiveOpts);
  } catch (error) {
    throw unwrapRetryError(error);
  }
}

function cleanOptions(opt?: { [index: string]: any }) {
  if (opt) {
    Object.keys(opt).forEach(key => {
      if (opt[key] === undefined) {
        delete opt[key];
      }
    });
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
