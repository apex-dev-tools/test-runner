/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */

import { AuthHelper } from '@apexdevtools/sfdx-auth-helper';
import { Connection as JSForceConnection, Record, RequestInfo } from 'jsforce';
import { Logger } from '../log/Logger';
import { Connection } from '@salesforce/core';
import { retry } from '../runner/Poll';
import { TestError, TestErrorKind } from '../runner/TestError';

export interface QueryOptions {
  maxQueryRetries?: number; // Maximum number of times to retry queries
  queryInitialIntervalMs?: number; // First delay after query fail - doubles every retry
}

export class QueryHelper {
  // Until we can upgrade to new jsforce / core types
  // use fallback jsforce v1
  connection: JSForceConnection;
  retryConfig: { delay?: number; retries?: number };
  logger?: Logger;

  static create(
    connection: Connection,
    logger?: Logger,
    options: QueryOptions = {}
  ): QueryHelper {
    const jsforce = AuthHelper.toJsForceConnection(connection);
    return new QueryHelper(jsforce, options, logger);
  }

  private constructor(
    connection: JSForceConnection,
    options: QueryOptions,
    logger?: Logger
  ) {
    this.connection = connection;
    this.retryConfig = {
      retries: options.maxQueryRetries,
      delay: options.queryInitialIntervalMs,
    };
    this.logger = logger;
  }

  async request<T>(req: string | RequestInfo): Promise<T> {
    return await this.retryFn(async () =>
      this.connection.tooling.request<T>(req)
    );
  }

  async query<T>(
    sobject: string,
    clause: string,
    fields: string
  ): Promise<Record<T>[]> {
    return await this.retryFn(async () =>
      this.connection.tooling
        .sobject(sobject)
        .find<T>(clause, fields)
        .execute({ autoFetch: true, maxFetch: 100000 })
    );
  }

  private async retryFn<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return retry(fn, this.logger, this.retryConfig);
    } catch (err) {
      throw TestError.wrapError(err, TestErrorKind.Query);
    }
  }
}
