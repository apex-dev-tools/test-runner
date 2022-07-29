#!/usr/bin/env node
/* istanbul ignore file */
/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */

import { Connection, AuthInfo } from '@apexdevtools/sfdx-auth-helper';
import { OrgTestMethodCollector } from '../collector/TestMethodCollector';
import { BaseLogger } from '../log/BaseLogger';
import * as fs from 'fs';

class ConsoleLogger extends BaseLogger {
  protected logMessage(message: string): void {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} - ${message}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected logFile(path: string, contents: string): void {
    fs.writeFileSync(path, contents);
  }
}

async function getConnection(username: string): Promise<Connection> {
  return await Connection.create({
    authInfo: await AuthInfo.create({ username: username }),
  });
}

async function gatherTestMethods(username: string, namespace: string) {
  const connection = await getConnection(username);
  const collector = new OrgTestMethodCollector(
    new ConsoleLogger(connection, false),
    connection,
    namespace == 'unmanaged' ? '' : namespace,
    []
  );
  return await collector.gatherTestMethods();
}

if (process.argv.length != 4) {
  console.log('TestMethod <username> <namespace>');
} else {
  gatherTestMethods(process.argv[2], process.argv[3])
    .then(results => {
      console.log(results);
    })
    .catch(err => {
      console.log(err);
    });
}
