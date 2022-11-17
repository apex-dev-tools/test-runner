/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */

import { Connection } from '@apexdevtools/sfdx-auth-helper';
import { Logger } from '../log/Logger';
import {
  ApexClassInfo,
  ClassSymbolLoader,
  MAX_SYMBOLS_CHUNK_SIZE,
} from '../query/ClassSymbolLoader';
import { chunk } from '../query/Chunk';
import {
  classIdNameMapFromNames,
  TestMethodCollector,
} from './TestMethodCollector';

export class OrgTestMethodCollector implements TestMethodCollector {
  logger: Logger;
  connection: Connection;
  namespace: string;
  classNames: string[];

  private classNameById: null | Map<string, string> = null;

  constructor(
    logger: Logger,
    connection: Connection,
    namespace: string,
    classNames: string[]
  ) {
    this.logger = logger;
    this.connection = connection;
    this.namespace = namespace;
    this.classNames = classNames;
  }

  async classIdNameMap(): Promise<Map<string, string>> {
    if (this.classNameById == null) {
      this.classNameById = await classIdNameMapFromNames(
        this.classNames,
        this.connection,
        this.namespace
      );
    }
    return this.classNameById;
  }

  async gatherTestMethods(): Promise<Map<string, Set<string>>> {
    // Query class symbols in chunks
    const loader = new ClassSymbolLoader(
      this.logger,
      this.connection,
      this.namespace
    );

    const classNamesByIds = await this.classIdNameMap();
    const chunks = chunk(
      Array.from(classNamesByIds.keys()),
      MAX_SYMBOLS_CHUNK_SIZE
    );

    let classInfos: ApexClassInfo[] = [];
    for (const chunk of chunks) {
      classInfos = classInfos.concat(await loader.load(chunk));
    }

    // Find test methods on each
    const testMethodsByClassName = new Map<string, Set<string>>();
    for (const classInfo of classInfos) {
      const symbolTable = classInfo.SymbolTable;
      const testMethods = new Set<string>();

      if (
        symbolTable != null &&
        /* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
        symbolTable.tableDeclaration.modifiers.includes('testMethod')
      ) {
        const methods = symbolTable.methods;

        for (let j = 0; j < methods.length; j++) {
          const method = methods[j];

          if (method.modifiers.includes('testMethod')) {
            testMethods.add(method.name);
          }
        }
      }
      /* eslint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
      if (testMethods.size !== 0)
        testMethodsByClassName.set(classInfo.Name, testMethods);
    }

    return testMethodsByClassName;
  }
}