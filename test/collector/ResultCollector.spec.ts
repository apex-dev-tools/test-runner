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
import { ApexTestResult } from '../../src/model/ApexTestResult';
import {
  ResultCollector,
  ResultsByType,
} from '../../src/collector/ResultCollector';
import { testRunId } from '../Setup';
import { QueryHelper } from '../../src/query/QueryHelper';
import { CapturingLogger } from '../../src/log/CapturingLogger';
import { TestError, TestErrorKind } from '../../src';

const $$ = testSetup();
let mockConnection: Connection;
let sandboxStub: SinonSandbox;
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
    queryHelperStub = sandboxStub.stub(
      QueryHelper.instance(mockConnection.tooling),
      'query'
    );
  });

  afterEach(() => {
    sandboxStub.restore();
  });

  it('should return test results', async () => {
    const mockTestRunResult: ApexTestResult = {
      Id: 'The id',
      QueueItemId: 'Queue id',
      AsyncApexJobId: testRunId,
      Outcome: 'Pass',
      ApexClass: { Id: 'Class id', Name: 'FooClass', NamespacePrefix: '' },
      MethodName: 'MethodName',
      Message: null,
      StackTrace: null,
      RunTime: 1,
      TestTimestamp: '',
    };

    queryHelperStub.resolves([mockTestRunResult]);

    const results = await ResultCollector.gatherResults(
      mockConnection,
      testRunId
    );

    expect(results.length).to.equal(1);
    expect(results[0]).to.equal(mockTestRunResult);
  });

  it('should group test results by type', () => {
    const mockTestRunResults: ApexTestResult[] = [
      {
        Id: 'The id',
        QueueItemId: 'Queue id',
        AsyncApexJobId: testRunId,
        Outcome: 'Pass',
        ApexClass: { Id: 'Class id', Name: 'FooClass', NamespacePrefix: '' },
        MethodName: 'MethodName',
        Message: null,
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
        MethodName: 'MethodName',
        Message: 'Some error message',
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
        MethodName: 'MethodName',
        Message: 'Some UNABLE_TO_LOCK_ROW error',
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
        MethodName: 'MethodName',
        Message: 'Some deadlock detected while waiting for resource error',
        StackTrace: null,
        RunTime: 1,
        TestTimestamp: '',
      },
    ];

    const logger = new CapturingLogger();
    const results = ResultCollector.groupRecords(logger, mockTestRunResults);

    expect(results.passed.length).to.equal(1);
    expect(results.passed[0]).to.equal(mockTestRunResults[0]);
    expect(results.failed.length).to.equal(1);
    expect(results.failed[0]).to.equal(mockTestRunResults[1]);
    expect(results.rerun.length).to.equal(2);
    expect(results.rerun[0]).to.equal(mockTestRunResults[2]);
    expect(results.rerun[1]).to.equal(mockTestRunResults[3]);
  });

  it('should re-group test results by type', () => {
    const mockTestRunResults: ApexTestResult[] = [
      {
        Id: 'The id',
        QueueItemId: 'Queue id',
        AsyncApexJobId: testRunId,
        Outcome: 'Pass',
        ApexClass: { Id: 'Class id', Name: 'FooClass', NamespacePrefix: '' },
        MethodName: 'MethodName',
        Message: null,
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
        MethodName: 'MethodName',
        Message: 'Some error message',
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
        MethodName: 'MethodName',
        Message: 'Some UNABLE_TO_LOCK_ROW error',
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
        MethodName: 'MethodName',
        Message: 'Some deadlock detected while waiting for resource error',
        StackTrace: null,
        RunTime: 1,
        TestTimestamp: '',
      },
    ];

    const badResultsByType: ResultsByType = {
      passed: [mockTestRunResults[2]],
      failed: [mockTestRunResults[0], mockTestRunResults[3]],
      rerun: [mockTestRunResults[1]],
    };

    const logger = new CapturingLogger();
    const results = ResultCollector.reGroupRecords(logger, badResultsByType);

    expect(results.passed.length).to.equal(1);
    expect(results.passed[0]).to.equal(mockTestRunResults[0]);
    expect(results.failed.length).to.equal(1);
    expect(results.failed[0]).to.equal(mockTestRunResults[1]);
    expect(results.rerun.length).to.equal(2);
    expect(results.rerun[0]).to.equal(mockTestRunResults[2]);
    expect(results.rerun[1]).to.equal(mockTestRunResults[3]);
  });

  describe('getCoverageReport', () => {
    const mockTestRunResults: ApexTestResult[] = [
      {
        Id: 'The id',
        QueueItemId: 'Queue id',
        AsyncApexJobId: testRunId,
        Outcome: 'Pass',
        ApexClass: { Id: 'ClassId1', Name: 'FooClass', NamespacePrefix: '' },
        MethodName: 'MethodName',
        Message: null,
        StackTrace: null,
        RunTime: 1,
        TestTimestamp: '',
      },
      {
        Id: 'The id',
        QueueItemId: 'Queue id',
        AsyncApexJobId: testRunId,
        Outcome: 'Fail',
        ApexClass: { Id: 'ClassId2', Name: 'FooClass', NamespacePrefix: '' },
        MethodName: 'MethodName',
        Message: 'Some error message',
        StackTrace: null,
        RunTime: 1,
        TestTimestamp: '',
      },
    ];
    const mockCodeCoverage = [
      {
        Id: 'Coverage-Id',
        ApexTestClass: {
          Id: 'TestClassID',
          Name: 'TestClass',
          NamespacePrefix: '',
        },
        TestMethodName: 'method',
        ApexClassOrTrigger: {
          Id: 'ClassID',
          Name: 'FooClass',
          NamespacePrefix: '',
        },
        NumLinesCovered: 3,
        NumLinesUncovered: 3,
        Coverage: { coveredLines: [1, 2, 3], uncoveredLines: [4, 5, 6] },
      },
      {
        Id: 'Coverage-Id',
        ApexTestClass: {
          Id: 'TestClassID2',
          Name: 'TestClass',
          NamespacePrefix: '',
        },
        TestMethodName: 'method',
        ApexClassOrTrigger: {
          Id: 'ClassID',
          Name: 'FooClass',
          NamespacePrefix: '',
        },
        NumLinesCovered: 3,
        NumLinesUncovered: 3,
        Coverage: { coveredLines: [1, 2, 3], uncoveredLines: [4, 5, 6] },
      },
    ];

    const mockApexCodeCoverageAggregate = [
      {
        ApexClassOrTrigger: {
          Id: 'ClassID',
          Name: 'FooClass',
          NamespacePrefix: '',
        },
        NumLinesCovered: 3,
        NumLinesUncovered: 3,
        Coverage: { coveredLines: [1, 2, 3], uncoveredLines: [4, 5, 6] },
      },
    ];

    it('should collect and report code coverage', async () => {
      queryHelperStub.onFirstCall().resolves([mockCodeCoverage]);
      queryHelperStub.onSecondCall().resolves(mockApexCodeCoverageAggregate);

      const results = await ResultCollector.getCoverageReport(
        mockConnection,
        mockTestRunResults
      );
      const expectedTableOutput = 'CLASSES PERCENT UNCOVERED LINES FooClass 50% 4,5,6'.replace(
        /\s+/g,
        ''
      );
      const actualTableOutput = results.table?.replace(/\s+/g, '');

      expect(results.table).not.to.be.undefined;
      expect(actualTableOutput).to.equal(expectedTableOutput);
      expect(results.data).to.deep.equal(mockApexCodeCoverageAggregate);
    });

    it('should not produce table when code coverage is empty', async () => {
      queryHelperStub.onFirstCall().resolves([mockCodeCoverage]);
      queryHelperStub.onSecondCall().resolves([]);

      const results = await ResultCollector.getCoverageReport(
        mockConnection,
        mockTestRunResults
      );

      expect(results.table).to.be.undefined;
      expect(results.data).to.deep.equal([]);
    });

    it('should not produce table when first query fails', async () => {
      queryHelperStub.onFirstCall().rejects(new Error('First Query Error'));

      try {
        await ResultCollector.getCoverageReport(
          mockConnection,
          mockTestRunResults
        );
      } catch (er) {
        expect(er).to.be.instanceOf(TestError);
        expect((er as TestError).message).to.equal(
          'Failed getting coverage data: First Query Error'
        );
        expect((er as TestError).kind).to.equal(TestErrorKind.Query);
      }
    });

    it('should not produce table when second query fails', async () => {
      queryHelperStub.onFirstCall().resolves([mockCodeCoverage]);

      queryHelperStub.onSecondCall().rejects(new Error('Second Query Error'));
      try {
        await ResultCollector.getCoverageReport(
          mockConnection,
          mockTestRunResults
        );
      } catch (er) {
        expect(er).to.be.instanceOf(TestError);
        expect((er as TestError).message).to.equal(
          'Failed getting coverage data: Second Query Error'
        );
        expect((er as TestError).kind).to.equal(TestErrorKind.Query);
      }
    });
  });
});
