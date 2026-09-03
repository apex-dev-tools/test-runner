/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */
import { Connection } from '@salesforce/core';
import { TestContext } from '@salesforce/core/testSetup';
import { expect } from 'chai';
import { SinonSandbox, SinonStubbedInstance, createSandbox } from 'sinon';
import { CapturingLogger } from '../../src/log/CapturingLogger';
import { QueryHelper } from '../../src/query/QueryHelper';
import { getTestRunAborter } from '../../src/runner/TestOptions';
import { TestRunCancelAborter } from '../../src/runner/TestRunCancelAborter';
import {
  createMockConnection,
  createQueryHelper,
  logRegex,
  setupExecuteAnonymous,
  testRunId,
} from '../Setup';

describe('TestRunCancelAborter', () => {
  const $$ = new TestContext();
  let sandbox: SinonSandbox;

  let mockConnection: Connection;
  let qhStub: SinonStubbedInstance<QueryHelper>;

  beforeEach(async () => {
    sandbox = createSandbox();
    mockConnection = await createMockConnection($$, sandbox);
    qhStub = createQueryHelper(sandbox, mockConnection);
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should be the default aborter', () => {
    const aborter = getTestRunAborter({});
    expect(aborter).to.be.instanceOf(TestRunCancelAborter);
  });

  it('should cancel when no tests still running', async () => {
    setupExecuteAnonymous(sandbox);
    qhStub.query.resolves([]);

    const logger = new CapturingLogger();
    const aborter = new TestRunCancelAborter();
    await aborter.abortRun(logger, mockConnection, testRunId);

    expect(logger.entries.length).to.equal(2);
    expect(logger.entries[0]).to.match(
      logRegex(`Cancelling test run '${testRunId}'`)
    );
    expect(logger.entries[1]).to.match(
      logRegex(`Test run '${testRunId}' has been cancelled`)
    );
  });

  it('should throw if execute anon to cancel tests fails', async () => {
    qhStub.query.onCall(0).resolves([{ Id: 'Some Id' }]);

    setupExecuteAnonymous(sandbox, {
      exceptionMessage: 'A message',
      success: 'false',
    });

    const logger = new CapturingLogger();
    let error;
    try {
      const aborter = new TestRunCancelAborter();
      await aborter.abortRun(logger, mockConnection, testRunId);
      expect.fail('Missing exception');
    } catch (err) {
      error = err;
    }
    expect(error).to.be.an(Error.name);
    if (error instanceof Error) {
      expect(error.message).to.equal(
        `Anon apex to abort tests did not succeed, result='${JSON.stringify({
          success: false,
          compiled: true,
          diagnostic: [
            {
              lineNumber: -1,
              columnNumber: -1,
              compileProblem: '',
              exceptionMessage: 'A message',
              exceptionStackTrace: '',
            },
          ],
        })}'`
      );
    }
  });

  it('should wait for outstanding queue items to clear before returning', async () => {
    setupExecuteAnonymous(sandbox);
    // call 0: items to abort. call 1: still outstanding. call 2: cleared.
    qhStub.query
      .onCall(0)
      .resolves([{ Id: 'q1' }])
      .onCall(1)
      .resolves([{ Id: 'q1' }])
      .onCall(2)
      .resolves([]);

    const logger = new CapturingLogger();
    const aborter = new TestRunCancelAborter();
    await aborter.abortRun(logger, mockConnection, testRunId, {
      cancelPollIntervalMs: 1,
    });

    expect(qhStub.query.callCount).to.equal(3);
    expect(logger.entries.length).to.equal(3);
    expect(logger.entries[0]).to.match(
      logRegex(`Cancelling test run '${testRunId}'`)
    );
    expect(logger.entries[1]).to.match(
      logRegex(
        `Waiting for test run '${testRunId}' to cancel... 1 tests queued`
      )
    );
    expect(logger.entries[2]).to.match(
      logRegex(`Test run '${testRunId}' has been cancelled`)
    );
  });

  it('should not query for confirmation when skipCancelConfirmation is set', async () => {
    setupExecuteAnonymous(sandbox);
    // Would never clear, so without the flag this would poll until it timed out
    qhStub.query.resolves([{ Id: 'q1' }]);

    const logger = new CapturingLogger();
    const aborter = new TestRunCancelAborter();
    await aborter.abortRun(logger, mockConnection, testRunId, {
      skipCancelConfirmation: true,
    });

    // Only the query for the items to abort - no confirmation polling
    expect(qhStub.query.callCount).to.equal(1);
    expect(logger.entries.length).to.equal(2);
    expect(logger.entries[1]).to.match(
      logRegex(`Test run '${testRunId}' has been cancelled`)
    );
  });

  it('should give up on the first failed confirmation query rather than retrying', async () => {
    setupExecuteAnonymous(sandbox);
    qhStub.query
      .onCall(0)
      .resolves([{ Id: 'q1' }]) // items to abort
      .onCall(1)
      .rejects(new Error('INVALID_SESSION_ID')); // confirmation query fails

    const logger = new CapturingLogger();
    const aborter = new TestRunCancelAborter();
    const ids = await aborter.abortRun(logger, mockConnection, testRunId);

    // One confirmation attempt only - a broken query must not spin until the
    // poll timeout
    expect(qhStub.query.callCount).to.equal(2);
    expect(ids).to.deep.equal(['q1']);
    expect(
      logger.entries.some(e =>
        /Warning: Could not confirm test run .* finished cancelling: INVALID_SESSION_ID/.test(
          e
        )
      )
    ).to.be.true;
    // The warning stands alone - don't also claim the run has been cancelled
    expect(logger.entries.some(e => /has been cancelled/.test(e))).to.be.false;
  });

  it('should warn and return rather than throw if the queue never clears', async () => {
    setupExecuteAnonymous(sandbox);
    // Every query, including confirmation polls, still reports an outstanding item
    qhStub.query.resolves([{ Id: 'q1' }]);

    const logger = new CapturingLogger();
    const aborter = new TestRunCancelAborter();
    const ids = await aborter.abortRun(logger, mockConnection, testRunId, {
      cancelPollIntervalMs: 1,
      cancelPollTimoutMins: 0.001,
    });

    // Returns normally with the ids it originally tried to abort, rather than throwing
    expect(ids).to.deep.equal(['q1']);
    expect(
      logger.entries.some(e =>
        logRegex(
          `Warning: Could not confirm test run '${testRunId}' finished cancelling.*`
        ).test(e)
      )
    ).to.be.true;
    // The warning stands alone - don't also claim the run has been cancelled
    expect(logger.entries.some(e => /has been cancelled/.test(e))).to.be.false;
  });
});
