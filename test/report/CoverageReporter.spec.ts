/*
 * Copyright (c) 2023, FinancialForce.com, inc. All rights reserved.
 */

import { CoverageReporter as ApexNodeCoverageReporter } from '@salesforce/apex-node';
import { expect } from 'chai';
import fs from 'fs';
import path from 'path';
import { SinonSandbox, createSandbox } from 'sinon';
import { CapturingLogger } from '../../src';
import { CoverageReporter } from '../../src/results/CoverageReporter';

const generateReportsMock = jest.fn();
jest.mock('@salesforce/apex-node', () => {
  return {
    CoverageReporter: jest.fn().mockImplementation(() => {
      return { generateReports: generateReportsMock };
    }),
  };
});

const MockCoverageReporter = jest.mocked(ApexNodeCoverageReporter);

describe('CoverageReporter', () => {
  let sandbox: SinonSandbox;

  beforeEach(() => {
    sandbox = createSandbox();
    sandbox.stub(path, 'join').returns('dirBase/coverage');
    sandbox.stub(path, 'resolve').returns('/abs/dirBase/coverage');
    sandbox.stub(fs, 'mkdirSync');
  });

  afterEach(() => {
    sandbox.restore();
    jest.restoreAllMocks();
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

    expect(generateReportsMock.mock.calls.length).to.equal(1);
    expect(MockCoverageReporter.mock.calls[0]).to.deep.equal([
      {
        done: true,
        records: [
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
        totalSize: 1,
      },
      '/abs/dirBase/coverage',
      'projectRoot',
      {
        reportFormats: ['lcovonly'],
        reportOptions: {
          lcovonly: { file: 'lcov.info', projectRoot: 'projectRoot' },
        },
      },
    ]);
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

    expect(generateReportsMock.mock.calls.length).to.equal(0);
  });
});
