/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */

import { Connection } from '@salesforce/core';
import { TestContext } from '@salesforce/core/lib/testSetup';
import { SinonSandbox, SinonStub, createSandbox } from 'sinon';
import { expect } from 'chai';
import { CapturingLogger } from '../../src/log/CapturingLogger';
import {
  createMockConnection,
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

describe('TestDebugLogs', () => {
  const $$ = new TestContext();
  let sandbox: SinonSandbox;

  let mockConnection: Connection;
  let queryStub: SinonStub;
  let toolingQueryStub: SinonStub;
  let toolingCreateStub: SinonStub;
  let toolingRequestStub: SinonStub;

  beforeEach(async () => {
    sandbox = createSandbox();
    mockConnection = await createMockConnection($$, sandbox);

    const qh = QueryHelper.instance(mockConnection);
    queryStub = sandbox.stub(qh, 'query');
    // delegate retry variant to basic query
    sandbox.stub(qh, 'queryWithRetry').returns(queryStub);

    toolingQueryStub = sandbox.stub(mockConnection.tooling, 'query');
    toolingCreateStub = sandbox.stub(mockConnection.tooling, 'create');
    toolingRequestStub = sandbox.stub(mockConnection.tooling, 'request');
    sandbox.stub(mockConnection.tooling, 'destroy').resolves();
  });

  afterEach(() => {
    sandbox.restore();
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
    queryStub.onCall(0).resolves([]);

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
    queryStub.onCall(0).resolves([{ Id: 'AnId' }]); // User Id
    queryStub.onCall(1).resolves([]); // Debug logs
    queryStub.onCall(2).resolves([]); // ApexClassInfo
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
    queryStub.onCall(0).resolves([{ Id: 'AnId' }]); // User Id
    queryStub.onCall(1).resolves([]); // Debug logs
    queryStub.onCall(2).resolves([]); // ApexClassInfo
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

    queryStub.onCall(0).resolves([{ Id: 'AnId' }]); // User Id
    queryStub.onCall(1).resolves([{ Id: 'LogId' }]); // Debug logs
    queryStub.onCall(2).resolves([mockTestRunResult[0]]);
    queryStub.onCall(3).resolves([{ Id: 'LogId' }]); // Debug logs
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

    expect(logger.entries.length).to.be.equal(8);
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
    expect(logger.entries[7]).to.match(
      logRegex('No matching test failures to re-run')
    );

    const logFile = path.join(tmpDir, 'LogId.log');
    expect(fs.lstatSync(logFile).isFile()).to.be.true;
    expect(fs.lstatSync(tmpDir).isDirectory()).to.be.true;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
