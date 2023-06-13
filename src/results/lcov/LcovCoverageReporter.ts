/*
 * Copyright (c) 2023, Certinia Inc. All rights reserved.
 */

import {
  ApexCodeCoverageAggregate,
  CoverageReporter,
  DefaultWatermarks,
} from '@salesforce/apex-node';
import { nls } from '@salesforce/apex-node/lib/src/i18n';
import { CoverageMap } from 'istanbul-lib-coverage';
import { createContext, Context } from 'istanbul-lib-report';
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
      new LcovOnlyReport(this.lcovOptions).execute(this.getContext());
    } catch (e) {
      if (e instanceof Error) {
        e.message = this.localizeErrorMessage(e.message);
        throw e;
      }
    }
  }

  public getContext(): Context {
    // apex-node private method needs to be called
    // type checking must be disabled to access

    //@ts-ignore
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const coverageMap: CoverageMap = this.buildCoverageMap();

    return createContext({
      dir: this.dir,
      defaultSummarizer: 'nested',
      watermarks: DefaultWatermarks,
      coverageMap,
    });
  }

  public localizeErrorMessage(message: string): string {
    return nls.localize('coverageReportCreationError', message);
  }
}
