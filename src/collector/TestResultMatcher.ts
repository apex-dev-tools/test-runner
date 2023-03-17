/*
 * Copyright (c) 2023, FinancialForce.com, inc. All rights reserved.
 */

import { Logger } from '../log/Logger';
import * as fs from 'fs';
import * as path from 'path';

export const DEFAULT_TEST_RERUN_PATTERNS = [
  'UNABLE_TO_LOCK_ROW',
  'deadlock detected while waiting for resource',
];

export class TestResultMatcher {
  failedRegex: RegExp | null = null;

  constructor(logger: Logger, failedRegex: string[]) {
    const sources = failedRegex.flatMap(pattern => {
      try {
        const re = new RegExp(pattern);
        return [re.source];
      } catch (err) {
        logger.logWarning(
          `Failure test result regex '${pattern}' could not be compiled`
        );
        logger.logError(err);
        return [];
      }
    });
    if (sources.length != 0)
      this.failedRegex = RegExp(sources.map(source => `(${source})`).join('|'));
  }

  doesMatchAny(text: string): boolean {
    return this.failedRegex != null && text.search(this.failedRegex) != -1;
  }

  public static create(logger: Logger): TestResultMatcher {
    const patternsFile = this.findPatternsFile(process.cwd());
    if (patternsFile != null) {
      const lines = fs
        .readFileSync(patternsFile)
        .toString()
        .replace(/\r\n/g, '\n')
        .split('\n');
      return new TestResultMatcher(logger, lines);
    } else {
      return new TestResultMatcher(logger, [
        'UNABLE_TO_LOCK_ROW',
        'deadlock detected while waiting for resource',
      ]);
    }
  }

  private static findPatternsFile(dir: string): string | null {
    const target = path.join(dir, '.apexTestRerun');
    if (fs.existsSync(target)) {
      return target;
    } else {
      const parent = path.join(dir, '..');
      if (parent == dir) {
        return null;
      } else {
        return this.findPatternsFile(parent);
      }
    }
  }
}
