/*
 * Copyright (c) 2023, FinancialForce.com, inc. All rights reserved.
 */

import { expect } from 'chai';
import { TestResultMatcher } from '../../src/collector/TestResultMatcher';
import { CapturingLogger } from '../../src/log/CapturingLogger';
import * as fs from 'fs';
import { logRegex } from '../Setup';

describe('TestResultMatcher', () => {
  let logger: CapturingLogger;

  beforeEach(() => {
    logger = new CapturingLogger();
  });

  it('default should not match empty', () => {
    expect(TestResultMatcher.create(logger).doesMatchAny('')).to.be.false;
  });

  it('default should not match non-empty', () => {
    expect(TestResultMatcher.create(logger).doesMatchAny('abc xyz')).to.be
      .false;
  });

  it('default should match lock error', () => {
    expect(
      TestResultMatcher.create(logger).doesMatchAny(
        'abc UNABLE_TO_LOCK_ROW xyz'
      )
    ).to.be.true;
  });

  it('default should match deadlock error', () => {
    expect(
      TestResultMatcher.create(logger).doesMatchAny(
        'abc deadlock detected while waiting for resource xyz'
      )
    ).to.be.true;
  });

  it('empty custom should not match empty', () => {
    const matcher = new TestResultMatcher(logger, []);
    expect(matcher.doesMatchAny('')).to.be.false;
  });

  it('empty custom should not match lock error', () => {
    const matcher = new TestResultMatcher(logger, []);
    expect(matcher.doesMatchAny('abc UNABLE_TO_LOCK_ROW xyz')).to.be.false;
  });

  it('empty custom should not match deadlock error', () => {
    const matcher = new TestResultMatcher(logger, []);
    expect(
      matcher.doesMatchAny(
        'abc deadlock detected while waiting for resource xyz'
      )
    ).to.be.false;
  });

  it('lock custom should match lock error', () => {
    const matcher = new TestResultMatcher(logger, ['UNABLE_TO_LOCK_ROW']);
    expect(matcher.doesMatchAny('abc UNABLE_TO_LOCK_ROW xyz')).to.be.true;
  });

  it('custom should match custom errors', () => {
    const matcher = new TestResultMatcher(logger, ['x[a-z]z', 'a.*a']);
    expect(matcher.doesMatchAny('abc xdz')).to.be.true;
    expect(matcher.doesMatchAny('abc x0z')).to.be.false;
    expect(matcher.doesMatchAny('1xez1')).to.be.true;
    expect(matcher.doesMatchAny('aba')).to.be.true;
    expect(matcher.doesMatchAny('abca')).to.be.true;
  });

  it('bad regex should log message', () => {
    new TestResultMatcher(logger, ['a\\']);
    expect(logger.entries.length).to.be.equal(3);
    expect(logger.entries[0]).to.match(
      logRegex(
        "Warning: Failure test result regex 'a\\\\' could not be compiled"
      )
    );
    expect(logger.entries[1]).to.match(
      logRegex('Invalid regular expression: /a\\\\/: \\\\ at end of pattern')
    );
  });

  it('rules file should match custom errors', () => {
    try {
      fs.writeFileSync('.apexTestRerun', 'x[a-z]z\na.*a');
      const matcher = TestResultMatcher.create(logger);
      expect(matcher.doesMatchAny('abc xdz')).to.be.true;
      expect(matcher.doesMatchAny('abc x0z')).to.be.false;
      expect(matcher.doesMatchAny('1xez1')).to.be.true;
      expect(matcher.doesMatchAny('aba')).to.be.true;
      expect(matcher.doesMatchAny('abca')).to.be.true;
    } finally {
      fs.unlinkSync('.apexTestRerun');
    }
  });

  it('parent rules file should match custom errors', () => {
    try {
      fs.writeFileSync('../.apexTestRerun', 'x[a-z]z\na.*a');
      const matcher = TestResultMatcher.create(logger);
      expect(matcher.doesMatchAny('abc xdz')).to.be.true;
      expect(matcher.doesMatchAny('abc x0z')).to.be.false;
      expect(matcher.doesMatchAny('1xez1')).to.be.true;
      expect(matcher.doesMatchAny('aba')).to.be.true;
      expect(matcher.doesMatchAny('abca')).to.be.true;
    } finally {
      fs.unlinkSync('../.apexTestRerun');
    }
  });
});
