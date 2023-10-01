/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */

import { Connection } from '@salesforce/core';
import { Logger } from '../log/Logger';
import { TestItem } from '@salesforce/apex-node';
import { TestRunner } from '../runner/TestRunner';
import { TestItemTestMethodCollector } from '../collector/TestItemTestMethodCollector';
import { Testall } from './Testall';
import { DebugTraceLoader } from '../query/DebugTraceLoader';
import { DebugLogLoader } from '../query/DebugLogLoader';
import * as fs from 'fs';
import { QueryHelper } from '../query/QueryHelper';
import { TestMethodCollector } from '../collector/TestMethodCollector';
import { TestError } from '../runner/TestError';

export class TestDebugLogs {
  _logger: Logger;
  _connection: Connection;
  _namespace: string;
  _username: string;
  _outputDir: string;

  public static async run(
    logger: Logger,
    connection: Connection,
    namespace: string,
    methodCollector: TestMethodCollector,
    runner: TestRunner,
    username: string,
    outputDir: string
  ): Promise<void> {
    try {
      const cmd = new TestDebugLogs(
        logger,
        connection,
        namespace,
        username,
        outputDir
      );
      await cmd.run(methodCollector, runner);
    } catch (e) {
      logger.logError(e);
    }
  }

  private constructor(
    logger: Logger,
    connection: Connection,
    namespace: string,
    username: string,
    outputDir: string
  ) {
    this._logger = logger;
    this._connection = connection;
    this._namespace = namespace;
    this._outputDir = outputDir;
    this._username = username;
  }

  public async run(
    methodCollector: TestMethodCollector,
    runner: TestRunner
  ): Promise<void> {
    const userId = await this.getUserId(this._username, this._connection);
    this.clearOutputDir(this._outputDir);

    const traceLoader = await DebugTraceLoader.instance(
      this._connection,
      this._namespace
    );
    if (traceLoader.traces.length > 0)
      this._logger.logMessage(
        `Clearing ${traceLoader.traces.length} trace flags`
      );
    await traceLoader.resetFlags(userId);

    const logLoader = await DebugLogLoader.instance(
      this._connection,
      this._namespace
    );
    if (logLoader.logs.length > 0) {
      this._logger.logMessage(`Clearing ${logLoader.logs.length} debug logs`);
      await logLoader.clearLogs();
    }

    this._logger.logMessage(
      'Collecting test methods, this may take some time...'
    );
    const testMethodMap = await methodCollector.gatherTestMethods(() => false);
    this._logger.logMessage(`Found ${testMethodMap.size} test classes`);

    while (testMethodMap.size > 0) {
      const testClasses = Array.from(testMethodMap.keys());
      testClasses.sort((a, b) => a.localeCompare(b));
      const testItems: TestItem[] = [];
      for (let i = 0; i < Math.min(testClasses.length, 50); i++) {
        const className = testClasses[i];
        const testMethods = testMethodMap.get(className) as Set<string>;
        const [testMethod] = testMethods.values();
        testItems.push({ className: className, testMethods: [testMethod] });

        testMethods.delete(testMethod);
        if (testMethods.size == 0) {
          testMethodMap.delete(className);
          this._logger.logMessage(`Queued all of method of class ${className}`);
        } else {
          testMethodMap.set(className, testMethods);
        }
      }

      await this.runTestItems(
        this._logger,
        this._connection,
        this._namespace,
        runner,
        testItems
      );

      const resultLogLoader = await DebugLogLoader.instance(
        this._connection,
        this._namespace
      );
      await resultLogLoader.saveLogs(this._outputDir);
      await resultLogLoader.clearLogs();
    }
  }

  clearOutputDir(outputDir: string): void {
    if (!fs.existsSync(outputDir)) {
      this._logger.logMessage(`Creating output directory '${outputDir}'`);
      fs.mkdirSync(outputDir);
    } else if (fs.lstatSync(outputDir).isDirectory()) {
      this._logger.logMessage(
        `Removing & recreating output directory '${outputDir}'`
      );
      fs.rmSync(outputDir, { recursive: true });
      fs.mkdirSync(outputDir);
    } else {
      throw new TestError(
        `Output directory '${outputDir}' exists but is not a directory`
      );
    }
  }

  async getUserId(username: string, connection: Connection): Promise<string> {
    const users = await QueryHelper.instance(connection).query(
      'User',
      "Username = '${username}'",
      'Id'
    );
    if (users.length == 1) {
      return users[0].Id as string;
    } else {
      throw new TestError(`Unknown user '${username}' on this org`);
    }
  }

  async runTestItems(
    logger: Logger,
    connection: Connection,
    namespace: string,
    runner: TestRunner,
    testItems: TestItem[]
  ): Promise<void> {
    const localRunner = runner.newRunner(testItems);
    const runMethodCollector = new TestItemTestMethodCollector(
      logger,
      connection,
      namespace,
      testItems
    );
    await Testall.run(
      logger,
      connection,
      namespace == 'unmanaged' ? '' : namespace,
      runMethodCollector,
      localRunner,
      [],
      {}
    );
  }
}
