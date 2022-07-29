#!/usr/bin/env node
/* istanbul ignore file */

import { Connection, AuthInfo, fs } from '@apexdevtools/sfdx-auth-helper';
import { OrgTestMethodCollector } from '../collector/TestMethodCollector';
import { Testall } from '../command/Testall';
import { BaseLogger } from '../log/BaseLogger';
import ReportGenerator from '../results/ReportGenerator';
import { AsyncTestRunner } from '../runner/TestRunner';

async function getConnection(username: string): Promise<Connection> {
  return await Connection.create({
    authInfo: await AuthInfo.create({ username: username }),
  });
}

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

async function runTestall(username: string, namespace: string) {
  const connection = await getConnection(username);
  const generator = new ReportGenerator(
    'url',
    'orgId',
    'username',
    'suitename'
  );
  const logger = new ConsoleLogger(connection, false);
  const methodCollector = new OrgTestMethodCollector(
    logger,
    connection,
    namespace,
    []
  );
  const runner = new AsyncTestRunner(logger, connection, [], {
    testRunTimeoutMins: 240,
  });
  await Testall.run(
    logger,
    connection,
    namespace == 'unmanaged' ? '' : namespace,
    methodCollector,
    runner,
    generator,
    {}
  );
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
