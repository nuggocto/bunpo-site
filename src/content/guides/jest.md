---

title: "Jest"
order: 2
reportFormat: "JUnit XML (jest-junit)"
selection: "Anchored escaped regex"
summary: "List files with jest --listTests, pass exact anchored patterns so Jest cannot double-run files, and record jest-junit XML."
---

Bunpō splits your test files across parallel GitHub Actions machines by how
long each took last time, and checks that every file was assigned exactly
once. This guide sets it up for Jest in one workflow file.

The first run has no timings yet, so files are dealt out evenly. From the
second run on, each machine gets a balanced share.

## What you need

- [`jest-junit`](https://github.com/jest-community/jest-junit) as a dev
  dependency: `npm install --save-dev jest-junit`. The workflow turns on its
  file attribute, which Bunpō needs.
- Nothing else in your Jest config. The list of test files comes from
  `jest --listTests`, so it follows your own `testMatch` and roots.

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
          JEST_JUNIT_OUTPUT_NAME: junit.xml
          JEST_JUNIT_ADD_FILE_ATTRIBUTE: "true"
        run: |
          npx jest --listTests | sed "s|^$PWD/||" | bunpo split --index "$INDEX" --total "$TOTAL" > mine.txt
          mine=()
          while IFS= read -r path; do mine+=("$path"); done < mine.txt

          # Given no files, Jest would run the whole suite.
          if [ "${#mine[@]}" -eq 0 ]; then
            bunpo record --index "$INDEX"
            exit 0
          fi

          status=0
          # Jest reads each argument as a regular expression over absolute
          # paths, and even --runTestsByPath expands glob characters, so each
          # path becomes an anchored, escaped expression matching only itself.
          patterns=()
          while IFS= read -r pattern; do patterns+=("$pattern"); done < <(
            awk -v dir="$PWD/" '{ print dir $0 }' mine.txt |
              sed -e 's/[][\.*^$+?(){}|]/\\&/g' -e 's/^/^/' -e 's/$/$/'
          )
          npx jest --ci --reporters=default --reporters=jest-junit -- "${patterns[@]}" || status=$?
          bunpo record --index "$INDEX" junit.xml
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
      - uses: actions/setup-node@v7
        with:
          node-version: 24
      - run: npm ci
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
        run: npx jest --listTests | sed "s|^$PWD/||" | bunpo verify
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
  and runs `bunpo split` to get its share in `mine.txt`. It runs Jest on
  exactly those files, then `bunpo record` turns the report into timings.
  The test exit status is kept and returned last, so a failing test still
  fails the job after its times are recorded.
- **A machine with no files** skips Jest, which would otherwise run the
  whole suite, and records an empty report.
- **The `bunpo` job** collects every machine's files. `bunpo verify` checks
  that all machines split the same input and that each file was assigned
  exactly once. `bunpo merge` folds the times into the timing file and fails
  if a machine's report is missing.
- **Only passing `main` runs save timings.** Pull requests read them and never
  overwrite them, and failed `main` runs leave the previous cache intact so
  "Re-run failed jobs" restores the same split. Each save uses a new cache key,
  and `restore-keys` picks the newest.

Change `machine: [0, 1, 2, 3]` to use more or fewer machines. The actions are
shown by tag; if you pin `nuggocto/bunpo` to a commit SHA, also pass
`with: version: v0.0.6` (matching that commit's tag) so the installed binary is
pinned too.

## Common setups

- **Tests in a subdirectory (monorepo).** GitHub's `defaults.run.working-directory`
  does not apply to `uses:` steps (`actions/cache`, `upload-artifact`,
  `download-artifact`). If your suite lives in `web/`, keep
  `working-directory: web` on `run` steps, prefix every `.bunpo/` path in
  `uses:` steps with `web/.bunpo/`, and use suite-specific cache and artifact
  prefixes (such as `bunpo-web-timings-` and `bunpo-web-`).
- **Coverage thresholds.** A single machine runs only a fraction of the suite,
  so `coverageThreshold` will fail even when all tests pass. Pass
  `--coverageThreshold='{}'` on the `test` machines and enforce thresholds
  after merging coverage in the final job.
- **Remove any existing sharding.** Drop Jest's `--shard` flag before enabling
  Bunpō so the suite is not filtered twice.
- **Busy queues and concurrent pushes (`bunpo plan`).** If another `main` run
  saves newer timings while one of your shards is still waiting for a runner,
  the late shard restores a different cache and `verify` fails. To freeze one
  split for the whole workflow, run `bunpo plan --total M` in an upfront job,
  upload `.bunpo/plan.json`, and run `bunpo split --index "$INDEX" --plan` on
  each machine.

## If something fails

- **`record` says files were not assigned to this machine.** The runner ran
  more files than it was given, so some ran twice. Check that the run
  command is exactly the one above.
- **`merge` says a machine's report is missing.** A `test` job stopped before
  uploading its files. Its own log says why.
- **`verify` says machines used different inputs or timings.** The machines
  listed different test files or restored different timing files. The
  message names the machines that differed.
- **`record` says a test case names no file.** `JEST_JUNIT_ADD_FILE_ATTRIBUTE`
  is missing from the step's environment.
