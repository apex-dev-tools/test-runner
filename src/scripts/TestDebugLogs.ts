#!/usr/bin/env node
/* istanbul ignore file */
/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */

import { Connection, AuthInfo } from '@apexdevtools/sfdx-auth-helper';
import { ConsoleLogger } from './ConsoleLogger';
import { TestDebugLogs } from '../command/TestDebugLogs';

async function getConnection(username: string): Promise<Connection> {
  return await Connection.create({
    authInfo: await AuthInfo.create({ username: username }),
  });
}

async function run(
  username: string,
  namespace: string,
  outputDir: string,
  testClasses: string[]
): Promise<void> {
  const connection = await getConnection(username);
  const logger = new ConsoleLogger(connection, false);
  await TestDebugLogs.run(
    logger,
    connection,
    namespace,
    username,
    outputDir,
    testClasses
  );
}

if (process.argv.length != 5 && process.argv.length != 6) {
  console.log(
    'TestDebugLogs <username> <namespace> <outputdir> [<test classes>]'
  );
} else {
  const testClassesArg = process.argv[5] || '';
  const testClasses = testClassesArg.split(',').map(cls => cls.trim());
  run(process.argv[2], process.argv[3], process.argv[4], testClasses)
    .then(() => {
      console.log('Complete');
    })
    .catch(err => {
      console.log(err);
    });
}
