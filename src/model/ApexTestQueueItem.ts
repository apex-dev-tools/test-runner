/*
 * Copyright (c) 2019, FinancialForce.com, inc. All rights reserved.
 */

export type QueueItemStatus =
  | 'Holding'
  | 'Queued'
  | 'Preparing'
  | 'Processing'
  | 'Aborted'
  | 'Completed'
  | 'Failed';

export interface ApexTestQueueItem {
  Id: string;
  ApexClassId: string;
  Status: QueueItemStatus;
  TestRunResultId: string;
}
