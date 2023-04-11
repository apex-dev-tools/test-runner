# test-runner - Changelog

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
