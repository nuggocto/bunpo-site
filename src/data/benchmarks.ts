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
		shortTag: "pytest · 4 machines · -50% vs count",
		subtitle: "113 pytest files · 2,777 tests · PostgreSQL 16 · 4 machines",
		environment: "Local 4-CPU-pinned trial, serial pytest --use-postgres",
		beforeLabel: "split by count",
		beforeHeadline: "4m 15s",
		afterLabel: "split by Bunpō timings",
		afterHeadline: "2m 08s",
		gainLabel: "saved vs count",
		gainHeadline: "2m 07s (50% less)",
		gainDetail: "Spread cut from 179.5s to 7.3s · 8m 10s on 1 machine",
		beforeTitle: "Round 1 · split by count",
		beforeMeta: "slowest 4m 15s · 179.5s spread",
		beforeBars: [
			{ label: "Machine 0", seconds: 75.8, files: 29 },
			{ label: "Machine 1", seconds: 75.2, files: 28 },
			{ label: "Machine 2", seconds: 254.7, files: 28, inlineNote: "slow file" },
			{ label: "Machine 3", seconds: 101.9, files: 28 },
		],
		afterTitle: "Round 2 · Bunpō timed split",
		afterMeta: "slowest 2m 08s · 7.3s spread",
		afterBars: [
			{ label: "Machine 0", seconds: 127.6, files: 1, inlineNote: "slow file" },
			{ label: "Machine 1", seconds: 121.9, files: 36 },
			{ label: "Machine 2", seconds: 125.9, files: 40 },
			{ label: "Machine 3", seconds: 120.3, files: 36 },
		],
		takeaway:
			"Counting files put the slow WebSocket file on a machine with 27 others. Bunpō gave it its own machine.",
		caveat:
			"A second timed run finished in 2m 13s. Each machine runs its own Postgres testcontainer. Test-command wall time only; CI checkout and dependency install are extra.",
	},
	{
		id: "latabdhir-postgres",
		title: "LaTabdhir Postgres parity",
		shortTag: "pytest · 4 machines · -5% vs count",
		subtitle: "495 pytest files · 6,469 tests · PostgreSQL 18 · 4 machines",
		environment: "Local 4-CPU-pinned trial, serial pytest --use-postgres",
		beforeLabel: "split by count",
		beforeHeadline: "6m 36s",
		afterLabel: "split by Bunpō timings",
		afterHeadline: "6m 16s",
		gainLabel: "saved vs count",
		gainHeadline: "20s (5% less)",
		gainDetail: "Spread cut from 54.5s to 5.4s · 25m 30s on 1 machine",
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
			"This suite has no dominant file, so a count split was already close. Most of the drop from 25m 30s comes from using four machines.",
		caveat: "A second timed run finished in 6m 19s. Bunpō predicted 5m59s on all four machines.",
	},
	{
		id: "latabdhir-e2e-gha",
		title: "LaTabdhir Playwright",
		shortTag: "GitHub Actions · 2 unequal runners",
		subtitle: "68 specs · 232 cases · Docker Compose · 2 self-hosted runners",
		environment: "Live GitHub Actions (v0.0.5 via nuggocto/bunpo@v0), x64 + ARM64",
		beforeLabel: "slowest job, split by count",
		beforeHeadline: "8m 46s",
		afterLabel: "slowest job, Bunpō timings",
		afterHeadline: "7m 32s",
		gainLabel: "saved vs count",
		gainHeadline: "1m 14s (14% less)",
		gainDetail:
			"19m 12s job on 1 machine · workflows: 9m 58s by count, 17m 49s timed (runner queue)",
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
			"The slowest job dropped 1m 14s, but the timed workflow took longer end to end because one runner was queued.",
		caveat:
			"Machine 0 (x64) is faster than machine 1 (ARM64), and another CI job queued x64 for 13m 09s in the timed run. Stack startup also varied between runs. Static splitting balances file weight, not mixed hardware or runner queues.",
	},
	{
		id: "synthetic-40",
		title: "Synthetic 40-file suite",
		shortTag: "declared benchmark · 1.021 ratio",
		subtitle: "40 pytest files · 100–900 ms · 4 parallel processes",
		environment: "Declared benchmark in docs/benchmark.md (pytest setup: 134 ms)",
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
			digest: "1d81686a7841",
			files: [
				{ name: "tests/test_auth.py", minutes: 9, duplicate: true },
				{ name: "tests/test_export.py", minutes: 5 },
				{ name: "tests/test_search.py", minutes: 3 },
			],
			total: 17,
		},
		{
			machine: 1,
			digest: "dfc79e6d2958",
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
