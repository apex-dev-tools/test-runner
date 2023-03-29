/*
 * Copyright (c) 2023, FinancialForce.com, inc. All rights reserved.
 */

import { OutputGenerator, TestRunSummary } from './OutputGenerator';
import { Logger } from '../log/Logger';
import { CoverageReporter as ApexNodeCoverageReporter } from '@salesforce/apex-node';
import path from 'path';

export class CoverageReporter implements OutputGenerator {
  private projectRoot: string;
  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }
  public generate(
    logger: Logger,
    outputFileBase: string,
    summary: TestRunSummary
  ): void {
    if (summary.coverageResult) {
      const fileBase = path.join(outputFileBase, 'coverage');
      const records = {
        done: true,
        totalSize: summary.coverageResult.data.length,
        records: summary.coverageResult.data,
      };
      new ApexNodeCoverageReporter(records, fileBase, this.projectRoot, {
        reportFormats: ['lcov'],
        reportOptions: {
          lcov: {
            projectRoot: this.projectRoot,
            file: 'lcov.info',
          },
        },
      }).generateReports();
    }
  }
}
