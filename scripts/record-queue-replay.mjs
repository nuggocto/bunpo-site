#!/usr/bin/env node
// Records a real 8-machine live-queue build using the real bunpo-server and
// `bunpo --queue` binaries built from the bunpo repository, then writes a
// compact, relative-timestamped replay JSON to src/data/queue-replay.json.
//
// Plain Node, zero dependencies. Does not modify the bunpo repository.
//
// Usage:
//   BUNPO_REPO=../bunpo node scripts/record-queue-replay.mjs

import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SITE_ROOT = resolve(import.meta.dirname, "..");
const BUNPO_REPO = resolve(SITE_ROOT, process.env.BUNPO_REPO || "../bunpo");
const OUT_PATH = join(SITE_ROOT, "src/data/queue-replay.json");

const MACHINES = 8;
const TEST_COUNT = 120;
const LEASE_TTL = "10s";
const MAX_BATCH = 5;
const LATE_MACHINE = 6;
const LATE_START_MS = 18_000;
const KILL_MACHINE = 7;
const KILL_AFTER_BATCH2_MS = 4_500;

// Relative runtime multipliers per machine (fast x64 -> slow ARM64).
const SPEED_FACTORS = [0.72, 0.78, 0.86, 0.98, 1.15, 1.58, 0.88, 1.0];

// Deterministic synthetic suite of 120 plain paths and base durations (ms).
// Skewed so longest-first dealing and uneven batch sizes are clearly visible.
const MODULES = ["auth", "billing", "checkout", "orders", "search", "sync", "uploads", "webhooks"];

function buildSuite() {
	let seed = 0x51a7f319;
	const nextRand = () => {
		seed = (Math.imul(seed ^ (seed >>> 15), 1 | seed) + 0x6d2b79f5) >>> 0;
		return ((seed ^ (seed >>> 14)) >>> 0) / 4294967296;
	};

	const tests = [];
	for (let i = 0; i < TEST_COUNT; i++) {
		const mod = MODULES[i % MODULES.length];
		const num = String(Math.floor(i / MODULES.length) + 1).padStart(2, "0");
		const path = `tests/${mod}/test_${num}.py`;
		const r = nextRand();
		let baseMS;
		if (i < 8) {
			baseMS = 6800 + Math.round(r * 2200); // 6.8s..9.0s slow files
		} else if (i < 32) {
			baseMS = 4600 + Math.round(r * 1900); // 4.6s..6.5s medium files
		} else {
			baseMS = 2400 + Math.round(r * 2400); // 2.4s..4.8s normal files
		}
		tests.push({ path, baseMS });
	}
	tests.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
	return tests;
}

function freePort() {
	return new Promise((resolvePort, reject) => {
		const srv = createServer();
		srv.listen(0, "127.0.0.1", () => {
			const addr = srv.address();
			const port = typeof addr === "object" && addr ? addr.port : 0;
			srv.close(() => resolvePort(port));
		});
		srv.on("error", reject);
	});
}

function sleep(ms) {
	return new Promise((r) => setTimeout(r, ms));
}

async function fetchJSON(url, token) {
	const resp = await fetch(url, {
		headers: { Authorization: `Bearer ${token}` },
	});
	const text = await resp.text();
	if (!resp.ok) {
		throw new Error(`GET ${url} -> HTTP ${resp.status}: ${text}`);
	}
	return JSON.parse(text);
}

const bunpoCommit = execFileSync("git", ["-C", BUNPO_REPO, "rev-parse", "--short", "HEAD"], {
	encoding: "utf8",
}).trim();

const work = mkdtempSync(join(tmpdir(), "bunpo-replay-rec-"));
const children = new Set();
let serverProc = null;

function stopAll() {
	for (const p of children) {
		try {
			p.kill("SIGKILL");
		} catch {
			// already exited
		}
	}
	if (serverProc && serverProc.exitCode === null) {
		try {
			serverProc.kill("SIGTERM");
		} catch {
			// already exited
		}
	}
}

process.on("SIGINT", () => {
	stopAll();
	rmSync(work, { recursive: true, force: true });
	process.exit(130);
});

try {
	console.log(`Building real bunpo and bunpo-server from ${BUNPO_REPO} (${bunpoCommit})...`);
	const bunpoBin = join(work, "bunpo");
	const serverBin = join(work, "bunpo-server");
	execFileSync("go", ["build", "-o", bunpoBin, "./cmd/bunpo"], {
		cwd: BUNPO_REPO,
		stdio: "inherit",
	});
	execFileSync("go", ["build", "-o", serverBin, "./cmd/bunpo-server"], {
		cwd: BUNPO_REPO,
		stdio: "inherit",
	});

	const suite = buildSuite();
	const testList = `${suite.map((t) => t.path).join("\n")}\n`;
	const durationsMap = Object.fromEntries(suite.map((t) => [t.path, t.baseMS]));
	const durationsFile = join(work, "durations.json");
	writeFileSync(durationsFile, JSON.stringify(durationsMap));

	// Seed timings.json so bunpo's guided self-scheduling has predictions on the first run.
	const timingsObj = {
		version: 1,
		run: 5,
		tests: Object.fromEntries(suite.map((t) => [t.path, { samples: [t.baseMS], last_seen: 5 }])),
	};

	// Synthetic batch runner: sleeps baseMS * speedFactor per leased file and writes --format lines report.
	const runnerScript = join(work, "run-batch.mjs");
	writeFileSync(
		runnerScript,
		`import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
const durations = JSON.parse(readFileSync(process.env.DURATIONS_FILE, "utf8"));
const speed = Number(process.env.SPEED_FACTOR || "1");
const reportPath = process.env.REPORT_PATH;
const batchCounterFile = process.env.BATCH_COUNTER_FILE || "";
const batch2Marker = process.env.BATCH2_MARKER || "";

if (batchCounterFile) {
  let count = 0;
  try { count = Number(readFileSync(batchCounterFile, "utf8").trim()) || 0; } catch {}
  count += 1;
  writeFileSync(batchCounterFile, String(count));
  if (count === 2 && batch2Marker) {
    writeFileSync(batch2Marker, String(Date.now()));
  }
}

const files = readFileSync(process.env.BUNPO_TESTS_FILE, "utf8")
  .split("\\n")
  .map((s) => s.trim())
  .filter(Boolean);

const lines = [];
for (const f of files) {
  const ms = Math.max(50, Math.round((durations[f] || 1000) * speed));
  await new Promise((r) => setTimeout(r, ms));
  lines.push(f + " " + ms);
}
writeFileSync(reportPath, lines.join("\\n") + "\\n");
`,
	);

	const writeTok = randomBytes(24).toString("hex");
	const readTok = randomBytes(24).toString("hex");
	const port = await freePort();
	const baseURL = `http://127.0.0.1:${port}`;
	const dataDir = join(work, "server-data");
	const buildID = "replay-demo-01";

	console.log(`Starting bunpo-server on ${baseURL}...`);
	serverProc = spawn(serverBin, ["--addr", `127.0.0.1:${port}`, "--data", dataDir], {
		env: { ...process.env, BUNPO_QUEUE_TOKEN: writeTok, BUNPO_QUEUE_READ_TOKEN: readTok },
		stdio: ["ignore", "pipe", "pipe"],
	});

	for (let i = 0; i < 50; i++) {
		try {
			const r = await fetch(`${baseURL}/healthz`);
			if (r.ok) break;
		} catch {
			// waiting
		}
		await sleep(100);
	}

	const batch2Marker = join(work, "victim-batch2.marker");
	let victimProc = null;
	let killedAtAbsMS = null;

	function startMachine(idx) {
		const mDir = join(work, `m${idx}`);
		const bunpoDir = join(mDir, ".bunpo");
		mkdirSync(bunpoDir, { recursive: true });
		writeFileSync(join(bunpoDir, "timings.json"), JSON.stringify(timingsObj));
		const reportPath = join(mDir, "report.txt");
		const counterFile = idx === KILL_MACHINE ? join(mDir, "batches.count") : "";

		const proc = spawn(
			bunpoBin,
			[
				"--queue",
				baseURL,
				"--build",
				buildID,
				"--dir",
				bunpoDir,
				"--index",
				String(idx),
				"--total",
				String(MACHINES),
				"--format",
				"lines",
				"--report",
				reportPath,
				"--lease-ttl",
				LEASE_TTL,
				"--max-batch",
				String(MAX_BATCH),
				"--",
				process.execPath,
				runnerScript,
			],
			{
				cwd: mDir,
				env: {
					...process.env,
					BUNPO_QUEUE_TOKEN: writeTok,
					DURATIONS_FILE: durationsFile,
					SPEED_FACTOR: String(SPEED_FACTORS[idx]),
					REPORT_PATH: reportPath,
					BATCH_COUNTER_FILE: counterFile,
					BATCH2_MARKER: idx === KILL_MACHINE ? batch2Marker : "",
				},
				stdio: ["pipe", "pipe", "pipe"],
			},
		);
		proc.stdin.end(testList);
		children.add(proc);
		if (idx === KILL_MACHINE) {
			victimProc = proc;
		}

		let stderr = "";
		proc.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});

		return new Promise((resolveDone) => {
			proc.on("close", (code, signal) => {
				children.delete(proc);
				resolveDone({ idx, code, signal, stderr });
			});
		});
	}

	console.log(
		`Launching ${MACHINES} real bunpo --queue runners (${TEST_COUNT} files, machine ${LATE_MACHINE} starts +${LATE_START_MS / 1000}s late, machine ${KILL_MACHINE} SIGKILLed on batch 2)...`,
	);
	const tStart = Date.now();
	const promises = [];
	for (let i = 0; i < MACHINES; i++) {
		if (i === LATE_MACHINE) continue;
		promises.push(startMachine(i));
	}

	// Late-starting machine 6.
	const latePromise = (async () => {
		await sleep(LATE_START_MS);
		console.log(
			`+${((Date.now() - tStart) / 1000).toFixed(1)}s: starting late machine ${LATE_MACHINE}`,
		);
		return startMachine(LATE_MACHINE);
	})();
	promises.push(latePromise);

	// Kill machine 7 mid-way through its second batch.
	const killWatcher = (async () => {
		while (!existsSync(batch2Marker)) {
			await sleep(100);
		}
		await sleep(KILL_AFTER_BATCH2_MS);
		if (victimProc && victimProc.exitCode === null) {
			killedAtAbsMS = Date.now();
			victimProc.kill("SIGKILL");
			console.log(
				`+${((killedAtAbsMS - tStart) / 1000).toFixed(1)}s: SIGKILL sent to machine ${KILL_MACHINE}`,
			);
		}
	})();

	const results = await Promise.all(promises);
	await killWatcher;

	for (const r of results) {
		if (r.idx === KILL_MACHINE) {
			if (r.signal !== "SIGKILL") {
				throw new Error(
					`expected machine ${KILL_MACHINE} to die via SIGKILL, got code=${r.code} signal=${r.signal}`,
				);
			}
			continue;
		}
		if (r.code !== 0) {
			throw new Error(`machine ${r.idx} exited ${r.code} (${r.signal}):\n${r.stderr}`);
		}
	}

	// Query final status + every page of /tests from the real bunpo-server API.
	const status = await fetchJSON(`${baseURL}/api/v1/builds/${buildID}`, readTok);
	const allTests = [];
	let cursor = 0;
	while (true) {
		const page = await fetchJSON(
			`${baseURL}/api/v1/builds/${buildID}/tests?cursor=${cursor}&limit=1000`,
			readTok,
		);
		allTests.push(...page.tests);
		if (page.next_cursor === null || page.next_cursor === undefined) break;
		cursor = page.next_cursor;
	}

	if (status.verdict !== "passed") {
		throw new Error(`expected verdict passed, got ${status.verdict}`);
	}
	if (allTests.length !== TEST_COUNT) {
		throw new Error(`expected ${TEST_COUNT} tests, got ${allTests.length}`);
	}

	const originMS = status.created_at_ms;
	const durationMS = status.finished_at_ms - originMS;
	const killedRelMS = killedAtAbsMS !== null ? Math.max(0, killedAtAbsMS - originMS) : null;

	const runnerToMachine = new Map();
	for (const r of status.runners) {
		runnerToMachine.set(r.runner_id, r.machine_index);
	}

	const runners = [...status.runners]
		.sort((a, b) => a.machine_index - b.machine_index)
		.map((r) => ({
			machine: r.machine_index,
			speed: SPEED_FACTORS[r.machine_index],
			first_ms: r.first_seen_ms - originMS,
			leases: r.leases,
			accepted: r.accepted,
		}));

	// Compact test records with times relative to created_at_ms.
	// Attempt tuple: [lease_id, machine, generation, status, leased_rel_ms, finished_rel_ms, duration_ms]
	const tests = allTests.map((t) => ({
		t: t.test,
		a: t.attempts.map((a) => [
			a.lease_id,
			runnerToMachine.get(a.runner_id),
			a.generation,
			a.status,
			a.leased_at_ms - originMS,
			a.finished_at_ms - originMS,
			a.duration_ms,
		]),
	}));

	const expiredAttempts = tests.flatMap((t) => t.a).filter((a) => a[3] === "expired");
	const retryAttempts = tests.flatMap((t) => t.a).filter((a) => a[2] > 1);
	if (expiredAttempts.length === 0 || retryAttempts.length === 0) {
		throw new Error(
			`recording missing recovery: expired=${expiredAttempts.length}, retries=${retryAttempts.length}`,
		);
	}

	const payload = {
		version: 1,
		bunpo_commit: bunpoCommit,
		synthetic: true,
		config: {
			machines: status.config.machines,
			lease_ttl_ms: status.config.lease_ttl_ms,
			max_batch: status.config.max_batch,
			max_attempts: status.config.max_attempts,
		},
		verdict: status.verdict,
		duration_ms: durationMS,
		counts: status.counts,
		late_machine: LATE_MACHINE,
		killed: {
			machine: KILL_MACHINE,
			at_ms: killedRelMS,
			lease_id: expiredAttempts[0][0],
			source: "harness",
		},
		runners,
		tests,
	};

	writeFileSync(OUT_PATH, `${JSON.stringify(payload)}\n`);
	console.log(
		`Recorded ${OUT_PATH}: duration=${(durationMS / 1000).toFixed(2)}s, tests=${tests.length}, expired=${expiredAttempts.length}, retries=${retryAttempts.length}, killed_at=${(killedRelMS / 1000).toFixed(2)}s`,
	);
} finally {
	stopAll();
	rmSync(work, { recursive: true, force: true });
}
