---

title: "Playwright"
order: 5
reportFormat: "JUnit XML (classname + prefix)"
selection: "Anchored escaped regex"
summary: "Pass exact specs as anchored escaped regexes and record Playwright JUnit reports with --file-from classname --path-prefix tests."
---

Bunpō splits your test files across parallel GitHub Actions machines by how
long each took last time, and checks that every file was assigned exactly
once. This guide sets it up for Playwright in one workflow file.

The first run has no timings yet, so files are dealt out evenly. From the
second run on, each machine gets a balanced share.

## What you need

- Playwright's built-in JUnit reporter. It writes each test's path into the
  `classname` attribute, relative to your `testDir`, so `bunpo record` takes
  `--file-from classname --path-prefix tests`. Change `tests` in both places
  if your `testDir` is different.
- Playwright reads file arguments as regular expressions, so
  `tests/a.spec.ts` would also run `tests/x/tests/a.spec.ts`. `--test-list`
  breaks on filenames starting with `[` (such as `tests/[id].spec.ts`), so
  the workflow passes each path as a case-sensitive anchored, escaped regular
  expression (`/^\/abs\/path$/`) matching only itself.
- The `find` command below matches Playwright's default `testMatch`
  (`**/*.@(spec|test).?(c|m)[jt]s?(x)`). If your config uses a custom
  `testMatch` or `--project`/`--grep` filters, use
  `npx playwright test --list --reporter=json` under Common setups.

## The workflow

Save this as `.github/workflows/tests.yml`:

```yaml
name: Tests

on:
  push:
    branches: [main]
  pull_request:

# "shell: bash" turns on pipefail, so a failing command that lists the test
# files fails the step instead of passing an empty list to bunpo.
defaults:
  run:
    shell: bash

jobs:
  test:
    strategy:
      fail-fast: false
      matrix:
        machine: [0, 1, 2, 3]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
      - run: npm ci
      - run: npx playwright install --with-deps
      - uses: nuggocto/bunpo@v0
      - uses: actions/cache/restore@v6
        with:
          path: .bunpo/timings.json
          key: bunpo-timings-${{ github.sha }}
          restore-keys: bunpo-timings-
      - name: Run this machine's tests
        env:
          INDEX: ${{ strategy.job-index }}
          TOTAL: ${{ strategy.job-total }}
          PLAYWRIGHT_JUNIT_OUTPUT_FILE: junit.xml
        run: |
          find tests \( -name '*.spec.[jt]s' -o -name '*.spec.[jt]sx' -o -name '*.spec.[cm][jt]s' -o -name '*.spec.[cm][jt]sx' -o -name '*.test.[jt]s' -o -name '*.test.[jt]sx' -o -name '*.test.[cm][jt]s' -o -name '*.test.[cm][jt]sx' \) | bunpo split --index "$INDEX" --total "$TOTAL" > mine.txt
          mine=()
          while IFS= read -r path; do mine+=("$path"); done < mine.txt

          # Given no files, Playwright would run the whole suite.
          if [ "${#mine[@]}" -eq 0 ]; then
            bunpo record --index "$INDEX"
            exit 0
          fi

          status=0
          # Playwright reads each argument as a regular expression over absolute
          # paths, and --test-list rejects filenames starting with "[" (such as
          # Next.js dynamic routes), so each path becomes a case-sensitive
          # anchored, escaped expression matching only itself.
          patterns=()
          while IFS= read -r pattern; do patterns+=("$pattern"); done < <(
            awk -v dir="$(pwd -P)/" '{ print dir $0 }' mine.txt |
              sed -e 's/[][\.*^$+?(){}|/]/\\&/g' -e 's/^/\/^/' -e 's/$/$\//'
          )
          npx playwright test --reporter=list,junit "${patterns[@]}" || status=$?
          bunpo record --index "$INDEX" --file-from classname --path-prefix tests junit.xml
          exit "$status"
      - if: ${{ !cancelled() }}
        uses: actions/upload-artifact@v7
        with:
          name: bunpo-${{ strategy.job-index }}
          path: |
            .bunpo/manifest-*.json
            .bunpo/report-*.json
          include-hidden-files: true

  bunpo:
    needs: test
    if: ${{ !cancelled() }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: nuggocto/bunpo@v0
      - uses: actions/cache/restore@v6
        with:
          path: .bunpo/timings.json
          key: bunpo-timings-${{ github.sha }}
          restore-keys: bunpo-timings-
      - uses: actions/download-artifact@v8
        with:
          pattern: bunpo-*
          path: .bunpo
          merge-multiple: true
      - name: Verify the assignment
        run: find tests \( -name '*.spec.[jt]s' -o -name '*.spec.[jt]sx' -o -name '*.spec.[cm][jt]s' -o -name '*.spec.[cm][jt]sx' -o -name '*.test.[jt]s' -o -name '*.test.[jt]sx' -o -name '*.test.[cm][jt]s' -o -name '*.test.[cm][jt]sx' \) | bunpo verify
      - name: Merge timings
        run: bunpo merge
      - if: ${{ github.event_name == 'push' && github.ref == 'refs/heads/main' && needs.test.result == 'success' }}
        uses: actions/cache/save@v6
        with:
          path: .bunpo/timings.json
          key: bunpo-timings-${{ github.run_id }}-${{ github.run_attempt }}
```

## How it works

- **Each `test` machine** restores the timing file, lists every test file,
  and runs `bunpo split` to get its share in `mine.txt`. It runs Playwright on
  exactly those files, then `bunpo record` turns the report into timings.
  The test exit status is kept and returned last, so a failing test still
  fails the job after its times are recorded.
- **A machine with no files** skips Playwright, which would otherwise run the
  whole suite, and records an empty report.
- **The `bunpo` job** collects every machine's files. `bunpo verify` checks
  that all machines split the same input and that each file was assigned
  exactly once. `bunpo merge` folds the times into the timing file and fails
  if a machine's report is missing.
- **Only passing `main` runs save timings.** Pull requests read them and never
  overwrite them, and failed `main` runs leave the previous cache intact so
  re-running a failed shard does not hit timings saved by the same run. Each
  save uses a new cache key, and `restore-keys` picks the newest.

Change `machine: [0, 1, 2, 3]` to use more or fewer machines. The actions are
shown by tag; if you pin `nuggocto/bunpo` to a commit SHA, also pass
`with: version: v0.0.7` (matching that commit's tag) so the installed binary is
pinned too.

## Common setups

- **Tests in a subdirectory (monorepo).** GitHub's `defaults.run.working-directory`
  does not apply to `uses:` steps (`actions/cache`, `upload-artifact`,
  `download-artifact`). If your Playwright suite lives in `e2e/`, keep
  `working-directory: e2e` on `run` steps, prefix every `.bunpo/` path in
  `uses:` steps with `e2e/.bunpo/`, and use suite-specific cache and artifact
  prefixes (such as `bunpo-e2e-timings-` and `bunpo-e2e-`).
- **Filtered suites (`--project`, `--grep`, `--grep-invert`).** `find tests`
  lists every file on disk, including specs your command excludes, so `record`
  warns that excluded files stayed unrecorded. To list only the files
  Playwright will actually run, write the JSON list to a file and extract the
  paths with `jq` (both in the `test` job and in `bunpo verify`):
  ```bash
  PLAYWRIGHT_JSON_OUTPUT_NAME=list.json \
    npx playwright test --list --project=chromium --grep-invert @payments --reporter=json >/dev/null
  jq -r '.suites[].file' list.json | sed 's|^|tests/|' | sort -u | bunpo split --index "$INDEX" --total "$TOTAL" > mine.txt
  ```
  Writing to `PLAYWRIGHT_JSON_OUTPUT_NAME` avoids broken JSON when `dotenv` or
  a config script prints a banner line to stdout.
- **Setup projects (`dependencies` / `auth.setup.ts`).** If your config has a
  setup project that other projects depend on, Playwright runs it on every
  machine and `bunpo record` exits `1` because the setup file was not assigned
  to that machine. Keep setup files out of the split input (the default `find`
  already skips `*.setup.*`; with `--list`, filter to the non-setup project),
  run the setup project first without JUnit, then run the split specs with
  `--no-deps`:
  ```bash
  npx playwright test --project=setup --no-deps --reporter=list
  npx playwright test --no-deps --reporter=list,junit "${patterns[@]}" || status=$?
  ```
  Store login or auth state outside `test-results/` (for example
  `playwright/.auth/user.json`), because the second Playwright command clears
  `test-results/` on startup. If you also have a `teardown` project, run it
  after `bunpo record` with `--project=<teardown> --no-deps`, since `--no-deps`
  skips project dependencies and teardowns.
- **Multi-project suites and multiple `workers`.** When several Playwright
  projects run the same spec files (for example desktop and mobile viewports
  sharing `tests/smoke/`), `bunpo record` sums all projects' case durations
  per file automatically. When Playwright runs with `workers > 1`
  (`fullyParallel: true`), Bunpō's printed predictions and dominant-file
  warnings count summed case seconds across workers, not wall time.
- **Suites with a Docker Compose stack or `workers: 1`.** Suites that share
  database or application state cannot raise Playwright's `workers`, but each
  GitHub Actions machine brings up its own stack, so Bunpō parallelizes them
  across machines without rewriting tests. Stack startup and `globalSetup`
  database seeding run once per machine, so wall time is
  `stack + globalSetup + slowest machine's specs`.
- **Retries and flaky specs.** By default, Playwright's JUnit reporter sums
  all attempt durations into `<testcase time>` (excluding worker restart and
  stack overhead), while `includeRetries: true` records only the final passing
  attempt. Either way, Bunpō takes the median of the last five runs so an
  occasional retry does not reshuffle the split, though a flaky spec that
  retries during a run will still make its machine finish later than predicted.
- **Heterogeneous self-hosted runners.** Bunpō balances recorded file durations
  assuming similar machines. If one self-hosted runner is faster than another
  (for example x64 alongside ARM64) or starts late behind another job in the
  queue, measured wall time will diverge even when predicted loads match. Track
  the slowest shard's wall time separately from runner queue delay.
- **Remove any existing sharding.** Drop Playwright's `--shard` flag before
  enabling Bunpō so the suite is not filtered twice.
- **Busy queues, re-runs, and concurrent pushes (`bunpo plan`).** If another
  `main` run saves newer timings while a shard is queued or before you click
  "Re-run failed jobs", the late shard restores a different cache and `verify`
  fails. To freeze one split for the whole workflow, add an upfront `plan` job
  that restores `.bunpo/timings.json`, runs `bunpo plan --total M`, and uploads
  `.bunpo/plan.json` and `.bunpo/timings.json` with `include-hidden-files: true`;
  download that artifact into `.bunpo` on each `test` machine and run
  `bunpo split --index "$INDEX" --plan`, and download the same snapshot in the
  final job before `bunpo merge`.

## Live queue

Requires **Bunpō 0.1.0 or later**. If your machines have uneven speeds, start
at different times, or can be preempted, run Bunpō in live-queue mode against
`bunpo-server` or the Cloudflare Worker instead of static splitting. Prefer
static splitting when machines are equal and start together, in repositories
that accept fork pull requests, or when your suite has very slow per-batch
startup.

GitHub Actions withholds secrets from fork pull requests, so this workflow
fails on forks with a missing-token error—that is the safe outcome. Use the
static workflow above if your repository accepts fork pull requests, and never
add an `if:` condition that can skip the required `bunpo` job, because GitHub
counts a skipped required check as passed.

If a machine is killed mid-run, its own `test` matrix job stays red in GitHub
Actions even when the remaining machines finish the build cleanly. Make the
`bunpo` job your required branch-protection check rather than the `test` matrix
jobs, and keep `if: ${{ !cancelled() }}` on `bunpo` so a lost machine never
skips it.

Pay attention to how Playwright setup hooks behave across batches:

- **Setup projects and `dependencies`.** Without `--no-deps`, Playwright runs
  dependent setup projects on every batch and writes the setup file into
  `junit.xml`. Bunpō rejects that file as unassigned and fails the batch.
  Instead, keep `*.setup.*` out of discovery (the `find` command below already
  excludes them), run the setup project once per machine before `bunpo --queue`
  without JUnit (`npx playwright test --project=setup --no-deps --reporter=list`),
  pass `--no-deps` in `run-batch.sh`, and run any `teardown` project once after
  `bunpo --queue` (`npx playwright test --project=teardown --no-deps --reporter=list`).
  Save auth state outside `test-results/` (for example
  `playwright/.auth/user.json`), because Playwright clears `test-results/` at
  the start of every batch.
- **`globalSetup` and `globalTeardown`.** Playwright does not emit `<testcase>`
  entries for `globalSetup`, so it does not cause extra-file errors, but it
  runs **once per batch** (on every `playwright test` invocation, not once per
  machine). Keep `globalSetup` fast and idempotent, move expensive one-time
  machine setup (such as starting a server or seeding a database) to a workflow
  step before `bunpo --queue`, or stay on static splitting if `globalSetup` is
  slow and cannot be moved out.

Save this helper as `run-batch.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

patterns=()
while IFS= read -r pattern; do
  [ -n "$pattern" ] && patterns+=("$pattern")
done < <(
  awk -v dir="$(pwd -P)/" 'length($0) > 0 { print dir $0 }' "$BUNPO_TESTS_FILE" |
    sed -e 's/[][\.*^$+?(){}|/]/\\&/g' -e 's/^/\/^/' -e 's/$/$\//'
)

# Given no files, Playwright would run the whole suite.
if [ "${#patterns[@]}" -eq 0 ]; then
  exit 0
fi

export PLAYWRIGHT_JUNIT_OUTPUT_FILE=junit.xml
exec npx playwright test --no-deps --reporter=list,junit "${patterns[@]}"
```

Then point the workflow at your queue server (`BUNPO_QUEUE_URL` repository
variable, plus `BUNPO_QUEUE_TOKEN` and `BUNPO_QUEUE_READ_TOKEN` secrets). If
you use a setup project, run `npx playwright test --project=setup --no-deps --reporter=list`
in a step before `Run tests from the live queue`:

```yaml
name: Tests

on:
  push:
    branches: [main]
  pull_request:

defaults:
  run:
    shell: bash

jobs:
  test:
    strategy:
      fail-fast: false
      matrix:
        machine: [0, 1, 2, 3]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
      - run: npm ci
      - run: npx playwright install --with-deps
      - uses: nuggocto/bunpo@v0
      - uses: actions/cache/restore@v6
        with:
          path: .bunpo/timings.json
          key: bunpo-timings-${{ github.sha }}
          restore-keys: bunpo-timings-
      - name: Run tests from the live queue
        env:
          INDEX: ${{ strategy.job-index }}
          TOTAL: ${{ strategy.job-total }}
          BUNPO_QUEUE_URL: ${{ vars.BUNPO_QUEUE_URL }}
          BUNPO_QUEUE_TOKEN: ${{ secrets.BUNPO_QUEUE_TOKEN }}
        run: |
          find tests \( -name '*.spec.[jt]s' -o -name '*.spec.[jt]sx' -o -name '*.spec.[cm][jt]s' -o -name '*.spec.[cm][jt]sx' -o -name '*.test.[jt]s' -o -name '*.test.[jt]sx' -o -name '*.test.[cm][jt]s' -o -name '*.test.[cm][jt]sx' \) |
            bunpo --queue "$BUNPO_QUEUE_URL" --build "$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT" \
              --index "$INDEX" --total "$TOTAL" --report junit.xml --file-from classname --path-prefix tests -- bash run-batch.sh

  bunpo:
    needs: test
    if: ${{ !cancelled() }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: nuggocto/bunpo@v0
      - uses: actions/cache/restore@v6
        with:
          path: .bunpo/timings.json
          key: bunpo-timings-${{ github.sha }}
          restore-keys: bunpo-timings-
      - name: Check build status
        env:
          BUNPO_QUEUE_URL: ${{ vars.BUNPO_QUEUE_URL }}
          BUNPO_QUEUE_READ_TOKEN: ${{ secrets.BUNPO_QUEUE_READ_TOKEN }}
        run: bunpo --queue "$BUNPO_QUEUE_URL" --build "$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT" --status
      - name: Merge timings
        run: bunpo merge
      - if: ${{ github.event_name == 'push' && github.ref == 'refs/heads/main' && needs.test.result == 'success' }}
        uses: actions/cache/save@v6
        with:
          path: .bunpo/timings.json
          key: bunpo-timings-${{ github.run_id }}-${{ github.run_attempt }}
```

## If something fails

- **`record` says files were not assigned to this machine.** The runner ran
  more files than it was given, so some ran twice. Check that the run
  command is exactly the one above.
- **`merge` says a machine's report is missing.** A `test` job stopped before
  uploading its files. Its own log says why.
- **`verify` says machines used different inputs or timings.** The machines
  listed different test files or restored different timing files. The
  message names the machines that differed.
- **`record` says none of the files were assigned to this machine.** The
  `--path-prefix` does not match your `testDir`.
