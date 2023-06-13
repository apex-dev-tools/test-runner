/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */
/* istanbul ignore file */
import { BaseLogger } from '../log/BaseLogger';
import * as fs from 'fs';
import path from 'path';

export class ConsoleLogger extends BaseLogger {
  constructor(verbose = false) {
    super('./test-results', verbose);
  }

  public logMessage(message: string): void {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} - ${message}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected logFile(filepath: string, contents: string): void {
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    fs.writeFileSync(filepath, contents);
  }
}
