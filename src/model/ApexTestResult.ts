/*
 * Copyright (c) 2019, FinancialForce.com, inc. All rights reserved.
 */

/*
 Unselected fields:
  ApexLogId: string;
  ApexTestRunResultId: string;
  IsTestSetup: boolean;
*/

export const ApexTestResultFields = [
  'ApexClass.Id',
  'ApexClass.Name',
  'ApexClass.NamespacePrefix',
  'AsyncApexJobId',
  'Id',
  'Message',
  'MethodName',
  'Outcome',
  'QueueItemId',
  'RunTime',
  'StackTrace',
  'TestTimestamp',
];

export type Outcome = 'Pass' | 'Fail' | 'CompileFail' | 'Skip';

export type OutcomeMap<T> = {
  [K in Outcome]: T;
};

export interface ApexClass {
  Id: string;
  Name: string;
  NamespacePrefix: string | null;
}

export interface BaseTestResult {
  ApexClass: ApexClass;
  Message: string | null;
  MethodName: string;
  Outcome: Outcome;
  RunTime: number;
  StackTrace: string | null;
  TestTimestamp: string;
}

export interface ApexTestResult extends BaseTestResult {
  AsyncApexJobId: string;
  Id: string;
  QueueItemId: string;
}
