/*
 * Copyright (c) 2023, FinancialForce.com, inc. All rights reserved.
 */
import { CoverageReporter } from '../../src/results/CoverageReporter';
import { CapturingLogger } from '../../src';

import path from 'path';
import fs from 'fs';
import { CoverageReporter as ApexNodeCoverageReporter } from '@salesforce/apex-node';

jest.mock('@salesforce/apex-node', () => {
  return {
    CoverageReporter: jest.fn().mockImplementation(() => {
      return { generateReports: jest.fn() };
    }),
  };
});

const mockedApexNodeCoverageReporter = jest.mocked(ApexNodeCoverageReporter);
describe('coverage reporter', () => {
  let joinSpy: any, resolveSpy: any, mkDirSyncSpy: any;

  beforeEach(() => {
    joinSpy = jest
      .spyOn(path, 'join')
      .mockReturnValueOnce('./fakepath/coverage');
    resolveSpy = jest
      .spyOn(path, 'resolve')
      .mockReturnValueOnce('path/to/fakepath/coverage');
    mkDirSyncSpy = jest.spyOn(fs, 'mkdirSync');
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });
  it('should call generate reports on CoverageReporter when there is data', () => {
    const generator = new CoverageReporter('projetRoot');
    const logger = new CapturingLogger();
    generator.generate(logger, 'dirBase', '.fileName', {
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
      retries: [],
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

    expect(mockedApexNodeCoverageReporter).toBeCalledWith(
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
      'path/to/fakepath/coverage',
      'projetRoot',
      {
        reportFormats: ['lcovonly'],
        reportOptions: {
          lcovonly: { file: 'lcov.info', projectRoot: 'projetRoot' },
        },
      }
    );
    expect(joinSpy).toBeCalledWith('dirBase', 'coverage');
    expect(resolveSpy).toBeCalledWith('./fakepath/coverage');
    expect(mkDirSyncSpy).toBeCalledWith('path/to/fakepath/coverage', {
      recursive: true,
    });
  });

  it('should not call generate reports on CoverageReporter when there is no data', () => {
    const generator = new CoverageReporter('projetRoot');
    const logger = new CapturingLogger();
    generator.generate(logger, 'dirBase', '.fileName', {
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
      retries: [],
      coverageResult: undefined,
    });

    expect(mockedApexNodeCoverageReporter).not.toHaveBeenCalled();
    expect(joinSpy).not.toBeCalled();
    expect(resolveSpy).not.toBeCalled();
    expect(mkDirSyncSpy).not.toBeCalled();
  });
});
