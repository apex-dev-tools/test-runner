/*
 * Copyright (c) 2023, Certinia Inc. All rights reserved.
 */

import {
  ApexCodeCoverageAggregate,
  CoverageReporter,
  DefaultWatermarks,
} from '@salesforce/apex-node';
import { nls } from '@salesforce/apex-node/lib/src/i18n';
import * as libCoverage from 'istanbul-lib-coverage';
import * as libReport from 'istanbul-lib-report';
import { LcovOnlyOptions } from 'istanbul-reports';
import LcovOnlyReport from 'istanbul-reports/lib/lcovonly';

/*
 * istanbul-reports/index.js uses dynamic require to load different report types.
 *
 * It does not work with webpack since it needs the require to start with a string
 * to get a minimum context. To work around this we import the reporter we need directly.
 */

export class LcovCoverageReporter extends CoverageReporter {
  private readonly dir: string;
  private readonly lcovOptions: LcovOnlyOptions;

  constructor(
    coverage: ApexCodeCoverageAggregate,
    reportDir: string,
    sourceDir: string
  ) {
    super(coverage, reportDir, sourceDir);

    this.dir = reportDir;
    this.lcovOptions = {
      projectRoot: sourceDir,
      file: 'lcov.info',
    };
  }

  public generateReports(): void {
    try {
      new LcovOnlyReport(this.lcovOptions).execute(
        libReport.createContext({
          dir: this.dir,
          defaultSummarizer: 'nested',
          watermarks: DefaultWatermarks,
          coverageMap: this.getCoverageMap(),
        })
      );
    } catch (e) {
      if (e instanceof Error) {
        e.message = this.localizeErrorMessage(e.message);
        throw e;
      }
    }
  }

  public getCoverageMap(): libCoverage.CoverageMap {
    // apex-node private method needs to be called
    // type checking must be disabled to access

    //@ts-ignore
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return
    return this.buildCoverageMap();
  }

  public localizeErrorMessage(message: string): string {
    return nls.localize('coverageReportCreationError', message);
  }
}
