# test-runner

Salesforce unit test runner, built over @salesforce/apex-node and jsforce. The runner provides a number of reliability features aimed at ensuring the greatest chance of obtaining a good test run.

The main abstraction is a Testall command. You can use this to configure and execute a test run. The runner
is assisted by three plugins:

- TestMethodCollector - Locates all test methods that should be executed, this is used to validate there are no missing methods in a run and if necessary arrange for additional test to be executed to fill the gaps.
- TestRunner - This manages the initial test run and subsequent runs that may be needed due to missing tests. It monitors the test runs for progress and can abort/restart runs when progress is not being made.
- OutputGenerator - This manages the generation of test reports, by default JUnit XML and json style outputs are created.

The Testall command also handles re-running tests that failed due to locking after the main run(s) have completed.

You can start a Testall run by providing a set of test classes. If you don't provide any the run will execute against all the "local" (non-packaged) tests in the org.

### Building

You must use **pnpm** to build the package.

    pnpm install
    pnpm build

Jest unit tests can be run with

    pnpm test

See './script' for some basic scripts to aid org testing.

### History

    1.2.0 - Add callback `onPoll` for retrieving test stats.
    1.1.0 - Export `ResultCollector`, add callback for `onRunStarted`.
    1.0.1 - Reduce symbol chunk size.
    1.0.0 - Initial version

### License

All the source code included uses a 3-clause BSD license, see LICENSE for details.
