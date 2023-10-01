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

  static wrapError(
    err: unknown,
    type: TestErrorKind = TestErrorKind.General,
    preamble?: string
  ): TestError {
    if (err instanceof TestError && !preamble) {
      return err;
    } else if (err instanceof Error) {
      // do not overwrite err kind
      const kind = err instanceof TestError ? err.kind : type;
      const msg = preamble ? `${preamble} ${err.message}` : err.message;
      const testErr = new TestError(msg, kind);

      testErr.stack = err.stack;
      testErr.data = (err as MaybeError).data;

      return testErr;
    } else if (typeof err == 'string') {
      return new TestError(err, type);
    }

    return new TestError(JSON.stringify(err), type);
  }
}
