/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */

import { expect } from 'chai';
import { CapturingLogger } from '../../src/log/CapturingLogger';
import { ApexTestResult } from '../../src/model/ApexTestResult';
import { ApexTestRunResult } from '../../src/model/ApexTestRunResult';
import { logRegex } from '../Setup';

describe('BaseLogger', () => {
  it('should save test run status when verbose logging', () => {
    const mockTestRunResult: Partial<ApexTestRunResult> = {
      Status: 'Processing',
      MethodsEnqueued: 6,
    };
    const mockTestResults: Partial<ApexTestResult>[] = [
      {
        Outcome: 'Pass',
      },
      {
        Outcome: 'Pass',
      },
      {
        Outcome: 'Fail',
      },
    ];

    const logger = new CapturingLogger();
    logger.logStatus(
      mockTestRunResult as ApexTestRunResult,
      mockTestResults as ApexTestResult[],
      '',
      0,
      5
    );

    expect(logger.entries.length).to.equal(1);
    expect(logger.entries[0]).to.match(
      logRegex(
        '\\[Processing\\] Passed: 2 \\| Failed: 1 \\| 3\\/6 Complete \\(50%\\)'
      )
    );
  });

  it('should append a no-progress count to the status line when stalled', () => {
    const mockTestRunResult: Partial<ApexTestRunResult> = {
      Status: 'Processing',
      MethodsEnqueued: 6,
    };
    const mockTestResults: Partial<ApexTestResult>[] = [{ Outcome: 'Pass' }];

    const logger = new CapturingLogger();
    logger.logStatus(
      mockTestRunResult as ApexTestRunResult,
      mockTestResults as ApexTestResult[],
      '',
      3,
      5
    );

    expect(logger.entries.length).to.equal(1);
    expect(logger.entries[0]).to.match(
      logRegex(
        '\\[Processing\\] Passed: 1 \\| Failed: 0 \\| 1\\/6 Complete \\(16%\\)' +
          ' \\| No progress 3/5'
      )
    );
  });

  it('should output file content with filename', () => {
    const logger = new CapturingLogger('/log/path', true);
    const content = '{ "records": [] }';

    logger.logOutputFile('somefile.json', content);

    expect(logger.files.length).to.equal(1);
    expect(logger.files[0][0]).to.equal('/log/path/somefile.json');
    expect(logger.files[0][1]).to.equal(content);
  });

  it('should output file content with part path', () => {
    const logger = new CapturingLogger('/log/path', true);
    const content = '{ "records": [] }';

    logger.logOutputFile('to/somefile.json', content);

    expect(logger.files.length).to.equal(1);
    expect(logger.files[0][0]).to.equal('/log/path/to/somefile.json');
    expect(logger.files[0][1]).to.equal(content);
  });

  it('should output file content with full path', () => {
    const logger = new CapturingLogger('/log/path', true);
    const content = '{ "records": [] }';

    logger.logOutputFile('/abs/path/to/somefile.json', content);

    expect(logger.files.length).to.equal(1);
    expect(logger.files[0][0]).to.equal('/abs/path/to/somefile.json');
    expect(logger.files[0][1]).to.equal(content);
  });

  it('should output file content with relative log path', () => {
    const logger = new CapturingLogger('.', true);
    const content = '{ "records": [] }';

    logger.logOutputFile('to/somefile.json', content);

    expect(logger.files.length).to.equal(1);
    expect(logger.files[0][0]).to.equal(`${process.cwd()}/to/somefile.json`);
    expect(logger.files[0][1]).to.equal(content);
  });

  it('should output file content with empty log path', () => {
    const logger = new CapturingLogger('', true);
    const content = '{ "records": [] }';

    logger.logOutputFile('somefile.json', content);

    expect(logger.files.length).to.equal(1);
    expect(logger.files[0][0]).to.equal(`${process.cwd()}/somefile.json`);
    expect(logger.files[0][1]).to.equal(content);
  });

  it('should log a run reset summary', () => {
    const logger = new CapturingLogger();
    logger.logRunReset(14000, 320, 6000, 140);

    expect(logger.entries.length).to.equal(1);
    expect(logger.entries[0]).to.match(
      logRegex(
        'Reusing 14000 tests from 320 completed classes; ' +
          'rerunning 6000 remaining tests across 140 classes'
      )
    );
  });

  it('should log when a run is abandoned while stuck', () => {
    const logger = new CapturingLogger();
    logger.logRunStuck('707xx', 'Queued');

    expect(logger.entries.length).to.equal(1);
    expect(logger.entries[0]).to.match(
      logRegex(
        "Test run '707xx' stuck in Queued with no progress, " +
          'abandoning this attempt'
      )
    );
  });

  it('should generate warning messages', () => {
    const logger = new CapturingLogger('', true);
    logger.logWarning('A message');

    expect(logger.entries.length).to.equal(1);
    expect(logger.entries[0]).to.match(logRegex('Warning: A message'));
  });
});
