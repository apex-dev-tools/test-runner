/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */
import { ExecuteService } from '@salesforce/apex-node';
import { Connection } from '@salesforce/core';
import { TestContext } from '@salesforce/core/lib/testSetup';
import { expect } from 'chai';
import { SinonSandbox, SinonStub, createSandbox } from 'sinon';
import { CapturingLogger } from '../../src/log/CapturingLogger';
import { QueryHelper } from '../../src/query/QueryHelper';
import { getTestRunAborter } from '../../src/runner/TestOptions';
import { TestRunCancelAborter } from '../../src/runner/TestRunCancelAborter';
import {
  createMockConnection,
  logRegex,
  setupExecuteAnonymous,
  testRunId,
} from '../Setup';

describe('TestRunCancelAborter', () => {
  const $$ = new TestContext();
  let sandbox: SinonSandbox;

  let mockConnection: Connection;
  let queryStub: SinonStub;

  beforeEach(async () => {
    sandbox = createSandbox();
    mockConnection = await createMockConnection($$, sandbox);
    queryStub = sandbox.stub(QueryHelper.instance(mockConnection), 'query');
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should be the default aborter', () => {
    const aborter = getTestRunAborter({});
    expect(aborter).to.be.instanceOf(TestRunCancelAborter);
  });

  it('should cancel when no tests still running', async () => {
    setupExecuteAnonymous(
      sandbox.stub(ExecuteService.prototype, 'connectionRequest'),
      {
        column: -1,
        line: -1,
        compiled: 'true',
        compileProblem: '',
        exceptionMessage: '',
        exceptionStackTrace: '',
        success: 'true',
      }
    );
    queryStub.resolves([]);

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
    queryStub.onCall(0).resolves([{ Id: 'Some Id' }]);

    setupExecuteAnonymous(
      sandbox.stub(ExecuteService.prototype, 'connectionRequest'),
      {
        column: -1,
        line: -1,
        compiled: 'true',
        compileProblem: '',
        exceptionMessage: 'A message',
        exceptionStackTrace: '',
        success: 'false',
      }
    );

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

  it('should time out after polling too long for tests to cancel', async () => {
    queryStub.onCall(0).resolves([{ Id: 'Some Id' }]);
    setupExecuteAnonymous(
      sandbox.stub(ExecuteService.prototype, 'connectionRequest'),
      {
        column: -1,
        line: -1,
        compiled: 'true',
        compileProblem: '',
        exceptionMessage: 'A message',
        exceptionStackTrace: '',
        success: 'true',
      }
    );

    queryStub.resolves([{ Status: 'Something' }]);

    const logger = new CapturingLogger();
    let error;
    try {
      const aborter = new TestRunCancelAborter();
      await aborter.abortRun(logger, mockConnection, testRunId, {
        cancelPollTimoutMins: 0, // Just for test, to ensure timeout
        cancelPollIntervalMs: 100,
      });
      expect.fail('Missing exception');
    } catch (err) {
      error = err;
    }
    expect(error).to.be.an(Error.name);
    if (error instanceof Error) {
      expect(error.message).to.equal(
        `Cancel of test run '${testRunId}' has exceed max allowed time of 0 minutes`
      );
    }
    expect(logger.entries.length).to.be.equal(2);
  });

  it('should rethrow and unexpected exception', async () => {
    queryStub.onCall(0).resolves([{ Id: 'Some Id' }]);
    setupExecuteAnonymous(
      sandbox.stub(ExecuteService.prototype, 'connectionRequest'),
      {
        column: -1,
        line: -1,
        compiled: 'true',
        compileProblem: '',
        exceptionMessage: 'A message',
        exceptionStackTrace: '',
        success: 'true',
      }
    );
    queryStub.throws(new Error('An Error'));

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
      expect(error.message).to.equal('An Error');
    }
    expect(logger.entries.length).to.be.equal(1);
  });

  it('should poll while tests still running', async () => {
    queryStub.onCall(0).resolves([{ Id: 'Some Id' }]);
    setupExecuteAnonymous(
      sandbox.stub(ExecuteService.prototype, 'connectionRequest'),
      {
        column: -1,
        line: -1,
        compiled: 'true',
        compileProblem: '',
        exceptionMessage: '',
        exceptionStackTrace: '',
        success: 'true',
      }
    );
    queryStub
      .onCall(1)
      .resolves([{ Status: 'Something' }, { Status: 'Something' }]);
    queryStub.onCall(2).resolves([{ Status: 'Something' }]);
    queryStub.onCall(3).resolves([]);

    const logger = new CapturingLogger();
    const aborter = new TestRunCancelAborter();
    await aborter.abortRun(logger, mockConnection, testRunId, {
      cancelPollIntervalMs: 100, // Just for test so polls quickly
    });

    expect(logger.entries.length).to.equal(4);
    expect(logger.entries[0]).to.match(
      logRegex(`Cancelling test run '${testRunId}'`)
    );
    expect(logger.entries[1]).to.match(
      logRegex(
        `Waiting for test run '${testRunId}' to cancel... 2 tests queued`
      )
    );
    expect(logger.entries[2]).to.match(
      logRegex(
        `Waiting for test run '${testRunId}' to cancel... 1 tests queued`
      )
    );
    expect(logger.entries[3]).to.match(
      logRegex(`Test run '${testRunId}' has been cancelled`)
    );
  });
});
