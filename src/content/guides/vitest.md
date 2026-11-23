---

title: "Vitest"
order: 3
reportFormat: "Two-column (--format lines)"
selection: "include from BUNPO_TESTS_FILE"
summary: "Use a tiny inline reporter that sums environment, import, setup, and test time, and pass escaped paths through BUNPO_TESTS_FILE."
---

Bunpō splits your test files across parallel GitHub Actions machines by how
long each took last time, and checks that every file was assigned exactly
once. This guide sets it up for Vitest in one workflow file.

The first run has no timings yet, so files are dealt out evenly. From the
second run on, each machine gets a balanced share.

## What you need

- Vitest 3.2 or later (for the `onTestModuleEnd` reporter hook and
  `module.diagnostic()`).
- Vitest reads file arguments as patterns: `vitest run tests/a.test.ts` also
  runs `other/tests/a.test.ts`. Its `include` option is anchored at the project
  root, so Bunpō passes the share through `BUNPO_TESTS_FILE`, escaping glob
  characters so `tests/[ab].test.ts` cannot also select `tests/a.test.ts`.
- Vitest's built-in JUnit reporter only times test bodies and leaves out module
  imports, setup files, and environment startup, which are often most of the
  wall time. The inline reporter below writes each passing file's full cost in
  milliseconds for `bunpo record --format lines` (writing `-` for failed files
  so they stay seen without recording a time).

Add this to `vitest.config.ts`:

```ts
import { readFileSync, writeFileSync } from "node:fs";
import { defineConfig } from "vitest/config";
import type { Reporter } from "vitest/node";

// Set by the CI workflow to the file listing this machine's share. include
// takes glob patterns, so each path is escaped to match only itself.
const bunpo = process.env.BUNPO_TESTS_FILE
	? readFileSync(process.env.BUNPO_TESTS_FILE, "utf8")
			.split("\n")
			.filter(Boolean)
			.map((file) => file.replace(/[*?[\]{}()!+@\\]/g, "\\$&"))
	: undefined;

// Writes each passing file's full cost (environment, imports, setup, and tests)
// in milliseconds, and "-" for failed files so they stay seen without a time.
// Vitest's JUnit report leaves out imports and setup.
const bunpoTimes: string[] = [];
const bunpoReporter: Reporter = {
	onTestModuleEnd(mod) {
		if (mod.state() === "failed") {
			bunpoTimes.push(`${mod.relativeModuleId} -`);
			return;
		}
		const d = mod.diagnostic();
		const ms = Math.max(
			0,
			Math.round(
				d.environmentSetupDuration +
					d.prepareDuration +
					d.collectDuration +
					d.setupDuration +
					d.duration,
			),
		);
		bunpoTimes.push(`${mod.relativeModuleId} ${ms}`);
	},
	onTestRunEnd() {
		writeFileSync("bunpo-times.txt", bunpoTimes.length ? bunpoTimes.join("\n") + "\n" : "");
	},
};

export default defineConfig({
	test: {
		// ...your existing options
		...(bunpo && {
			include: bunpo,
			reporters: ["default", bunpoReporter],
		}),
	},
});
```

When `BUNPO_TESTS_FILE` is not set, as on your own machine, Vitest behaves
exactly as before. On older Vitest versions without `module.diagnostic()`, you
can use `reporters: ["default", ["junit", { outputFile: "junit.xml", addFileAttribute: true }]]`
and `bunpo record --index "$INDEX" junit.xml` instead.

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
        run: |
          npx vitest list --filesOnly | bunpo split --index "$INDEX" --total "$TOTAL" > mine.txt
          mine=()
          while IFS= read -r path; do mine+=("$path"); done < mine.txt

          # Given no files, Vitest would run the whole suite.
          if [ "${#mine[@]}" -eq 0 ]; then
            bunpo record --index "$INDEX"
            exit 0
          fi

          status=0
          BUNPO_TESTS_FILE=mine.txt npx vitest run || status=$?
          bunpo record --index "$INDEX" --format lines bunpo-times.txt
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
        run: npx vitest list --filesOnly | bunpo verify
      - name: Merge timings
        run: bunpo merge
      - if: ${{ github.event_name == 'push' && github.ref == 'refs/heads/main' }}
        uses: actions/cache/save@v6
        with:
          path: .bunpo/timings.json
          key: bunpo-timings-${{ github.run_id }}-${{ github.run_attempt }}
```

## How it works

- **Each `test` machine** restores the timing file, lists every test file,
  and runs `bunpo split` to get its share in `mine.txt`. It runs Vitest on
  exactly those files, then `bunpo record` turns the report into timings.
  The test exit status is kept and returned last, so a failing test still
  fails the job after its times are recorded.
- **A machine with no files** skips Vitest, which would otherwise run the
  whole suite, and records an empty report.
- **The `bunpo` job** collects every machine's files. `bunpo verify` checks
  that all machines split the same input and that each file was assigned
  exactly once. `bunpo merge` folds the times into the timing file and fails
  if a machine's report is missing.
- **Only `main` saves timings.** Pull requests read them and never overwrite
  them. Each save uses a new cache key, and `restore-keys` picks the newest.

Change `machine: [0, 1, 2, 3]` to use more or fewer machines. The actions are
shown by tag; if you pin `nuggocto/bunpo` to a commit SHA, also pass
`with: version: v0.0.6` (matching that commit's tag) so the installed binary is
pinned too.

## Common setups

- **Tests in a subdirectory (monorepo).** GitHub's `defaults.run.working-directory`
  does not apply to `uses:` steps (`actions/cache`, `upload-artifact`,
  `download-artifact`). If your frontend lives in `front/`, keep
  `working-directory: front` on `run` steps, prefix every `.bunpo/` path in
  `uses:` steps with `front/.bunpo/`, and use suite-specific cache and artifact
  prefixes (such as `bunpo-front-timings-` and `bunpo-front-`).
- **Coverage thresholds.** A single machine runs only a fraction of the suite,
  so per-machine coverage thresholds (`coverage.thresholds`) will fail even
  when every test passes. Skip thresholds when `BUNPO_TESTS_FILE` is set
  (for example `thresholds: bunpo ? undefined : { ... }`) or run without
  coverage on the `test` machines, upload each machine's coverage JSON, and
  merge and enforce thresholds in the final job.
- **Remove any existing sharding.** Drop Vitest's `--shard` flag before
  enabling Bunpō so the suite is not filtered twice.

## If something fails

- **`record` says files were not assigned to this machine.** The runner ran
  more files than it was given, so some ran twice. Check that the run
  command matches the workflow above, that `include` comes from
  `BUNPO_TESTS_FILE`, and that no other config file overrides it.
- **`merge` says a machine's report is missing.** A `test` job stopped before
  uploading its files. Its own log says why.
- **`verify` says machines used different inputs or timings.** The machines
  listed different test files or restored different timing files. The
  message names the machines that differed.
