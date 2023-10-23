/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */
import { ExecuteService } from '@salesforce/apex-node';
import { Connection } from '@salesforce/core';
import { TestContext } from '@salesforce/core/lib/testSetup';
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
});
