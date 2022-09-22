#!/usr/bin/env node
/* istanbul ignore file */
/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */

import { Connection, AuthInfo } from '@apexdevtools/sfdx-auth-helper';
import { OrgTestMethodCollector } from '../collector/OrgTestMethodCollector';
import { ConsoleLogger } from './ConsoleLogger';

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
