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
      numberOfResets: 0,
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
      numberOfResets: 0,
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
      numberOfResets: 0,
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

  it('should generate JSON and XML outputs with key fields validated', () => {
    const generator = new ReportGenerator(
      'instanceUrl',
      'orgId',
      'username',
      'suitename'
    );

    const logger = new CapturingLogger();
    generator.generate(logger, '', '/test-output', {
      startTime: new Date('2020-07-10T15:00:00.000Z'),
      testResults: [
        {
          Id: 'TestId1',
          QueueItemId: 'QueueItemId1',
          AsyncApexJobId: 'JobId1',
          Outcome: 'Pass',
          ApexClass: {
            Id: 'ClassId1',
            Name: 'ClassName1',
            NamespacePrefix: null,
          },
          MethodName: 'MethodName1',
          Message: null,
          StackTrace: null,
          RunTime: 10,
          TestTimestamp: '2020-07-10T15:00:00.000Z',
        },
      ],
      runResult: {
        AsyncApexJobId: 'JobId1',
        StartTime: '2020-07-10T15:00:00.000Z',
        EndTime: '2020-07-10T15:01:00.000Z',
        Status: 'Completed',
        TestTime: 60,
        UserId: 'UserId1',
        ClassesCompleted: 1,
        ClassesEnqueued: 1,
        MethodsCompleted: 1,
        MethodsEnqueued: 1,
        MethodsFailed: 0,
      },
      runIds: ['JobId1'],
      reruns: [],
      numberOfResets: 7,
    });

    // Verify JSON output
    const jsonOutput = logger.files.find(
      (file): boolean => file[0] === '/test-output.json'
    );
    expect(jsonOutput).to.not.be.undefined;
    if (jsonOutput) {
      const jsonContent: {
        summary: {
          failing: number;
          numberOfResets: number;
          outcome: string;
          testRunId: string;
          testTotalTime: number;
          testsRan: number;
        };
      } = JSON.parse(jsonOutput[1]);
      expect(jsonContent.summary.failing).to.equal(0);
      expect(jsonContent.summary.numberOfResets).to.equal(7);
      expect(jsonContent.summary.outcome).to.equal('Passed');
      expect(jsonContent.summary.testRunId).to.equal('JobId1');
      expect(jsonContent.summary.testTotalTime).to.equal(60);
      expect(jsonContent.summary.testsRan).to.equal(1);
    }

    // Verify XML output

    const content1 = logger.files[0][1];
    parseString(
      content1,
      (err, result: { testsuites: { testsuite: any }[] }) => {
        expect(err).to.be.null;
        expect(result).to.haveOwnProperty('testsuites');
      }
    );
  });
});
