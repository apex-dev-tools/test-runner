/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */
import { AuthInfo, Connection } from '@apexdevtools/sfdx-auth-helper';
import {
  MockTestOrgData,
  testSetup,
} from '@apexdevtools/sfdx-auth-helper/lib/src/testSetup';
import { StreamingClient } from '@salesforce/apex-node/lib/src/streaming';
import { createSandbox, SinonSandbox, SinonStub } from 'sinon';
import { expect } from 'chai';
import { CapturingLogger } from '../../src/log/CapturingLogger';
import { logRegex, testRunId } from '../Setup';
import { ApexTestRunResult } from '../../src/model/ApexTestRunResult';
import { QueryHelper } from '../../src/query/QueryHelper';
import { AggResult } from '../../src/log/BaseLogger';

const $$ = testSetup();
let mockConnection: Connection;
let sandboxStub: SinonSandbox;
let queryHelperStub: SinonStub;
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

    sandboxStub.stub(StreamingClient.prototype, 'handshake').resolves();
    queryHelperStub = sandboxStub.stub(
      QueryHelper.instance(mockConnection),
      'query'
    );
  });

  afterEach(() => {
    sandboxStub.restore();
  });

  it('should save test run status when verbose logging', async () => {
    const mockTestRunResult: ApexTestRunResult = {
      AsyncApexJobId: testRunId,
      StartTime: '',
      EndTime: '',
      Status: 'Processing',
      TestTime: 0,
      UserId: '',
      ClassesCompleted: 0,
      ClassesEnqueued: 0,
      MethodsCompleted: 2,
      MethodsEnqueued: 20,
      MethodsFailed: 3,
    };

    const aggCount: AggResult = {
      expr0: 10,
    };
    queryHelperStub.onCall(0).resolves([aggCount]);

    const mockQueueItems = {
      records: [
        {
          Id: 'id',
          ApexClassId: 'apexClassId',
          ExtendedStatus: 'extendedStatus',
          Status: 'status',
          TestRunResultID: 'testRunResultId',
          ShouldSkipCodeCoverage: true,
        },
      ],
    };
    queryHelperStub.onCall(1).resolves(mockQueueItems);

    const logger = new CapturingLogger(mockConnection, true);
    await logger.logStatus(mockTestRunResult);

    expect(logger.entries.length).to.equal(1);
    expect(logger.entries[0]).to.match(
      logRegex('3 have failed, 50% run, job is Processing$')
    );
    expect(logger.files.length).to.equal(1);
    expect(logger.files[0][1]).to.equal(JSON.stringify(mockQueueItems));
  });

  it('should generate warning messages', () => {
    const logger = new CapturingLogger(mockConnection, true);
    logger.logWarning('A message');

    expect(logger.entries.length).to.equal(1);
    expect(logger.entries[0]).to.match(logRegex('Warning: A message'));
  });
});
