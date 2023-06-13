/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */

import { Connection } from '@salesforce/core';
import { QueryHelper } from '../query/QueryHelper';
import { ApexClassInfo } from '../query/ClassSymbolLoader';
import { chunk } from '../query/Chunk';

export interface TestMethodCollector {
  classIdNameMap(): Promise<Map<string, string>>;
  gatherTestMethods(abort: () => boolean): Promise<Map<string, Set<string>>>;
}

export async function classIdNameMapFromNames(
  classNames: string[],
  connection: Connection,
  namespace: string
): Promise<Map<string, string>> {
  let apexClasses: ApexClassInfo[] = [];

  if (classNames.length == 0) {
    apexClasses = await QueryHelper.instance(connection).query<ApexClassInfo>(
      'ApexClass',
      `NamespacePrefix=${namespace === '' ? 'null' : `'${namespace}'`}`,
      'Id, Name'
    );
  } else {
    const chunks = chunk(classNames, 200);
    for (const chunk of chunks) {
      const classes = chunk.map(name => `'${name}'`).join(', ');
      apexClasses = apexClasses.concat(
        await QueryHelper.instance(connection).query<ApexClassInfo>(
          'ApexClass',
          `NamespacePrefix=${namespace === '' ? 'null' : `'${namespace}'`} ${
            classes.length > 0 ? `AND Name in (${classes})` : ''
          }`,
          'Id, Name'
        )
      );
    }
  }

  return new Map(apexClasses.map(record => [record.Id, record.Name]));
}
