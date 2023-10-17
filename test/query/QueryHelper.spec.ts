/*
 * Copyright (c) 2023, FinancialForce.com, inc. All rights reserved.
 */

import { Connection } from '@salesforce/core';
import { TestContext } from '@salesforce/core/lib/testSetup';
import { expect } from 'chai';
import { SinonSandbox, SinonStub, createSandbox } from 'sinon';
import { CapturingLogger } from '../../src/log/CapturingLogger';
import { QueryHelper } from '../../src/query/QueryHelper';
import { TestError, TestErrorKind } from '../../src/runner/TestError';
import { createMockConnection, logRegex } from '../Setup';
import { AuthHelper } from '@apexdevtools/sfdx-auth-helper';
import { Connection as JSForceConnection } from 'jsforce';

describe('QueryHelper', () => {
  const $$ = new TestContext();
  let sandbox: SinonSandbox;

  let mockConnection: Connection;
  let sobjectStub: SinonStub;
  let sobjectMock: {
    find: SinonStub;
  };
  let queryMock: {
    execute: SinonStub;
  };

  beforeEach(async () => {
    sandbox = createSandbox();
    mockConnection = await createMockConnection($$, sandbox);

    // always call timeouts immediately
    // won't work if the retry has a timeout set
    sandbox.stub(global, 'setTimeout').callsFake(cb => {
      cb();
      return {} as NodeJS.Timeout;
    });

    sobjectMock = {
      find: sandbox.stub(),
    };
    queryMock = {
      execute: sandbox.stub(),
    };

    sobjectStub = sandbox.stub(mockConnection.tooling, 'sobject');
    sobjectStub.returns(sobjectMock);
    sobjectMock.find.returns(queryMock);
    sandbox
      .stub(AuthHelper, 'toJsForceConnection')
      .returns(mockConnection as unknown as JSForceConnection);
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should retry with default options', async () => {
    queryMock.execute.resolves([]);
    queryMock.execute.onFirstCall().rejects(new Error('400'));

    const logger = new CapturingLogger();

    await QueryHelper.instance(mockConnection, logger).query(
      'sobject',
      'clause',
      'fields'
    );

    expect(queryMock.execute.callCount).to.equal(2);
    expect(sobjectStub.alwaysCalledWith('sobject')).to.be.true;
    expect(sobjectMock.find.alwaysCalledWith('clause', 'fields')).to.be.true;
    expect(logger.entries.length).to.equal(2);
    expect(logger.entries[0]).to.match(
      logRegex('Warning: Request failed. Cause: 400')
    );
    expect(logger.entries[1]).to.match(
      logRegex(
        'Retrying failed request, waiting \\d+ seconds \\(attempts: 1\\)'
      )
    );
  });

  it('should retry with custom options', async () => {
    queryMock.execute.resolves([]);
    queryMock.execute.onFirstCall().rejects(new Error('error'));
    queryMock.execute.onSecondCall().rejects(new Error('400'));

    const logger = new CapturingLogger();

    await QueryHelper.instance(mockConnection, logger, {
      maxQueryRetries: 2,
      queryInitialIntervalMs: 500,
    }).query('sobject', 'clause', 'fields');

    expect(queryMock.execute.callCount).to.equal(3);
    expect(sobjectStub.alwaysCalledWith('sobject')).to.be.true;
    expect(sobjectMock.find.alwaysCalledWith('clause', 'fields')).to.be.true;
    expect(logger.entries.length).to.equal(4);
    expect(logger.entries[0]).to.match(
      logRegex('Warning: Request failed. Cause: error')
    );
    expect(logger.entries[1]).to.match(
      logRegex('Retrying failed request, waiting 0.5 seconds \\(attempts: 1\\)')
    );
    expect(logger.entries[2]).to.match(
      logRegex('Warning: Request failed. Cause: 400')
    );
    expect(logger.entries[3]).to.match(
      logRegex('Retrying failed request, waiting 1 seconds \\(attempts: 2\\)')
    );
  });

  it('should throw error after max retries', async () => {
    const error = new Error('400');
    queryMock.execute.rejects(error);

    const logger = new CapturingLogger();

    let capturedErr;
    try {
      await QueryHelper.instance(mockConnection, logger, {
        maxQueryRetries: 3,
      }).query('sobject', 'clause', 'fields');
      expect.fail('Missing exception');
    } catch (err) {
      capturedErr = err as TestError;
    }

    expect(queryMock.execute.callCount).to.equal(4);
    expect(sobjectStub.alwaysCalledWith('sobject')).to.be.true;
    expect(sobjectMock.find.alwaysCalledWith('clause', 'fields')).to.be.true;
    expect(capturedErr).to.be.instanceof(TestError);
    expect(capturedErr.message).to.equal(
      'All retries failed. Last error: Error: 400'
    );
    expect(capturedErr.kind).to.equal(TestErrorKind.Query);
    expect(logger.entries.length).to.equal(7);
    expect(logger.entries[0]).to.match(
      logRegex('Warning: Request failed. Cause: 400')
    );
    expect(logger.entries[1]).to.match(
      logRegex('Retrying failed request, waiting 15 seconds \\(attempts: 1\\)')
    );
    expect(logger.entries[2]).to.match(
      logRegex('Warning: Request failed. Cause: 400')
    );
    expect(logger.entries[3]).to.match(
      logRegex('Retrying failed request, waiting 30 seconds \\(attempts: 2\\)')
    );
    expect(logger.entries[4]).to.match(
      logRegex('Warning: Request failed. Cause: 400')
    );
    expect(logger.entries[5]).to.match(
      logRegex('Retrying failed request, waiting 60 seconds \\(attempts: 3\\)')
    );
    expect(logger.entries[6]).to.match(
      logRegex('Warning: Request failed. Cause: 400')
    );
  });
});
