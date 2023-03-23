/*
 * Copyright (c) 2023, FinancialForce.com, inc. All rights reserved.
 */

import { AuthInfo, Connection } from '@apexdevtools/sfdx-auth-helper';
import {
  MockTestOrgData,
  testSetup,
} from '@apexdevtools/sfdx-auth-helper/lib/src/testSetup';
import { StreamingClient } from '@salesforce/apex-node/lib/src/streaming';
import { expect } from 'chai';
import { createSandbox, SinonSandbox, SinonStub } from 'sinon';
import { CapturingLogger } from '../../src/log/CapturingLogger';
import { logRegex } from '../Setup';
import { QueryHelper } from '../../src/query/QueryHelper';
import { TestError, TestErrorKind } from '../../src/runner/TestError';

const $$ = testSetup();
let mockConnection: Connection;
let sandboxStub: SinonSandbox;
let sobjectStub: SinonStub<[string], any>;
let sobjectMock: {
  find: SinonStub;
};
let queryMock: {
  execute: SinonStub;
};
let timeoutSpy: jest.SpyInstance;

const testData = new MockTestOrgData();

describe('messages', () => {
  beforeEach(async () => {
    sandboxStub = createSandbox();
    $$.setConfigStubContents('AuthInfoConfig', {
      contents: await testData.getConfig(),
    });
    // Stub retrieveMaxApiVersion to get over "Domain Not Found: The org cannot be found" error
    sandboxStub
      .stub(Connection.prototype, 'retrieveMaxApiVersion')
      .resolves('50.0');
    mockConnection = await Connection.create({
      authInfo: await AuthInfo.create({
        username: testData.username,
      }),
    });
    sandboxStub.stub(mockConnection, 'instanceUrl').get(() => {
      return 'https://na139.salesforce.com';
    });

    // always call timeouts immediately
    timeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation(cb => {
      cb();
      return {} as NodeJS.Timeout;
    });

    sandboxStub.stub(StreamingClient.prototype, 'handshake').resolves();
    sobjectMock = {
      find: sandboxStub.stub(),
    };
    queryMock = {
      execute: sandboxStub.stub(),
    };

    sobjectStub = sandboxStub.stub(mockConnection, 'sobject');
    sobjectStub.returns(sobjectMock);
    sobjectMock.find.returns(queryMock);
  });

  afterEach(() => {
    sandboxStub.restore();
    timeoutSpy.mockRestore();
  });

  it('should retry with default options', async () => {
    queryMock.execute.resolves([]);
    queryMock.execute.onFirstCall().rejects(new Error('400'));

    const logger = new CapturingLogger();

    await QueryHelper.instance(mockConnection).queryWithRetry(logger, {})(
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

    await QueryHelper.instance(mockConnection).queryWithRetry(logger, {
      maxQueryRetries: 2,
      queryInitialIntervalMs: 500,
    })('sobject', 'clause', 'fields');

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
      await QueryHelper.instance(mockConnection).queryWithRetry(logger, {})(
        'sobject',
        'clause',
        'fields'
      );
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
