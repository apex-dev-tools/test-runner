/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */

import {
  AsyncTestArrayConfiguration,
  AsyncTestConfiguration,
  TestItem,
} from '@salesforce/apex-node';
import {
  ExecAnonApiResponse,
  SoapResponse,
} from '@salesforce/apex-node/lib/src/execute/types';
import { Connection } from '@apexdevtools/sfdx-auth-helper';
import { SinonStub, match } from 'sinon';
import { TestMethodCollector } from '../src/collector/TestMethodCollector';
import { Logger } from '../src/log/Logger';
import { ApexTestRunResult } from '../src/model/ApexTestRunResult';
import {
  CancelTestRunOptions,
  TestRunAborter,
} from '../src/runner/TestOptions';
import { TestRunner } from '../src/runner/TestRunner';
import {
  OutputGenerator,
  TestRunSummary,
} from '../src/results/OutputGenerator';
import { ApexClassInfo, QueryResponse } from '../src/query/ClassSymbolLoader';
import { Record } from 'jsforce';

export const testRunId = '707xx0000AGQ3jbQQD';

export const isoDateFormat =
  '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}.[0-9]{3}Z';

export function logRegex(entry: string): RegExp {
  return new RegExp(`^${isoDateFormat} - ${entry}$`, 'gm');
}

export function setupRunTestsAsynchronous(
  stub: SinonStub,
  mockConnection: Connection,
  config: AsyncTestArrayConfiguration | AsyncTestConfiguration
): void {
  const testAsyncRequest = {
    method: 'POST',
    url: `${mockConnection.tooling._baseUrl()}/runTestsAsynchronous`,
    body: JSON.stringify(config),
    headers: { 'content-type': 'application/json' },
  };
  stub.withArgs(testAsyncRequest).returns(testRunId);
}

export type ApexTestRunResultParams = Partial<ApexTestRunResult>;

export function setupQueryApexTestResults(
  stub: SinonStub<[string, string, string], Promise<Record<any>[]>>,
  params: ApexTestRunResultParams
): void {
  const mockTestRunResult: ApexTestRunResult = createMockRunResult(params);

  stub
    .withArgs('ApexTestRunResult', match.any, match.any)
    .resolves([mockTestRunResult]);
}

export function setupMultipleQueryApexTestResults(
  stub: SinonStub<[string, string, string], Promise<Record<any>[]>>,
  paramsList: ApexTestRunResultParams[]
): void {
  for (let i = 0; i < paramsList.length; i++) {
    const mockTestRunResult: ApexTestRunResult = createMockRunResult(
      paramsList[i]
    );

    stub
      .withArgs('ApexTestRunResult', match.any, match.any)
      .onCall(i)
      .resolves([mockTestRunResult]);
  }
}

function createMockRunResult(params: ApexTestRunResultParams) {
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
  stub: SinonStub,
  records: ApexClassInfo[]
): void {
  const soapResponse: QueryResponse = {
    'soapenv:Envelope': {
      'soapenv:Body': {
        queryResponse: { result: { records: records } },
      },
    },
  };
  stub.resolves(soapResponse);
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
  results: ApexTestRunResult;
  testItems: TestItem[];

  constructor(results: ApexTestRunResult, testItems: TestItem[] = []) {
    this.results = results;
    this.testItems = testItems;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  newRunner(testItems: TestItem[]): TestRunner {
    return new MockTestRunner(this.results, this.testItems);
  }

  getTestClasses(): string[] {
    return this.testItems.map(i => i.className as string);
  }

  async run(): Promise<ApexTestRunResult> {
    return Promise.resolve(this.results);
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

  run(): Promise<ApexTestRunResult> {
    throw this.error;
  }
}

export class MockOutputGenerator implements OutputGenerator {
  generate(
    /* eslint-disable @typescript-eslint/no-unused-vars */
    logger: Logger,
    outputFileBase: string,
    summary: TestRunSummary
    /* eslint-enable @typescript-eslint/no-unused-vars */
  ): void {
    // Do nothing
  }
}

export class MockTestMethodCollector implements TestMethodCollector {
  classIdName: Map<string, string>;
  testMethods: Map<string, Set<string>>;

  constructor(
    classIdName: Map<string, string>,
    testMethods: Map<string, Set<string>>
  ) {
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
