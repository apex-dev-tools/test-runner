/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */
import { Connection } from '@apexdevtools/sfdx-auth-helper';
import { Record } from 'jsforce';

/* This is just to make mocking easier */
export class QueryHelper {
  static helpers = new Map<Connection, QueryHelper>();
  connection: Connection;

  static instance(connection: Connection): QueryHelper {
    let helper = this.helpers.get(connection);
    if (helper == undefined) {
      helper = new QueryHelper(connection);
      this.helpers.set(connection, helper);
    }
    return helper;
  }

  private constructor(connection: Connection) {
    this.connection = connection;
  }

  async query<T>(
    sobject: string,
    clause: string,
    fields: string
  ): Promise<Record<T>[]> {
    return this.connection
      .sobject(sobject)
      .find<T>(clause, fields)
      .execute({ autoFetch: true, maxFetch: 100000 });
  }
}
