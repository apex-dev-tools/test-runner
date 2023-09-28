/*
 * Copyright (c) 2023, Certinia Inc. All rights reserved.
 */

import {
  ApexTestResult,
  BaseTestResult,
  OutcomeMap,
} from '../model/ApexTestResult';

export function groupByOutcome(
  results: ApexTestResult[]
): OutcomeMap<ApexTestResult[]> {
  return results.reduce(
    (acc, current) => {
      const outcome = current.Outcome;
      acc[outcome].push(current);
      return acc;
    },
    {
      Pass: [],
      Fail: [],
      CompileFail: [],
      Skip: [],
    } as OutcomeMap<ApexTestResult[]>
  );
}

export function getTestName(test: BaseTestResult): string {
  return formatTestName(
    test.ApexClass.Name,
    test.MethodName,
    test.ApexClass.NamespacePrefix
  );
}

export function formatTestName(
  className: string,
  methodName: string,
  ns: string | null
): string {
  return `${resolveNamespace(ns)}${className}.${methodName}`;
}

export function getClassName(test: BaseTestResult): string {
  return `${resolveNamespace(test.ApexClass.NamespacePrefix)}${
    test.ApexClass.Name
  }`;
}

function resolveNamespace(ns: string | null) {
  return ns ? (ns.endsWith('__') ? ns : `${ns}__`) : '';
}
