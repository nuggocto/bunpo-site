export interface Release {
	version: string;
	date: string;
	summary: string;
	url: string;
	notes: string[];
}

export const LATEST_VERSION = "v0.1.2";

export const releases: Release[] = [
	{
		version: "v0.1.2",
		date: "2026-11-26",
		summary:
			"Live-queue dashboard fixes for failed detail refreshes, empty timeline pages, and blocked sessionStorage, plus a local-trial prose correction.",
		url: "https://github.com/nuggocto/bunpo/releases/tag/v0.1.2",
		notes: [
			"Keep retrying live-queue dashboard details after a failed page request (such as HTTP 503) even when the build status is already terminal, stopping polling only once timeline and test details catch up or retries run out.",
			'Keep the timeline\'s "Load next 200 tests into timeline" pager visible when the loaded pages have no lease attempts yet.',
			"Show an error message instead of failing silently when signing into the dashboard with sessionStorage blocked, keeping the token field intact.",
			"Corrected the LaTabdhir PostgreSQL prose summary in docs/trials/2026-11-21-souhib-local-trial.md to match its measured table (369.0–379.3 s, 2.8–5.7% above the 359 s prediction).",
		],
	},
	{
		version: "v0.1.1",
		date: "2026-11-26",
		summary:
			"Clean multi-page dashboard refresh, alarm-backed BuildIndex retry on Cloudflare, runner-ID batch filenames, and strict server checksum verification.",
		url: "https://github.com/nuggocto/bunpo/releases/tag/v0.1.1",
		notes: [
			"Reload all loaded timeline and test pages from cursor 0 along the next_cursor chain on live-queue dashboard refresh (stopping early when next_cursor is null), keeping loaded pages without stale states or missed filter matches.",
			"Retry failed BuildIndex updates in the Cloudflare Worker (BuildDO) by alarm with exponential backoff (60 s up to 1 h, capped at 8 retries, never past the 7-day deletion alarm) so finished builds converge without a client request.",
			"Name bunpo --queue batch files by runner ID (queue-<runner-id>.txt) instead of --index so two runners sharing --index and --dir do not overwrite each other's test list.",
			"Fail the bunpo-server release smoke check explicitly when its checksum is missing from SHA256SUMS or does not match.",
		],
	},
	{
		version: "v0.1.0",
		date: "2026-11-26",
		summary:
			"Self-hosted live queue (--queue and --status), Cloudflare Worker, standalone bunpo-server, and shared read-only web dashboard.",
		url: "https://github.com/nuggocto/bunpo/releases/tag/v0.1.0",
		notes: [
			"Added live-queue mode (bunpo --queue and --status) to pull test batches as machines finish, reassign work from killed or slow runners, and write report-0.json for bunpo merge.",
			"Added Cloudflare Worker queue server (worker/) backed by SQLite Durable Objects with 7-day automatic cleanup.",
			"Added standalone Go queue server (bunpo-server) with optional --data persistence, cross-compiled release binaries (6.4 to 7.1 MiB), and a scratch Dockerfile.",
			"Added a shared read-only web dashboard served by both bunpo-server and the Cloudflare Worker, showing recent builds, a per-machine lease timeline, slowest files, and retried or failed tests.",
			"Added CLI reference (docs/cli.md), self-hosting guide, HTTP protocol spec, live-queue workflows in all five runner guides, and Cloudflare Free-plan trial record.",
			"Static mode (split, plan, record, merge, verify, version), .bunpo/ file formats, and exit codes are unchanged. The bunpo CLI grew from 3.2 MiB to 7.0 MiB on linux/amd64 (6.4 to 7.2 MiB across targets) due to Go's standard library HTTP/TLS client.",
		],
	},
	{
		version: "v0.0.7",
		date: "2026-11-23",
		summary:
			"Gated release promotion, hardened Action installer, Playwright anchored regex selection, and cleaner re-runs.",
		url: "https://github.com/nuggocto/bunpo/releases/tag/v0.0.7",
		notes: [
			"Publish releases as prereleases until cross-OS smoke checks pass, then promote stable tags and move @v0.",
			"Forward github.token only on github.com and restrict @v0 major-tag lookup to stable vX.Y.Z tags.",
			"Delete leftover report-<index>.json at the start of bunpo record and format extreme totals without time.Duration overflow.",
			"Switch the Playwright guide from --test-list to case-sensitive anchored regex arguments so filenames starting with '[' work, and widen pytest/Playwright find patterns to match runner defaults including symlinks.",
			"Gate cache saves on passing test runs in all five runner guides and document the full bunpo plan workflow for busy queues.",
		],
	},
	{
		version: "v0.0.6",
		date: "2026-11-22",
		summary: "CLI version flags, Playwright retry clarification, and live GitHub Actions trial.",
		url: "https://github.com/nuggocto/bunpo/releases/tag/v0.0.6",
		notes: [
			"Accept -version and --version alongside bunpo version.",
			"Archived the live GitHub Actions Playwright trial on LaTabdhir (68 specs across x64 and ARM64 self-hosted runners).",
			"Corrected Playwright JUnit retry timing notes and documented heterogeneous self-hosted runners and queue delays.",
		],
	},
	{
		version: "v0.0.5",
		date: "2026-11-22",
		summary:
			"Failed-file markers in --format lines, full-cost Vitest reporter, and 600x fewer split allocations.",
		url: "https://github.com/nuggocto/bunpo/releases/tag/v0.0.5",
		notes: [
			'Support "-" in --format lines reports so failed files stay seen without recording a timing.',
			"Added full-cost Vitest inline reporter and monorepo, coverage-threshold, sidecar, and filtered-suite guide sections.",
			"Rejected null elements inside timings.json samples arrays and clamped report limitReader reads at the byte limit.",
			"Added zero-allocation canonicalization, reused the SHA-256 digest buffer, and parsed valid JSON in a single pass (50k split: 252k to 403 allocations, ~49 ms to ~31 ms).",
			"Paginated major-tag (@v0) lookups in scripts/install.sh and validated matched tags.",
		],
	},
	{
		version: "v0.0.4",
		date: "2026-11-21",
		summary:
			"Stricter nested JSON validation, canonical timing keys, and Vitest file-based test lists.",
		url: "https://github.com/nuggocto/bunpo/releases/tag/v0.0.4",
		notes: [
			"Required nested members in timings.json and run reports, rejected null shards in plan.json, and rejected non-canonical timing keys.",
			"Deleted stale plan.json at the start of bunpo plan and validated --path-prefix upfront in bunpo record.",
			"Switched the Vitest guide to BUNPO_TESTS_FILE=mine.txt to avoid Linux's 128 KiB env-var limit.",
			"Renamed the Action to Bunpo for ASCII Marketplace search and hardened tag checks in the release workflow.",
		],
	},
	{
		version: "v0.0.3",
		date: "2026-11-21",
		summary:
			"First public binary release, GitHub Action, five runner guides, and synthetic benchmarks.",
		url: "https://github.com/nuggocto/bunpo/releases/tag/v0.0.3",
		notes: [
			"Cross-compiled static binaries (Linux, macOS, Windows on x86-64 and ARM64) with SHA256SUMS.",
			"GitHub Action (nuggocto/bunpo@v0) that resolves tags, verifies checksums, and puts bunpo on PATH.",
			"Guides for pytest, Jest, Vitest, RSpec, and Playwright checked against real runners with guidecheck.",
			"GitHub Actions workflow annotations (::warning::, ::error::, ::notice::) and NO_COLOR-aware terminal labels.",
		],
	},
	{
		version: "v0.0.2",
		date: "2026-11-20",
		summary:
			"Complete CLI (split, plan, record, merge, verify), bounded JUnit reader, and manifests.",
		url: "https://github.com/nuggocto/bunpo/releases/tag/v0.0.2",
		notes: [
			"Added split, plan, record, merge, verify, and version with 0/1/2 exit codes.",
			"Bounded JUnit XML and two-column report readers using exact rational sums rounded half up once per file.",
			"Atomic writes (temp file, fsync, rename) and os.Root directory confinement.",
			"Eight-process end-to-end tests covering stale caches, skipped runners, dominant files, and empty shards.",
		],
	},
	{
		version: "v0.0.1",
		date: "2026-11-20",
		summary: "Core integer-only split engine and strict timing file format.",
		url: "https://github.com/nuggocto/bunpo/releases/tag/v0.0.1",
		notes: [
			"Canonical POSIX/Windows test identifiers with collision detection, longest-first dealing, and SHA-256 split digests.",
			"Strict versioned JSON timing file (encoding/json/v2), integer half-up median over 5 samples, and pruning after 30 unseen runs.",
			"2,000-seed property tests, brute-force optimal makespan oracle verifying the 4/3 bound, and fuzzers.",
		],
	},
];
