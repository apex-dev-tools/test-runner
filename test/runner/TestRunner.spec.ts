/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */

import { ExecuteService, TestLevel, TestService } from '@salesforce/apex-node';
import { ApexTestResult as ApexNodeTestResult } from '@salesforce/apex-node/lib/src/tests/types';
import { Connection } from '@salesforce/core';
import { TestContext } from '@salesforce/core/lib/testSetup';
import { expect } from 'chai';
import {
  SinonSandbox,
  SinonStub,
  SinonStubbedInstance,
  createSandbox,
  match,
} from 'sinon';
import { CapturingLogger } from '../../src/log/CapturingLogger';
import { ApexTestResult } from '../../src/model/ApexTestResult';
import { QueryHelper } from '../../src/query/QueryHelper';
import { TestError, TestErrorKind } from '../../src/runner/TestError';
import { TestRunnerCallbacks } from '../../src/runner/TestOptions';
import { AsyncTestRunner, TestRunner } from '../../src/runner/TestRunner';
import {
  MockAborter,
  createMockConnection,
  createMockTestResult,
  createQueryHelper,
  isoDateFormat,
  logRegex,
  mockSetTimeout,
  setupExecuteAnonymous,
  setupMultipleQueryApexTestResults,
  setupQueryApexTestResults,
  testRunId,
  timeFormat,
} from '../Setup';

describe('TestRunner', () => {
  const $$ = new TestContext();
  let sandbox: SinonSandbox;

  let mockConnection: Connection;
  let testServiceAsyncStub: SinonStub;
  let qhStub: SinonStubbedInstance<QueryHelper>;

  const mockTestResult: ApexTestResult[] = [
    createMockTestResult({
      Id: 'test1',
      Outcome: 'Pass',
      ApexClass: {
        Id: 'Class1',
        Name: 'Class1',
        NamespacePrefix: null,
      },
      MethodName: 'Method1',
      RunTime: 10,
    }),
    createMockTestResult({
      Id: 'test2',
      Outcome: 'Fail',
      ApexClass: {
        Id: 'Class3',
        Name: 'Class3',
        NamespacePrefix: null,
      },
      MethodName: 'Method2',
      Message: 'Exception: Test Failed',
      RunTime: 20,
    }),
  ];

  beforeEach(async () => {
    sandbox = createSandbox();
    mockConnection = await createMockConnection($$, sandbox);

    mockSetTimeout(sandbox);

    qhStub = createQueryHelper(sandbox, mockConnection);
    testServiceAsyncStub = sandbox
      .stub(TestService.prototype, 'runTestAsynchronous')
      .resolves({ testRunId });

    qhStub.query
      .withArgs('ApexTestResult', match.any, match.any)
      .resolves(mockTestResult);
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should complete for test class', async () => {
    setupQueryApexTestResults(qhStub, mockTestResult, {});

    const logger = new CapturingLogger();
    const runner: TestRunner = AsyncTestRunner.forClasses(
      logger,
      mockConnection,
      '',
      ['TestSample'],
      {
        maxTestRunRetries: 1,
      }
    );

    const testRunResult = await runner.run();

    expect(testServiceAsyncStub.calledOnce).to.be.true;
    expect(testServiceAsyncStub.args[0][0]).to.deep.equal({
      tests: [{ className: 'TestSample', namespace: undefined }],
      testLevel: TestLevel.RunSpecifiedTests,
      skipCodeCoverage: true,
    });
    expect(testRunResult.run.AsyncApexJobId).to.equal(testRunId);
    expect(testRunResult.run.Status).to.equal('Completed');
    expect(logger.entries.length).to.equal(4);
    expect(logger.entries[0]).to.match(
      logRegex(`Test run started with AsyncApexJob Id: ${testRunId}`)
    );
    expect(logger.entries[1]).to.match(
      logRegex(
        `${timeFormat} \\[Completed\\] Passed: 1 \\| Failed: 1 \\| 2/2 Complete \\(100%\\)`
      )
    );
    expect(logger.entries[2]).to.match(logRegex("Failing tests in 'Class3':"));
    expect(logger.entries[3]).to.match(
      logRegex('\\* Method2 - Exception: Test Failed')
    );
  });

  it('should complete for all tests', async () => {
    setupQueryApexTestResults(qhStub, mockTestResult, {});

    const logger = new CapturingLogger();
    const runner = new AsyncTestRunner(logger, mockConnection, [], {
      maxTestRunRetries: 1,
    });

    const testRunResult = await runner.run();

    expect(testServiceAsyncStub.calledOnce).to.be.true;
    expect(testServiceAsyncStub.args[0][0]).to.deep.equal({
      suiteNames: undefined,
      testLevel: TestLevel.RunLocalTests,
      skipCodeCoverage: true,
    });
    expect(testRunResult.run.AsyncApexJobId).to.equal(testRunId);
    expect(testRunResult.run.Status).to.equal('Completed');
    expect(logger.entries.length).to.equal(4);
    expect(logger.entries[0]).to.match(
      logRegex(`Test run started with AsyncApexJob Id: ${testRunId}`)
    );
    expect(logger.entries[1]).to.match(
      logRegex(
        `${timeFormat} \\[Completed\\] Passed: 1 \\| Failed: 1 \\| 2/2 Complete \\(100%\\)`
      )
    );
    expect(logger.entries[2]).to.match(logRegex("Failing tests in 'Class3':"));
    expect(logger.entries[3]).to.match(
      logRegex('\\* Method2 - Exception: Test Failed')
    );
  });

  it('should report failed run', async () => {
    qhStub.query
      .withArgs('ApexTestResult', match.any, match.any)
      .resolves([mockTestResult[1]]);

    setupQueryApexTestResults(qhStub, mockTestResult, {
      Status: 'Failed',
    });

    const logger = new CapturingLogger();
    const runner = new AsyncTestRunner(logger, mockConnection, [], {
      maxTestRunRetries: 1,
    });

    const testRunResult = await runner.run();

    expect(testServiceAsyncStub.calledOnce).to.be.true;
    expect(testServiceAsyncStub.args[0][0]).to.deep.equal({
      suiteNames: undefined,
      testLevel: TestLevel.RunLocalTests,
      skipCodeCoverage: true,
    });
    expect(testRunResult.run.AsyncApexJobId).to.equal(testRunId);
    expect(testRunResult.run.Status).to.equal('Failed');
    expect(logger.entries.length).to.equal(4);
    expect(logger.entries[0]).to.match(
      logRegex(`Test run started with AsyncApexJob Id: ${testRunId}`)
    );
    expect(logger.entries[1]).to.match(
      logRegex(
        `${timeFormat} \\[Failed\\] Passed: 0 \\| Failed: 1 \\| 1/2 Complete \\(50%\\)`
      )
    );
    expect(logger.entries[2]).to.match(logRegex("Failing tests in 'Class3':"));
    expect(logger.entries[3]).to.match(
      logRegex('\\* Method2 - Exception: Test Failed')
    );
  });

  it('should report aborted run', async () => {
    qhStub.query.withArgs('ApexTestResult', match.any, match.any).resolves([]);

    setupQueryApexTestResults(qhStub, mockTestResult, {
      Status: 'Aborted',
    });

    const logger = new CapturingLogger();
    const runner = new AsyncTestRunner(logger, mockConnection, [], {
      maxTestRunRetries: 1,
    });

    const testRunResult = await runner.run();

    expect(testServiceAsyncStub.calledOnce).to.be.true;
    expect(testServiceAsyncStub.args[0][0]).to.deep.equal({
      suiteNames: undefined,
      testLevel: TestLevel.RunLocalTests,
      skipCodeCoverage: true,
    });
    expect(testRunResult.run.AsyncApexJobId).to.equal(testRunId);
    expect(testRunResult.run.Status).to.equal('Aborted');
    expect(logger.entries.length).to.equal(2);
    expect(logger.entries[0]).to.match(
      logRegex(`Test run started with AsyncApexJob Id: ${testRunId}`)
    );
    expect(logger.entries[1]).to.match(
      logRegex(
        `${timeFormat} \\[Aborted\\] Passed: 0 \\| Failed: 0 \\| 0/2 Complete \\(0%\\)`
      )
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
      }
    );

    let error;
    try {
      await runner.run();
    } catch (err) {
      error = err as TestError;
    }
    if (!error) {
      expect.fail('Missing exception');
    }
    expect(error).to.be.instanceof(TestError);
    expect(error.message).to.equal(
      'Max number of test run retries reached, max allowed retries: 0'
    );
    expect(error.kind).to.equal(TestErrorKind.Timeout);
  });

  it('should throw on timeout if no results found', async () => {
    qhStub.query.resolves([]);

    const logger = new CapturingLogger();
    const runner = AsyncTestRunner.forClasses(
      logger,
      mockConnection,
      '',
      ['TestSample'],
      {
        maxTestRunRetries: 1,
      }
    );

    let error;
    try {
      await runner.run();
    } catch (err) {
      error = err as TestError;
    }
    if (!error) {
      expect.fail('Missing exception');
    }
    expect(error).to.be.instanceof(TestError);
    expect(error.message).to.equal(
      `Test run '${testRunId}' has exceeded test runner max allowed run time of 120 minutes`
    );
    expect(error.kind).to.equal(TestErrorKind.Timeout);
    expect(
      logger.entries.some(str =>
        logRegex(
          `${timeFormat} Poll failed: Wrong number of ApexTestRunResult records found for '${testRunId}', found 0, expected 1`
        ).test(str)
      )
    ).to.be.true;
  });

  it('should poll while not complete', async () => {
    qhStub.query
      .withArgs('ApexTestResult', match.any, match.any)
      .onFirstCall()
      .resolves([mockTestResult[0]]);

    setupMultipleQueryApexTestResults(qhStub, mockTestResult, [
      { Status: 'Processing' },
      { Status: 'Processing' },
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
      }
    );

    const testRunResult = await runner.run();

    expect(testServiceAsyncStub.calledOnce).to.be.true;
    expect(testRunResult.run.AsyncApexJobId).to.equal(testRunId);
    expect(testRunResult.run.Status).to.equal('Completed');
    expect(logger.entries.length).to.equal(6);
    expect(logger.entries[0]).to.match(
      logRegex(`Test run started with AsyncApexJob Id: ${testRunId}`)
    );
    expect(logger.entries[1]).to.match(
      logRegex(
        `${timeFormat} \\[Processing\\] Passed: 1 \\| Failed: 0 \\| 1/2 Complete \\(50%\\)`
      )
    );
    expect(logger.entries[2]).to.match(
      logRegex(
        `${timeFormat} \\[Processing\\] Passed: 1 \\| Failed: 1 \\| 2/2 Complete \\(100%\\)`
      )
    );
    expect(logger.entries[3]).to.match(logRegex("Failing tests in 'Class3':"));
    expect(logger.entries[4]).to.match(
      logRegex('\\* Method2 - Exception: Test Failed')
    );
    expect(logger.entries[5]).to.match(
      logRegex(
        `${timeFormat} \\[Completed\\] Passed: 1 \\| Failed: 1 \\| 2/2 Complete \\(100%\\)`
      )
    );
  });

  it('should timeout after polling too long', async () => {
    setupMultipleQueryApexTestResults(qhStub, mockTestResult, [
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
      }
    );

    const result = await runner.run();
    const error = result.error as TestError;

    expect(error).to.be.instanceof(TestError);
    expect(error.message).to.equal(
      `Test run '${testRunId}' has exceeded test runner max allowed run time of 0 minutes`
    );
    expect(error.kind).to.equal(TestErrorKind.Timeout);
  });

  it('should cancel and restart after no progress detected', async () => {
    setupMultipleQueryApexTestResults(qhStub, mockTestResult, [
      { Status: 'Processing' },
      { Status: 'Processing' },
      { Status: 'Completed' },
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
        pollLimitToAssumeHangingTests: 1, // Will asumme hanging on each poll
        aborter: mockAborter, // Skip over aborting
      }
    );

    const testRunResult = await runner.run();

    expect(mockAborter.calls).to.equal(1);
    expect(testServiceAsyncStub.calledTwice).to.be.true;
    expect(testRunResult.run.AsyncApexJobId).to.equal(testRunId);
    expect(testRunResult.run.Status).to.equal('Completed');
    expect(logger.entries.length).to.equal(10);
    expect(logger.entries[0]).to.match(
      logRegex(`Test run started with AsyncApexJob Id: ${testRunId}`)
    );
    expect(logger.entries[1]).to.match(
      logRegex(
        `${timeFormat} \\[Processing\\] Passed: 1 \\| Failed: 1 \\| 2/2 Complete \\(100%\\)`
      )
    );
    expect(logger.entries[2]).to.match(logRegex("Failing tests in 'Class3':"));
    expect(logger.entries[3]).to.match(
      logRegex('\\* Method2 - Exception: Test Failed')
    );
    expect(logger.entries[4]).to.match(
      logRegex(
        `${timeFormat} \\[Processing\\] Passed: 1 \\| Failed: 1 \\| 2/2 Complete \\(100%\\)`
      )
    );
    expect(logger.entries[5]).to.match(
      logRegex(
        `Test run '${testRunId}' was not progressing, cancelling and retrying...`
      )
    );
    expect(logger.entries[6]).to.match(
      logRegex(`Test run started with AsyncApexJob Id: ${testRunId}`)
    );
    expect(logger.entries[7]).to.match(
      logRegex(
        `${timeFormat} \\[Completed\\] Passed: 1 \\| Failed: 1 \\| 2/2 Complete \\(100%\\)`
      )
    );
  });

  it('should not cancel if progress detected', async () => {
    const finalResults: ApexTestResult[] = [
      ...mockTestResult,
      createMockTestResult({
        Id: 'test3',
        Outcome: 'Pass',
        ApexClass: {
          Id: 'Class1',
          Name: 'Class1',
          NamespacePrefix: null,
        },
        MethodName: 'Method3',
        RunTime: 10,
      }),
    ];

    setupMultipleQueryApexTestResults(qhStub, finalResults, [
      { Status: 'Processing' }, // poll
      { Status: 'Processing' }, // poll
      { Status: 'Processing' }, // poll
      { Status: 'Completed' }, // poll
    ]);
    // poll results
    qhStub.query
      .withArgs('ApexTestResult', match.any, match.any)
      .onCall(0)
      .resolves([mockTestResult[0]])
      .onCall(1)
      .resolves(mockTestResult)
      .onCall(2)
      .resolves(finalResults)
      .onCall(3)
      .resolves(finalResults);
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
        pollLimitToAssumeHangingTests: 1, // Will asumme hanging on each poll
        aborter: mockAborter, // Skip over aborting
      }
    );

    const testRunResult = await runner.run();
    expect(mockAborter.calls).to.equal(0);
    expect(testServiceAsyncStub.calledOnce).to.be.true;
    expect(testRunResult.run.AsyncApexJobId).to.equal(testRunId);
    expect(testRunResult.run.Status).to.equal('Completed');
    expect(logger.entries.length).to.equal(7);
    expect(logger.entries[0]).to.match(
      logRegex(`Test run started with AsyncApexJob Id: ${testRunId}`)
    );
    expect(logger.entries[1]).to.match(
      logRegex(
        `${timeFormat} \\[Processing\\] Passed: 1 \\| Failed: 0 \\| 1/3 Complete \\(33%\\)`
      )
    );
    expect(logger.entries[2]).to.match(
      logRegex(
        `${timeFormat} \\[Processing\\] Passed: 1 \\| Failed: 1 \\| 2/3 Complete \\(66%\\)`
      )
    );
    expect(logger.entries[3]).to.match(logRegex("Failing tests in 'Class3':"));
    expect(logger.entries[4]).to.match(
      logRegex('\\* Method2 - Exception: Test Failed')
    );
    expect(logger.entries[5]).to.match(
      logRegex(
        `${timeFormat} \\[Processing\\] Passed: 2 \\| Failed: 1 \\| 3/3 Complete \\(100%\\)`
      )
    );
    expect(logger.entries[6]).to.match(
      logRegex(
        `${timeFormat} \\[Completed\\] Passed: 2 \\| Failed: 1 \\| 3/3 Complete \\(100%\\)`
      )
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
    setupQueryApexTestResults(qhStub, mockTestResult, {});

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
    setupQueryApexTestResults(qhStub, mockTestResult, {});
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
    qhStub.query
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
    expect(testRunResult.run.AsyncApexJobId).to.equal(testRunId);
    expect(testRunResult.run.Status).to.equal('Completed');
    expect(logger.files.length).to.equal(1);
    expect(logger.files[0][0]).to.match(
      new RegExp(`^${process.cwd()}/testqueue-${isoDateFormat}.json`)
    );
    expect(logger.files[0][1]).to.equal(
      JSON.stringify(mockQueueItems, undefined, 2)
    );
  });

  it('should timeout on failed poll and continue', async () => {
    setupMultipleQueryApexTestResults(qhStub, mockTestResult, [
      { Status: 'Processing' }, // poll
      { Status: 'Processing' }, // poll
      { Status: 'Completed' }, // poll
    ]);

    // poll results
    qhStub.query
      .withArgs('ApexTestResult', match.any, match.any)
      .onCall(0)
      .resolves([mockTestResult[0]])
      .onCall(1)
      .returns(
        new Promise(() => {
          // never resolved promise
        })
      )
      .onCall(2)
      .resolves(mockTestResult);

    const logger = new CapturingLogger();
    const runner = new AsyncTestRunner(logger, mockConnection, [], {
      maxTestRunRetries: 1,
    });

    const testRunResult = await runner.run();

    expect(testServiceAsyncStub.calledOnce).to.be.true;
    expect(testServiceAsyncStub.args[0][0]).to.deep.equal({
      suiteNames: undefined,
      testLevel: TestLevel.RunLocalTests,
      skipCodeCoverage: true,
    });
    expect(testRunResult.run.AsyncApexJobId).to.equal(testRunId);
    expect(testRunResult.run.Status).to.equal('Completed');
    expect(logger.entries.length).to.equal(6);
    expect(logger.entries[0]).to.match(
      logRegex(`Test run started with AsyncApexJob Id: ${testRunId}`)
    );
    expect(logger.entries[1]).to.match(
      logRegex(
        `${timeFormat} \\[Processing\\] Passed: 1 \\| Failed: 0 \\| 1/2 Complete \\(50%\\)`
      )
    );
    expect(logger.entries[2]).to.match(
      logRegex(
        `${timeFormat} Poll failed: Request exceeded allowed time of 30000ms.`
      )
    );
    expect(logger.entries[3]).to.match(
      logRegex(
        `${timeFormat} \\[Completed\\] Passed: 1 \\| Failed: 1 \\| 2/2 Complete \\(100%\\)`
      )
    );
    expect(logger.entries[4]).to.match(logRegex("Failing tests in 'Class3':"));
    expect(logger.entries[5]).to.match(
      logRegex('\\* Method2 - Exception: Test Failed')
    );
  });
});
