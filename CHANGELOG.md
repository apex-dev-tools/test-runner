# test-runner - Changelog

## 3.2.0 - 2024-12-10

* Add `QueryHelper.setGlobalRetryOptions()` static method.
  * Use to change the retry behaviour of queries across all instances.

## 3.1.3 - 2024-11-20

* Exclude `@testSetup` methods from `ApexTestResult` queries.

## 3.1.2 - 2024-04-08

* Set minimum timeout to 30s on polling requests.

## 3.1.1 - 2024-04-08

* Add timeout to each poll call during test run.
  * Uses `statusPollIntervalMs` as the timeout value.
* Test failure logging now limits at 4+ failures in the same class.

## 3.1.0 - 2023-11-24

* Format millisecond/second time values in reports as numbers.
  * For JSON: `"time": "12030 ms"` is now `"time": 12030`.
  * For JUnit XML: `value="12.03 s"` is now `value="12.03"`.
* Add elapsed time to test run status logging.
* Add `rerunExecutionTime` value to main test reports.
  * This is sum of all the re-run `RunTime`s. Similar to `testExecutionTime`.
* Remove spaces in class time CSV report.
* Add output of class time report to JSON.
* Optimise missing test re-run request payload when requesting all tests in a class.

## 3.0.0 - 2023-10-23

* **BREAKING**: `AsyncTestRunner` now does not re-throw errors. Instead it returns a `TestRunnerResult` type which includes all test results retrieved and optional error.

* Adds `ts-retry-promise` as dependency.
  * Replacing uses of `@salesforce/core`'s `PollingClient`.
  * All errors are now caught and retried, instead of just network errors.
  * Errors and retries will be logged.
* Reworked `TestAll` command to return partial result, no longer potentially undefined.
* Added retries to many external request promises.
  * Currently fixed 3 additional attempts made over ~2 minutes.
* Added inline logging of test failures as they happen.
* Fix rounding error with test status logging, show completed number.
* `TestAborter` no longer waits after marking aborted tests.

## 2.1.0 - 2023-10-13

* Update to `@salesforce/core` v4 and other supporting deps.

## 2.0.1 - 2023-06-26

* Fix `@salesforce/apex-node` including commitlint by relaxing required version.

## 2.0.0 - 2023-06-23

* Removes module override for `@salesforce/core`.
* Upgrade core dependencies, including:
  * `@apexdevtools/sfdx-auth-helper`
  * `@salesforce/core`
  * `@salesforce/apex-node`
* Supports webpack bundling.

## 1.9.2 - 2023-06-07

* Add file extension back to reruns report.

## 1.9.1 - 2023-06-01

* Fix bug with missed test detection.

## 1.9.0 - 2023-05-19

* Fix report output crash on tests that were rerun.
* Update rerun report format and remove file extension.
  * To avoid being recognised as a test result file.

## 1.8.0 - 2023-05-11

* Return `TestRunSummary` for `TestAll`.
* Add properties to result summary:
  * `reruns` is a list of before/after test results.
  * `runIds` is all the job Ids involved in a run.
* Add new `TestallOptions`:
  * `disableCoverageReport` to disable print out of coverage when enabled for org.
  * `rerunOption` to select different rerun behaviour, possible values:
    * `'pattern'` - default, rerun tests based on pattern file entries.
    * `'limit'` - will rerun all failed tests only when under `maxErrorsForReRun` limit.
    * `'all'` - rerun all failed tests.
* Add report generator to detail reruns to a file.
* Catch and skip reruns on error.

## 1.7.0 - 2023-04-11

* Add support for collecting code coverage data
* Refactor OutputGenerator interface to accept a path and filename as param
* Add Cove Coverage generator that generates `locv.info` file

## 1.6.0 - 2023-03-23

* Throw the error from `Testall.run()` instead of just logging.
* Add `TestError` type.
  * Thrown in all local error cases, external errors may still pass through.
  * Use built-in `Error().name` property to identify its type.
  * Has `kind` property with enum type `TestErrorKind`
    * `General` - 0
    * `Timeout` - 1
    * `Query` - 2

## 1.5.1 - 2023-03-17

* Use tooling api for most sobject queries.

## 1.5.0 - 2023-03-17

* **BREAKING:** BaseLogger no longer accepts a `Connection` in constructor.
  * All logging methods are now synchronous.
  * Has new optional `logDirPath` parameter to set a common location for log files.
  * `logOutputFile()` will now use `path.resolve` with `logDirPath` or given parameter.
* Add retry feature to `QueryHelper`, used in `Testall` during post-test `gatherResultsWithRetry`.
* Update logging status message to include pass count.
* Update logging for pattern based retries with before/after explanation.
* Fix unhandled promise rejection on failed polling query.
* Fix cancellation token not passed to test reruns.
* Export `DEFAULT_TEST_RERUN_PATTERNS` from `TestResultMatcher`.

## 1.4.0 - 2023-03-02

* Add support for test rerun patterns in `.apexTestRerun`.

## 1.3.0 - 2023-01-30

* Fix misreporting of failed tests.
* Add code coverage support.
* Add abort when tests already in progress.
* Apply xml escaping to values used in unit test results.

## 1.2.0 - 2022-12-08

* Add callback `onPoll` for retrieving test stats.

## 1.1.0 - 2022-11-29

* Expose `ResultCollector`.
* Add callbacks for `onRunStarted`.
* Modify run abort to return the IDs of cancelled tests.

## 1.0.1 - 2022-08-09

* Export logger types.
* Reduce symbol chunk size.

## 1.0.0 - 2022-08-01

* Initial release.
