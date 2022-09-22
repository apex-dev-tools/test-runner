/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */
import { BaseLogger } from '../log/BaseLogger';
import * as fs from 'fs';

export class ConsoleLogger extends BaseLogger {
  public logMessage(message: string): void {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} - ${message}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected logFile(path: string, contents: string): void {
    fs.writeFileSync(path, contents);
  }
}
