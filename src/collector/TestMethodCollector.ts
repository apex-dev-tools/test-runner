/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */

import { Connection } from '@salesforce/core';
import { QueryHelper } from '../query/QueryHelper';
import { ApexClassInfo } from '../query/ClassSymbolLoader';
import { chunk } from '../query/Chunk';
import { Logger } from '../log/Logger';

export abstract class TestMethodCollector {
  logger: Logger;
  connection: Connection;
  namespace: string;

  constructor(logger: Logger, connection: Connection, namespace: string) {
    this.logger = logger;
    this.connection = connection;
    this.namespace = namespace;
  }

  abstract classIdNameMap(): Promise<Map<string, string>>;
  abstract gatherTestMethods(
    abort: () => boolean
  ): Promise<Map<string, Set<string>>>;

  async classIdNameMapFromNames(
    classNames: string[]
  ): Promise<Map<string, string>> {
    let apexClasses: ApexClassInfo[] = [];

    if (classNames.length == 0) {
      apexClasses = await QueryHelper.instance(
        this.connection
      ).query<ApexClassInfo>(
        'ApexClass',
        `NamespacePrefix=${
          this.namespace === '' ? 'null' : `'${this.namespace}'`
        }`,
        'Id, Name'
      );
    } else {
      const chunks = chunk(classNames, 200);
      for (const chunk of chunks) {
        const classes = chunk.map(name => `'${name}'`).join(', ');
        apexClasses = apexClasses.concat(
          await QueryHelper.instance(this.connection).query<ApexClassInfo>(
            'ApexClass',
            `NamespacePrefix=${
              this.namespace === '' ? 'null' : `'${this.namespace}'`
            } ${classes.length > 0 ? `AND Name in (${classes})` : ''}`,
            'Id, Name'
          )
        );
      }
    }

    return new Map(apexClasses.map(record => [record.Id, record.Name]));
  }
}
