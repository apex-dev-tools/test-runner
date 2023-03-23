/*
 * Copyright (c) 2023, FinancialForce.com, inc. All rights reserved.
 */

export const enum TestErrorKind {
  General,
  Timeout,
  Query,
}

export interface MaybeError {
  message?: string;
  data?: any;
}

export class TestError extends Error {
  kind: TestErrorKind;
  data?: any;

  constructor(message?: string, kind: TestErrorKind = TestErrorKind.General) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = new.target.name;
    this.kind = kind;
  }

  static wrapError(err: unknown, type: TestErrorKind): TestError {
    if (err instanceof Error) {
      const runnerErr = new TestError(err.message, type);

      runnerErr.stack = err.stack;
      runnerErr.data = (err as MaybeError).data;

      return runnerErr;
    } else if (typeof err == 'string') {
      return new TestError(err, type);
    }

    return new TestError(JSON.stringify(err), type);
  }
}
