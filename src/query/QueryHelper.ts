/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */
import { Connection } from '@apexdevtools/sfdx-auth-helper';
import { Record } from 'jsforce';
import { Logger } from '../log/Logger';

type QueryFunction<T> = (
  sobject: string,
  clause: string,
  fields: string
) => Promise<Record<T>[]>;

const DEFAULT_QUERY_MAX_RETRIES = 3;
const DEFAULT_QUERY_RETRY_INTERVAL_MS = 30000;

export interface QueryOptions {
  maxQueryRetries?: number; // Maximum number of times to retry queries that support it, default 3
  queryInitialIntervalMs?: number; // First delay after query fail - doubles every retry, default 30 secs
}

export function getQueryInitialIntervalMs(options: QueryOptions): number {
  if (
    options.queryInitialIntervalMs !== undefined &&
    options.queryInitialIntervalMs >= 0
  )
    return options.queryInitialIntervalMs;
  else return DEFAULT_QUERY_RETRY_INTERVAL_MS;
}

export function getMaxQueryRetries(options: QueryOptions): number {
  if (options.maxQueryRetries !== undefined && options.maxQueryRetries >= 0)
    return options.maxQueryRetries;
  else return DEFAULT_QUERY_MAX_RETRIES;
}

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

  queryWithRetry<T>(logger: Logger, options: QueryOptions): QueryFunction<T> {
    const retries = getMaxQueryRetries(options);
    const delay = getQueryInitialIntervalMs(options);

    return async (sobject: string, clause: string, fields: string) => {
      const boundQuery = this.query.bind<
        this,
        string,
        string,
        string,
        [],
        Promise<Record<T>[]>
      >(this, sobject, clause, fields);

      try {
        // await required to catch errors
        return await this.doRetry(logger, boundQuery, retries, delay);
      } catch (err) {
        logger.logMessage(
          `Request failed after ${retries} retries. Cause: ${this.getErrorCause(
            err
          )}`
        );

        throw err;
      }
    };
  }

  private async doRetry<T>(
    logger: Logger,
    boundFn: () => Promise<T>,
    retries: number,
    delay: number
  ): Promise<T> {
    try {
      // await required to catch errors
      return await boundFn();
    } catch (err) {
      if (retries > 0) {
        logger.logMessage(
          `Request failed, waiting ${
            delay / 1000
          } seconds before trying again. Cause: ${this.getErrorCause(err)}`
        );
        await new Promise(r => setTimeout(r, delay));
        return this.doRetry(logger, boundFn, retries - 1, delay * 2);
      }

      throw err;
    }
  }

  private getErrorCause(err: unknown): string {
    let cause = 'Unknown';
    if (err instanceof Error) {
      cause = err.message;
    } else if (typeof err == 'string') {
      cause = err;
    }
    return cause;
  }
}
