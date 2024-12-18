/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */

import { expect } from 'chai';
import { parseString } from 'xml2js';
import { CapturingLogger } from '../../src/log/CapturingLogger';
import { ReportGenerator } from '../../src/results/ReportGenerator';

describe('ReportGenerator', () => {
  it('should create json & xml output on failing report', () => {
    const generator = new ReportGenerator(
      'instanceUrl',
      'orgId',
      'username',
      'suitename'
    );

    const logger = new CapturingLogger();
    generator.generate(logger, '', '/test-output', {
      startTime: new Date(),
      testResults: [
        {
          Id: 'An id',
          QueueItemId: 'queue item id',
          AsyncApexJobId: 'job id',
          Outcome: 'Pass',
          ApexClass: {
            Id: 'Class Id',
            Name: 'Class1',
            NamespacePrefix: null,
          },
          MethodName: 'Method1',
          Message: null,
          StackTrace: null,
          RunTime: 10,
          TestTimestamp: '2022-09-07T07:38:56.000+0000',
        },
        {
          Id: 'An id',
          QueueItemId: 'queue item id',
          AsyncApexJobId: 'job id',
          Outcome: 'Fail',
          ApexClass: {
            Id: 'Class Id3',
            Name: 'Class3',
            NamespacePrefix: null,
          },
          MethodName: 'Method2',
          Message: null,
          StackTrace: null,
          RunTime: 20,
          TestTimestamp: '2022-09-07T07:38:56.000+0000',
        },
        {
          Id: 'An id',
          QueueItemId: 'queue item id',
          AsyncApexJobId: 'job id',
          Outcome: 'Fail',
          ApexClass: {
            Id: 'Class Id2',
            Name: 'Class2',
            NamespacePrefix: null,
          },
          MethodName: 'Method2',
          Message: null,
          StackTrace: null,
          RunTime: 20,
          TestTimestamp: '2022-09-07T07:38:56.000+0000',
        },
        {
          Id: 'An id',
          QueueItemId: 'queue item id',
          AsyncApexJobId: 'job id',
          Outcome: 'Fail',
          ApexClass: {
            Id: 'Class Id3',
            Name: 'Class3',
            NamespacePrefix: 'ns',
          },
          MethodName: 'Method2',
          Message: 'A message',
          StackTrace: 'Stack info',
          RunTime: 20,
          TestTimestamp: '2022-09-07T07:38:56.000+0000',
        },
      ],
      runResult: {
        AsyncApexJobId: 'job Id',
        StartTime: '2020-07-10 15:00:00.000',
        EndTime: '2020-07-10 15:01:00.000',
        Status: 'Status',
        TestTime: 1000,
        UserId: 'user Id',
        ClassesCompleted: 100,
        ClassesEnqueued: 99,
        MethodsCompleted: 500,
        MethodsEnqueued: 600,
        MethodsFailed: 100,
      },
      runIds: ['job Id'],
      reruns: [],
    });

    expect(logger.files.length).to.be.equal(2);
    expect(logger.files[0][0]).to.be.equal('/test-output.xml');
    expect(logger.files[0][1].length > 0).to.be.true;
    expect(logger.files[1][0]).to.be.equal('/test-output.json');
    expect(logger.files[1][1].length > 0).to.be.true;
  });

  it('should create json & xml output on passing report', () => {
    const generator = new ReportGenerator(
      'instanceUrl',
      'orgId',
      'username',
      'suitename'
    );

    const logger = new CapturingLogger();
    generator.generate(logger, '', '/test-output', {
      startTime: new Date(),
      testResults: [
        {
          Id: 'An id',
          QueueItemId: 'queue item id',
          AsyncApexJobId: 'job id',
          Outcome: 'Pass',
          ApexClass: {
            Id: 'Class Id',
            Name: 'Class1',
            NamespacePrefix: null,
          },
          MethodName: 'Method1',
          Message: null,
          StackTrace: null,
          RunTime: 10,
          TestTimestamp: '2022-09-07T07:38:56.000+0000',
        },
      ],
      runResult: {
        AsyncApexJobId: 'job Id',
        StartTime: '2020-07-10 15:00:00.000',
        EndTime: '2020-07-10 15:01:00.000',
        Status: 'Status',
        TestTime: 1000,
        UserId: 'user Id',
        ClassesCompleted: 100,
        ClassesEnqueued: 99,
        MethodsCompleted: 500,
        MethodsEnqueued: 600,
        MethodsFailed: 0,
      },
      runIds: ['job Id'],
      reruns: [],
    });

    expect(logger.files.length).to.be.equal(2);
    expect(logger.files[0][0]).to.be.equal('/test-output.xml');
    expect(logger.files[0][1].length > 0).to.be.true;
    expect(logger.files[1][0]).to.be.equal('/test-output.json');
    expect(logger.files[1][1].length > 0).to.be.true;
  });

  it('should create escape characters in xml output', () => {
    const generator = new ReportGenerator(
      'instanceUrl',
      'orgId',
      'username',
      'suitename'
    );

    const logger = new CapturingLogger();
    generator.generate(logger, '', '/test-output', {
      startTime: new Date(),
      testResults: [
        {
          Id: 'An id',
          QueueItemId: 'queue item id',
          AsyncApexJobId: 'job id',
          Outcome: 'Fail',
          ApexClass: {
            Id: 'Class Id',
            Name: '<Class1',
            NamespacePrefix: null,
          },
          MethodName: '&Method1',
          Message: "It Work's",
          StackTrace: null,
          RunTime: 10,
          TestTimestamp: '2022-09-07T07:38:56.000+0000',
        },
      ],
      runResult: {
        AsyncApexJobId: 'job Id',
        StartTime: '2020-07-10 15:00:00.000',
        EndTime: '2020-07-10 15:01:00.000',
        Status: 'Status',
        TestTime: 1000,
        UserId: 'user Id',
        ClassesCompleted: 100,
        ClassesEnqueued: 99,
        MethodsCompleted: 500,
        MethodsEnqueued: 600,
        MethodsFailed: 0,
      },
      runIds: ['job Id'],
      reruns: [],
    });

    expect(logger.files.length).to.be.equal(2);
    expect(logger.files[0][0]).to.be.equal('/test-output.xml');
    expect(logger.files[0][1].length > 0).to.be.true;
    const content = logger.files[0][1];
    parseString(content, err => {
      expect(err).to.be.null;
    });
    expect(content).contains(
      '<testcase name="&amp;Method1" classname="&lt;Class1" time="0.01">'
    );
    expect(content).contains('<failure message="It Work&apos;s"></failure>');
  });
});
