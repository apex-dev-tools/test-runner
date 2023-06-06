/*
 * Copyright (c) 2023, Certinia Inc. All rights reserved.
 */

// for directly importing and using the lcov reporter
declare module 'istanbul-reports/lib/lcovonly' {
  import { ReportBase } from 'istanbul-lib-report';
  import { LcovOnlyOptions } from 'istanbul-reports';

  export default class LcovOnlyReport extends ReportBase {
    constructor(opts?: LcovOnlyOptions);
  }
}
