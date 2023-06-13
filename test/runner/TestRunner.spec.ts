/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */

import { ExecuteService, TestLevel, TestService } from '@salesforce/apex-node';
import { ApexTestResult as ApexNodeTestResult } from '@salesforce/apex-node/lib/src/tests/types';
import { Connection } from '@salesforce/core';
import { TestContext } from '@salesforce/core/lib/testSetup';
import { expect } from 'chai';
import { SinonSandbox, SinonStub, createSandbox, match } from 'sinon';
import { ResultCollector } from '../../src/collector/ResultCollector';
import { CapturingLogger } from '../../src/log/CapturingLogger';
import { ApexTestResult } from '../../src/model/ApexTestResult';
import { QueryHelper } from '../../src/query/QueryHelper';
import { TestError, TestErrorKind } from '../../src/runner/TestError';
import { TestRunnerCallbacks } from '../../src/runner/TestOptions';
import { AsyncTestRunner, TestRunner } from '../../src/runner/TestRunner';
import {
  MockAborter,
  createMockConnection,
  isoDateFormat,
  logRegex,
  setupExecuteAnonymous,
  setupMultipleQueryApexTestResults,
  setupQueryApexTestResults,
  testRunId,
} from '../Setup';

const mockTestResult: ApexTestResult[] = [
  {
    Id: 'id',
    QueueItemId: 'queue item id',
    AsyncApexJobId: 'job id',
    Outcome: 'Pass',
    ApexClass: {
      Id: 'Class Id',
      Name: 'Class1',
      NamespacePrefix: null,
    },
    MethodName: 'Method1',
    Message: null,
    StackTrace: null,
    RunTime: 10,
    TestTimestamp: '2022-09-07T07:38:56.000+0000',
  },
  {
    Id: 'id2',
    QueueItemId: 'queue item id',
    AsyncApexJobId: 'job id',
    Outcome: 'Fail',
    ApexClass: {
      Id: 'Class Id3',
      Name: 'Class3',
      NamespacePrefix: null,
    },
    MethodName: 'Method2',
    Message: null,
    StackTrace: null,
    RunTime: 20,
    TestTimestamp: '2022-09-07T07:38:56.000+0000',
  },
];

jest.mock('../../src/collector/ResultCollector');
const gatherResult = jest.spyOn(ResultCollector, 'gatherResults');

describe('TestRunner', () => {
  const $$ = new TestContext();
  let sandbox: SinonSandbox;

  let mockConnection: Connection;
  let testServiceAsyncStub: SinonStub;
  let queryStub: SinonStub;

  beforeEach(async () => {
    sandbox = createSandbox();
    mockConnection = await createMockConnection($$, sandbox);

    queryStub = sandbox.stub(QueryHelper.instance(mockConnection), 'query');
    testServiceAsyncStub = sandbox
      .stub(TestService.prototype, 'runTestAsynchronous')
      .resolves({ testRunId });

    gatherResult.mockReset();
    gatherResult.mockReturnValue(Promise.resolve(mockTestResult));
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should complete for test class', async () => {
    setupQueryApexTestResults(queryStub, {});

    const logger = new CapturingLogger();
    const runner: TestRunner = AsyncTestRunner.forClasses(
      logger,
      mockConnection,
      '',
      ['TestSample'],
      {}
    );

    const testRunResult = await runner.run();

    expect(testServiceAsyncStub.calledOnce).to.be.true;
    expect(testServiceAsyncStub.args[0][0]).to.deep.equal({
      tests: [{ className: 'TestSample', namespace: undefined }],
      testLevel: TestLevel.RunSpecifiedTests,
      skipCodeCoverage: true,
    });
    expect(testRunResult.AsyncApexJobId).to.equal(testRunId);
    expect(testRunResult.Status).to.equal('Completed');
    expect(logger.entries.length).to.equal(2);
    expect(logger.entries[0]).to.match(
      logRegex(`Test run started with AsyncApexJob Id: ${testRunId}`)
    );
    expect(logger.entries[1]).to.match(
      logRegex('\\[Completed\\] Passed: 1 \\| Failed: 1 \\| 0% Complete')
    );
  });

  it('should complete for all tests', async () => {
    setupQueryApexTestResults(queryStub, {});

    const logger = new CapturingLogger();
    const runner = new AsyncTestRunner(logger, mockConnection, [], {
      maxTestRunRetries: 1,
      testRunTimeoutMins: 10,
    });

    const testRunResult = await runner.run();

    expect(testServiceAsyncStub.calledOnce).to.be.true;
    expect(testServiceAsyncStub.args[0][0]).to.deep.equal({
      suiteNames: undefined,
      testLevel: TestLevel.RunLocalTests,
      skipCodeCoverage: true,
    });
    expect(testRunResult.AsyncApexJobId).to.equal(testRunId);
    expect(testRunResult.Status).to.equal('Completed');
    expect(logger.entries.length).to.equal(2);
    expect(logger.entries[0]).to.match(
      logRegex(`Test run started with AsyncApexJob Id: ${testRunId}`)
    );
    expect(logger.entries[1]).to.match(
      logRegex('\\[Completed\\] Passed: 1 \\| Failed: 1 \\| 0% Complete')
    );
  });

  it('should report failed run', async () => {
    setupQueryApexTestResults(queryStub, { Status: 'Failed' });

    const logger = new CapturingLogger();
    const runner = new AsyncTestRunner(logger, mockConnection, [], {
      maxTestRunRetries: 1,
      testRunTimeoutMins: 10,
    });

    const testRunResult = await runner.run();

    expect(testServiceAsyncStub.calledOnce).to.be.true;
    expect(testServiceAsyncStub.args[0][0]).to.deep.equal({
      suiteNames: undefined,
      testLevel: TestLevel.RunLocalTests,
      skipCodeCoverage: true,
    });
    expect(testRunResult.AsyncApexJobId).to.equal(testRunId);
    expect(testRunResult.Status).to.equal('Failed');
    expect(logger.entries.length).to.equal(2);
    expect(logger.entries[0]).to.match(
      logRegex(`Test run started with AsyncApexJob Id: ${testRunId}`)
    );
    expect(logger.entries[1]).to.match(
      logRegex('\\[Failed\\] Passed: 1 \\| Failed: 1 \\| 0% Complete')
    );
  });

  it('should report aborted run', async () => {
    setupQueryApexTestResults(queryStub, { Status: 'Aborted' });

    const logger = new CapturingLogger();
    const runner = new AsyncTestRunner(logger, mockConnection, [], {
      maxTestRunRetries: 1,
      testRunTimeoutMins: 10,
    });

    const testRunResult = await runner.run();

    expect(testServiceAsyncStub.calledOnce).to.be.true;
    expect(testServiceAsyncStub.args[0][0]).to.deep.equal({
      suiteNames: undefined,
      testLevel: TestLevel.RunLocalTests,
      skipCodeCoverage: true,
    });
    expect(testRunResult.AsyncApexJobId).to.equal(testRunId);
    expect(testRunResult.Status).to.equal('Aborted');
    expect(logger.entries.length).to.equal(2);
    expect(logger.entries[0]).to.match(
      logRegex(`Test run started with AsyncApexJob Id: ${testRunId}`)
    );
    expect(logger.entries[1]).to.match(
      logRegex('\\[Aborted\\] Passed: 1 \\| Failed: 1 \\| 0% Complete')
    );
  });

  it('should throw if max retries exceeded', async () => {
    const logger = new CapturingLogger();
    const runner = AsyncTestRunner.forClasses(
      logger,
      mockConnection,
      '',
      ['TestSample'],
      {
        maxTestRunRetries: 0,
        testRunTimeoutMins: 10,
      }
    );

    let error;
    try {
      await runner.run();
      expect.fail(false, 'Missing exception');
    } catch (err) {
      error = err;
    }
    expect(error).to.be.an(Error.name);
    if (error instanceof TestError) {
      expect(error.message).to.equal(
        'Max number of test run retries reached, max allowed retries: 0'
      );
      expect(error.kind).to.equal(TestErrorKind.Timeout);
    } else {
      expect.fail('Not a TestError');
    }
  });

  it('should throw if test run not found', async () => {
    queryStub.resolves([]);

    const logger = new CapturingLogger();
    const runner = AsyncTestRunner.forClasses(
      logger,
      mockConnection,
      '',
      ['TestSample'],
      {
        maxTestRunRetries: 1,
        testRunTimeoutMins: 10,
      }
    );

    let error;
    try {
      await runner.run();
      expect.fail(false, 'Missing exception');
    } catch (err) {
      error = err;
    }
    expect(error).to.be.an(Error.name);
    if (error instanceof TestError) {
      expect(error.message).to.equal(
        "Wrong number of ApexTestRunResult records found for '707xx0000AGQ3jbQQD', found 0, expected 1"
      );
      expect(error.kind).to.equal(TestErrorKind.Query);
    } else {
      expect.fail('Not a TestError');
    }
  });

  it('should poll while not complete', async () => {
    setupMultipleQueryApexTestResults(queryStub, [
      { Status: 'Queued' },
      { Status: 'Queued' },
      {},
      {},
    ]);

    const logger = new CapturingLogger();
    const runner = AsyncTestRunner.forClasses(
      logger,
      mockConnection,
      '',
      ['TestSample'],
      {
        maxTestRunRetries: 1,
        testRunTimeoutMins: 10,
        statusPollIntervalMs: 10, // Just for testing, to keep under timeout
      }
    );

    const testRunResult = await runner.run();

    expect(testServiceAsyncStub.calledOnce).to.be.true;
    expect(testRunResult.AsyncApexJobId).to.equal(testRunId);
    expect(testRunResult.Status).to.equal('Completed');
    expect(logger.entries.length).to.equal(4);
    expect(logger.entries[0]).to.match(
      logRegex(`Test run started with AsyncApexJob Id: ${testRunId}`)
    );
    expect(logger.entries[1]).to.match(
      logRegex('\\[Queued\\] Passed: 1 \\| Failed: 1 \\| 0% Complete')
    );
    expect(logger.entries[2]).to.match(
      logRegex('\\[Queued\\] Passed: 1 \\| Failed: 1 \\| 0% Complete')
    );
    expect(logger.entries[3]).to.match(
      logRegex('\\[Completed\\] Passed: 1 \\| Failed: 1 \\| 0% Complete')
    );
  });

  it('should timeout after polling too long', async () => {
    setupMultipleQueryApexTestResults(queryStub, [
      { Status: 'Queued' },
      { Status: 'Queued' },
      {},
    ]);

    const logger = new CapturingLogger();
    const runner = AsyncTestRunner.forClasses(
      logger,
      mockConnection,
      '',
      ['TestSample'],
      {
        maxTestRunRetries: 1,
        testRunTimeoutMins: 0, // will timeout after first poll
        statusPollIntervalMs: 10, // Just for testing, to keep under timeout
      }
    );

    let error;
    try {
      await runner.run();
      expect.fail(false, 'Missing exception');
    } catch (err) {
      error = err;
    }
    expect(error).to.be.an(Error.name);
    if (error instanceof TestError) {
      expect(error.message).to.equal(
        `Test run '${testRunId}' has exceed test runner max allowed run time of 0 minutes`
      );
      expect(error.kind).to.equal(TestErrorKind.Timeout);
    } else {
      expect.fail('Not a TestError');
    }
  });

  it('should cancel and restart after no progress detected', async () => {
    setupMultipleQueryApexTestResults(queryStub, [
      { Status: 'Processing' }, // poll
      { Status: 'Processing' }, // poll
      { Status: 'Processing' }, // result
      { Status: 'Completed' }, // poll
      { Status: 'Completed' }, // result
    ]);
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

    const logger = new CapturingLogger();
    const mockAborter = new MockAborter();
    const runner = AsyncTestRunner.forClasses(
      logger,
      mockConnection,
      '',
      ['TestSample'],
      {
        maxTestRunRetries: 2,
        testRunTimeoutMins: 1,
        statusPollIntervalMs: 10, // Just for testing, to keep under timeout
        pollLimitToAssumeHangingTests: 1, // Will asumme hanging on each poll
        aborter: mockAborter, // Skip over aborting
      }
    );

    const testRunResult = await runner.run();

    expect(mockAborter.calls).to.equal(1);
    expect(testServiceAsyncStub.calledTwice).to.be.true;
    expect(testRunResult.AsyncApexJobId).to.equal(testRunId);
    expect(testRunResult.Status).to.equal('Completed');
    expect(logger.entries.length).to.equal(6);
    expect(logger.entries[0]).to.match(
      logRegex(`Test run started with AsyncApexJob Id: ${testRunId}`)
    );
    expect(logger.entries[1]).to.match(
      logRegex('\\[Processing\\] Passed: 1 \\| Failed: 1 \\| 0% Complete')
    );
    expect(logger.entries[2]).to.match(
      logRegex('\\[Processing\\] Passed: 1 \\| Failed: 1 \\| 0% Complete')
    );
    expect(logger.entries[3]).to.match(
      logRegex(
        `Test run '${testRunId}' was not progressing, cancelling and retrying...`
      )
    );
    expect(logger.entries[4]).to.match(
      logRegex(`Test run started with AsyncApexJob Id: ${testRunId}`)
    );
    expect(logger.entries[5]).to.match(
      logRegex('\\[Completed\\] Passed: 1 \\| Failed: 1 \\| 0% Complete')
    );
  });

  it('should not cancel if progress detected', async () => {
    const finalResults: ApexTestResult[] = [
      ...mockTestResult,
      {
        Id: 'id3',
        QueueItemId: 'queue item id',
        AsyncApexJobId: 'job id',
        Outcome: 'Pass',
        ApexClass: {
          Id: 'Class Id',
          Name: 'Class1',
          NamespacePrefix: null,
        },
        MethodName: 'Method3',
        Message: null,
        StackTrace: null,
        RunTime: 10,
        TestTimestamp: '2022-09-07T07:38:56.000+0000',
      },
    ];

    setupMultipleQueryApexTestResults(queryStub, [
      { Status: 'Processing' }, // poll
      { Status: 'Processing' }, // poll
      { Status: 'Processing' }, // poll
      { Status: 'Completed' }, // poll
      { Status: 'Completed' }, // result
    ]);
    // poll results
    gatherResult
      .mockReturnValueOnce(Promise.resolve([mockTestResult[0]]))
      .mockReturnValueOnce(Promise.resolve(mockTestResult))
      .mockReturnValueOnce(Promise.resolve(finalResults))
      .mockReturnValueOnce(Promise.resolve(finalResults));
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

    const logger = new CapturingLogger();
    const mockAborter = new MockAborter();
    const runner = AsyncTestRunner.forClasses(
      logger,
      mockConnection,
      '',
      ['TestSample'],
      {
        maxTestRunRetries: 1,
        testRunTimeoutMins: 1,
        statusPollIntervalMs: 10, // Just for testing, to keep under timeout
        pollLimitToAssumeHangingTests: 1, // Will asumme hanging on each poll
        aborter: mockAborter, // Skip over aborting
      }
    );

    const testRunResult = await runner.run();
    expect(mockAborter.calls).to.equal(0);
    expect(testServiceAsyncStub.calledOnce).to.be.true;
    expect(testRunResult.AsyncApexJobId).to.equal(testRunId);
    expect(testRunResult.Status).to.equal('Completed');
    expect(logger.entries.length).to.equal(5);
    expect(logger.entries[0]).to.match(
      logRegex(`Test run started with AsyncApexJob Id: ${testRunId}`)
    );
    expect(logger.entries[1]).to.match(
      logRegex('\\[Processing\\] Passed: 1 \\| Failed: 0 \\| 0% Complete')
    );
    expect(logger.entries[2]).to.match(
      logRegex('\\[Processing\\] Passed: 1 \\| Failed: 1 \\| 0% Complete')
    );
    expect(logger.entries[3]).to.match(
      logRegex('\\[Processing\\] Passed: 2 \\| Failed: 1 \\| 0% Complete')
    );
    expect(logger.entries[4]).to.match(
      logRegex('\\[Completed\\] Passed: 2 \\| Failed: 1 \\| 0% Complete')
    );
  });

  it('should create clone additional run', () => {
    const logger = new CapturingLogger();
    const runner: TestRunner = AsyncTestRunner.forClasses(
      logger,
      mockConnection,
      'ns',
      ['TestSample'],
      {}
    );
    expect(runner.getTestClasses()).to.deep.equal(['TestSample']);

    const another = runner.newRunner([
      { className: 'TestSample2', testMethods: ['methodA', 'methodB'] },
      { className: 'TestSample3', testMethods: ['methodC'] },
    ]);
    expect(another.getTestClasses()).to.deep.equal([
      'TestSample2',
      'TestSample3',
    ]);
  });

  it('should call OnPoll when running tests', async () => {
    setupQueryApexTestResults(queryStub, {});

    const mockedOnRunStart = jest.fn<void, [string, void]>();
    const mockedOnPoll = jest.fn<void, [ApexNodeTestResult, void]>();

    const callbacks = {
      onRunStarted: mockedOnRunStart,
      onPoll: mockedOnPoll,
    } as unknown as TestRunnerCallbacks;

    const logger = new CapturingLogger();
    const runner: TestRunner = AsyncTestRunner.forClasses(
      logger,
      mockConnection,
      '',
      ['TestSample'],
      { callbacks }
    );
    await runner.run();

    expect(mockedOnRunStart.mock.calls[0][0]).to.equal(testRunId);
    expect(mockedOnPoll.mock.calls[0][0]).to.deep.equal(mockTestResult);
  });

  it('should report queue items to file on verbose logging', async () => {
    setupQueryApexTestResults(queryStub, {});
    const mockQueueItems = [
      {
        Id: 'id',
        ApexClassId: 'apexClassId',
        ExtendedStatus: 'extendedStatus',
        Status: 'status',
        TestRunResultID: 'testRunResultId',
        ShouldSkipCodeCoverage: true,
      },
    ];
    queryStub
      .withArgs('ApexTestQueueItem', match.any, match.any)
      .resolves(mockQueueItems);

    const logger = new CapturingLogger('', true);
    const runner: TestRunner = AsyncTestRunner.forClasses(
      logger,
      mockConnection,
      '',
      ['TestSample'],
      {}
    );

    const testRunResult = await runner.run();

    expect(testServiceAsyncStub.calledOnce).to.be.true;
    expect(testRunResult.AsyncApexJobId).to.equal(testRunId);
    expect(testRunResult.Status).to.equal('Completed');
    expect(logger.entries.length).to.equal(2);
    expect(logger.entries[0]).to.match(
      logRegex(`Test run started with AsyncApexJob Id: ${testRunId}`)
    );
    expect(logger.entries[1]).to.match(
      logRegex('\\[Completed\\] Passed: 1 \\| Failed: 1 \\| 0% Complete')
    );
    expect(logger.files.length).to.equal(1);
    expect(logger.files[0][0]).to.match(
      new RegExp(`^${process.cwd()}/testqueue-${isoDateFormat}.json`)
    );
    expect(logger.files[0][1]).to.equal(
      JSON.stringify(mockQueueItems, undefined, 2)
    );
  });
});
