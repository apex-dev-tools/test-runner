/*
 * Copyright (c) 2019, FinancialForce.com, inc. All rights reserved.
 */

export interface ApexClass {
  Id: string;
  Name: string;
  NamespacePrefix: string | null;
}
export interface ApexTestResult {
  Id: string;
  QueueItemId: string;
  AsyncApexJobId: string;
  Outcome: string;
  ApexClass: ApexClass;
  MethodName: string;
  Message: string | null;
  StackTrace: string | null;
  RunTime: number;
}
