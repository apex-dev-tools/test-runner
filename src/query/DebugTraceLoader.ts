/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */

import { Connection } from '@salesforce/core';
import { RecordResult, SfDate } from 'jsforce';
import { QueryHelper } from './QueryHelper';

export interface TraceFlag {
  Id: string;
}

export interface DebugLevel {
  Id: string;
}

export class DebugTraceLoader {
  helper: QueryHelper;
  namespace: string;
  traces: TraceFlag[];

  static async instance(
    connection: Connection,
    namespace: string
  ): Promise<DebugTraceLoader> {
    const qh = QueryHelper.instance(connection);
    const traces = (
      await qh.run(c => c.tooling.query<TraceFlag>('Select Id FROM TraceFlag'))
    ).records;

    return new DebugTraceLoader(qh, namespace, traces);
  }

  private constructor(
    helper: QueryHelper,
    namespace: string,
    traces: TraceFlag[]
  ) {
    this.helper = helper;
    this.namespace = namespace;
    this.traces = traces;
  }

  async resetFlags(userId: string): Promise<void> {
    await this.clearFlags();
    await this.setFlags(userId);
  }

  async clearFlags(): Promise<void> {
    await this.helper.run(c =>
      c.tooling.sobject('TraceFlag').delete(this.traces.map(trace => trace.Id))
    );

    const levels = (
      await this.helper.run(c =>
        c.tooling.query<DebugLevel>(
          "Select Id FROM DebugLevel WHERE DeveloperName= 'TestRunner'"
        )
      )
    ).records;
    if (levels.length > 0) {
      await this.helper.run(c =>
        c.tooling.sobject('DebugLevel').delete(levels.map(level => level.Id))
      );
    }
  }

  async setFlags(userId: string): Promise<void> {
    const level = (await this.helper.run(c =>
      c.tooling.create('DebugLevel', {
        MasterLabel: 'TestRunner',
        DeveloperName: 'TestRunner',
        ApexCode: 'FINE',
        ApexProfiling: 'NONE',
        Callout: 'NONE',
        Database: 'FINE',
        System: 'NONE',
        Validation: 'NONE',
        Visualforce: 'NONE',
        Workflow: 'NONE',
      })
    )) as RecordResult;
    if (level.success) {
      const start = Date.now();
      const end = start + 86400000 - 1000;
      await this.helper.run(c =>
        c.tooling.create('TraceFlag', {
          DebugLevelId: level.id,
          StartDate: SfDate.toDateTimeLiteral(start).toString(),
          ExpirationDate: SfDate.toDateTimeLiteral(end).toString(),
          LogType: 'USER_DEBUG',
          TracedEntityId: userId,
        })
      );
    }
  }
}
