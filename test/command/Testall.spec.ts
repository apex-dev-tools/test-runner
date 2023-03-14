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
import { Testall } from '../../src/command/Testall';
import { TestResult, TestService } from '@salesforce/apex-node';
import { CapturingLogger } from '../../src/log/CapturingLogger';
import {
  logRegex,
  MockOutputGenerator,
  MockTestMethodCollector,
  MockTestRunner,
  MockThrowingTestRunner,
  testRunId,
} from '../Setup';
import { ApexTestRunResult } from '../../src/model/ApexTestRunResult';
import { ApexTestResult } from '../../src/model/ApexTestResult';
import { QueryHelper } from '../../src/query/QueryHelper';

const $$ = testSetup();
let mockConnection: Connection;
let sandboxStub: SinonSandbox;
let testingServiceSyncStub: SinonStub;
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
    testingServiceSyncStub = sandboxStub.stub(
      TestService.prototype,
      'runTestSynchronous'
    );
    queryHelperStub = sandboxStub.stub(
      QueryHelper.instance(mockConnection),
      'query'
    );
  });

  afterEach(() => {
    sandboxStub.restore();
  });

  it('should log and re-throw internal Error', async () => {
    const logger = new CapturingLogger();
    const err = new Error('TestRunner failed');
    ((err as unknown) as Record<string, unknown>).data = 'More data';
    const runner = new MockThrowingTestRunner(err);
    const testMethods = new MockTestMethodCollector(
      new Map<string, string>([['An Id', 'FooClass']]),
      new Map<string, Set<string>>([['FooClass', new Set(['testMethod'])]])
    );

    try {
      await Testall.run(
        logger,
        mockConnection,
        '',
        testMethods,
        runner,
        [new MockOutputGenerator()],
        {}
      );
    } catch (err) {
      // Ignore
    }

    expect(logger.entries.length).to.be.equal(4);
    expect(logger.entries[0]).to.match(
      logRegex('Starting test run, with max failing tests for re-run 10')
    );
    expect(logger.entries[1]).to.match(logRegex('TestRunner failed'));
    expect(logger.entries[2]).to.match(
      logRegex('Error stack: Error: TestRunner failed\n    at.*')
    );
    expect(logger.entries[3]).to.match(
      logRegex('Additional data: "More data"')
    );
  });

  it('should log and re-throw non-Error exception', async () => {
    const logger = new CapturingLogger();
    const runner = new MockThrowingTestRunner('TestRunner failed');
    const testMethods = new MockTestMethodCollector(
      new Map<string, string>([['An Id', 'FooClass']]),
      new Map<string, Set<string>>([['FooClass', new Set(['testMethod'])]])
    );

    try {
      await Testall.run(
        logger,
        mockConnection,
        '',
        testMethods,
        runner,
        [new MockOutputGenerator()],
        {}
      );
    } catch (err) {
      // Ignore
    }

    expect(logger.entries.length).to.be.equal(2);
    expect(logger.entries[0]).to.match(
      logRegex('Starting test run, with max failing tests for re-run 10')
    );
    expect(logger.entries[1]).to.match(logRegex('Error: "TestRunner failed"'));
  });

  it('should stop after an initial aborted test run', async () => {
    const logger = new CapturingLogger();
    const runnerResult: ApexTestRunResult = {
      AsyncApexJobId: testRunId,
      StartTime: '',
      EndTime: '',
      Status: 'Aborted',
      TestTime: 1,
      UserId: 'user',
      ClassesCompleted: 100,
      ClassesEnqueued: 10,
      MethodsCompleted: 1000,
      MethodsEnqueued: 900,
      MethodsFailed: 0,
    };
    const runner = new MockTestRunner(runnerResult);
    queryHelperStub.resolves([]);
    const testMethods = new MockTestMethodCollector(
      new Map<string, string>([['An Id', 'FooClass']]),
      new Map<string, Set<string>>([['FooClass', new Set(['testMethod'])]])
    );

    await Testall.run(
      logger,
      mockConnection,
      '',
      testMethods,
      runner,
      [new MockOutputGenerator()],
      {}
    );

    expect(logger.entries.length).to.be.equal(2);
    expect(logger.entries[0]).to.match(
      logRegex('Starting test run, with max failing tests for re-run 10')
    );
    expect(logger.entries[1]).to.match(
      logRegex('Initial test run was aborted, no results will be generated')
    );
  });

  it('should stop if there are too many failed tests', async () => {
    const logger = new CapturingLogger();
    const runnerResult: ApexTestRunResult = {
      AsyncApexJobId: testRunId,
      StartTime: '',
      EndTime: '',
      Status: 'Failed',
      TestTime: 1,
      UserId: 'user',
      ClassesCompleted: 100,
      ClassesEnqueued: 10,
      MethodsCompleted: 1000,
      MethodsEnqueued: 900,
      MethodsFailed: 0,
    };
    const runner = new MockTestRunner(runnerResult);

    const mockTestRunResult: ApexTestResult = {
      Id: 'The id',
      QueueItemId: 'Queue id',
      AsyncApexJobId: testRunId,
      Outcome: 'Fail',
      ApexClass: { Id: 'An Id', Name: 'FooClass', NamespacePrefix: '' },
      MethodName: 'MethodName',
      Message: null,
      StackTrace: null,
      RunTime: 1,
      TestTimestamp: '',
    };
    queryHelperStub.resolves([mockTestRunResult]);
    const testMethods = new MockTestMethodCollector(
      new Map<string, string>([['An Id', 'FooClass']]),
      new Map<string, Set<string>>([['FooClass', new Set(['testMethod'])]])
    );

    await Testall.run(
      logger,
      mockConnection,
      '',
      testMethods,
      runner,
      [new MockOutputGenerator()],
      {
        maxErrorsForReRun: 0,
      }
    );

    expect(logger.entries.length).to.be.equal(2);
    expect(logger.entries[0]).to.match(
      logRegex('Starting test run, with max failing tests for re-run 0')
    );
    expect(logger.entries[1]).to.match(
      logRegex(
        'Aborting re-testing as 1 failed \\(excluding for locking\\) which is above the max limit'
      )
    );
  });

  it('should complete after passed sequential re-run of locked tests', async () => {
    const logger = new CapturingLogger();
    const runnerResult: ApexTestRunResult = {
      AsyncApexJobId: testRunId,
      StartTime: '',
      EndTime: '',
      Status: 'Failed',
      TestTime: 1,
      UserId: 'user',
      ClassesCompleted: 100,
      ClassesEnqueued: 10,
      MethodsCompleted: 1000,
      MethodsEnqueued: 900,
      MethodsFailed: 0,
    };
    const runner = new MockTestRunner(runnerResult);
    const testMethods = new MockTestMethodCollector(
      new Map<string, string>([['An Id', 'FooClass']]),
      new Map<string, Set<string>>([['FooClass', new Set(['testMethod'])]])
    );

    const mockTestRunResult: ApexTestResult[] = [
      {
        Id: 'The id',
        QueueItemId: 'Queue id',
        AsyncApexJobId: testRunId,
        Outcome: 'Fail',
        ApexClass: { Id: 'Class id', Name: 'FooClass', NamespacePrefix: '' },
        MethodName: 'testMethod',
        Message: 'UNABLE_TO_LOCK_ROW',
        StackTrace: null,
        RunTime: 1,
        TestTimestamp: '',
      },
    ];
    queryHelperStub.resolves(mockTestRunResult);

    const mockTestResult = {
      summary: {
        outcome: 'Passed',
      },
    } as TestResult;
    testingServiceSyncStub.resolves(mockTestResult);

    await Testall.run(
      logger,
      mockConnection,
      '',
      testMethods,
      runner,
      [new MockOutputGenerator()],
      {}
    );

    expect(logger.entries.length).to.be.equal(2);
    expect(logger.entries[0]).to.match(
      logRegex('Starting test run, with max failing tests for re-run 10')
    );
    expect(logger.entries[1]).to.match(
      logRegex(
        'FooClass.testMethod re-run sequentially due to locking, outcome=Pass'
      )
    );
  });

  it('should complete after failed sequential re-run of locked tests', async () => {
    const logger = new CapturingLogger();
    const runnerResult: ApexTestRunResult = {
      AsyncApexJobId: testRunId,
      StartTime: '',
      EndTime: '',
      Status: 'Failed',
      TestTime: 1,
      UserId: 'user',
      ClassesCompleted: 100,
      ClassesEnqueued: 10,
      MethodsCompleted: 1000,
      MethodsEnqueued: 900,
      MethodsFailed: 0,
    };
    const runner = new MockTestRunner(runnerResult);
    const testMethods = new MockTestMethodCollector(
      new Map<string, string>([['An Id', 'FooClass']]),
      new Map<string, Set<string>>([['FooClass', new Set(['testMethod'])]])
    );

    const mockTestRunResult: ApexTestResult[] = [
      {
        Id: 'The id',
        QueueItemId: 'Queue id',
        AsyncApexJobId: testRunId,
        Outcome: 'Fail',
        ApexClass: { Id: 'Class id', Name: 'FooClass', NamespacePrefix: '' },
        MethodName: 'testMethod',
        Message: 'UNABLE_TO_LOCK_ROW',
        StackTrace: null,
        RunTime: 1,
        TestTimestamp: '',
      },
    ];
    queryHelperStub.resolves(mockTestRunResult);

    const mockTestResult = {
      summary: {
        outcome: 'Failed',
      },
    } as TestResult;
    testingServiceSyncStub.resolves(mockTestResult);

    await Testall.run(
      logger,
      mockConnection,
      '',
      testMethods,
      runner,
      [new MockOutputGenerator()],
      {}
    );

    expect(logger.entries.length).to.be.equal(2);
    expect(logger.entries[0]).to.match(
      logRegex('Starting test run, with max failing tests for re-run 10')
    );
    expect(logger.entries[1]).to.match(
      logRegex(
        'FooClass.testMethod re-run sequentially due to locking, outcome=Fail'
      )
    );
  });

  it('should re-run missing tests', async () => {
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
    const testMethods = new MockTestMethodCollector(
      new Map<string, string>([['An Id', 'FooClass']]),
      new Map<string, Set<string>>([
        ['FooClass', new Set(['FooMethod1', 'FooMethod2'])],
      ])
    );

    const mockTestRunResult: ApexTestResult[] = [
      {
        Id: 'Class id',
        QueueItemId: 'Queue id',
        AsyncApexJobId: testRunId,
        Outcome: 'Pass',
        ApexClass: { Id: 'Class id', Name: 'FooClass', NamespacePrefix: '' },
        MethodName: 'FooMethod1',
        Message: '',
        StackTrace: null,
        RunTime: 1,
        TestTimestamp: '',
      },
      {
        Id: 'Class id',
        QueueItemId: 'Queue id',
        AsyncApexJobId: testRunId,
        Outcome: 'Pass',
        ApexClass: { Id: 'Class id', Name: 'FooClass', NamespacePrefix: '' },
        MethodName: 'FooMethod2',
        Message: '',
        StackTrace: null,
        RunTime: 1,
        TestTimestamp: '',
      },
    ];
    queryHelperStub.onCall(0).resolves([mockTestRunResult[0]]);
    queryHelperStub.onCall(1).resolves([mockTestRunResult[1]]);

    await Testall.run(
      logger,
      mockConnection,
      '',
      testMethods,
      runner,
      [new MockOutputGenerator()],
      {}
    );

    expect(logger.entries.length).to.be.equal(2);
    expect(logger.entries[0]).to.match(
      logRegex('Starting test run, with max failing tests for re-run 10')
    );
    expect(logger.entries[1]).to.match(
      logRegex('Found 1 methods in 1 classes were not run, trying again...')
    );
  });
});
