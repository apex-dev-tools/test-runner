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
  helper: QueryHelper;
  namespace: string;
  logs: ApexLog[];

  static async instance(
    connection: Connection,
    namespace: string
  ): Promise<DebugLogLoader> {
    const qh = QueryHelper.instance(connection);
    const logs = await qh.query<ApexLog>(
      'ApexLog',
      '',
      'Id, LogLength, Status'
    );
    return new DebugLogLoader(qh, namespace, logs);
  }

  private constructor(helper: QueryHelper, namespace: string, logs: ApexLog[]) {
    this.helper = helper;
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
    const baseUrl = this.helper.connection.tooling._baseUrl();
    const url = `${baseUrl}/sobjects/ApexLog/${logId}/Body`;
    return await this.helper.run(c => c.tooling.request(url));
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
    await this.helper.run(c =>
      c.sobject('ApexLog').destroy(this.logs.map(log => log.Id))
    );
    this.logs = [];
  }
}
