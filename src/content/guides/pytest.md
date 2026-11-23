---

title: "pytest"
order: 1
reportFormat: "JUnit XML (xunit1)"
selection: "File arguments"
summary: "Run pytest with -o junit_family=xunit1 and --rootdir=., record JUnit XML, and verify every file was assigned once."
---

Bunpō splits your test files across parallel GitHub Actions machines by how
long each took last time, and checks that every file was assigned exactly
once. This guide sets it up for pytest in one workflow file.

The first run has no timings yet, so files are dealt out evenly. From the
second run on, each machine gets a balanced share.

## What you need

- pytest with a JUnit report that names each test's file. The default
  report format (xunit2) leaves the file out, so the run command below
  passes `-o junit_family=xunit1`. It also passes `--rootdir=.`: pytest
  writes paths relative to its rootdir, which moves to `tests/` when the
  config lives there, as in projects with a `tests/pytest.ini`.
- Test files named `test_*.py` or `*_test.py` under `tests/`. If yours live
  elsewhere or use custom `python_files` patterns, change the `find` command in
  both jobs.

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
      - uses: actions/setup-python@v7
        with:
          python-version: "3.13"
      - run: pip install -r requirements.txt
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
          find tests -type f \( -name 'test_*.py' -o -name '*_test.py' \) | bunpo split --index "$INDEX" --total "$TOTAL" > mine.txt
          mine=()
          while IFS= read -r path; do mine+=("$path"); done < mine.txt

          # Given no files, pytest would run the whole suite.
          if [ "${#mine[@]}" -eq 0 ]; then
            bunpo record --index "$INDEX"
            exit 0
          fi

          status=0
          # --rootdir=. keeps report paths relative to the repository root even
          # when the pytest config lives in a subdirectory.
          pytest --rootdir=. -o junit_family=xunit1 --junitxml=junit.xml -- "${mine[@]}" || status=$?
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
        run: find tests -type f \( -name 'test_*.py' -o -name '*_test.py' \) | bunpo verify
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
  and runs `bunpo split` to get its share in `mine.txt`. It runs pytest on
  exactly those files, then `bunpo record` turns the report into timings.
  The test exit status is kept and returned last, so a failing test still
  fails the job after its times are recorded.
- **A machine with no files** skips pytest, which would otherwise run the
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
  `download-artifact`). If your suite lives in `backend/`, keep
  `working-directory: backend` on `run` steps and prefix every `.bunpo/` path
  in `uses:` steps with `backend/.bunpo/`. Use a suite-specific cache and
  artifact prefix (such as `bunpo-backend-timings-` and `bunpo-backend-`) when
  a repository runs more than one split suite.
- **`pytest-xdist` (`-n auto`).** Adding `-n auto` to the `pytest` command
  works as-is. Bunpō's printed predictions are summed test seconds across
  workers, so actual wall time is roughly `predicted / workers` and the
  dominant-file warning counts serial seconds.
- **Database sidecars and separate workflow lanes (e.g. SQLite vs `--use-postgres`).**
  Suites that `TRUNCATE` a shared PostgreSQL schema cannot safely raise
  `pytest-xdist` workers on one database, but each Bunpō machine can start its
  own PostgreSQL sidecar or testcontainer and run in parallel without lock
  contention. If the same
  directory runs in two lanes with different backends (such as fast SQLite on
  every push and weekly `--use-postgres` parity), give each workflow its own
  cache and artifact prefix (for example `bunpo-backend-sqlite-timings-` vs
  `bunpo-backend-postgres-timings-`) so their timings never mix.
- **Coverage thresholds.** A single machine runs only a fraction of the suite,
  so a per-machine `--cov-fail-under` check will fail even when all tests pass.
  Turn thresholds off on the `test` machines (`--no-cov` or `--cov-fail-under=0`),
  upload each machine's `.coverage` file, and combine and check coverage in the
  final job.
- **Remove any existing sharding.** If your repository already filters tests
  with a `conftest.py` shard hook or another splitter, turn it off before
  enabling Bunpō. Running both filters the suite twice; `verify` checks file
  assignment, not how many cases ran inside each file.
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
- **`record` says a test case names no file.** The report was written in the
  xunit2 format. Keep `-o junit_family=xunit1` on the pytest command.
- **`record` says none of the files were assigned to this machine.** The
  report paths are not relative to the repository root. Keep `--rootdir=.`
  on the pytest command.
