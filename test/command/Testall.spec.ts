/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */

import { TestResult, TestService } from '@salesforce/apex-node';
import { Connection } from '@salesforce/core';
import { TestContext } from '@salesforce/core/lib/testSetup';
import { expect } from 'chai';
import { SinonSandbox, SinonStub, createSandbox } from 'sinon';
import { RerunOption, Testall } from '../../src/command/Testall';
import { CapturingLogger } from '../../src/log/CapturingLogger';
import { ApexTestResult } from '../../src/model/ApexTestResult';
import { ApexTestRunResult } from '../../src/model/ApexTestRunResult';
import { QueryHelper } from '../../src/query/QueryHelper';
import {
  MaybeError,
  TestError,
  TestErrorKind,
} from '../../src/runner/TestError';
import {
  MockOutputGenerator,
  MockTestMethodCollector,
  MockTestRunner,
  MockThrowingTestRunner,
  createMockConnection,
  logRegex,
  testRunId,
} from '../Setup';

describe('TestAll', () => {
  const $$ = new TestContext();
  let sandbox: SinonSandbox;

  let mockConnection: Connection;
  let testingServiceSyncStub: SinonStub;
  let queryStub: SinonStub;

  beforeEach(async () => {
    sandbox = createSandbox();
    mockConnection = await createMockConnection($$, sandbox);

    const qh = QueryHelper.instance(mockConnection);
    queryStub = sandbox.stub(qh, 'query');
    // delegate retry variant to basic query
    sandbox.stub(qh, 'queryWithRetry').returns(queryStub);

    testingServiceSyncStub = sandbox.stub(
      TestService.prototype,
      'runTestSynchronous'
    );
  });

  afterEach(() => {
    sandbox.restore();
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
    const err: MaybeError = new Error('TestRunner failed');
    err.data = 'More data';
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
        ApexClass: { Id: 'Class id', Name: 'FooClass', NamespacePrefix: 'ns' },
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
        ApexClass: { Id: 'Class id', Name: 'FooClass', NamespacePrefix: 'ns' },
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
      'ns',
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
