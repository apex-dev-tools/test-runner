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
export interface ApexTestResult {
  Id: string;
  QueueItemId: string;
  AsyncApexJobId: string;
  Outcome: Outcome;
  ApexClass: ApexClass;
  MethodName: string;
  Message: string | null;
  StackTrace: string | null;
  RunTime: number;
  TestTimestamp: string;
}

export interface ApexCodeCoverage {
  Id: string;
  ApexTestClass: ApexClass;
  TestMethodName: string;
  ApexClassOrTrigger: ApexClass; //intentionally upper case 'O' as the result back is upper case
  NumLinesCovered: number;
  NumLinesUncovered: number;
  Coverage: CodeCoverage;
}

// Note ApexClassorTriggerId intentionally has smaller case 'o' in 'ApexClassorTriggerId' as this is the field name
// but the result back is in upper case 'o'
export const ApexCodeCoverageFields = [
  'Id',
  'ApexTestClassId',
  'TestMethodName',
  'ApexClassorTriggerId',
  'NumLinesCovered',
  'NumLinesUncovered',
  'Coverage',
  'ApexClassorTrigger.Name', //The Name of the class or trigger under test
  'ApexTestClass.Name', //The Name of the test class
  'ApexClassorTrigger.Id',
  'ApexTestClass.Id',
];

export type CodeCoverage = { coveredLines: number[]; uncoveredLines: number[] };

export interface ApexCodeCoverageAggregate {
  ApexClassOrTrigger: ApexClass;
  NumLinesCovered: number;
  NumLinesUncovered: number;
  Coverage: CodeCoverage;
}

export const ApexCodeCoverageAggregateFields = [
  'Id',
  'ApexClassorTriggerId',
  'NumLinesCovered',
  'NumLinesUncovered',
  'Coverage',
  'ApexClassorTrigger.Name', //The Name of the class or trigger under test
  'ApexClassorTrigger.Id',
];

export interface CoverageReport {
  table: string;
  data?: ApexCodeCoverageAggregate[];
}
