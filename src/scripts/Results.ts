#!/usr/bin/env node
/* istanbul ignore file */
/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */

import { ResultCollector } from '../collector/ResultCollector';
import { Connection, AuthInfo } from '@salesforce/core';

async function getConnection(username: string): Promise<Connection> {
  return await Connection.create({
    authInfo: await AuthInfo.create({ username: username }),
  });
}

async function gatherResults(username: string, testRunId: string) {
  return await ResultCollector.gatherResults(
    await getConnection(username),
    testRunId
  );
}

if (process.argv.length != 4) {
  console.log('Results <username> <testRunId>');
} else {
  gatherResults(process.argv[2], process.argv[3])
    .then(results => {
      console.log(results.length);
    })
    .catch(err => {
      console.log(err);
    });
}
