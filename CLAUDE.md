# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`@apexdevtools/test-runner` is a **library** (not a CLI) that runs Salesforce Apex unit tests in parallel with reliability features layered on top of `@salesforce/apex-node` and `jsforce`. It is consumed by other tools that pass it a Salesforce `Connection`. Its job is to maximise the chance of a clean test run by detecting and re-running tests that fail for non-genuine reasons (row-lock/deadlock errors), filling in missing results, and restarting runs that hang.

## Commands

This project uses **pnpm** (v8.9.2, via corepack). `.npmrc` pins the registry to npmjs.org to override any user private registry.

```sh
pnpm install
pnpm build                 # tsc -> ./lib
pnpm test                  # jest --coverage --runInBand (single-worker; tests rely on it)
pnpm test:watch            # jest --watch
pnpm lint                  # eslint ./src/ --fix
pnpm clean                 # rm -rf ./lib

# Run a single test file / test
pnpm test -- test/runner/TestRunner.spec.ts
pnpm test -- -t "name of test"

# Verify the webpack bundle (used by consumers); must run without error
pnpm test:pack && node test-bundle/bundle.js
```

Tests run against an org via the scripts in `src/scripts/` (executed with ts-node):

```sh
pnpm run:script -- ./src/scripts/Testall.ts <username> <namespace | unmanaged>
```

A husky `pre-commit` hook runs `lint-staged` (eslint on staged `*.ts`). Bypass with `git commit -n` if needed. CI (`.github/workflows/Build.yml`) runs install + build + test on push/PR.

## Architecture

The public API is re-exported from [src/index.ts](src/index.ts). The central entry point is `Testall.run(...)` ([src/command/Testall.ts](src/command/Testall.ts)), which orchestrates three pluggable collaborators that callers inject:

- **TestMethodCollector** ([src/collector/](src/collector/)) — enumerates the test methods that *should* run, so the command can detect methods missing from the actual results. `OrgTestMethodCollector` (all local classes) and `TestItemTestMethodCollector` (a specified set) extend the abstract base.
- **TestRunner** ([src/runner/TestRunner.ts](src/runner/TestRunner.ts)) — `AsyncTestRunner` starts an async Apex run, polls `ApexTestRunResult`/`ApexTestResult` via SOQL, and self-heals: if no progress is seen for `pollLimitToAssumeHangingTests` polls it aborts and restarts (tracked as a "reset", capped by `maxTestRunRetries`). `newRunner(testItems)` clones the runner for a follow-up subset.
- **OutputGenerator[]** ([src/results/](src/results/)) — post-process the final `TestRunSummary` into report files. Implementations: `ReportGenerator` (JUnit XML + json), `ClassTimeGenerator`, `ExecutionMapGenerator`, `CoverageReporter`, `RerunReportGenerator`.

### The reliability flow (read `Testall.run` to understand this)

1. **Method collection** starts in parallel with the run (a promise, not awaited up front) to avoid delaying test start.
2. **`asyncRun`** runs the main async batch, then recursively re-runs *missing* tests (expected − actual). It bails early if genuine failures exceed `maxErrorsForReRun` (default 10).
3. **`syncRun`** sequentially re-runs failed tests synchronously to confirm whether failures are genuine. *Which* tests get re-run is governed by `RerunOption`:
   - `pattern` (default) — only failures whose message matches a rerun pattern.
   - `limit` — pattern matches plus all failures, when total failures ≤ `maxErrorsForReRun`.
   - `all` — always re-run every failure.
4. **Coverage** is gathered only if `codeCoverage` is on and not disabled.
5. **`reportResults`** builds the `TestRunSummary` and feeds every `OutputGenerator`. Partial results are reported even on error/abort — the code is written to surface whatever ran rather than throwing everything away.

### Rerun patterns

`TestResultMatcher` ([src/collector/TestResultMatcher.ts](src/collector/TestResultMatcher.ts)) decides which failures are "rerunnable" (transient) vs genuine. Defaults are `UNABLE_TO_LOCK_ROW` and `deadlock detected while waiting for resource` (exported as `DEFAULT_TEST_RERUN_PATTERNS`). At runtime it searches up the directory tree from `process.cwd()` for a `.apexTestRerun` file (one regex per line) and uses that instead if found.

### Supporting pieces

- [src/query/](src/query/) — `QueryHelper` (a per-connection SOQL helper used everywhere instead of calling jsforce directly), `Chunk` (batches IN-clause ids, limit 500/200), and symbol/debug-log loaders.
- [src/model/](src/model/) — typed shapes for the Salesforce sObjects queried (`ApexTestResult`, `ApexTestRunResult`, `ApexCodeCoverage`, etc.); each exports a `*Fields` array used to build SELECT lists.
- [src/runner/Poll.ts](src/runner/Poll.ts) — generic `poll`/`retry` primitives used by the runner and sync reruns.
- [src/runner/TestError.ts](src/runner/TestError.ts) — `TestError` with `TestErrorKind`; use `TestError.wrapError` to normalise unknown errors.
- [src/log/](src/log/) — everything logs through the injected `Logger` interface ([src/log/Logger.ts](src/log/Logger.ts)). `BaseLogger`/`CapturingLogger` are the provided implementations; **do not `console.log`** — add a method to the `Logger` interface and call it.
- `numberOfResets` threads from `TestStats` → `TestRunnerResult` → `TestResultStore` → `TestRunSummary` and into reports, recording how often a hung run was restarted.

## Conventions

- TypeScript `strict`, target es2020, CommonJS. Source in `src/`, specs in `test/**/*.spec.ts` (jest + ts-jest, sinon/chai available). Build output goes to `lib/` and is what gets published (`files: lib/**/*`).
- Prefer dependency injection over hardcoding (logger, runner, collectors, output generators, and the `TestRunAborter` are all swappable) — this is what makes the runner testable without an org.
- Configurable knobs follow a `getX(options)` pattern with module-level `DEFAULT_*` constants and defensive validation (see [src/runner/TestOptions.ts](src/runner/TestOptions.ts)). Follow it when adding options.
