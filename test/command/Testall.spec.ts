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
  createMockRunResult,
  createMockTestResult,
  defaultTestInfo,
  logRegex,
  mockSetTimeout,
  testRunId,
} from '../Setup';
import { Logger } from '../../src/log/Logger';

function mockDefaultCollector(logger: Logger, connection: Connection) {
  const { classId, className, methodName } = defaultTestInfo;
  return new MockTestMethodCollector(
    logger,
    connection,
    '',
    new Map<string, string>([[classId, className]]),
    new Map<string, Set<string>>([[className, new Set([methodName])]])
  );
}

describe('TestAll', () => {
  const $$ = new TestContext();
  let sandbox: SinonSandbox;

  let mockConnection: Connection;
  let testingServiceSyncStub: SinonStub;

  beforeEach(async () => {
    sandbox = createSandbox();
    mockConnection = await createMockConnection($$, sandbox);

    mockSetTimeout(sandbox);

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
    const testMethods = mockDefaultCollector(logger, mockConnection);

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
    expect(logger.entries.length).to.be.equal(4);
    expect(logger.entries[0]).to.match(
      logRegex('Starting test run, with max failing tests for re-run 10')
    );
    expect(logger.entries[1]).to.match(
      logRegex('Warning: Test result reports were not generated')
    );
    expect(logger.entries[2]).to.match(logRegex('TestRunner timeout'));
    expect(logger.entries[3]).to.match(
      logRegex('Error stack: TestError: TestRunner timeout\n    at.*')
    );
  });

  it('should log and re-throw internal Error', async () => {
    const logger = new CapturingLogger();
    const err: MaybeError = new Error('TestRunner failed');
    err.data = 'More data';
    const runner = new MockThrowingTestRunner(err);
    const testMethods = mockDefaultCollector(logger, mockConnection);

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

    expect(logger.entries.length).to.be.equal(5);
    expect(logger.entries[0]).to.match(
      logRegex('Starting test run, with max failing tests for re-run 10')
    );
    expect(logger.entries[1]).to.match(
      logRegex('Warning: Test result reports were not generated')
    );
    expect(logger.entries[2]).to.match(logRegex('TestRunner failed'));
    expect(logger.entries[3]).to.match(
      logRegex('Error stack: Error: TestRunner failed\n    at.*')
    );
    expect(logger.entries[4]).to.match(
      logRegex('Additional data: "More data"')
    );
  });

  it('should log and re-throw non-Error exception', async () => {
    const logger = new CapturingLogger();
    const runner = new MockThrowingTestRunner('TestRunner failed');
    const testMethods = mockDefaultCollector(logger, mockConnection);

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

    expect(logger.entries.length).to.be.equal(3);
    expect(logger.entries[0]).to.match(
      logRegex('Starting test run, with max failing tests for re-run 10')
    );
    expect(logger.entries[1]).to.match(
      logRegex('Warning: Test result reports were not generated')
    );
    expect(logger.entries[2]).to.match(logRegex('Error: "TestRunner failed"'));
  });

  it('should return summary after running', async () => {
    const mockDate = new Date(1587412800000);
    const spy = jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

    const logger = new CapturingLogger();
    const mockRunResult: ApexTestRunResult = createMockRunResult();
    const mockTestResults: ApexTestResult[] = [createMockTestResult()];
    const runner = new MockTestRunner({
      run: mockRunResult,
      tests: mockTestResults,
    });
    const testMethods = mockDefaultCollector(logger, mockConnection);

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
      testResults: mockTestResults,
      runResult: mockRunResult,
      reruns: [],
      runIds: [testRunId],
      coverageResult: undefined,
    });
  });

  it('should stop after an initial aborted test run', async () => {
    const logger = new CapturingLogger();
    const mockRunResult: ApexTestRunResult = createMockRunResult({
      Status: 'Aborted',
    });
    const runner = new MockTestRunner({
      run: mockRunResult,
      tests: [],
    });
    const testMethods = mockDefaultCollector(logger, mockConnection);

    const result = await Testall.run(
      logger,
      mockConnection,
      '',
      testMethods,
      runner,
      [new MockOutputGenerator()],
      {}
    );

    expect(result.runIds.length).to.be.equal(1);
    expect(logger.entries.length).to.be.equal(3);
    expect(logger.entries[0]).to.match(
      logRegex('Starting test run, with max failing tests for re-run 10')
    );
    expect(logger.entries[1]).to.match(
      logRegex('Async test run has aborted, trying to report results')
    );
    expect(logger.entries[2]).to.match(
      logRegex('Generated reports for 0 tests')
    );
  });

  it('should stop if there are too many failed tests', async () => {
    const logger = new CapturingLogger();
    const mockRunResult: ApexTestRunResult = createMockRunResult({
      Status: 'Failed',
    });
    const mockTestResults: ApexTestResult[] = [
      createMockTestResult({
        Outcome: 'Fail',
      }),
    ];
    const runner = new MockTestRunner({
      run: mockRunResult,
      tests: mockTestResults,
    });
    const testMethods = mockDefaultCollector(logger, mockConnection);

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

    expect(result.runIds.length).to.be.equal(1);
    expect(logger.entries.length).to.be.equal(4);
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
    expect(logger.entries[3]).to.match(
      logRegex('Generated reports for 1 tests')
    );
  });

  it('should complete after passed sequential re-run of tests', async () => {
    const logger = new CapturingLogger();
    const mockRunResult: ApexTestRunResult = createMockRunResult({
      Status: 'Failed',
    });
    const mockTestResults: ApexTestResult[] = [
      createMockTestResult({
        Outcome: 'Fail',
        Message: 'UNABLE_TO_LOCK_ROW',
      }),
    ];
    const runner = new MockTestRunner({
      run: mockRunResult,
      tests: mockTestResults,
    });
    const testMethods = mockDefaultCollector(logger, mockConnection);
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

    expect(result.reruns.length).to.equal(1);
    expect(result.reruns[0].after.Outcome).to.equal('Pass');
    expect(result.reruns[0].after.Message).to.equal(null);
    expect(logger.entries.length).to.equal(4);
    expect(logger.entries[0]).to.match(
      logRegex('Starting test run, with max failing tests for re-run 10')
    );
    expect(logger.entries[1]).to.match(
      logRegex('Running 1 failed tests sequentially \\(matched patterns\\)')
    );
    expect(logger.entries[2]).to.match(
      logRegex('Class.method re-run complete, outcome = Pass')
    );
    expect(logger.entries[3]).to.match(
      logRegex('Generated reports for 1 tests with 1 re-runs')
    );
  });

  it('should complete after failed sequential re-run of tests', async () => {
    const logger = new CapturingLogger();
    const mockRunResult: ApexTestRunResult = createMockRunResult({
      Status: 'Failed',
    });
    const mockTestResults: ApexTestResult[] = [
      createMockTestResult({
        Outcome: 'Fail',
        Message: 'UNABLE_TO_LOCK_ROW',
      }),
    ];
    const runner = new MockTestRunner({
      run: mockRunResult,
      tests: mockTestResults,
    });
    const testMethods = mockDefaultCollector(logger, mockConnection);
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

    expect(result.reruns.length).to.equal(1);
    expect(result.reruns[0].after.Outcome).to.equal('Fail');
    expect(result.reruns[0].after.Message).to.equal('Other Error');
    expect(logger.entries.length).to.be.equal(6);
    expect(logger.entries[0]).to.match(
      logRegex('Starting test run, with max failing tests for re-run 10')
    );
    expect(logger.entries[1]).to.match(
      logRegex('Running 1 failed tests sequentially \\(matched patterns\\)')
    );
    expect(logger.entries[2]).to.match(
      logRegex('Class.method re-run complete, outcome = Fail')
    );
    expect(logger.entries[3]).to.match(
      logRegex(' \\[Before\\] UNABLE_TO_LOCK_ROW')
    );
    expect(logger.entries[4]).to.match(logRegex(' \\[After\\] Other Error'));
    expect(logger.entries[5]).to.match(
      logRegex('Generated reports for 1 tests with 1 re-runs')
    );
  });

  it('should ignore and log failed retry request of test', async () => {
    const logger = new CapturingLogger();
    const mockRunResult: ApexTestRunResult = createMockRunResult({
      Status: 'Failed',
    });
    const mockTestResults: ApexTestResult[] = [
      createMockTestResult({
        Outcome: 'Fail',
        Message: 'UNABLE_TO_LOCK_ROW',
      }),
    ];
    const runner = new MockTestRunner({
      run: mockRunResult,
      tests: mockTestResults,
    });
    const testMethods = mockDefaultCollector(logger, mockConnection);
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

    expect(result.reruns.length).to.equal(0);
    expect(logger.entries.length).to.be.equal(11);
    expect(logger.entries[0]).to.match(
      logRegex('Starting test run, with max failing tests for re-run 10')
    );
    expect(logger.entries[1]).to.match(
      logRegex('Running 1 failed tests sequentially \\(matched patterns\\)')
    );
    expect(logger.entries[2]).to.match(
      logRegex('Warning: Request failed. Cause: Request Error')
    );
    expect(logger.entries[3]).to.match(
      logRegex('Waiting 15 seconds to retry \\(attempts: 1\\)')
    );
    expect(logger.entries[4]).to.match(
      logRegex('Warning: Request failed. Cause: Request Error')
    );
    expect(logger.entries[5]).to.match(
      logRegex('Waiting 30 seconds to retry \\(attempts: 2\\)')
    );
    expect(logger.entries[6]).to.match(
      logRegex('Warning: Request failed. Cause: Request Error')
    );
    expect(logger.entries[7]).to.match(
      logRegex('Waiting 60 seconds to retry \\(attempts: 3\\)')
    );
    expect(logger.entries[8]).to.match(
      logRegex('Warning: Request failed. Cause: Request Error')
    );
    expect(logger.entries[9]).to.match(
      logRegex(
        'Class.method re-run failed. All retries failed. Last error: Error: Request Error'
      )
    );
    expect(logger.entries[10]).to.match(
      logRegex('Generated reports for 1 tests')
    );
  });

  it('should complete after limited sequential re-run of tests', async () => {
    const logger = new CapturingLogger();
    const mockRunResult: ApexTestRunResult = createMockRunResult({
      Status: 'Failed',
    });
    const mockTestResults: ApexTestResult[] = [
      createMockTestResult({
        Outcome: 'Fail',
        Message: 'Not matching Error',
      }),
    ];
    const runner = new MockTestRunner({
      run: mockRunResult,
      tests: mockTestResults,
    });
    const testMethods = mockDefaultCollector(logger, mockConnection);
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

    expect(result.reruns.length).to.equal(1);
    expect(result.reruns[0].after.Outcome).to.equal('Pass');
    expect(result.reruns[0].after.Message).to.equal(null);
    expect(logger.entries.length).to.equal(4);
    expect(logger.entries[0]).to.match(
      logRegex('Starting test run, with max failing tests for re-run 1')
    );
    expect(logger.entries[1]).to.match(
      logRegex(
        'Running 1 failed tests sequentially \\(0 tests matched patterns\\)'
      )
    );
    expect(logger.entries[2]).to.match(
      logRegex('Class.method re-run complete, outcome = Pass')
    );
    expect(logger.entries[3]).to.match(
      logRegex('Generated reports for 1 tests with 1 re-runs')
    );
  });

  it('should complete after exceeding limit on sequential re-run of tests', async () => {
    const logger = new CapturingLogger();
    const mockRunResult: ApexTestRunResult = createMockRunResult({
      Status: 'Failed',
    });
    const mockTestResults: ApexTestResult[] = [
      createMockTestResult({
        Outcome: 'Fail',
        Message: 'Not matching Error',
      }),
      createMockTestResult({
        Outcome: 'Fail',
        Message: 'Not matching Error',
        MethodName: 'method2',
      }),
    ];
    const runner = new MockTestRunner({
      run: mockRunResult,
      tests: mockTestResults,
    });
    const testMethods = mockDefaultCollector(logger, mockConnection);

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

    expect(result.reruns.length).to.equal(0);
    expect(logger.entries.length).to.equal(5);
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
    expect(logger.entries[4]).to.match(
      logRegex('Generated reports for 2 tests')
    );
  });

  it('should complete after sequential re-run of all failed tests', async () => {
    const logger = new CapturingLogger();
    const mockRunResult: ApexTestRunResult = createMockRunResult({
      Status: 'Failed',
    });
    const mockTestResults: ApexTestResult[] = [
      createMockTestResult({
        Outcome: 'Fail',
        Message: 'UNABLE_TO_LOCK_ROW',
      }),
      createMockTestResult({
        Outcome: 'Fail',
        Message: 'Not matching Error',
        MethodName: 'method2',
      }),
      createMockTestResult({
        Outcome: 'Fail',
        Message: 'Not matching Error 2',
        MethodName: 'method3',
      }),
    ];
    const runner = new MockTestRunner({
      run: mockRunResult,
      tests: mockTestResults,
    });
    const testMethods = mockDefaultCollector(logger, mockConnection);

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

    expect(result.reruns.length).to.equal(3);
    expect(logger.entries.length).to.equal(6);
    expect(logger.entries[0]).to.match(
      logRegex('Starting test run, with max failing tests for re-run 10')
    );
    expect(logger.entries[1]).to.match(
      logRegex(
        'Running 3 failed tests sequentially \\(1 tests matched patterns\\)'
      )
    );
    expect(logger.entries[2]).to.match(
      logRegex('Class.method re-run complete, outcome = Pass')
    );
    expect(logger.entries[3]).to.match(
      logRegex('Class.method2 re-run complete, outcome = Pass')
    );
    expect(logger.entries[4]).to.match(
      logRegex('Class.method3 re-run complete, outcome = Pass')
    );
    expect(logger.entries[5]).to.match(
      logRegex('Generated reports for 3 tests with 3 re-runs')
    );
  });

  it('should re-run missing tests', async () => {
    const logger = new CapturingLogger();
    const mockRunResult: ApexTestRunResult = createMockRunResult({
      Status: 'Completed',
    });
    const { classId, className } = defaultTestInfo;
    const mockTestResults: ApexTestResult[] = [
      createMockTestResult({
        Outcome: 'Pass',
        MethodName: 'method1',
        ApexClass: {
          Id: classId,
          Name: className,
          NamespacePrefix: 'ns',
        },
      }),
      createMockTestResult({
        Outcome: 'Pass',
        MethodName: 'method2',
        ApexClass: {
          Id: classId,
          Name: className,
          NamespacePrefix: 'ns',
        },
      }),
    ];
    const runner = new MockTestRunner({
      run: mockRunResult,
      tests: [mockTestResults[0]],
    }).addNextResult({
      run: mockRunResult,
      tests: [mockTestResults[1]],
    });
    const testMethods = new MockTestMethodCollector(
      logger,
      mockConnection,
      'ns',
      new Map<string, string>([[classId, className]]),
      new Map<string, Set<string>>([
        [className, new Set(['method1', 'method2'])],
      ])
    );

    const result = await Testall.run(
      logger,
      mockConnection,
      'ns',
      testMethods,
      runner,
      [new MockOutputGenerator()],
      {}
    );
    expect(result.runIds.length).to.be.equal(2);
    expect(logger.entries.length).to.be.equal(4);
    expect(logger.entries[0]).to.match(
      logRegex('Starting test run, with max failing tests for re-run 10')
    );
    expect(logger.entries[1]).to.match(
      logRegex('Found 1 methods in 1 classes were not run, trying again...')
    );
    expect(logger.entries[2]).to.match(
      logRegex('No matching test failures to re-run')
    );
    expect(logger.entries[3]).to.match(
      logRegex('Generated reports for 2 tests')
    );
  });
});
