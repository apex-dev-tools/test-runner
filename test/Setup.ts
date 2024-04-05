/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */

import { TestItem } from '@salesforce/apex-node';
import {
  ExecAnonApiResponse,
  SoapResponse,
} from '@salesforce/apex-node/lib/src/execute/types';
import { Connection } from '@salesforce/core';
import { MockTestOrgData, TestContext } from '@salesforce/core/lib/testSetup';
import { SinonSandbox, SinonStub, SinonStubbedInstance, match } from 'sinon';
import { TestMethodCollector } from '../src/collector/TestMethodCollector';
import { Logger } from '../src/log/Logger';
import { ApexTestRunResult } from '../src/model/ApexTestRunResult';
import { ApexClassInfo, QueryResponse } from '../src/query/ClassSymbolLoader';
import {
  OutputGenerator,
  TestRunSummary,
} from '../src/results/OutputGenerator';
import {
  CancelTestRunOptions,
  TestRunAborter,
} from '../src/runner/TestOptions';
import { TestRunner, TestRunnerResult } from '../src/runner/TestRunner';
import { QueryHelper } from '../src/query/QueryHelper';
import { Connection as JSForceConnection } from 'jsforce';
import { ApexTestResult } from '../src/model/ApexTestResult';
import { Duration } from '@salesforce/kit';

export const testRunId = '707xx0000AGQ3jbQQD';
export const defaultTestInfo = {
  id: 'test',
  queueId: 'queue',
  classId: 'cls',
  className: 'Class',
  methodName: 'method',
};

export const isoDateFormat =
  '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}.[0-9]{3}Z';

export const timeFormat = '[0-9]{1,2}:[0-9]{2}:[0-9]{2}';

export const timeoutMs = Duration.minutes(120).milliseconds;
export const pollMs = Duration.seconds(30).milliseconds;

export function mockSetTimeout(
  sandbox: SinonSandbox,
  testPollMs = 10,
  testTimeoutMs = 100
) {
  // NOTE: for debugging within polling, increase Ms params

  // stub timeout only for default durations
  // make global timeouts fit within test

  const timeoutStub = sandbox.stub(global, 'setTimeout');

  // always call timeouts for retry immediately
  // timeoutStub.withArgs(match.any, 0).callThrough();
  // timeoutStub.callsFake(cb => setTimeout(cb, 0));

  // replace default timeouts with fixed delay
  timeoutStub.withArgs(match.any, testPollMs).callThrough();
  timeoutStub.callsFake(cb => setTimeout(cb, testPollMs));

  // replace default global 120 min timeout
  timeoutStub.withArgs(match.any, testTimeoutMs).callThrough();
  timeoutStub
    .withArgs(match.any, timeoutMs)
    .callsFake(cb => setTimeout(cb, testTimeoutMs));
}

export async function createMockConnection(
  $$: TestContext,
  sandbox: SinonSandbox,
  testData = new MockTestOrgData()
): Promise<Connection> {
  // stub api version to avoid request failure
  $$.SANDBOX.stub(Connection.prototype, 'retrieveMaxApiVersion').resolves(
    '50.0'
  );

  // creates a temp alias file to avoid crash
  $$.stubAliases({});

  await $$.stubAuths(testData);
  const mockConnection = await testData.getConnection();

  sandbox.stub(mockConnection, 'instanceUrl').get(() => {
    return 'https://na139.salesforce.com';
  });

  return mockConnection;
}

export function logRegex(entry: string): RegExp {
  return new RegExp(`^${isoDateFormat} -\\s*${entry}\\s*$`, 'gm');
}

export function createQueryHelper(
  sandbox: SinonSandbox,
  connection: Connection
) {
  // hack: use sf core connection mock in place of jsforce connection
  const stubInstance = sandbox.createStubInstance(QueryHelper);
  stubInstance.connection = connection as unknown as JSForceConnection;
  stubInstance.run.callsFake(fn =>
    fn(connection as unknown as JSForceConnection)
  );

  sandbox.stub(QueryHelper, 'instance').returns(stubInstance);

  return stubInstance;
}

export type ApexTestRunResultParams = Partial<ApexTestRunResult>;

export function setupQueryApexTestResults(
  stub: SinonStubbedInstance<QueryHelper>,
  tests: ApexTestResult[],
  params?: ApexTestRunResultParams
): void {
  const mockTestRunResult: ApexTestRunResult = createMockRunResult({
    MethodsEnqueued: tests.length,
    ...params,
  });

  stub.query
    .withArgs('ApexTestRunResult', match.any, match.any)
    .resolves([mockTestRunResult]);
}

export function setupMultipleQueryApexTestResults(
  stub: SinonStubbedInstance<QueryHelper>,
  tests: ApexTestResult[],
  paramsList: ApexTestRunResultParams[]
): void {
  for (let i = 0; i < paramsList.length; i++) {
    const mockTestRunResult: ApexTestRunResult = createMockRunResult({
      MethodsEnqueued: tests.length,
      ...paramsList[i],
    });

    stub.query
      .withArgs('ApexTestRunResult', match.any, match.any)
      .onCall(i)
      .resolves([mockTestRunResult]);
  }
}

export function createMockRunResult(params: ApexTestRunResultParams = {}) {
  return {
    AsyncApexJobId: params.AsyncApexJobId || testRunId,
    StartTime: params.StartTime || '',
    EndTime: params.EndTime || '',
    Status: params.Status || 'Completed',
    TestTime: params.TestTime || 0,
    UserId: params.UserId || '',
    ClassesCompleted: params.ClassesCompleted || 0,
    ClassesEnqueued: params.ClassesEnqueued || 0,
    MethodsCompleted: params.MethodsCompleted || 0,
    MethodsEnqueued: params.MethodsEnqueued || 0,
    MethodsFailed: params.MethodsFailed || 0,
  };
}

export type ApexTestResultParams = Partial<ApexTestResult>;

export function createMockTestResult(params: ApexTestResultParams = {}) {
  return {
    Id: params.Id || defaultTestInfo.id,
    QueueItemId: params.QueueItemId || defaultTestInfo.queueId,
    AsyncApexJobId: params.AsyncApexJobId || testRunId,
    Outcome: params.Outcome || 'Pass',
    ApexClass: params.ApexClass || {
      Id: defaultTestInfo.classId,
      Name: defaultTestInfo.className,
      NamespacePrefix: '',
    },
    MethodName: params.MethodName || defaultTestInfo.methodName,
    Message: params.Message || '',
    StackTrace: params.StackTrace || null,
    RunTime: params.RunTime || 1,
    TestTimestamp: params.TestTimestamp || '',
  };
}

export function setupExecuteAnonymous(
  stub: SinonStub,
  result: ExecAnonApiResponse
): void {
  const log =
    '47.0 APEX_CODE,DEBUG;APEX_PROFILING,INFO\nExecute Anonymous: System.assert(true);|EXECUTION_FINISHED\n';
  const soapResponse: SoapResponse = {
    'soapenv:Envelope': {
      'soapenv:Header': { DebuggingInfo: { debugLog: log } },
      'soapenv:Body': {
        executeAnonymousResponse: { result: result },
      },
    },
  };
  stub.resolves(soapResponse);
}

export function setupQueryApexClassesSOAP(
  records: ApexClassInfo[]
): QueryResponse {
  return {
    'soapenv:Envelope': {
      'soapenv:Body': {
        queryResponse: { result: { records: records } },
      },
    },
  };
}

export class MockAborter implements TestRunAborter {
  calls = 0;

  async abortRun(
    /* eslint-disable @typescript-eslint/no-unused-vars */
    _logger: Logger,
    _connection: Connection,
    _testRunId: string,
    _options: CancelTestRunOptions
    /* eslint-enable @typescript-eslint/no-unused-vars */
  ): Promise<string[]> {
    this.calls++;
    return Promise.resolve(['ID1']);
  }
}

export class MockTestRunner implements TestRunner {
  result: TestRunnerResult;
  nextResult?: TestRunnerResult;
  testItems: TestItem[];

  constructor(result: TestRunnerResult, testItems: TestItem[] = []) {
    this.result = result;
    this.testItems = testItems;
  }

  addNextResult(res: TestRunnerResult): TestRunner {
    this.nextResult = res;
    return this;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  newRunner(testItems: TestItem[]): TestRunner {
    return new MockTestRunner(this.nextResult || this.result, this.testItems);
  }

  getTestClasses(): string[] {
    return this.testItems.map(i => i.className as string);
  }

  async run(): Promise<TestRunnerResult> {
    return Promise.resolve(this.result);
  }
}

export class MockThrowingTestRunner implements TestRunner {
  error: any;

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  constructor(error: any) {
    this.error = error;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  newRunner(testItems: TestItem[]): TestRunner {
    throw this.error;
  }

  getTestClasses(): string[] {
    return [];
  }

  run(): Promise<TestRunnerResult> {
    throw this.error;
  }
}

export class MockOutputGenerator implements OutputGenerator {
  generate(
    /* eslint-disable @typescript-eslint/no-unused-vars */
    logger: Logger,
    outputDirBase: string,
    fileName: string,
    summary: TestRunSummary
    /* eslint-enable @typescript-eslint/no-unused-vars */
  ): void {
    // Do nothing
  }
}

export class MockTestMethodCollector extends TestMethodCollector {
  classIdName: Map<string, string>;
  testMethods: Map<string, Set<string>>;

  constructor(
    logger: Logger,
    connection: Connection,
    namespace: string,
    classIdName: Map<string, string>,
    testMethods: Map<string, Set<string>>
  ) {
    super(logger, connection, namespace);
    this.classIdName = classIdName;
    this.testMethods = testMethods;
  }

  classIdNameMap(): Promise<Map<string, string>> {
    return Promise.resolve(this.classIdName);
  }
  gatherTestMethods(): Promise<Map<string, Set<string>>> {
    return Promise.resolve(this.testMethods);
  }
}
