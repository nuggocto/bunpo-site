---

title: "RSpec"
order: 4
reportFormat: "JUnit XML (rspec_junit_formatter)"
selection: "File arguments"
summary: "Feed spec/*_spec.rb to bunpo split, run RSpec with RspecJunitFormatter, and verify every spec file once."
---

Bunpō splits your test files across parallel GitHub Actions machines by how
long each took last time, and checks that every file was assigned exactly
once. This guide sets it up for RSpec in one workflow file.

The first run has no timings yet, so files are dealt out evenly. From the
second run on, each machine gets a balanced share.

## What you need

- [`rspec_junit_formatter`](https://github.com/sj26/rspec_junit_formatter) in
  your Gemfile's test group. It writes each test's file by default.
- Spec files named `*_spec.rb` under `spec/`. If yours live elsewhere,
  change the `find` command in both jobs.

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
      - uses: ruby/setup-ruby@v1
        with:
          bundler-cache: true
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
        run: |
          find spec -name '*_spec.rb' | bunpo split --index "$INDEX" --total "$TOTAL" > mine.txt
          mine=()
          while IFS= read -r path; do mine+=("$path"); done < mine.txt

          # Given no files, RSpec would run the whole suite.
          if [ "${#mine[@]}" -eq 0 ]; then
            bunpo record --index "$INDEX"
            exit 0
          fi

          status=0
          bundle exec rspec --format progress --format RspecJunitFormatter --out junit.xml -- "${mine[@]}" || status=$?
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
        run: find spec -name '*_spec.rb' | bunpo verify
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
  and runs `bunpo split` to get its share in `mine.txt`. It runs RSpec on
  exactly those files, then `bunpo record` turns the report into timings.
  The test exit status is kept and returned last, so a failing test still
  fails the job after its times are recorded.
- **A machine with no files** skips RSpec, which would otherwise run the
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
  `download-artifact`). If your app lives in `api/`, keep
  `working-directory: api` on `run` steps, prefix every `.bunpo/` path in
  `uses:` steps with `api/.bunpo/`, and use suite-specific cache and artifact
  prefixes (such as `bunpo-api-timings-` and `bunpo-api-`).
- **Coverage thresholds.** SimpleCov minimum coverage checks fail when one
  machine runs only a fraction of the suite. Disable minimum coverage on the
  `test` machines and collate results in the final job.
- **Remove any existing sharding.** Disable any existing test splitter before
  enabling Bunpō so specs are not filtered twice.
- **Busy queues, re-runs, and concurrent pushes (`bunpo plan`).** If another
  `main` run saves newer timings while a shard is queued or before you click
  "Re-run failed jobs", the late shard restores a different cache and `verify`
  fails. To freeze one split for the whole workflow, add an upfront `plan` job
  that restores `.bunpo/timings.json`, runs `bunpo plan --total M`, and uploads
  `.bunpo/plan.json` and `.bunpo/timings.json` with `include-hidden-files: true`;
  download that artifact into `.bunpo` on each `test` machine and run
  `bunpo split --index "$INDEX" --plan`, and download the same snapshot in the
  final job before `bunpo merge`.

## If something fails

- **`record` says files were not assigned to this machine.** The runner ran
  more files than it was given, so some ran twice. Check that the run
  command is exactly the one above.
- **`merge` says a machine's report is missing.** A `test` job stopped before
  uploading its files. Its own log says why.
- **`verify` says machines used different inputs or timings.** The machines
  listed different test files or restored different timing files. The
  message names the machines that differed.
