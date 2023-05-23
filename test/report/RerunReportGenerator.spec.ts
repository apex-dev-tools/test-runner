/*
 * Copyright (c) 2023, FinancialForce.com, inc. All rights reserved.
 */

import { expect } from 'chai';
import { CapturingLogger } from '../../src/log/CapturingLogger';
import { RerunReportGenerator } from '../../src/results/RerunReportGenerator';

describe('messages', () => {
  it('should create json & xml output on failing report', () => {
    const generator = new RerunReportGenerator();

    const logger = new CapturingLogger();
    generator.generate(logger, '', '/test-output', {
      startTime: new Date(),
      testResults: [],
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
      runIds: ['job Id', 'rerun job Id'],
      reruns: [
        {
          fullName: 'ns__Class.Method',
          before: {
            Id: 'An id',
            QueueItemId: 'queue item id',
            AsyncApexJobId: 'job id',
            Outcome: 'Fail',
            ApexClass: {
              Id: 'Class Id',
              Name: 'Class',
              NamespacePrefix: 'ns',
            },
            MethodName: 'Method',
            Message: 'A message',
            StackTrace: 'Stack info',
            RunTime: 20,
            TestTimestamp: '2022-09-07T07:38:56.000+0000',
          },
          after: {
            Outcome: 'Pass',
            ApexClass: {
              Id: 'Class Id',
              Name: 'Class',
              NamespacePrefix: 'ns',
            },
            MethodName: 'Method',
            Message: 'A message',
            StackTrace: 'Stack info',
            RunTime: 20,
            TestTimestamp: '2022-09-07T07:38:56.000+0000',
          },
        },
      ],
    });

    expect(logger.files.length).to.be.equal(1);
    expect(logger.files[0][0]).to.be.equal('/test-output-reruns');
    expect(logger.files[0][1].length > 0).to.be.true;
  });
});
