/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */

import { BaseLogger } from './BaseLogger';

export class CapturingLogger extends BaseLogger {
  entries: string[] = [];
  files: [string, string][] = [];

  constructor(logDirPath = '', verbose = false) {
    super(logDirPath, verbose);
  }

  logMessage(message: string): void {
    const timestamp = new Date().toISOString();
    this.entries.push(`${timestamp} - ${message}`);
  }

  protected logFile(path: string, contents: string): void {
    this.files.push([path, contents]);
  }
}
