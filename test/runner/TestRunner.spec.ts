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
    expect(testRunResult.numberOfResets).to.equal(0);
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
    expect(testRunResult.numberOfResets).to.equal(0);
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
    expect(testRunResult.numberOfResets).to.equal(0);
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
    expect(testRunResult.numberOfResets).to.equal(0);
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

  it('should abort and abandon without re-running when retries are exhausted', async () => {
    // One retry allowed. The run stalls, exhausting it - so we abort and
    // abandon without pretending to re-run (no reset/reusing logs, no extra
    // queue query).
    qhStub.query
      .withArgs('ApexTestResult', match.any, match.any)
      .resolves([mockTestResult[0]]);
    setupMultipleQueryApexTestResults(qhStub, mockTestResult, [
      { Status: 'Processing' },
      { Status: 'Processing' },
    ]);

    const logger = new CapturingLogger();
    const mockAborter = new MockAborter();
    const runner = AsyncTestRunner.forClasses(
      logger,
      mockConnection,
      '',
      ['TestSample'],
      {
        maxTestRunRetries: 1,
        pollLimitToAssumeHangingTests: 1,
        aborter: mockAborter,
      }
    );

    // Exhausting retries surfaces as a result error (caught for partial
    // reporting), not a throw.
    const testRunResult = await runner.run();
    expect(testRunResult.error).to.be.instanceof(TestError);
    expect(testRunResult.error?.message).to.equal(
      'Max number of test run retries reached, max allowed retries: 1'
    );
    // The stalled run was aborted, and not re-run
    expect(mockAborter.calls).to.equal(1);
    expect(testServiceAsyncStub.calledOnce).to.be.true;
    // No queue query, no reset/reusing logs - we did not pretend to re-run
    expect(qhStub.query.calledWith('ApexTestQueueItem', match.any, match.any))
      .to.be.false;
    expect(logger.entries.some(e => /Reusing/.test(e))).to.be.false;
    expect(logger.entries.some(e => /Reset \d/.test(e))).to.be.false;
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
    expect(testRunResult.numberOfResets).to.equal(0);
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
    const mockAborter = new MockAborter();
    const runner = AsyncTestRunner.forClasses(
      logger,
      mockConnection,
      '',
      ['TestSample'],
      {
        maxTestRunRetries: 1,
        testRunTimeoutMins: 0, // will timeout after first poll
        aborter: mockAborter,
      }
    );

    const result = await runner.run();
    const error = result.error as TestError;

    expect(mockAborter.calls).to.equal(1);
    expect(error).to.be.instanceof(TestError);
    expect(error.message).to.equal(
      `Test run '${testRunId}' has exceeded test runner max allowed run time of 0 minutes`
    );
    expect(error.kind).to.equal(TestErrorKind.Timeout);
  });

  it('should preserve timeout error if abort fails', async () => {
    setupMultipleQueryApexTestResults(qhStub, mockTestResult, [
      { Status: 'Queued' },
      { Status: 'Queued' },
      {},
    ]);

    const logger = new CapturingLogger();
    const aborter = {
      abortRun: sandbox.stub().rejects(new Error('Abort failed')),
    };
    const runner = AsyncTestRunner.forClasses(
      logger,
      mockConnection,
      '',
      ['TestSample'],
      {
        maxTestRunRetries: 1,
        testRunTimeoutMins: 0, // will timeout after first poll
        aborter,
      }
    );

    const result = await runner.run();
    const error = result.error as TestError;

    expect(aborter.abortRun.calledOnce).to.be.true;
    expect(error).to.be.instanceof(TestError);
    expect(error.message).to.equal(
      `Test run '${testRunId}' has exceeded test runner max allowed run time of 0 minutes`
    );
    expect(error.kind).to.equal(TestErrorKind.Timeout);
  });

  it('should cancel and re-run only incomplete classes after no progress detected', async () => {
    // Class1 finishes (its pass is kept); Class3 is still running when the run
    // stalls, so only Class3 should be re-run after the reset.
    qhStub.query
      .withArgs('ApexTestResult', match.any, match.any)
      .onCall(0)
      .resolves([mockTestResult[0]]) // Class1 pass
      .onCall(1)
      .resolves([mockTestResult[0]]) // no progress -> hang
      .onCall(2)
      .resolves([mockTestResult[1]]); // re-run produces Class3 result
    const queueItems = [
      { Id: 'q1', ApexClassId: 'Class1', Status: 'Completed' },
      { Id: 'q3', ApexClassId: 'Class3', Status: 'Processing' },
    ];
    qhStub.query
      .withArgs('ApexTestQueueItem', match.any, match.any)
      .resolves(queueItems);
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
        pollLimitToAssumeHangingTests: 1, // Will assume hanging on each poll
        aborter: mockAborter, // Skip over aborting
      }
    );

    const testRunResult = await runner.run();

    expect(mockAborter.calls).to.equal(1);
    expect(testServiceAsyncStub.calledTwice).to.be.true;
    // The re-run only asks for the class that had not completed
    expect(testServiceAsyncStub.args[1][0]).to.deep.equal({
      tests: [{ classId: 'Class3' }],
      testLevel: TestLevel.RunSpecifiedTests,
      skipCodeCoverage: true,
    });
    expect(testRunResult.run.AsyncApexJobId).to.equal(testRunId);
    expect(testRunResult.run.Status).to.equal('Completed');
    expect(testRunResult.numberOfResets).to.equal(1);
    // Kept Class1's result and added Class3's from the re-run
    expect(testRunResult.tests.map(t => t.Id).sort()).to.deep.equal([
      'test1',
      'test2',
    ]);
    // Run-level counts reflect the merged set, not just the re-run subset
    expect(testRunResult.run.MethodsCompleted).to.equal(2);
    expect(testRunResult.run.MethodsEnqueued).to.equal(2);
    expect(testRunResult.run.MethodsFailed).to.equal(1);
    expect(testRunResult.run.ClassesCompleted).to.equal(2);
    expect(testRunResult.run.TestTime).to.equal(30); // 10 + 20
    expect(logger.entries.length).to.equal(10);
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
        `${timeFormat} \\[Processing\\] Passed: 1 \\| Failed: 0 \\| 1/2 Complete \\(50%\\) \\| No progress 1/1`
      )
    );
    expect(logger.entries[3]).to.match(
      logRegex(
        `Test run '${testRunId}' was not progressing, cancelling and retrying...`
      )
    );
    expect(logger.entries[4]).to.match(
      logRegex('Reset 1/1 before abandoning run')
    );
    expect(logger.entries[5]).to.match(
      logRegex(
        'Reusing 1 tests from 1 completed classes; ' +
          'rerunning 1 remaining tests across 1 classes'
      )
    );
    expect(logger.entries[6]).to.match(
      logRegex(`Test run started with AsyncApexJob Id: ${testRunId}`)
    );
    expect(logger.entries[7]).to.match(
      logRegex(
        `${timeFormat} \\[Completed\\] Passed: 0 \\| Failed: 1 \\| 1/2 Complete \\(50%\\)`
      )
    );
    expect(logger.entries[8]).to.match(logRegex("Failing tests in 'Class3':"));
    expect(logger.entries[9]).to.match(
      logRegex('\\* Method2 - Exception: Test Failed')
    );
    // A per-reset diagnostic snapshot is written
    expect(logger.files.length).to.equal(1);
    expect(logger.files[0][0]).to.equal(
      `${process.cwd()}/test-result-reset-1-${testRunId}.json`
    );
    const snapshot = JSON.parse(logger.files[0][1]) as {
      resetNumber: number;
      completedClasses: number;
      pendingClasses: number;
      reusedTests: number;
      queueItems: unknown[];
    };
    expect(snapshot.resetNumber).to.equal(1);
    expect(snapshot.completedClasses).to.equal(1);
    expect(snapshot.pendingClasses).to.equal(1);
    expect(snapshot.reusedTests).to.equal(1);
    expect(snapshot.queueItems).to.have.length(2);
  });

  it('should fall back to a full re-run when no incomplete classes can be identified', async () => {
    // No queue items returned -> we cannot tell what is incomplete, so re-run
    // everything rather than risk dropping tests.
    qhStub.query
      .withArgs('ApexTestQueueItem', match.any, match.any)
      .resolves([]);
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
        pollLimitToAssumeHangingTests: 1,
        aborter: mockAborter,
      }
    );

    const testRunResult = await runner.run();

    expect(mockAborter.calls).to.equal(1);
    expect(testServiceAsyncStub.calledTwice).to.be.true;
    // Re-run uses the original full payload, not a pending subset
    expect(testServiceAsyncStub.args[1][0]).to.deep.equal({
      tests: [{ className: 'TestSample', namespace: undefined }],
      testLevel: TestLevel.RunSpecifiedTests,
      skipCodeCoverage: true,
    });
    expect(testRunResult.run.Status).to.equal('Completed');
    expect(testRunResult.numberOfResets).to.equal(1);
    // No reset reuse summary was logged
    expect(logger.entries.some(e => /Reusing/.test(e))).to.be.false;
  });

  it('should fall back to a full re-run when the queue cannot be queried', async () => {
    // The query for incomplete classes fails, so we must not drop tests - fall
    // back to re-running everything and warn.
    qhStub.query
      .withArgs('ApexTestQueueItem', match.any, match.any)
      .rejects(new Error('query boom'));
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
        pollLimitToAssumeHangingTests: 1,
        aborter: mockAborter,
      }
    );

    const testRunResult = await runner.run();

    expect(mockAborter.calls).to.equal(1);
    expect(testServiceAsyncStub.calledTwice).to.be.true;
    expect(testServiceAsyncStub.args[1][0]).to.deep.equal({
      tests: [{ className: 'TestSample', namespace: undefined }],
      testLevel: TestLevel.RunSpecifiedTests,
      skipCodeCoverage: true,
    });
    expect(testRunResult.run.Status).to.equal('Completed');
    expect(testRunResult.numberOfResets).to.equal(1);
    expect(logger.entries.some(e => /Reusing/.test(e))).to.be.false;
    expect(
      logger.entries.some(e =>
        logRegex(
          'Warning: Could not determine completed tests for restart, ' +
            're-running all: query boom'
        ).test(e)
      )
    ).to.be.true;
    // No snapshot written when we could not inspect the queue
    expect(logger.files.length).to.equal(0);
  });

  it('should abort and give up when a run is stuck before processing', async () => {
    // Run never leaves 'Queued' and makes no progress. It should be aborted and
    // abandoned (not reset/retried) so its tests aren't left enqueued for the
    // caller's missing-test re-run to collide with.
    qhStub.query.withArgs('ApexTestResult', match.any, match.any).resolves([]);
    setupMultipleQueryApexTestResults(qhStub, mockTestResult, [
      { Status: 'Queued' },
      { Status: 'Queued' },
    ]);

    const logger = new CapturingLogger();
    const mockAborter = new MockAborter();
    const runner = AsyncTestRunner.forClasses(
      logger,
      mockConnection,
      '',
      ['TestSample'],
      {
        maxTestRunRetries: 2,
        pollLimitToAssumeHangingTests: 1,
        aborter: mockAborter,
      }
    );

    const testRunResult = await runner.run();

    // Aborted once, and not restarted
    expect(mockAborter.calls).to.equal(1);
    expect(testServiceAsyncStub.calledOnce).to.be.true;
    expect(testRunResult.run.Status).to.equal('Queued');
    expect(testRunResult.numberOfResets).to.equal(0);
    expect(
      logger.entries.some(e =>
        logRegex(
          `Test run '${testRunId}' stuck in Queued with no progress, ` +
            'abandoning this attempt'
        ).test(e)
      )
    ).to.be.true;
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
    expect(testRunResult.numberOfResets).to.equal(0);
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
    expect(testRunResult.numberOfResets).to.equal(0);
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
      statusPollIntervalMs: 2000, // testing min time limit
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
    expect(testRunResult.numberOfResets).to.equal(0);
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
