/*
 * Copyright (c) 2019, FinancialForce.com, inc. All rights reserved.
 */

export const ApexTestResultFields = [
  'Id',
  'QueueItemId',
  'AsyncApexJobId',
  'Outcome',
  'MethodName',
  'Message',
  'StackTrace',
  'RunTime',
  'TestTimestamp',
  'ApexClass.Id',
  'ApexClass.Name',
  'ApexClass.NamespacePrefix',
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
  Outcome: Outcome;
  ApexClass: ApexClass;
  MethodName: string;
  Message: string | null;
  StackTrace: string | null;
  RunTime: number;
  TestTimestamp: string;
}

export interface ApexTestResult extends BaseTestResult {
  Id: string;
  QueueItemId: string;
  AsyncApexJobId: string;
}
