/*
 * Copyright (c) 2019, FinancialForce.com, inc. All rights reserved.
 */

/*
 Unselected fields:
  IsAllTests boolean;
  JobName string;
  Source string;
*/

export const ApexTestRunResultFields = [
  'AsyncApexJobId',
  'ClassesCompleted',
  'ClassesEnqueued',
  'EndTime',
  'MethodsCompleted',
  'MethodsEnqueued',
  'MethodsFailed',
  'StartTime',
  'Status',
  'TestSetupTime',
  'TestTime',
  'UserId',
];

export interface ApexTestRunResult {
  Id?: string;
  AsyncApexJobId: string;
  ClassesCompleted: number;
  ClassesEnqueued: number;
  EndTime: string;
  MethodsCompleted: number;
  MethodsEnqueued: number;
  MethodsFailed: number;
  StartTime: string;
  Status: string;
  TestSetupTime: number;
  TestTime: number;
  UserId: string;
}
