/*
 * Copyright (c) 2023, FinancialForce.com, inc. All rights reserved.
 */

import { expect } from 'chai';
import fs from 'fs';
import path from 'path';
import { SinonSandbox, SinonStub, createSandbox } from 'sinon';
import { CapturingLogger } from '../../src';
import { CoverageReporter } from '../../src/results/CoverageReporter';
import { LcovCoverageReporter } from '../../src/results/lcov/LcovCoverageReporter';
import LcovOnlyReport from 'istanbul-reports/lib/lcovonly';

describe('CoverageReporter', () => {
  let sandbox: SinonSandbox;
  let executeStub: SinonStub;
  let errorStub: SinonStub;

  beforeEach(() => {
    sandbox = createSandbox();

    executeStub = sandbox.stub(LcovOnlyReport.prototype, 'execute');
    errorStub = sandbox
      .stub(LcovCoverageReporter.prototype, 'localizeErrorMessage')
      .returnsArg(0);
    sandbox.stub(LcovCoverageReporter.prototype, 'getContext');

    sandbox.stub(path, 'join').returns('dirBase/coverage');
    sandbox.stub(path, 'resolve').returns('/abs/dirBase/coverage');
    sandbox.stub(fs, 'mkdirSync');
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should generate reports when there is data', () => {
    const generator = new CoverageReporter('projectRoot');
    const logger = new CapturingLogger();
    generator.generate(logger, 'dirBase', 'ignored', {
      startTime: new Date(),
      testResults: [],
      runResult: {
        AsyncApexJobId: 'job Id',
        StartTime: '2020-07-10 15:00:00.000',
        EndTime: '2020-07-10 15:01:00.000',
        Status: 'Status',
        TestTime: 1000,
        UserId: 'user Id',
        ClassesCompleted: 100,
        ClassesEnqueued: 99,
        MethodsCompleted: 500,
        MethodsEnqueued: 600,
        MethodsFailed: 100,
      },
      runIds: ['job Id'],
      reruns: [],
      coverageResult: {
        table: '',
        data: [
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
        ],
      },
    });

    expect(executeStub.calledOnce).to.be.true;
    expect(errorStub.called).to.be.false;
  });

  it('should not generate reports when there is no data', () => {
    const generator = new CoverageReporter('projectRoot');
    const logger = new CapturingLogger();
    generator.generate(logger, 'dirBase', 'ignored', {
      startTime: new Date(),
      testResults: [],
      runResult: {
        AsyncApexJobId: 'job Id',
        StartTime: '2020-07-10 15:00:00.000',
        EndTime: '2020-07-10 15:01:00.000',
        Status: 'Status',
        TestTime: 1000,
        UserId: 'user Id',
        ClassesCompleted: 100,
        ClassesEnqueued: 99,
        MethodsCompleted: 500,
        MethodsEnqueued: 600,
        MethodsFailed: 100,
      },
      runIds: ['job Id'],
      reruns: [],
      coverageResult: undefined,
    });

    expect(executeStub.called).to.be.false;
    expect(errorStub.called).to.be.false;
  });
});
