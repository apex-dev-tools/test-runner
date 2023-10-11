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
  let timeoutSpy: jest.SpyInstance;

  beforeEach(async () => {
    sandbox = createSandbox();
    mockConnection = await createMockConnection($$, sandbox);

    // always call timeouts immediately
    timeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation(cb => {
      cb();
      return {} as NodeJS.Timeout;
    });

    sobjectMock = {
      find: sandbox.stub(),
    };
    queryMock = {
      execute: sandbox.stub(),
    };

    const conn = AuthHelper.toJsForceConnection(mockConnection);
    sobjectStub = sandbox.stub(conn.tooling, 'sobject');
    sobjectStub.returns(sobjectMock);
    sobjectMock.find.returns(queryMock);
    sandbox.stub(AuthHelper, 'toJsForceConnection').returns(conn);
  });

  afterEach(() => {
    sandbox.restore();
    timeoutSpy.mockRestore();
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
    expect(logger.entries.length).to.equal(1);
    expect(logger.entries[0]).to.match(
      logRegex(
        'Request failed, waiting 30 seconds before trying again. Cause: 400'
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
    expect(logger.entries.length).to.equal(2);
    expect(logger.entries[0]).to.match(
      logRegex(
        'Request failed, waiting 0.5 seconds before trying again. Cause: error'
      )
    );
    expect(logger.entries[1]).to.match(
      logRegex(
        'Request failed, waiting 1 seconds before trying again. Cause: 400'
      )
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
    } catch (err) {
      capturedErr = err;
    }

    expect(queryMock.execute.callCount).to.equal(4);
    expect(sobjectStub.alwaysCalledWith('sobject')).to.be.true;
    expect(sobjectMock.find.alwaysCalledWith('clause', 'fields')).to.be.true;
    if (capturedErr instanceof TestError) {
      expect(capturedErr.message).to.equal('400');
      expect(capturedErr.kind).to.equal(TestErrorKind.Query);
    } else {
      expect.fail('Not a TestError');
    }
    expect(logger.entries.length).to.equal(4);
    expect(logger.entries[0]).to.match(
      logRegex(
        'Request failed, waiting 30 seconds before trying again. Cause: 400'
      )
    );
    expect(logger.entries[1]).to.match(
      logRegex(
        'Request failed, waiting 60 seconds before trying again. Cause: 400'
      )
    );
    expect(logger.entries[2]).to.match(
      logRegex(
        'Request failed, waiting 120 seconds before trying again. Cause: 400'
      )
    );
    expect(logger.entries[3]).to.match(
      logRegex('Request failed after 3 retries. Cause: 400')
    );
  });
});
