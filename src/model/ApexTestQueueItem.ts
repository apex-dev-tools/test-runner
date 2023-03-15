/*
 * Copyright (c) 2019, FinancialForce.com, inc. All rights reserved.
 */

export const enum ApexTestQueueItemStatus {
  Holding = 'Holding',
  Queued = 'Queued',
  Preparing = 'Preparing',
  Processing = 'Processing',
  Aborted = 'Aborted',
  Completed = 'Completed',
  Failed = 'Failed',
}

export interface ApexTestQueueItem {
  Id: string;
  ApexClassId: string;
  Status: keyof typeof ApexTestQueueItemStatus;
  TestRunResultId: string;
}
