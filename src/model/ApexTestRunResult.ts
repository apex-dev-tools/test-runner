/*
 * Copyright (c) 2019, FinancialForce.com, inc. All rights reserved.
 */

export const ApexTestRunResultFields = [
  'AsyncApexJobId',
  'StartTime',
  'EndTime',
  'Status',
  'TestTime',
  'UserId',
  'ClassesCompleted',
  'ClassesEnqueued',
  'MethodsCompleted',
  'MethodsEnqueued',
  'MethodsFailed',
];

export interface ApexTestRunResult {
  Id?: string;
  AsyncApexJobId: string;
  StartTime: string;
  EndTime: string;
  Status: string;
  TestTime: number;
  UserId: string;
  ClassesCompleted: number;
  ClassesEnqueued: number;
  MethodsCompleted: number;
  MethodsEnqueued: number;
  MethodsFailed: number;
}
