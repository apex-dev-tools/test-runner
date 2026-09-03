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

// Statuses of queue items that have not finished running - what a stalled run
// still has outstanding, and what aborting a run cancels.
export const PENDING_QUEUE_STATUSES: QueueItemStatus[] = [
  'Holding',
  'Queued',
  'Preparing',
  'Processing',
];

export interface ApexTestQueueItem {
  Id: string;
  ApexClassId: string;
  Status: QueueItemStatus;
  TestRunResultId: string;
}
