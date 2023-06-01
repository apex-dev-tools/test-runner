#!/usr/bin/env node
/* istanbul ignore file */
/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */

import { Connection, AuthInfo } from '@salesforce/core';
import { OrgTestMethodCollector } from '../collector/OrgTestMethodCollector';
import { Testall } from '../command/Testall';
import { ClassTimeGenerator } from '../results/ClassTimeGenerator';
import { ExecutionMapGenerator } from '../results/ExecutionMapGenerator';
import { ReportGenerator } from '../results/ReportGenerator';
import { AsyncTestRunner } from '../runner/TestRunner';
import { ConsoleLogger } from './ConsoleLogger';

async function getConnection(username: string): Promise<Connection> {
  return await Connection.create({
    authInfo: await AuthInfo.create({ username: username }),
  });
}

async function runTestall(username: string, namespace: string) {
  const connection = await getConnection(username);
  const reportGenerator = new ReportGenerator(
    'url',
    'orgId',
    'username',
    'suitename'
  );
  const classTimeGenerator = new ClassTimeGenerator('url', 'orgId', 'username');
  const executionMapGenerator = new ExecutionMapGenerator(
    'url',
    'orgId',
    'username'
  );

  const logger = new ConsoleLogger();
  const methodCollector = new OrgTestMethodCollector(
    logger,
    connection,
    namespace,
    []
  );
  const runner = new AsyncTestRunner(logger, connection, [], {
    testRunTimeoutMins: 240,
  });
  try {
    await Testall.run(
      logger,
      connection,
      namespace == 'unmanaged' ? '' : namespace,
      methodCollector,
      runner,
      [reportGenerator, classTimeGenerator, executionMapGenerator],
      {}
    );
  } catch (err) {
    // only log errors
  }
}

if (process.argv.length != 4) {
  console.log('Testall <username> <namespace>');
} else {
  runTestall(process.argv[2], process.argv[3])
    .then(() => {
      console.log('Complete');
    })
    .catch(err => {
      console.log(err);
    });
}
