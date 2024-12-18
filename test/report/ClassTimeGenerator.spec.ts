/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */

import { expect } from 'chai';
import { SfDate } from 'jsforce';
import { CapturingLogger } from '../../src/log/CapturingLogger';
import { ClassTimeGenerator } from '../../src/results/ClassTimeGenerator';

describe('ClassTimeGenerator', () => {
  it('should create csv and json output', () => {
    const now = Date.now();
    const generator = new ClassTimeGenerator(
      'instanceUrl',
      'orgId',
      'username'
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
          TestTimestamp: SfDate.toDateTimeLiteral(now).toString(),
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
          TestTimestamp: SfDate.toDateTimeLiteral(now + 1000).toString(),
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
          TestTimestamp: SfDate.toDateTimeLiteral(now + 2000).toString(),
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
          TestTimestamp: SfDate.toDateTimeLiteral(now + 3000).toString(),
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

    expect(logger.files.length).to.equal(2);
    expect(logger.files[0][0]).to.equal('/test-output-time.csv');
    expect(logger.files[0][1].length).not.to.equal(0);
    expect(logger.files[1][0]).to.equal('/test-output-time.json');
    expect(logger.files[1][1].length).not.to.equal(0);

    const lines = logger.files[0][1].split('\n');
    expect(lines.length).to.equal(5);
    expect(lines[0]).to.equal('ClassName,StartTime,EndTime,TotalTime');
    expect(lines[1]).to.equal('# instanceUrl orgId username');
    expect(lines[2]).to.match(/Class1,[0-9]*,[0-9]*,10/);
    expect(lines[3]).to.match(/Class3,[0-9]*,[0-9]*,40/);
    expect(lines[4]).to.match(/Class2,[0-9]*,[0-9]*,20/);
  });
});
