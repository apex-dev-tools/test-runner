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
import { RerunOption, Testall } from '../../src/command/Testall';
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
import { TestError, TestErrorKind } from '../../src/runner/TestError';

const $$ = testSetup();
let mockConnection: Connection;
let sandboxStub: SinonSandbox;
let testingServiceSyncStub: SinonStub;
let queryStub: SinonStub;
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

    queryStub = sandboxStub.stub(
      QueryHelper.instance(mockConnection.tooling),
      'query'
    );
    // delegate retry variant to basic query
    sandboxStub
      .stub(QueryHelper.instance(mockConnection.tooling), 'queryWithRetry')
      .returns(queryStub);
  });

  afterEach(() => {
    sandboxStub.restore();
  });

  it('should log and re-throw runner Error', async () => {
    const logger = new CapturingLogger();
    const err = new TestError('TestRunner timeout', TestErrorKind.Timeout);
    const runner = new MockThrowingTestRunner(err);
    const testMethods = new MockTestMethodCollector(
      new Map<string, string>([['An Id', 'FooClass']]),
      new Map<string, Set<string>>([['FooClass', new Set(['testMethod'])]])
    );

    let capturedErr;
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
      capturedErr = err;
    }

    expect(capturedErr).to.equal(err);
    expect(logger.entries.length).to.be.equal(3);
    expect(logger.entries[0]).to.match(
      logRegex('Starting test run, with max failing tests for re-run 10')
    );
    expect(logger.entries[1]).to.match(logRegex('TestRunner timeout'));
    expect(logger.entries[2]).to.match(
      logRegex('Error stack: TestError: TestRunner timeout\n    at.*')
    );
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

  it('should return summary after running', async () => {
    const mockDate = new Date(1587412800000);
    //@ts-expect-error
    const spy = jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

    const logger = new CapturingLogger();
    const runnerResult: ApexTestRunResult = {
      AsyncApexJobId: testRunId,
      StartTime: '',
      EndTime: '',
      Status: 'Passed',
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
        Outcome: 'Pass',
        ApexClass: { Id: 'Class id', Name: 'FooClass', NamespacePrefix: '' },
        MethodName: 'testMethod',
        Message: '',
        StackTrace: null,
        RunTime: 1,
        TestTimestamp: '',
      },
    ];
    queryStub.resolves(mockTestRunResult);

    const result = await Testall.run(
      logger,
      mockConnection,
      '',
      testMethods,
      runner,
      [new MockOutputGenerator()],
      {}
    );
    spy.mockRestore();

    expect(result).to.deep.equal({
      startTime: new Date('2020-04-20T20:00:00.000Z'),
      testResults: [
        {
          Id: 'The id',
          QueueItemId: 'Queue id',
          AsyncApexJobId: '707xx0000AGQ3jbQQD',
          Outcome: 'Pass',
          ApexClass: {
            Id: 'Class id',
            Name: 'FooClass',
            NamespacePrefix: '',
          },
          MethodName: 'testMethod',
          Message: '',
          StackTrace: null,
          RunTime: 1,
          TestTimestamp: '',
        },
      ],
      runResult: {
        AsyncApexJobId: '707xx0000AGQ3jbQQD',
        StartTime: '',
        EndTime: '',
        Status: 'Passed',
        TestTime: 1,
        UserId: 'user',
        ClassesCompleted: 100,
        ClassesEnqueued: 10,
        MethodsCompleted: 1000,
        MethodsEnqueued: 900,
        MethodsFailed: 0,
      },
      reruns: [],
      runIds: ['707xx0000AGQ3jbQQD'],
      coverageResult: undefined,
    });
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
    queryStub.resolves([]);
    const testMethods = new MockTestMethodCollector(
      new Map<string, string>([['An Id', 'FooClass']]),
      new Map<string, Set<string>>([['FooClass', new Set(['testMethod'])]])
    );

    const result = await Testall.run(
      logger,
      mockConnection,
      '',
      testMethods,
      runner,
      [new MockOutputGenerator()],
      {}
    );

    expect(result).to.be.undefined;
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
    queryStub.resolves([mockTestRunResult]);
    const testMethods = new MockTestMethodCollector(
      new Map<string, string>([['An Id', 'FooClass']]),
      new Map<string, Set<string>>([['FooClass', new Set(['testMethod'])]])
    );

    const result = await Testall.run(
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

    expect(result?.runIds.length).to.be.equal(1);
    expect(logger.entries.length).to.be.equal(3);
    expect(logger.entries[0]).to.match(
      logRegex('Starting test run, with max failing tests for re-run 0')
    );
    expect(logger.entries[1]).to.match(
      logRegex(
        'Aborting missing test check as 1 failed - max re-run limit exceeded'
      )
    );
    expect(logger.entries[2]).to.match(
      logRegex('No matching test failures to re-run')
    );
  });

  it('should complete after passed sequential re-run of tests', async () => {
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
    queryStub.resolves(mockTestRunResult);

    const mockTestResult = {
      tests: [{ asyncApexJobId: 'retryId', outcome: 'Pass', message: null }],
    } as TestResult;
    testingServiceSyncStub.resolves(mockTestResult);

    const result = await Testall.run(
      logger,
      mockConnection,
      '',
      testMethods,
      runner,
      [new MockOutputGenerator()],
      {}
    );

    expect(result?.runIds.length).to.equal(2);
    expect(result?.reruns.length).to.equal(1);
    expect(result?.reruns[0].after.Outcome).to.equal('Pass');
    expect(result?.reruns[0].after.Message).to.equal(null);
    expect(logger.entries.length).to.equal(3);
    expect(logger.entries[0]).to.match(
      logRegex('Starting test run, with max failing tests for re-run 10')
    );
    expect(logger.entries[1]).to.match(
      logRegex('Running 1 failed tests sequentially \\(matched patterns\\)')
    );
    expect(logger.entries[2]).to.match(
      logRegex('FooClass.testMethod re-run complete, outcome = Pass')
    );
  });

  it('should complete after failed sequential re-run of tests', async () => {
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
    queryStub.resolves(mockTestRunResult);

    const mockTestResult = {
      tests: [
        { asyncApexJobId: 'retryId', outcome: 'Fail', message: 'Other Error' },
      ],
    } as TestResult;
    testingServiceSyncStub.resolves(mockTestResult);

    const result = await Testall.run(
      logger,
      mockConnection,
      '',
      testMethods,
      runner,
      [new MockOutputGenerator()],
      {}
    );

    expect(result?.runIds.length).to.be.equal(2);
    expect(result?.reruns.length).to.equal(1);
    expect(result?.reruns[0].after.Outcome).to.equal('Fail');
    expect(result?.reruns[0].after.Message).to.equal('Other Error');
    expect(logger.entries.length).to.be.equal(5);
    expect(logger.entries[0]).to.match(
      logRegex('Starting test run, with max failing tests for re-run 10')
    );
    expect(logger.entries[1]).to.match(
      logRegex('Running 1 failed tests sequentially \\(matched patterns\\)')
    );
    expect(logger.entries[2]).to.match(
      logRegex('FooClass.testMethod re-run complete, outcome = Fail')
    );
    expect(logger.entries[3]).to.match(
      logRegex(' \\[Before\\] UNABLE_TO_LOCK_ROW')
    );
    expect(logger.entries[4]).to.match(logRegex(' \\[After\\] Other Error'));
  });

  it('should ignore and log failed retry request of test', async () => {
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
    queryStub.resolves(mockTestRunResult);

    testingServiceSyncStub.rejects(new Error('Request Error'));

    const result = await Testall.run(
      logger,
      mockConnection,
      '',
      testMethods,
      runner,
      [new MockOutputGenerator()],
      {}
    );

    expect(result?.runIds.length).to.be.equal(1);
    expect(result?.reruns.length).to.equal(0);
    expect(logger.entries.length).to.be.equal(3);
    expect(logger.entries[0]).to.match(
      logRegex('Starting test run, with max failing tests for re-run 10')
    );
    expect(logger.entries[1]).to.match(
      logRegex('Running 1 failed tests sequentially \\(matched patterns\\)')
    );
    expect(logger.entries[2]).to.match(
      logRegex('FooClass.testMethod re-run failed, cause: Request Error')
    );
  });

  it('should complete after limited sequential re-run of tests', async () => {
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
        Message: 'Not matching Error',
        StackTrace: null,
        RunTime: 1,
        TestTimestamp: '',
      },
    ];
    queryStub.resolves(mockTestRunResult);

    const mockTestResult = {
      tests: [{ asyncApexJobId: 'retryId', outcome: 'Pass', message: null }],
    } as TestResult;
    testingServiceSyncStub.resolves(mockTestResult);

    const result = await Testall.run(
      logger,
      mockConnection,
      '',
      testMethods,
      runner,
      [new MockOutputGenerator()],
      {
        rerunOption: RerunOption.Limit,
        maxErrorsForReRun: 1,
      }
    );

    expect(result?.runIds.length).to.equal(2);
    expect(result?.reruns.length).to.equal(1);
    expect(result?.reruns[0].after.Outcome).to.equal('Pass');
    expect(result?.reruns[0].after.Message).to.equal(null);
    expect(logger.entries.length).to.equal(3);
    expect(logger.entries[0]).to.match(
      logRegex('Starting test run, with max failing tests for re-run 1')
    );
    expect(logger.entries[1]).to.match(
      logRegex(
        'Running 1 failed tests sequentially \\(0 tests matched patterns\\)'
      )
    );
    expect(logger.entries[2]).to.match(
      logRegex('FooClass.testMethod re-run complete, outcome = Pass')
    );
  });

  it('should complete after exceeding limit on sequential re-run of tests', async () => {
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
        Message: 'Not matching Error',
        StackTrace: null,
        RunTime: 1,
        TestTimestamp: '',
      },
      {
        Id: 'The id',
        QueueItemId: 'Queue id',
        AsyncApexJobId: testRunId,
        Outcome: 'Fail',
        ApexClass: { Id: 'Class id', Name: 'FooClass', NamespacePrefix: '' },
        MethodName: 'testMethod2',
        Message: 'Not matching Error 2',
        StackTrace: null,
        RunTime: 1,
        TestTimestamp: '',
      },
    ];
    queryStub.resolves(mockTestRunResult);

    const mockTestResult = {
      tests: [{ asyncApexJobId: 'retryId', outcome: 'Pass', message: null }],
    } as TestResult;
    testingServiceSyncStub.resolves(mockTestResult);

    const result = await Testall.run(
      logger,
      mockConnection,
      '',
      testMethods,
      runner,
      [new MockOutputGenerator()],
      {
        rerunOption: RerunOption.Limit,
        maxErrorsForReRun: 1,
      }
    );

    expect(result?.runIds.length).to.equal(1);
    expect(result?.reruns.length).to.equal(0);
    expect(logger.entries.length).to.equal(4);
    expect(logger.entries[0]).to.match(
      logRegex('Starting test run, with max failing tests for re-run 1')
    );
    expect(logger.entries[1]).to.match(
      logRegex(
        'Aborting missing test check as 2 failed - max re-run limit exceeded'
      )
    );
    expect(logger.entries[2]).to.match(
      logRegex('Max re-run limit exceeded, running pattern matched tests only')
    );
    expect(logger.entries[3]).to.match(
      logRegex('No matching test failures to re-run')
    );
  });

  it('should complete after sequential re-run of all failed tests', async () => {
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
      {
        Id: 'The id',
        QueueItemId: 'Queue id',
        AsyncApexJobId: testRunId,
        Outcome: 'Fail',
        ApexClass: { Id: 'Class id', Name: 'FooClass', NamespacePrefix: '' },
        MethodName: 'testMethod2',
        Message: 'Not matching Error',
        StackTrace: null,
        RunTime: 1,
        TestTimestamp: '',
      },
      {
        Id: 'The id',
        QueueItemId: 'Queue id',
        AsyncApexJobId: testRunId,
        Outcome: 'Fail',
        ApexClass: { Id: 'Class id', Name: 'FooClass', NamespacePrefix: '' },
        MethodName: 'testMethod3',
        Message: 'Not matching Error 2',
        StackTrace: null,
        RunTime: 1,
        TestTimestamp: '',
      },
    ];
    queryStub.resolves(mockTestRunResult);

    const mockTestResult = {
      tests: [{ asyncApexJobId: 'retryId', outcome: 'Pass', message: null }],
    } as TestResult;
    testingServiceSyncStub.resolves(mockTestResult);

    const result = await Testall.run(
      logger,
      mockConnection,
      '',
      testMethods,
      runner,
      [new MockOutputGenerator()],
      {
        rerunOption: RerunOption.All,
      }
    );

    expect(result?.runIds.length).to.equal(4);
    expect(result?.reruns.length).to.equal(3);
    expect(logger.entries.length).to.equal(5);
    expect(logger.entries[0]).to.match(
      logRegex('Starting test run, with max failing tests for re-run 10')
    );
    expect(logger.entries[1]).to.match(
      logRegex(
        'Running 3 failed tests sequentially \\(1 tests matched patterns\\)'
      )
    );
    expect(logger.entries[2]).to.match(
      logRegex('FooClass.testMethod re-run complete, outcome = Pass')
    );
    expect(logger.entries[3]).to.match(
      logRegex('FooClass.testMethod2 re-run complete, outcome = Pass')
    );
    expect(logger.entries[4]).to.match(
      logRegex('FooClass.testMethod3 re-run complete, outcome = Pass')
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
    queryStub.onCall(0).resolves([mockTestRunResult[0]]);
    queryStub.onCall(1).resolves([mockTestRunResult[1]]);

    const result = await Testall.run(
      logger,
      mockConnection,
      '',
      testMethods,
      runner,
      [new MockOutputGenerator()],
      {}
    );
    expect(result?.runIds.length).to.be.equal(2);
    expect(logger.entries.length).to.be.equal(3);
    expect(logger.entries[0]).to.match(
      logRegex('Starting test run, with max failing tests for re-run 10')
    );
    expect(logger.entries[1]).to.match(
      logRegex('Found 1 methods in 1 classes were not run, trying again...')
    );
    expect(logger.entries[2]).to.match(
      logRegex('No matching test failures to re-run')
    );
  });
});
