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
import {
  logRegex,
  MockTestMethodCollector,
  MockTestRunner,
  testRunId,
} from '../Setup';
import { ApexTestRunResult } from '../../src/model/ApexTestRunResult';
import { ApexTestResult } from '../../src/model/ApexTestResult';
import { QueryHelper } from '../../src/query/QueryHelper';
import { TestDebugLogs } from '../../src/command/TestDebugLogs';
import * as fs from 'fs';
import * as os from 'os';
import path from 'path';

const $$ = testSetup();
let mockConnection: Connection;
let sandboxStub: SinonSandbox;
let queryHelperStub: SinonStub;
let toolingQueryStub: SinonStub;
let toolingCreateStub: SinonStub;
let toolingRequestStub: SinonStub;
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
      QueryHelper.instance(mockConnection.tooling),
      'query'
    );
    // delegate retry variant to basic query
    sandboxStub
      .stub(QueryHelper.instance(mockConnection.tooling), 'queryWithRetry')
      .returns(queryHelperStub);
    toolingQueryStub = sandboxStub.stub(mockConnection.tooling, 'query');
    toolingCreateStub = sandboxStub.stub(mockConnection.tooling, 'create');
    toolingRequestStub = sandboxStub.stub(mockConnection.tooling, 'request');
  });

  afterEach(() => {
    sandboxStub.restore();
  });

  it('unknown user should throw', async () => {
    const logger = new CapturingLogger();
    const runnerResult: ApexTestRunResult = {
      AsyncApexJobId: testRunId,
      StartTime: '',
      EndTime: '',
      Status: 'Completed',
      TestTime: 1,
      UserId: 'user',
      ClassesCompleted: 100,
      ClassesEnqueued: 10,
      MethodsCompleted: 1000,
      MethodsEnqueued: 900,
      MethodsFailed: 0,
    };
    const runner = new MockTestRunner(runnerResult);
    const methodCollector = new MockTestMethodCollector(new Map(), new Map());
    queryHelperStub.onCall(0).resolves([]);

    try {
      await TestDebugLogs.run(
        logger,
        mockConnection,
        '',
        methodCollector,
        runner,
        'username',
        'outputDir'
      );
    } catch (err) {
      // Ignore
    }

    expect(logger.entries.length).to.be.equal(2);
    expect(logger.entries[0]).to.match(
      logRegex("Unknown user 'username' on this org")
    );
    expect(logger.entries[1]).to.match(
      logRegex(
        "Error stack: TestError: Unknown user 'username' on this org\n    at.*"
      )
    );
  });

  it('creates output directory', async () => {
    const logger = new CapturingLogger();
    const runnerResult: ApexTestRunResult = {
      AsyncApexJobId: testRunId,
      StartTime: '',
      EndTime: '',
      Status: 'Completed',
      TestTime: 1,
      UserId: 'user',
      ClassesCompleted: 100,
      ClassesEnqueued: 10,
      MethodsCompleted: 1000,
      MethodsEnqueued: 900,
      MethodsFailed: 0,
    };
    const runner = new MockTestRunner(runnerResult);
    const methodCollector = new MockTestMethodCollector(new Map(), new Map());
    queryHelperStub.onCall(0).resolves([{ Id: 'AnId' }]); // User Id
    queryHelperStub.onCall(1).resolves([]); // Debug logs
    queryHelperStub.onCall(2).resolves([]); // ApexClassInfo
    toolingQueryStub.resolves({ records: [] }); // Debug trace
    toolingCreateStub.resolves({ success: true }); // Debug trace

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'foo-'));
    fs.rmSync(tmpDir, { recursive: true, force: true });
    try {
      await TestDebugLogs.run(
        logger,
        mockConnection,
        '',
        methodCollector,
        runner,
        'username',
        tmpDir
      );
    } catch (err) {
      // Ignore
    }

    expect(logger.entries.length).to.be.equal(3);
    expect(logger.entries[0]).to.match(
      logRegex(`Creating output directory '${tmpDir}'`)
    );
    expect(logger.entries[1]).to.match(
      logRegex('Collecting test methods, this may take some time...')
    );
    expect(logger.entries[2]).to.match(logRegex('Found 0 test classes'));

    expect(fs.lstatSync(tmpDir).isDirectory()).to.be.true;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('re-creates output directory', async () => {
    const logger = new CapturingLogger();
    const runnerResult: ApexTestRunResult = {
      AsyncApexJobId: testRunId,
      StartTime: '',
      EndTime: '',
      Status: 'Completed',
      TestTime: 1,
      UserId: 'user',
      ClassesCompleted: 100,
      ClassesEnqueued: 10,
      MethodsCompleted: 1000,
      MethodsEnqueued: 900,
      MethodsFailed: 0,
    };
    const runner = new MockTestRunner(runnerResult);
    const methodCollector = new MockTestMethodCollector(new Map(), new Map());
    queryHelperStub.onCall(0).resolves([{ Id: 'AnId' }]); // User Id
    queryHelperStub.onCall(1).resolves([]); // Debug logs
    queryHelperStub.onCall(2).resolves([]); // ApexClassInfo
    toolingQueryStub.resolves({ records: [] }); // Debug trace
    toolingCreateStub.resolves({ success: true }); // Debug trace

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'foo-'));

    try {
      await TestDebugLogs.run(
        logger,
        mockConnection,
        '',
        methodCollector,
        runner,
        'username',
        tmpDir
      );
    } catch (err) {
      // Ignore
    }

    expect(logger.entries.length).to.be.equal(3);
    expect(logger.entries[0]).to.match(
      logRegex(`Removing & recreating output directory '${tmpDir}'`)
    );
    expect(logger.entries[1]).to.match(
      logRegex('Collecting test methods, this may take some time...')
    );
    expect(logger.entries[2]).to.match(logRegex('Found 0 test classes'));

    expect(fs.lstatSync(tmpDir).isDirectory()).to.be.true;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('clears trace flags/logs & saves logs', async () => {
    const logger = new CapturingLogger();
    const runnerResult: ApexTestRunResult = {
      AsyncApexJobId: testRunId,
      StartTime: '',
      EndTime: '',
      Status: 'Completed',
      TestTime: 1,
      UserId: 'user',
      ClassesCompleted: 100,
      ClassesEnqueued: 10,
      MethodsCompleted: 1000,
      MethodsEnqueued: 900,
      MethodsFailed: 0,
    };
    const runner = new MockTestRunner(runnerResult);
    const methodCollector = new MockTestMethodCollector(
      new Map<string, string>([['Class id', 'FooClass']]),
      new Map<string, Set<string>>([['FooClass', new Set(['testMethod'])]])
    );
    const mockTestRunResult: ApexTestResult[] = [
      {
        Id: 'Class id',
        QueueItemId: 'Queue id',
        AsyncApexJobId: testRunId,
        Outcome: 'Pass',
        ApexClass: { Id: 'Class id', Name: 'FooClass', NamespacePrefix: '' },
        MethodName: 'testMethod',
        Message: '',
        StackTrace: null,
        RunTime: 1,
        TestTimestamp: '',
      },
    ];

    queryHelperStub.onCall(0).resolves([{ Id: 'AnId' }]); // User Id
    queryHelperStub.onCall(1).resolves([{ Id: 'LogId' }]); // Debug logs
    queryHelperStub.onCall(2).resolves([mockTestRunResult[0]]);
    queryHelperStub.onCall(3).resolves([{ Id: 'LogId' }]); // Debug logs
    toolingQueryStub.resolves({ records: [{ Id: 'AnId' }] }); // Debug trace
    toolingCreateStub.resolves({ success: true }); // Debug trace
    toolingRequestStub.resolves('Log Content');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'foo-'));

    try {
      await TestDebugLogs.run(
        logger,
        mockConnection,
        '',
        methodCollector,
        runner,
        'username',
        tmpDir
      );
    } catch (err) {
      // Ignore
    }

    expect(logger.entries.length).to.be.equal(7);
    expect(logger.entries[0]).to.match(
      logRegex(`Removing & recreating output directory '${tmpDir}'`)
    );
    expect(logger.entries[1]).to.match(logRegex('Clearing 1 trace flags'));
    expect(logger.entries[2]).to.match(logRegex('Clearing 1 debug logs'));
    expect(logger.entries[3]).to.match(
      logRegex('Collecting test methods, this may take some time...')
    );
    expect(logger.entries[4]).to.match(logRegex('Found 1 test classes'));
    expect(logger.entries[5]).to.match(
      logRegex('Queued all of method of class FooClass')
    );
    expect(logger.entries[6]).to.match(
      logRegex('Starting test run, with max failing tests for re-run 10')
    );

    const logFile = path.join(tmpDir, 'LogId.log');
    expect(fs.lstatSync(logFile).isFile()).to.be.true;
    expect(fs.lstatSync(tmpDir).isDirectory()).to.be.true;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
