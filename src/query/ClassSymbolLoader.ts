/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */

import { escapeXml } from '@salesforce/apex-node/lib/src/utils/authUtil';
import { Logger } from '../log/Logger';
import { QueryHelper } from '../query/QueryHelper';
import * as util from 'util';
import { TestError } from '../runner/TestError';
import { SymbolTable } from '../model/SymbolTable';
import { RequestInfo } from 'jsforce';

export interface ApexClassInfo {
  Id: string;
  Name: string;
  SymbolTable: SymbolTable | null;
}

export const MAX_SYMBOLS_CHUNK_SIZE = 50;

export class ClassSymbolLoader {
  private logger: Logger;
  private queryHelper: QueryHelper;
  private namespace: string;

  constructor(logger: Logger, queryHelper: QueryHelper, namespace: string) {
    this.logger = logger;
    this.queryHelper = queryHelper;
    this.namespace = namespace;
  }

  /*
   * This loads SymbolTables for the provided class ids.
   * The ApexClass SymbolTable is sometimes missing when you query with REST.
   * We can't query for the SymbolTable in SOAP for unknown reasons, but querying
   * for the Body via SOAP is known to cause that to be regenerated if it was
   * missing, and as a side effect that will make sure we can always get the
   * SymbolTable with a REST query. The reason the fields are sometimes not available
   * appears to be something to do with caching. Yep, the Tooling API is Kafkaesque.
   * P.S. You need to load in small chunks, too many and the queries silently fail to
   * do what you ask.
   */
  public async load(classIds: string[]): Promise<ApexClassInfo[]> {
    const results: ApexClassInfo[] = [];
    const failedIds: string[] = [];

    if (classIds.length > MAX_SYMBOLS_CHUNK_SIZE)
      throw new TestError(
        `Too many class symbol tables requested, ${classIds.length}, limit is ${MAX_SYMBOLS_CHUNK_SIZE}`
      );

    // Gather initially available symbol tables
    const classInfo = await this.queryApexClassesWithSymbolsREST(classIds);
    classInfo.forEach(cls => {
      if (cls.SymbolTable == null) {
        failedIds.push(cls.Id);
      } else {
        results.push(cls);
      }
    });

    // See comment above for why we don't care about return on this
    if (failedIds.length > 0) {
      await this.queryApexClassesWithBodySOAP(failedIds);

      // Try again for missing SymbolTables
      const classInfoAgain = await this.queryApexClassesWithSymbolsREST(
        failedIds
      );
      let missing = 0;
      classInfoAgain.forEach(cls => {
        if (cls.SymbolTable == null) {
          missing += 1;
        }
        results.push(cls);
      });
      if (missing > 0)
        this.logger.logWarning(
          `Failed to find symbol tables for ${missing} classes`
        );
    }

    return results;
  }

  private async queryApexClassesWithSymbolsREST(
    classIds: string[]
  ): Promise<ApexClassInfo[]> {
    const idClause = classIds.map(id => `'${id}'`).join(', ');
    const apexClasses = await this.queryHelper.query<ApexClassInfo>(
      'ApexClass',
      `Id IN (${idClause})`,
      'Id, Name, SymbolTable'
    );
    return apexClasses;
  }

  private async queryApexClassesWithBodySOAP(
    classIds: string[]
  ): Promise<ApexClassInfo[]> {
    const idClause = classIds.map(id => `'${id}'`).join(', ');
    const query = `Select Id, Name, Body from ApexClass Where NamespacePrefix = ${
      this.namespace == '' ? 'null' : `'${this.namespace}'`
    } AND Id in (${idClause})`;
    const result: QueryResponse = await this.queryHelper.run(conn =>
      conn.tooling.request(this.buildQueryRequest(query))
    );
    const envelope = result['soapenv:Envelope'];
    const body = envelope['soapenv:Body'];
    return body.queryResponse.result.records;
  }

  private buildQueryRequest(queryString: string): RequestInfo {
    const conn = this.queryHelper.connection;
    const body = util.format(
      soapTemplate,
      conn.accessToken,
      escapeXml(queryString)
    );
    const postEndpoint = `${conn.instanceUrl}/services/Soap/u/${conn.version}`;
    const requestHeaders = {
      'content-type': 'text/xml',
      SOAPAction: 'x',
    };
    const request = {
      method: 'POST',
      url: postEndpoint,
      body,
      headers: requestHeaders,
    };

    return request;
  }
}

export interface QueryResponse {
  ['soapenv:Envelope']: {
    ['soapenv:Body']: {
      queryResponse: {
        result: {
          records: ApexClassInfo[];
        };
      };
    };
  };
}

const soapTemplate = `<env:Envelope xmlns:xsd="http://www.w3.org/2001/XMLSchema"
    xmlns:env="http://schemas.xmlsoap.org/soap/envelope/"
    xmlns:urn="urn:partner.soap.sforce.com">
    <env:Header>
        <urn:SessionHeader>
            <urn:sessionId>%s</urn:sessionId>
        </urn:SessionHeader>
    </env:Header>
    <env:Body>
        <urn:query>
            <urn:queryString>
                %s
            </urn:queryString>        
        </urn:query>
    </env:Body>
</env:Envelope>`;
