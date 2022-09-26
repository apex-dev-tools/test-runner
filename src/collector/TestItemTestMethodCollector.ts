/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */
import { Connection } from '@apexdevtools/sfdx-auth-helper';
import { TestItem } from '@salesforce/apex-node';
import { Logger } from '../log/Logger';
import {
  classIdNameMapFromNames,
  TestMethodCollector,
} from './TestMethodCollector';

export class TestItemTestMethodCollector implements TestMethodCollector {
  logger: Logger;
  connection: Connection;
  namespace: string;
  testItems: TestItem[];

  constructor(
    logger: Logger,
    connection: Connection,
    namespace: string,
    testItems: TestItem[]
  ) {
    this.logger = logger;
    this.connection = connection;
    this.namespace = namespace;
    this.testItems = testItems;
  }

  classIdNameMap(): Promise<Map<string, string>> {
    return classIdNameMapFromNames(
      this.testItems.map(item => item.className as string),
      this.connection,
      this.namespace
    );
  }

  gatherTestMethods(): Promise<Map<string, Set<string>>> {
    const testMethods = new Map<string, Set<string>>();
    this.testItems.forEach(item => {
      const className = item.className as string;
      const testMethod = (item.testMethods as string[])[0];
      if (!testMethods.has(className)) testMethods.set(className, new Set());
      testMethods.get(className)?.add(testMethod);
    });
    return Promise.resolve(testMethods);
  }
}
