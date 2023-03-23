/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */
import { AuthInfo, Connection } from '@apexdevtools/sfdx-auth-helper';
import {
  MockTestOrgData,
  testSetup,
} from '@apexdevtools/sfdx-auth-helper/lib/src/testSetup';
import { StreamingClient } from '@salesforce/apex-node/lib/src/streaming';
import { ExecuteService, TestLevel } from '@salesforce/apex-node';
import { expect } from 'chai';
import { createSandbox, SinonSandbox, SinonStub, match } from 'sinon';
import { AsyncTestRunner, TestRunner } from '../../src/runner/TestRunner';
import { CapturingLogger } from '../../src/log/CapturingLogger';
import {
  isoDateFormat,
  logRegex,
  MockAborter,
  setupExecuteAnonymous,
  setupMultipleQueryApexTestResults,
  setupQueryApexTestResults,
  setupRunTestsAsynchronous,
  testRunId,
} from '../Setup';
import { QueryHelper } from '../../src/query/QueryHelper';
import { ResultCollector } from '../../src/collector/ResultCollector';
import { TestRunnerCallbacks } from '../../src/runner/TestOptions';
import { ApexTestResult as ApexNodeTestResult } from '@salesforce/apex-node/lib/src/tests/types';
import { ApexTestResult } from '../../src/model/ApexTestResult';
import { Record } from 'jsforce';
import { TestError, TestErrorKind } from '../../src/runner/TestError';

const $$ = testSetup();
let mockConnection: Connection;
let sandboxStub: SinonSandbox;
let toolingRequestStub: SinonStub;
let queryStub: SinonStub<[string, string, string], Promise<Record<any>[]>>;
const testData = new MockTestOrgData();

jest.mock('../../src/collector/ResultCollector');
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
const gatherResult = jest.spyOn(ResultCollector, 'gatherResults');

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
    toolingRequestStub = sandboxStub.stub(mockConnection.tooling, 'request');
    queryStub = sandboxStub.stub(
      QueryHelper.instance(mockConnection.tooling),
      'query'
    );

    gatherResult.mockReset();
    gatherResult.mockReturnValue(Promise.resolve(mockTestResult));
  });

  afterEach(() => {
    sandboxStub.restore();
  });

  it('should complete for test class', async () => {
    setupRunTestsAsynchronous(toolingRequestStub, mockConnection, {
      tests: [{ className: 'TestSample' }],
      testLevel: TestLevel.RunSpecifiedTests,
      skipCodeCoverage: true,
    });
    setupQueryApexTestResults(queryStub, {});

    const logger = new CapturingLogger();
    const runner: TestRunner = AsyncTestRunner.forClasses(
      logger,
      mockConnection,
      '',
      ['TestSample'],
      {}
    );
    expect(runner.getTestClasses()).to.deep.equal(['TestSample']);

    const testRunResult = await runner.run();
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
    setupRunTestsAsynchronous(toolingRequestStub, mockConnection, {
      suiteNames: undefined,
      testLevel: TestLevel.RunLocalTests,
      skipCodeCoverage: true,
    });
    setupQueryApexTestResults(queryStub, {});

    const logger = new CapturingLogger();
    const runner = new AsyncTestRunner(logger, mockConnection, [], {
      maxTestRunRetries: 1,
      testRunTimeoutMins: 10,
    });
    expect(runner.getTestClasses()).to.deep.equal([]);

    const testRunResult = await runner.run();
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
    setupRunTestsAsynchronous(toolingRequestStub, mockConnection, {
      suiteNames: undefined,
      testLevel: TestLevel.RunLocalTests,
      skipCodeCoverage: true,
    });
    setupQueryApexTestResults(queryStub, { Status: 'Failed' });

    const logger = new CapturingLogger();
    const runner = new AsyncTestRunner(logger, mockConnection, [], {
      maxTestRunRetries: 1,
      testRunTimeoutMins: 10,
    });

    const testRunResult = await runner.run();
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
    setupRunTestsAsynchronous(toolingRequestStub, mockConnection, {
      suiteNames: undefined,
      testLevel: TestLevel.RunLocalTests,
      skipCodeCoverage: true,
    });
    setupQueryApexTestResults(queryStub, { Status: 'Aborted' });

    const logger = new CapturingLogger();
    const runner = new AsyncTestRunner(logger, mockConnection, [], {
      maxTestRunRetries: 1,
      testRunTimeoutMins: 10,
    });

    const testRunResult = await runner.run();
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
    setupRunTestsAsynchronous(toolingRequestStub, mockConnection, {
      tests: [{ className: 'TestSample' }],
      testLevel: TestLevel.RunSpecifiedTests,
      skipCodeCoverage: true,
    });
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
    setupRunTestsAsynchronous(toolingRequestStub, mockConnection, {
      tests: [{ className: 'TestSample' }],
      testLevel: TestLevel.RunSpecifiedTests,
      skipCodeCoverage: true,
    });
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
        statusPollIntervalMs: 100, // Just for testing, to keep under timeout
      }
    );

    const testRunResult = await runner.run();
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
    setupRunTestsAsynchronous(toolingRequestStub, mockConnection, {
      tests: [{ className: 'TestSample' }],
      testLevel: TestLevel.RunSpecifiedTests,
      skipCodeCoverage: true,
    });
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
        statusPollIntervalMs: 100, // Just for testing, to keep under timeout
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
    setupRunTestsAsynchronous(toolingRequestStub, mockConnection, {
      tests: [{ className: 'TestSample' }],
      testLevel: TestLevel.RunSpecifiedTests,
      skipCodeCoverage: true,
    });
    setupMultipleQueryApexTestResults(queryStub, [
      { Status: 'Processing' }, // poll
      { Status: 'Processing' }, // poll
      { Status: 'Processing' }, // result
      { Status: 'Completed' }, // poll
      { Status: 'Completed' }, // result
    ]);
    setupExecuteAnonymous(
      sandboxStub.stub(ExecuteService.prototype, 'connectionRequest'),
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
        statusPollIntervalMs: 100, // Just for testing, to keep under timeout
        pollLimitToAssumeHangingTests: 1, // Will asumme hanging on each poll
        aborter: mockAborter, // Skip over aborting
      }
    );

    const testRunResult = await runner.run();
    expect(mockAborter.calls).to.equal(1);
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

    setupRunTestsAsynchronous(toolingRequestStub, mockConnection, {
      tests: [{ className: 'TestSample' }],
      testLevel: TestLevel.RunSpecifiedTests,
      skipCodeCoverage: true,
    });
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
      sandboxStub.stub(ExecuteService.prototype, 'connectionRequest'),
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
        statusPollIntervalMs: 100, // Just for testing, to keep under timeout
        pollLimitToAssumeHangingTests: 1, // Will asumme hanging on each poll
        aborter: mockAborter, // Skip over aborting
      }
    );

    const testRunResult = await runner.run();
    expect(mockAborter.calls).to.equal(0);
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
    setupRunTestsAsynchronous(toolingRequestStub, mockConnection, {
      tests: [{ className: 'TestSample' }],
      testLevel: TestLevel.RunSpecifiedTests,
      skipCodeCoverage: true,
    });
    setupQueryApexTestResults(queryStub, {});

    const mockedOnRunStart = jest.fn<void, [string, void]>();
    const mockedOnPoll = jest.fn<void, [ApexNodeTestResult, void]>();

    const callbacks = ({
      onRunStarted: mockedOnRunStart,
      onPoll: mockedOnPoll,
    } as unknown) as TestRunnerCallbacks;

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
    setupRunTestsAsynchronous(toolingRequestStub, mockConnection, {
      tests: [{ className: 'TestSample' }],
      testLevel: TestLevel.RunSpecifiedTests,
      skipCodeCoverage: true,
    });
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
