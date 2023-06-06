/*
 * Copyright (c) 2023, Certinia Inc. All rights reserved.
 */

import { DefaultWatermarks } from '@salesforce/apex-node';
import { nls } from '@salesforce/apex-node/lib/src/i18n';
import { expect } from 'chai';
import libReport from 'istanbul-lib-report';
import LcovOnlyReport from 'istanbul-reports/lib/lcovonly';
import { SinonSandbox, SinonStub, createSandbox } from 'sinon';
import { LcovCoverageReporter } from '../../../src/results/lcov/LcovCoverageReporter';

jest.mock('@salesforce/apex-node');

describe('LcovCoverageReporter', () => {
  let sandbox: SinonSandbox;
  let executeStub: SinonStub;
  let localizeStub: SinonStub;
  let contextStub: SinonStub;

  beforeEach(() => {
    sandbox = createSandbox();

    executeStub = sandbox.stub(LcovOnlyReport.prototype, 'execute');
    localizeStub = sandbox.stub(nls, 'localize').returnsArg(0);
    contextStub = sandbox.stub(libReport, 'createContext');
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should generate reports', () => {
    new LcovCoverageReporter(
      {
        done: true,
        records: [
          {
            ApexClassOrTrigger: {
              Id: 'ClassID',
              Name: 'FooClass',
            },
            NumLinesCovered: 3,
            NumLinesUncovered: 3,
            Coverage: { coveredLines: [1, 2, 3], uncoveredLines: [4, 5, 6] },
          },
        ],
        totalSize: 1,
      },
      '/abs/dirBase/coverage',
      'projectRoot'
    ).generateReports();

    expect(contextStub.calledOnce).to.be.true;
    expect(contextStub.args[0][0]).to.deep.equal({
      dir: '/abs/dirBase/coverage',
      defaultSummarizer: 'nested',
      watermarks: DefaultWatermarks,
      coverageMap: undefined,
    });
    expect(executeStub.calledOnce).to.be.true;
    expect(localizeStub.called).to.be.false;
  });

  it('should report errors', () => {
    contextStub.throws(new Error('context error'));

    const reporter = new LcovCoverageReporter(
      {
        done: true,
        records: [
          {
            ApexClassOrTrigger: {
              Id: 'ClassID',
              Name: 'FooClass',
            },
            NumLinesCovered: 3,
            NumLinesUncovered: 3,
            Coverage: { coveredLines: [1, 2, 3], uncoveredLines: [4, 5, 6] },
          },
        ],
        totalSize: 1,
      },
      '/abs/dirBase/coverage',
      'projectRoot'
    );

    expect(() => reporter.generateReports()).to.throw(
      'coverageReportCreationError'
    );

    expect(contextStub.calledOnce).to.be.true;
    expect(localizeStub.called).to.be.true;
    expect(executeStub.calledOnce).to.be.false;
  });
});
