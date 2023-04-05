/*
 * Copyright (c) 2023, FinancialForce.com, inc. All rights reserved.
 */

import { OutputGenerator, TestRunSummary } from './OutputGenerator';
import { Logger } from '../log/Logger';
import { CoverageReporter as ApexNodeCoverageReporter } from '@salesforce/apex-node';
import path from 'path';
import fs from 'fs';

/*
 * Create a lcov.info coverage report of the given test run summary. If there is no data available nothing will be
 * generated
 */
export class CoverageReporter implements OutputGenerator {
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  public generate(
    _logger: Logger,
    outputDirBase: string,
    _fileName: string,
    summary: TestRunSummary
  ): void {
    if (summary.coverageResult) {
      const fileBase = path.join(outputDirBase, 'coverage');
      const abs = path.resolve(fileBase);
      fs.mkdirSync(abs, { recursive: true });
      const records = {
        done: true,
        totalSize: summary.coverageResult.data.length,
        records: summary.coverageResult.data,
      };
      new ApexNodeCoverageReporter(records, fileBase, this.projectRoot, {
        reportFormats: ['lcovonly'],
        reportOptions: {
          lcovonly: {
            projectRoot: this.projectRoot,
            file: 'lcov.info',
          },
        },
      }).generateReports();
    }
  }
}
