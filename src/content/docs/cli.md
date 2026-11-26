---

title: "CLI reference"
summary: "Every command, flag, exit code, environment variable, and .bunpo/ file for bunpo and bunpo-server."
---

Reference for `bunpo` and `bunpo-server`. `bunpo split` writes test file paths to standard output; every command writes status and error messages to standard error. For the live-queue overview see [/queue](/queue); for the HTTP contract and self-hosting steps see [docs/queue-protocol.md](https://github.com/nuggocto/bunpo/blob/shrek/docs/queue-protocol.md) and [docs/self-hosting.md](https://github.com/nuggocto/bunpo/blob/shrek/docs/self-hosting.md).

## Exit codes

| Binary         | `0`                                         | `1`                                                                                                          | `2`                                                          |
| -------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `bunpo`        | Success, `version`, or `-h`                 | Check or build failed (`verify`, `merge`, `record` overlap, `--queue` non-`passed` verdict or runtime error) | Bad usage, invalid flags, missing env vars, or invalid input |
| `bunpo-server` | Clean shutdown (`SIGINT`/`SIGTERM`) or `-h` | Listen failure, `--data` load/runtime error, or shutdown error                                               | Bad flags, unexpected arguments, or invalid/missing tokens   |

## Commands

### `bunpo split`

Reads canonical test file paths from standard input (or `plan.json` with `--plan`), prints this machine's share to standard output, and writes `manifest-<index>.json` into `--dir`.

```sh
find tests -name 'test_*.py' | bunpo split --index 0 --total 4
```

| Flag      | Default                      | Description                                                 |
| --------- | ---------------------------- | ----------------------------------------------------------- |
| `--dir`   | `.bunpo`                     | Directory for Bunpō's files                                 |
| `--index` | _(required)_                 | This machine's 0-based index (`0` to `total-1`)             |
| `--total` | _(required unless `--plan`)_ | Number of parallel machines (`1` to `256`)                  |
| `--plan`  | `false`                      | Take this machine's share from `plan.json` instead of stdin |

### `bunpo plan`

Reads the full test list from standard input, splits once for all machines, and writes `plan.json` into `--dir` so every machine running `bunpo split --plan` uses the exact same split.

```sh
find tests -name 'test_*.py' | bunpo plan --total 4
```

| Flag      | Default      | Description                                |
| --------- | ------------ | ------------------------------------------ |
| `--dir`   | `.bunpo`     | Directory for Bunpō's files                |
| `--total` | _(required)_ | Number of parallel machines (`1` to `256`) |

### `bunpo record`

Reads one or more JUnit XML or two-column timing reports, checks reported files against `manifest-<index>.json`, and writes `report-<index>.json` into `--dir`. Fails with exit `1` if the reports include files not assigned to this machine.

```sh
bunpo record --index 0 junit.xml
```

| Flag            | Default      | Description                                                                  |
| --------------- | ------------ | ---------------------------------------------------------------------------- |
| `--dir`         | `.bunpo`     | Directory for Bunpō's files                                                  |
| `--index`       | _(required)_ | This machine's 0-based index, matching `split`                               |
| `--format`      | `junit`      | Report format: `junit` (JUnit XML) or `lines` (`path<ws>ms` or `path<ws>-`)  |
| `--file-from`   | `file`       | Where JUnit XML keeps each test's file path: `file`, `classname`, or `suite` |
| `--path-prefix` | `""`         | Relative directory prepended to every path in the reports                    |

### `bunpo merge`

Folds every machine's `report-<index>.json` in `--dir` into `timings.json` (keeping up to 5 timed samples per file and pruning files unseen for 30 merges), then removes the consumed report files. Fails with exit `1` if any machine's report is missing or if two reports overlap.

```sh
bunpo merge --dir .bunpo
```

| Flag    | Default  | Description                                                                |
| ------- | -------- | -------------------------------------------------------------------------- |
| `--dir` | `.bunpo` | Directory holding `timings.json` and every machine's `report-<index>.json` |

### `bunpo verify`

Reads the full test list from standard input and verifies every `manifest-<index>.json` in `--dir`: matching machine counts, matching input/timings digests, no duplicates, no missing files, and no extra files.

```sh
find tests -name 'test_*.py' | bunpo verify --dir .bunpo
```

| Flag    | Default  | Description                                               |
| ------- | -------- | --------------------------------------------------------- |
| `--dir` | `.bunpo` | Directory holding every machine's `manifest-<index>.json` |

### `bunpo --queue`

Runs in live-queue worker mode (pulling dynamically sized test batches from a queue server until the build finishes) or queries a build's status with `--status`. Plain `http://` is refused outside loopback unless `--allow-insecure-http` is set.

```sh
# Worker mode (each machine)
find tests -name 'test_*.py' | \
  bunpo --queue "$BUNPO_QUEUE_URL" --build "$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT" \
    --index 0 --total 4 --report junit.xml -- bash run-batch.sh

# Final status job (writes report-0.json when resolved so bunpo merge can run)
bunpo --queue "$BUNPO_QUEUE_URL" --build "$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT" --status
```

| Flag                    | Default                     | Description                                                                                       |
| ----------------------- | --------------------------- | ------------------------------------------------------------------------------------------------- |
| `--allow-insecure-http` | `false`                     | Allow plain `http://` outside loopback (for private networks)                                     |
| `--build`               | _(required)_                | Build identifier (`[A-Za-z0-9][A-Za-z0-9._-]{0,127}`, no `..`)                                    |
| `--build-timeout`       | `6h0m0s`                    | Build deadline (`lease-ttl` to `24h`)                                                             |
| `--dir`                 | `.bunpo`                    | Directory for `timings.json`, batch files, and `report-0.json`                                    |
| `--file-from`           | `file`                      | Where JUnit XML keeps each test's file path: `file`, `classname`, or `suite`                      |
| `--format`              | `junit`                     | Report format: `junit` or `lines`                                                                 |
| `--index`               | `-1` (omitted)              | Optional machine index metadata (`0` to `255`)                                                    |
| `--lease-ttl`           | `1m0s`                      | Lease TTL duration (`10s` to `10m`, enforced by server)                                           |
| `--max-attempts`        | `3`                         | Maximum attempts per test file (`1` to `10`)                                                      |
| `--max-batch`           | `200`                       | Maximum test files per lease (`1` to `200`)                                                       |
| `--path-prefix`         | `""`                        | Relative directory prepended to every path in the reports                                         |
| `--report`              | _(required in worker mode)_ | Report file path written by the command (repeatable)                                              |
| `--status`              | `false`                     | Print verdict and write `report-0.json` when build finished with no unresolved tests or conflicts |
| `--total`               | _(required in worker mode)_ | Number of parallel machines (`1` to `256`)                                                        |

### `bunpo version` and `bunpo help`

- `bunpo version` (aliases: `-version`, `--version`): prints `bunpo <version>` and exits `0`.
- `bunpo help` (aliases: `-h`, `-help`, `--help`): prints usage summary and exits `0`.
- `bunpo <command> -h` or `bunpo --queue -h`: prints command flags and exits `0`.

### `bunpo-server`

Standalone HTTP server for the live queue and embedded web dashboard. Terminate TLS at a reverse proxy. Tokens are read only from environment variables, never flags. Run at most one process per `--data` directory.

```sh
bunpo-server --addr 127.0.0.1:8080 --data /var/lib/bunpo
```

| Flag     | Default          | Description                                                           |
| -------- | ---------------- | --------------------------------------------------------------------- |
| `--addr` | `127.0.0.1:8080` | TCP address to listen on                                              |
| `--data` | `""`             | Directory for persistent CRC-32C build logs (omit for in-memory only) |

## Environment variables

| Variable                                      | Used by                                  | Purpose                                                                                                                                                                      |
| --------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BUNPO_QUEUE_TOKEN`                           | `bunpo --queue`, `bunpo-server`          | Write bearer token (`>= 16` bytes, distinct from read token). Fallback for `--status`. Stripped from child test command environments.                                        |
| `BUNPO_QUEUE_READ_TOKEN`                      | `bunpo --queue --status`, `bunpo-server` | Read-only bearer token (`>= 16` bytes, distinct from write token). Preferred by `--status` and used in the browser dashboard. Stripped from child test command environments. |
| `BUNPO_TESTS_FILE`                            | Child command of `bunpo --queue`         | Absolute path to the newline-delimited list of test files in the current lease (e.g. `.bunpo/queue-<runner-id>.txt`).                                                        |
| `GITHUB_ACTIONS`                              | `bunpo`                                  | When `true`, formats warnings, errors, and notices as GitHub Actions workflow commands (`::warning::`, `::error::`, `::notice::`).                                           |
| `NO_COLOR`, `COLORTERM`, `TERM`, `WT_SESSION` | `bunpo`                                  | Control ANSI label colors on terminal stderr (`NO_COLOR` non-empty or `TERM=dumb` disables color; `COLORTERM=truecolor` or `24bit` enables truecolor).                       |

## Files in `.bunpo/`

Every command opens `--dir` (default `.bunpo`) via `os.Root`, preventing path traversal or symlink escape.

| File                    | Written by                                     | Read by                                 | Purpose                                                                                      |
| ----------------------- | ---------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------- |
| `timings.json`          | `merge`                                        | `split`, `plan`, `merge`, `--queue`     | Versioned per-file timing history (up to 5 samples/file; pruned after 30 merges unseen).     |
| `plan.json`             | `plan`                                         | `split --plan`                          | Precomputed shards and input/timings digest shared across machines.                          |
| `manifest-<index>.json` | `split`                                        | `record`, `verify`                      | Machine's assigned files, machine count, and input/timings digest.                           |
| `report-<index>.json`   | `record`, `--queue --status` (`report-0.json`) | `merge`                                 | Per-file observed durations (and untimed failure markers); removed by `merge` after folding. |
| `queue-<runner-id>.txt` | `--queue`                                      | Child test command (`BUNPO_TESTS_FILE`) | Current leased batch's file paths, one per line.                                             |

## Static mode vs. live queue

Static mode needs no server, starts each test runner only once per machine, and works on fork pull requests without secrets. Live queue mode runs a self-hosted queue server (`bunpo-server` or the Cloudflare Worker) and hands out batches as machines finish, reassigning work when a machine is slower, starts late, or gets killed.

| Condition                                              | Recommended mode                              |
| ------------------------------------------------------ | --------------------------------------------- |
| Identical CI machines starting together                | Static (`split`, `record`, `verify`, `merge`) |
| Fork pull requests without repository secrets          | Static                                        |
| Mixed-speed runners (x64 + ARM64, noisy hosts)         | Live queue (`--queue`)                        |
| Runners starting minutes apart behind CI queues        | Live queue (`--queue`)                        |
| Spot or preemptible runners that can be killed mid-build | Live queue (`--queue`)                        |
