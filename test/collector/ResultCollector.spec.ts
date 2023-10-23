/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */

import { Connection } from '@salesforce/core';
import { TestContext } from '@salesforce/core/lib/testSetup';
import { expect } from 'chai';
import { SinonSandbox, SinonStubbedInstance, createSandbox } from 'sinon';
import { TestError, TestErrorKind } from '../../src';
import {
  ResultCollector,
  ResultsByType,
} from '../../src/collector/ResultCollector';
import { CapturingLogger } from '../../src/log/CapturingLogger';
import { ApexTestResult } from '../../src/model/ApexTestResult';
import { QueryHelper } from '../../src/query/QueryHelper';
import {
  createMockConnection,
  createMockTestResult,
  createQueryHelper,
  testRunId,
} from '../Setup';
import {
  ApexCodeCoverage,
  ApexCodeCoverageAggregate,
} from '../../src/model/ApexCodeCoverage';

describe('ResultCollector', () => {
  const $$ = new TestContext();
  let sandbox: SinonSandbox;

  let mockConnection: Connection;
  let qhStub: SinonStubbedInstance<QueryHelper>;

  beforeEach(async () => {
    sandbox = createSandbox();
    mockConnection = await createMockConnection($$, sandbox);
    qhStub = createQueryHelper(sandbox, mockConnection);
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should return test results', async () => {
    const mockTestRunResults: ApexTestResult[] = [
      createMockTestResult({
        Outcome: 'Pass',
      }),
    ];

    qhStub.query.resolves(mockTestRunResults);

    const results = await ResultCollector.gatherResults(
      mockConnection,
      testRunId
    );

    expect(results.length).to.equal(1);
    expect(results[0]).to.equal(mockTestRunResults[0]);
  });

  it('should group test results by type', () => {
    const mockTestRunResults: ApexTestResult[] = [
      createMockTestResult({
        Outcome: 'Pass',
      }),
      createMockTestResult({
        Outcome: 'Fail',
        Message: 'Some error message',
      }),
      createMockTestResult({
        Outcome: 'Fail',
        Message: 'Some UNABLE_TO_LOCK_ROW error',
      }),
      createMockTestResult({
        Outcome: 'Fail',
        Message: 'Some deadlock detected while waiting for resource error',
      }),
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
      createMockTestResult({
        Outcome: 'Pass',
      }),
      createMockTestResult({
        Outcome: 'Fail',
        Message: 'Some error message',
      }),
      createMockTestResult({
        Outcome: 'Fail',
        Message: 'Some UNABLE_TO_LOCK_ROW error',
      }),
      createMockTestResult({
        Outcome: 'Fail',
        Message: 'Some deadlock detected while waiting for resource error',
      }),
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
      createMockTestResult({
        Outcome: 'Pass',
      }),
      createMockTestResult({
        Outcome: 'Fail',
        Message: 'Some error message',
      }),
    ];
    const mockCodeCoverage: ApexCodeCoverage[] = [
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

    const mockApexCodeCoverageAggregate: ApexCodeCoverageAggregate[] = [
      {
        Id: 'CoverageAgg-Id',
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
      qhStub.query.onFirstCall().resolves(mockCodeCoverage);
      qhStub.query.onSecondCall().resolves(mockApexCodeCoverageAggregate);

      const results = await ResultCollector.getCoverageReport(
        mockConnection,
        mockTestRunResults
      );
      const expectedTableOutput =
        'CLASSES PERCENT UNCOVERED LINES FooClass 50% 4,5,6'.replace(
          /\s+/g,
          ''
        );
      const actualTableOutput = results.table?.replace(/\s+/g, '');

      expect(results.table).not.to.be.undefined;
      expect(actualTableOutput).to.equal(expectedTableOutput);
      expect(results.data).to.deep.equal(mockApexCodeCoverageAggregate);
    });

    it('should not produce table when code coverage is empty', async () => {
      qhStub.query.onFirstCall().resolves(mockCodeCoverage);
      qhStub.query.onSecondCall().resolves([]);

      const results = await ResultCollector.getCoverageReport(
        mockConnection,
        mockTestRunResults
      );

      expect(results.table).to.be.undefined;
      expect(results.data).to.deep.equal([]);
    });

    it('should not produce table when first query fails', async () => {
      qhStub.query.onFirstCall().rejects(new Error('First Query Error'));

      let err;
      try {
        await ResultCollector.getCoverageReport(
          mockConnection,
          mockTestRunResults
        );
      } catch (er) {
        err = er as TestError;
      }
      if (!err) {
        expect.fail('Missing exception');
      }

      expect(err).to.be.instanceOf(TestError);
      expect(err.message).to.equal(
        'Failed getting coverage data: First Query Error'
      );
      expect(err.kind).to.equal(TestErrorKind.Query);
    });

    it('should not produce table when second query fails', async () => {
      qhStub.query.onFirstCall().resolves(mockCodeCoverage);
      qhStub.query.onSecondCall().rejects(new Error('Second Query Error'));

      let err;
      try {
        await ResultCollector.getCoverageReport(
          mockConnection,
          mockTestRunResults
        );
      } catch (er) {
        err = er as TestError;
      }
      if (!err) {
        expect.fail('Missing exception');
      }

      expect(err).to.be.instanceOf(TestError);
      expect(err.message).to.equal(
        'Failed getting coverage data: Second Query Error'
      );
      expect(err.kind).to.equal(TestErrorKind.Query);
    });
  });
});
