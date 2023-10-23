/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */
import { Connection } from '@salesforce/core';
import { TestItem } from '@salesforce/apex-node';
import { Logger } from '../log/Logger';
import { TestMethodCollector } from './TestMethodCollector';

export class TestItemTestMethodCollector extends TestMethodCollector {
  testItems: TestItem[];

  constructor(
    logger: Logger,
    connection: Connection,
    namespace: string,
    testItems: TestItem[]
  ) {
    super(logger, connection, namespace);
    this.testItems = testItems;
  }

  classIdNameMap(): Promise<Map<string, string>> {
    return this.classIdNameMapFromNames(
      this.testItems.map(item => item.className as string)
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
