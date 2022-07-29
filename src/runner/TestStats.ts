/*
 * Copyright (c) 2019, FinancialForce.com, inc. All rights reserved.
 */

import {
  getPollLimitToAssumeHangingTests,
  TestRunnerOptions,
} from './TestOptions';

export default class TestStats {
  private readonly _updateLimitToAssumeTestHanging: number;
  private _numberOfTestsRun: number;
  private _numberOfTimesUpdatedWithoutChange: number;
  private _numberOfTimesReset: number;

  static instance(options: TestRunnerOptions): TestStats {
    return new TestStats(getPollLimitToAssumeHangingTests(options), 0, 0, 0);
  }

  private constructor(
    updateLimitToAssumeTestHanging: number,
    numberOfTestsRun: number,
    numberOfTimesPolledWithoutChange: number,
    numberOfTimesReset: number
  ) {
    this._updateLimitToAssumeTestHanging = updateLimitToAssumeTestHanging;
    this._numberOfTestsRun = numberOfTestsRun;
    this._numberOfTimesUpdatedWithoutChange = numberOfTimesPolledWithoutChange;
    this._numberOfTimesReset = numberOfTimesReset;
  }

  public reset(): TestStats {
    return new TestStats(
      this._updateLimitToAssumeTestHanging,
      0,
      0,
      this._numberOfTimesReset + 1
    );
  }

  public update(numberOfTestsRun: number): TestStats {
    if (this._numberOfTestsRun !== numberOfTestsRun) {
      return new TestStats(
        this._updateLimitToAssumeTestHanging,
        numberOfTestsRun,
        0,
        this._numberOfTimesReset
      );
    } else {
      return new TestStats(
        this._updateLimitToAssumeTestHanging,
        this._numberOfTestsRun,
        this._numberOfTimesUpdatedWithoutChange + 1,
        this._numberOfTimesReset
      );
    }
  }

  public isTestRunHanging(): boolean {
    return (
      this._numberOfTimesUpdatedWithoutChange >=
      this._updateLimitToAssumeTestHanging
    );
  }

  public getNumberOfTimesReset(): number {
    return this._numberOfTimesReset;
  }
}
