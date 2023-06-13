/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */

import { Connection } from '@salesforce/core';
import { QueryHelper } from '../query/QueryHelper';
import * as path from 'path';
import fs from 'fs';

export interface ApexLog {
  Id: string;
  LogLength: number;
  Status: string;
}

export class DebugLogLoader {
  connection: Connection;
  namespace: string;
  logs: ApexLog[];

  static async instance(
    connection: Connection,
    namespace: string
  ): Promise<DebugLogLoader> {
    const logs = await QueryHelper.instance(connection).query<ApexLog>(
      'ApexLog',
      '',
      'Id, LogLength, Status'
    );
    return new DebugLogLoader(connection, namespace, logs);
  }

  private constructor(
    connection: Connection,
    namespace: string,
    logs: ApexLog[]
  ) {
    this.connection = connection;
    this.namespace = namespace;
    this.logs = logs;
  }

  async getLogContents(): Promise<Map<string, string>> {
    const contentById = new Map<string, string>();
    for (let i = 0; i < this.logs.length; i++) {
      const id = this.logs[i].Id;
      contentById.set(id, await this.getLogContentById(id));
    }
    return contentById;
  }

  private async getLogContentById(logId: string): Promise<string> {
    const baseUrl = this.connection.tooling._baseUrl();
    const url = `${baseUrl}/sobjects/ApexLog/${logId}/Body`;
    return await this.connection.tooling.request(url);
  }

  async saveLogs(outputDir: string): Promise<void> {
    const logContents = await this.getLogContents();
    logContents.forEach((contents, id) => {
      const outputPath = path.join(outputDir, `${id}.log`);
      fs.writeFileSync(outputPath, contents);
    });
  }

  async clearLogs(): Promise<void> {
    // @types/jsforce does not have good types for this so just using defaults
    await this.connection
      .sobject('ApexLog')
      .destroy(this.logs.map(log => log.Id));
    this.logs = [];
  }
}
