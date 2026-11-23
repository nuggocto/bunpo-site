export interface MachineBar {
	label: string;
	seconds: number;
	files: number;
	inlineNote?: string;
	note?: string;
}

export interface TrialScenario {
	id: string;
	title: string;
	shortTag: string;
	subtitle: string;
	environment: string;
	baselineSeconds: number;
	baselineLabel: string;
	beforeLabel: string;
	beforeHeadline: string;
	afterLabel: string;
	afterHeadline: string;
	gainLabel: string;
	gainHeadline: string;
	gainDetail: string;
	beforeTitle: string;
	beforeMeta: string;
	beforeBars: MachineBar[];
	afterTitle: string;
	afterMeta: string;
	afterBars: MachineBar[];
	takeaway: string;
	caveat: string;
}

export const trials: TrialScenario[] = [
	{
		id: "majlisna-backend",
		title: "Majlisna backend",
		shortTag: "pytest · 4 machines · -6m 02s",
		subtitle: "113 pytest files · 2,777 tests · PostgreSQL 16 · 4 machines",
		environment: "Local 4-CPU-pinned trial, serial pytest --use-postgres",
		baselineSeconds: 490.0,
		baselineLabel: "8m 10s on 1 machine",
		beforeLabel: "1 machine → count split",
		beforeHeadline: "8m 10s → 4m 15s",
		afterLabel: "with Bunpō timings",
		afterHeadline: "2m 08s slowest shard",
		gainLabel: "time saved",
		gainHeadline: "6m 02s saved (3.84x faster)",
		gainDetail: "2m 07s faster than splitting by count · spread cut from 179.5s to 7.3s",
		beforeTitle: "Round 1 · split by count",
		beforeMeta: "slowest 4m 15s · 179.5s spread",
		beforeBars: [
			{ label: "Machine 0", seconds: 75.8, files: 29 },
			{ label: "Machine 1", seconds: 75.2, files: 28 },
			{ label: "Machine 2", seconds: 254.7, files: 28, inlineNote: "131s WS file" },
			{ label: "Machine 3", seconds: 101.9, files: 28 },
		],
		afterTitle: "Round 2 · Bunpō timed split",
		afterMeta: "slowest 2m 08s · 7.3s spread",
		afterBars: [
			{ label: "Machine 0", seconds: 127.6, files: 1, inlineNote: "131s WS alone" },
			{ label: "Machine 1", seconds: 121.9, files: 36 },
			{ label: "Machine 2", seconds: 125.9, files: 40 },
			{ label: "Machine 3", seconds: 120.3, files: 36 },
		],
		takeaway:
			"3.84x faster than 1 machine (8m 10s to 2m 08s). Spread dropped from 179.5 s to 7.3 s.",
		caveat:
			"Each shard runs its own Postgres testcontainer. Test-command wall time only; CI checkout and dependency install are extra.",
	},
	{
		id: "latabdhir-postgres",
		title: "LaTabdhir Postgres parity",
		shortTag: "pytest · 4 machines · -19m 14s",
		subtitle: "495 pytest files · 6,469 tests · PostgreSQL 18 · 4 machines",
		environment: "Local 4-CPU-pinned trial, serial pytest --use-postgres",
		baselineSeconds: 1529.7,
		baselineLabel: "25m 30s on 1 machine",
		beforeLabel: "1 machine → count split",
		beforeHeadline: "25m 30s → 6m 36s",
		afterLabel: "with Bunpō timings",
		afterHeadline: "6m 16s slowest shard",
		gainLabel: "time saved",
		gainHeadline: "19m 14s saved (4.07x faster)",
		gainDetail: "20s faster than splitting by count · spread cut from 54.5s to 5.4s",
		beforeTitle: "Round 1 · split by count",
		beforeMeta: "slowest 6m 36s · 54.5s spread",
		beforeBars: [
			{ label: "Machine 0", seconds: 363.1, files: 124 },
			{ label: "Machine 1", seconds: 395.7, files: 124 },
			{ label: "Machine 2", seconds: 385.2, files: 124 },
			{ label: "Machine 3", seconds: 341.2, files: 123 },
		],
		afterTitle: "Round 2 · Bunpō timed split",
		afterMeta: "slowest 6m 16s · 5.4s spread",
		afterBars: [
			{ label: "Machine 0", seconds: 375.5, files: 123 },
			{ label: "Machine 1", seconds: 370.0, files: 123 },
			{ label: "Machine 2", seconds: 370.6, files: 127 },
			{ label: "Machine 3", seconds: 371.6, files: 122 },
		],
		takeaway:
			"4.07x faster than 1 machine (25m 30s to 6m 16s). Predicted 5m59s on all four shards.",
		caveat:
			"Slightly over 4x because each shard starts with a fresh Postgres 18 database instead of 25 minutes of session churn.",
	},
	{
		id: "latabdhir-e2e-gha",
		title: "LaTabdhir Playwright",
		shortTag: "GitHub Actions · 2 runners · -49.6%",
		subtitle: "68 specs · 232 cases · Docker Compose · 2 self-hosted runners",
		environment: "Live GitHub Actions (v0.0.5 via nuggocto/bunpo@v0), x64 + ARM64",
		baselineSeconds: 1152,
		baselineLabel: "19m 12s job wall on 1 machine",
		beforeLabel: "1-machine job → cold split",
		beforeHeadline: "19m 12s → 8m 46s",
		afterLabel: "warm Bunpō timed job",
		afterHeadline: "7m 32s slowest job",
		gainLabel: "cold workflow saved",
		gainHeadline: "9m 49s saved (-49.6%)",
		gainDetail: "Cold workflow 19m 47s → 9m 58s · warm job cut another 1m 14s (8m 46s → 7m 32s)",
		beforeTitle: "Cold run · split by count",
		beforeMeta: "slowest job 8m 46s · workflow 9m 58s",
		beforeBars: [
			{ label: "Machine 0 (x64)", seconds: 348, files: 34, note: "3m 35s Playwright" },
			{ label: "Machine 1 (ARM64)", seconds: 526, files: 34, note: "7m 31s Playwright" },
		],
		afterTitle: "Warm run · Bunpō timed split",
		afterMeta: "slowest job 7m 32s · 16s verify+merge",
		afterBars: [
			{ label: "Machine 0 (x64)", seconds: 261, files: 31, note: "3m 32s Playwright" },
			{ label: "Machine 1 (ARM64)", seconds: 452, files: 37, note: "6m 29s Playwright" },
		],
		takeaway:
			"Cold workflow cut from 19m 47s to 9m 58s (49.6% shorter). Warm slowest job dropped to 7m 32s; verify + merge took 16 s.",
		caveat:
			"Machine 0 (x64) is faster than Machine 1 (ARM64), and in the warm run another CI job queued x64 for 13m 09s. Static splitting balances file weight, not mixed hardware speed or runner queues.",
	},
	{
		id: "synthetic-40",
		title: "Synthetic 40-file suite",
		shortTag: "declared benchmark · 1.021 ratio",
		subtitle: "40 pytest files · 100–900 ms · 4 parallel processes",
		environment: "Declared benchmark in docs/benchmark.md (pytest setup: 134 ms)",
		baselineSeconds: 19.04,
		baselineLabel: "19.04 s summed test time",
		beforeLabel: "Run 1 · split by count",
		beforeHeadline: "5.10s slowest (1.056)",
		afterLabel: "Run 3 · Bunpō timings",
		afterHeadline: "5.04s slowest (1.028)",
		gainLabel: "predicted balance",
		gainHeadline: "1.021 ratio (≤ 1.10 target)",
		gainDetail: "19.04s summed test time across 40 files · 134 ms pytest setup per machine",
		beforeTitle: "Run 1 · split by count",
		beforeMeta: "slowest 5.10s · wall ratio 1.056",
		beforeBars: [
			{ label: "Machine 0", seconds: 4.823, files: 10 },
			{ label: "Machine 1", seconds: 4.92, files: 10 },
			{ label: "Machine 2", seconds: 5.044, files: 10 },
			{ label: "Machine 3", seconds: 5.095, files: 10 },
		],
		afterTitle: "Run 3 · Bunpō timed split",
		afterMeta: "slowest 5.04s · pred 1.021 · wall 1.028",
		afterBars: [
			{ label: "Machine 0", seconds: 5.042, files: 10 },
			{ label: "Machine 1", seconds: 5.008, files: 10 },
			{ label: "Machine 2", seconds: 4.905, files: 10 },
			{ label: "Machine 3", seconds: 4.91, files: 10 },
		],
		takeaway: "Predicted ratio 1.021 (under the 1.10 target). Measured wall ratio 1.028.",
		caveat:
			"Includes 134 ms fixed pytest startup per machine. See /benchmarks for the Tight (1.104) and Indivisible (2.995) cases where file-level LPT cannot balance evenly.",
	},
];

export const workedExample = {
	files: [
		{ name: "tests/test_auth.py", minutes: 9 },
		{ name: "tests/test_billing.py", minutes: 7 },
		{ name: "tests/test_checkout.py", minutes: 6 },
		{ name: "tests/test_export.py", minutes: 5 },
		{ name: "tests/test_health.py", minutes: 4 },
		{ name: "tests/test_search.py", minutes: 3 },
	],
	byName: [
		{
			machine: 0,
			files: [
				{ name: "tests/test_auth.py", minutes: 9 },
				{ name: "tests/test_billing.py", minutes: 7 },
				{ name: "tests/test_checkout.py", minutes: 6 },
			],
			total: 22,
		},
		{
			machine: 1,
			files: [
				{ name: "tests/test_export.py", minutes: 5 },
				{ name: "tests/test_health.py", minutes: 4 },
				{ name: "tests/test_search.py", minutes: 3 },
			],
			total: 12,
		},
	],
	byTiming: [
		{
			machine: 0,
			files: [
				{ name: "tests/test_auth.py", minutes: 9 },
				{ name: "tests/test_export.py", minutes: 5 },
				{ name: "tests/test_search.py", minutes: 3 },
			],
			total: 17,
		},
		{
			machine: 1,
			files: [
				{ name: "tests/test_billing.py", minutes: 7 },
				{ name: "tests/test_checkout.py", minutes: 6 },
				{ name: "tests/test_health.py", minutes: 4 },
			],
			total: 17,
		},
	],
	staleCache: [
		{
			machine: 0,
			digest: "4e9a1b0f2c8d",
			files: [
				{ name: "tests/test_auth.py", minutes: 9, duplicate: true },
				{ name: "tests/test_export.py", minutes: 5 },
				{ name: "tests/test_search.py", minutes: 3 },
			],
			total: 17,
		},
		{
			machine: 1,
			digest: "c710e3a98b44",
			stale: true,
			files: [
				{ name: "tests/test_auth.py", minutes: 9, duplicate: true },
				{ name: "tests/test_billing.py", minutes: 7 },
				{ name: "tests/test_health.py", minutes: 4 },
			],
			total: 20,
		},
	],
};

export function formatSeconds(sec: number): string {
	if (sec < 10) {
		const hundredths = Math.round(Math.round(sec * 1000) / 10);
		return `${(hundredths / 100).toFixed(2)}s`;
	}
	if (sec < 60) {
		return `${(Math.round(sec * 10) / 10).toFixed(1)}s`;
	}
	const totalSec = Math.round(sec);
	const mins = Math.floor(totalSec / 60);
	const rem = totalSec % 60;
	return `${mins}m ${String(rem).padStart(2, "0")}s`;
}
