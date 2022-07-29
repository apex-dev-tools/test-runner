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
import { createSandbox, SinonSandbox, SinonStub } from 'sinon';
import { AsyncTestRunner, TestRunner } from '../../src/runner/TestRunner';
import { CapturingLogger } from '../../src/log/CapturingLogger';
import {
  logRegex,
  MockAborter,
  setupEmptyQueryApexTestResults,
  setupExecuteAnonymous,
  setupMultipleQueryApexTestResults,
  setupQueryApexTestResults,
  setupRunTestsAsynchronous,
  testRunId,
} from '../Setup';
import { AggResult } from '../../src/log/BaseLogger';
import { QueryHelper } from '../../src/query/QueryHelper';

const $$ = testSetup();
let mockConnection: Connection;
let sandboxStub: SinonSandbox;
let toolingRequestStub: SinonStub;
let toolingQueryStub: SinonStub;
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
    toolingRequestStub = sandboxStub.stub(mockConnection.tooling, 'request');
    toolingQueryStub = sandboxStub.stub(mockConnection.tooling, 'query');
    queryHelperStub = sandboxStub.stub(
      QueryHelper.instance(mockConnection),
      'query'
    );
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
    setupQueryApexTestResults(toolingQueryStub, {});
    const aggCount: AggResult = {
      expr0: 10,
    };
    queryHelperStub.onCall(0).resolves([aggCount]);

    const logger = new CapturingLogger(mockConnection);
    const runner: TestRunner = AsyncTestRunner.forClasses(
      logger,
      mockConnection,
      '',
      ['TestSample'],
      {}
    );
    expect(runner.getTestClasses() == ['TestSample']);

    const testRunResult = await runner.run();
    expect(testRunResult.AsyncApexJobId).to.equal(testRunId);
    expect(testRunResult.Status).to.equal('Completed');
    expect(logger.entries.length).to.equal(2);
    expect(logger.entries[0]).to.match(
      logRegex(`Test run started with AsyncApexJob Id: ${testRunId}$`)
    );
    expect(logger.entries[1]).to.match(
      logRegex('0 have failed, 0% run, job is Completed$')
    );
  });

  it('should complete for all tests', async () => {
    setupRunTestsAsynchronous(toolingRequestStub, mockConnection, {
      suiteNames: undefined,
      testLevel: TestLevel.RunLocalTests,
      skipCodeCoverage: true,
    });
    setupQueryApexTestResults(toolingQueryStub, {});
    const aggCount: AggResult = {
      expr0: 10,
    };
    queryHelperStub.onCall(0).resolves([aggCount]);

    const logger = new CapturingLogger(mockConnection);
    const runner = new AsyncTestRunner(logger, mockConnection, [], {
      maxTestRunRetries: 1,
      testRunTimeoutMins: 10,
    });
    expect(runner.getTestClasses() == []);

    const testRunResult = await runner.run();
    expect(testRunResult.AsyncApexJobId).to.equal(testRunId);
    expect(testRunResult.Status).to.equal('Completed');
    expect(logger.entries.length).to.equal(2);
    expect(logger.entries[0]).to.match(
      logRegex(`Test run started with AsyncApexJob Id: ${testRunId}$`)
    );
    expect(logger.entries[1]).to.match(
      logRegex('0 have failed, 0% run, job is Completed$')
    );
  });

  it('should report failed run', async () => {
    setupRunTestsAsynchronous(toolingRequestStub, mockConnection, {
      suiteNames: undefined,
      testLevel: TestLevel.RunLocalTests,
      skipCodeCoverage: true,
    });
    setupQueryApexTestResults(toolingQueryStub, { Status: 'Failed' });
    const aggCount: AggResult = {
      expr0: 10,
    };
    queryHelperStub.onCall(0).resolves([aggCount]);

    const logger = new CapturingLogger(mockConnection);
    const runner = new AsyncTestRunner(logger, mockConnection, [], {
      maxTestRunRetries: 1,
      testRunTimeoutMins: 10,
    });

    const testRunResult = await runner.run();
    expect(testRunResult.AsyncApexJobId).to.equal(testRunId);
    expect(testRunResult.Status).to.equal('Failed');
    expect(logger.entries.length).to.equal(2);
    expect(logger.entries[0]).to.match(
      logRegex(`Test run started with AsyncApexJob Id: ${testRunId}$`)
    );
    expect(logger.entries[1]).to.match(
      logRegex('0 have failed, 0% run, job is Failed$')
    );
  });

  it('should report aborted run', async () => {
    setupRunTestsAsynchronous(toolingRequestStub, mockConnection, {
      suiteNames: undefined,
      testLevel: TestLevel.RunLocalTests,
      skipCodeCoverage: true,
    });
    setupQueryApexTestResults(toolingQueryStub, { Status: 'Aborted' });
    const aggCount: AggResult = {
      expr0: 10,
    };
    queryHelperStub.onCall(0).resolves([aggCount]);

    const logger = new CapturingLogger(mockConnection);
    const runner = new AsyncTestRunner(logger, mockConnection, [], {
      maxTestRunRetries: 1,
      testRunTimeoutMins: 10,
    });

    const testRunResult = await runner.run();
    expect(testRunResult.AsyncApexJobId).to.equal(testRunId);
    expect(testRunResult.Status).to.equal('Aborted');
    expect(logger.entries.length).to.equal(2);
    expect(logger.entries[0]).to.match(
      logRegex(`Test run started with AsyncApexJob Id: ${testRunId}$`)
    );
    expect(logger.entries[1]).to.match(
      logRegex('0 have failed, 0% run, job is Aborted$')
    );
  });

  it('should throw if max retries exceeded', async () => {
    const logger = new CapturingLogger(mockConnection);
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
      expect(false);
    } catch (err) {
      error = err;
    }
    expect(error).to.be.an(Error.name);
    if (error instanceof Error) {
      expect(error.message).to.equal(
        'Max number of test run retries reached, max allowed retries: 0'
      );
    }
  });

  it('should throw if test run not found', async () => {
    setupRunTestsAsynchronous(toolingRequestStub, mockConnection, {
      tests: [{ className: 'TestSample' }],
      testLevel: TestLevel.RunSpecifiedTests,
      skipCodeCoverage: true,
    });
    setupEmptyQueryApexTestResults(toolingQueryStub);

    const logger = new CapturingLogger(mockConnection);
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
      expect(false);
    } catch (err) {
      error = err;
    }
    expect(error).to.be.an(Error.name);
    if (error instanceof Error) {
      expect(error.message).to.equal(
        "Wrong number of ApexTestRunResult records found for '707xx0000AGQ3jbQQD', found 0, expected 1"
      );
    }
  });

  it('should poll while not complete', async () => {
    setupRunTestsAsynchronous(toolingRequestStub, mockConnection, {
      tests: [{ className: 'TestSample' }],
      testLevel: TestLevel.RunSpecifiedTests,
      skipCodeCoverage: true,
    });
    setupMultipleQueryApexTestResults(toolingQueryStub, [
      { Status: 'Queued' },
      { Status: 'Queued' },
      {},
    ]);
    const aggCount: AggResult = {
      expr0: 10,
    };
    queryHelperStub.resolves([aggCount]);

    const logger = new CapturingLogger(mockConnection);
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
      logRegex(`Test run started with AsyncApexJob Id: ${testRunId}$`)
    );
    expect(logger.entries[1]).to.match(
      logRegex('0 have failed, 0% run, job is Queued$')
    );
    expect(logger.entries[2]).to.match(
      logRegex('0 have failed, 0% run, job is Queued$')
    );
    expect(logger.entries[3]).to.match(
      logRegex('0 have failed, 0% run, job is Completed$')
    );
  });

  it('should timeout after polling too long', async () => {
    setupRunTestsAsynchronous(toolingRequestStub, mockConnection, {
      tests: [{ className: 'TestSample' }],
      testLevel: TestLevel.RunSpecifiedTests,
      skipCodeCoverage: true,
    });
    setupMultipleQueryApexTestResults(toolingQueryStub, [
      { Status: 'Queued' },
      { Status: 'Queued' },
      {},
    ]);
    const aggCount: AggResult = {
      expr0: 10,
    };
    queryHelperStub.resolves([aggCount]);

    const logger = new CapturingLogger(mockConnection);
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
      expect(false);
    } catch (err) {
      error = err;
    }
    expect(error).to.be.an(Error.name);
    if (error instanceof Error) {
      expect(error.message).to.equal(
        `Test run '${testRunId}' has exceed test runner max allowed run time of 0 minutes`
      );
    }
  });

  it('should cancel and restart after no progress detected', async () => {
    setupRunTestsAsynchronous(toolingRequestStub, mockConnection, {
      tests: [{ className: 'TestSample' }],
      testLevel: TestLevel.RunSpecifiedTests,
      skipCodeCoverage: true,
    });
    setupMultipleQueryApexTestResults(toolingQueryStub, [
      { Status: 'Processing' },
      { Status: 'Processing' },
      { Status: 'Completed' },
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
    const aggCount: AggResult = {
      expr0: 10,
    };
    queryHelperStub.resolves([aggCount]);

    const logger = new CapturingLogger(mockConnection);
    const mockAborter = new MockAborter();
    const runner = AsyncTestRunner.forClasses(
      logger,
      mockConnection,
      '',
      ['TestSample'],
      {
        maxTestRunRetries: 5,
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
    expect(logger.entries.length).to.equal(5);
    expect(logger.entries[0]).to.match(
      logRegex(`Test run started with AsyncApexJob Id: ${testRunId}$`)
    );
    expect(logger.entries[1]).to.match(
      logRegex('0 have failed, 0% run, job is Processing$')
    );
    expect(logger.entries[2]).to.match(
      logRegex(
        `Test run '${testRunId}' was not progressing, cancelling and retrying...$`
      )
    );
    expect(logger.entries[3]).to.match(
      logRegex(`Test run started with AsyncApexJob Id: ${testRunId}$`)
    );
    expect(logger.entries[4]).to.match(
      logRegex('0 have failed, 0% run, job is Completed$')
    );
  });

  it('should not cancel if progress detected', async () => {
    setupRunTestsAsynchronous(toolingRequestStub, mockConnection, {
      tests: [{ className: 'TestSample' }],
      testLevel: TestLevel.RunSpecifiedTests,
      skipCodeCoverage: true,
    });
    setupMultipleQueryApexTestResults(toolingQueryStub, [
      { Status: 'Processing', MethodsCompleted: 1 },
      { Status: 'Processing', MethodsCompleted: 2 },
      { Status: 'Completed', MethodsCompleted: 5 },
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
    const aggCount: AggResult = {
      expr0: 10,
    };
    queryHelperStub.resolves([aggCount]);

    const logger = new CapturingLogger(mockConnection);
    const mockAborter = new MockAborter();
    const runner = AsyncTestRunner.forClasses(
      logger,
      mockConnection,
      '',
      ['TestSample'],
      {
        maxTestRunRetries: 5,
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
    expect(logger.entries.length).to.equal(4);
    expect(logger.entries[0]).to.match(
      logRegex(`Test run started with AsyncApexJob Id: ${testRunId}$`)
    );
    expect(logger.entries[1]).to.match(
      logRegex('0 have failed, 0% run, job is Processing$')
    );
    expect(logger.entries[2]).to.match(
      logRegex('0 have failed, 0% run, job is Processing$')
    );
    expect(logger.entries[3]).to.match(
      logRegex('0 have failed, 0% run, job is Completed$')
    );
  });

  it('should create clone additional run', () => {
    const logger = new CapturingLogger(mockConnection);
    const runner: TestRunner = AsyncTestRunner.forClasses(
      logger,
      mockConnection,
      'ns',
      ['TestSample'],
      {}
    );
    expect(runner.getTestClasses() == ['TestSample']);

    const another = runner.newRunner(
      new Map<string, Set<string>>([
        ['TestSample2', new Set(['methodA', 'methodB'])],
        ['TestSample3', new Set(['methodC'])],
      ])
    );
    expect(another.getTestClasses() == ['TestSample2', 'TestSample3']);
  });
});
