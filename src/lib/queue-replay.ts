export type AttemptStatus = "passed" | "failed" | "skipped" | "error" | "expired" | "leased";

/** [lease_id, machine_index, generation, status, start_ms, end_ms, duration_ms] */
export type RawAttempt = [number, number, number, AttemptStatus, number, number, number];

export interface RawTest {
	t: string;
	a: RawAttempt[];
}

export interface RawRunner {
	machine: number;
	speed: number;
	first_ms: number;
	leases: number;
	accepted: number;
}

export interface ReplayRecording {
	version: number;
	bunpo_commit: string;
	synthetic: boolean;
	config: {
		machines: number;
		lease_ttl_ms: number;
		max_batch: number;
		max_attempts: number;
	};
	verdict: string;
	duration_ms: number;
	counts: {
		total: number;
		pending: number;
		leased: number;
		passed: number;
		failed: number;
		skipped: number;
		unresolved: number;
	};
	late_machine: number;
	killed: {
		machine: number;
		at_ms: number | null;
		lease_id: number;
		source: "harness";
	};
	runners: RawRunner[];
	tests: RawTest[];
}

export interface LeaseSpan {
	leaseID: number;
	machine: number;
	startMS: number;
	endMS: number;
	finalStatus: "passed" | "failed" | "skipped" | "error" | "expired";
	isRetry: boolean;
	files: string[];
}

export type BarKind = "running" | "dying" | "passed" | "retried" | "expired";

export interface MachineBar {
	leaseID: number;
	startMS: number;
	drawEndMS: number;
	endMS: number;
	kind: BarKind;
	fileCount: number;
	isRetry: boolean;
	firstFile: string;
}

export type LaneStatusKind = "idle" | "running" | "retried" | "killed" | "offline" | "done";

export interface MachineLaneState {
	machine: number;
	speed: number;
	firstMS: number;
	isLate: boolean;
	isKilled: boolean;
	acceptedAtT: number;
	totalAccepted: number;
	statusKind: LaneStatusKind;
	statusText: string;
	bars: MachineBar[];
}

export interface ReplayMilestone {
	id: "start" | "late" | "kill" | "expiry" | "retry" | "passed";
	atMS: number;
	label: string;
	caption: string;
	source: "server" | "harness";
}

export const SEEK_STEP_MS = 1;
export const KEYBOARD_SEEK_STEP_MS = 1000;

export function formatMachineSpeed(timeMultiplier: number): string {
	const speed = timeMultiplier > 0 ? 1 / timeMultiplier : 1;
	return `${speed.toFixed(1)}× speed`;
}

export interface ReplayFrame {
	timeMS: number;
	durationMS: number;
	verdict: "running" | "passed" | "failed" | "unresolved";
	counts: {
		total: number;
		waiting: number;
		leased: number;
		done: number;
		passed: number;
		failed: number;
		skipped: number;
		requeuedWaiting: number;
		expiredAttempts: number;
		recoveredDone: number;
	};
	lanes: MachineLaneState[];
	milestones: ReplayMilestone[];
	activeMilestoneIndex: number;
	activeMilestone: ReplayMilestone;
	killedVisible: boolean;
}

export function formatReplayTime(ms: number): string {
	const clamped = Math.max(0, ms);
	if (clamped < 60_000) {
		return `${(clamped / 1000).toFixed(1)}s`;
	}
	const totalTenths = Math.round(clamped / 100);
	const mins = Math.floor(totalTenths / 600);
	const remSec = ((totalTenths % 600) / 10).toFixed(1).padStart(4, "0");
	return `${mins}m ${remSec}s`;
}

export function buildLeases(recording: ReplayRecording): LeaseSpan[] {
	const byID = new Map<number, LeaseSpan>();
	for (let i = 0; i < recording.tests.length; i++) {
		const test = recording.tests[i];
		for (let j = 0; j < test.a.length; j++) {
			const [leaseID, machine, gen, status, startMS, endMS] = test.a[j];
			let span = byID.get(leaseID);
			if (!span) {
				span = {
					leaseID,
					machine,
					startMS,
					endMS,
					finalStatus: status === "leased" ? "passed" : status,
					isRetry: gen > 1,
					files: [],
				};
				byID.set(leaseID, span);
			}
			if (startMS < span.startMS) span.startMS = startMS;
			if (endMS > span.endMS) span.endMS = endMS;
			if (gen > 1) span.isRetry = true;
			if (status === "expired") span.finalStatus = "expired";
			else if (status === "failed" && span.finalStatus !== "expired") span.finalStatus = "failed";
			else if (
				status === "error" &&
				span.finalStatus !== "expired" &&
				span.finalStatus !== "failed"
			) {
				span.finalStatus = "error";
			}
			span.files.push(test.t);
		}
	}
	return [...byID.values()].sort((a, b) => a.startMS - b.startMS || a.leaseID - b.leaseID);
}

export function buildMilestones(
	recording: ReplayRecording,
	leases: readonly LeaseSpan[] = buildLeases(recording),
): ReplayMilestone[] {
	const lateRunner = recording.runners.find((r) => r.machine === recording.late_machine);
	const expiredLease = leases.find(
		(l) => l.leaseID === recording.killed.lease_id || l.finalStatus === "expired",
	);
	const retryLeases = leases.filter((l) => l.isRetry);
	const firstRetry = retryLeases[0];
	const recoveredCount = expiredLease ? expiredLease.files.length : retryLeases.length;
	const initialMachines = recording.runners.filter(
		(r) => r.machine !== recording.late_machine,
	).length;
	const ttlSec = Math.round(recording.config.lease_ttl_ms / 1000);

	const out: ReplayMilestone[] = [
		{
			id: "start",
			atMS: 0,
			label: "Start",
			caption: `${initialMachines} machines join and pull the first longest-first batches. Machine ${recording.late_machine} has not started yet.`,
			source: "server",
		},
	];

	if (lateRunner && lateRunner.first_ms > 0) {
		out.push({
			id: "late",
			atMS: lateRunner.first_ms,
			label: "Late join",
			caption: `Machine ${lateRunner.machine} joins at ${formatReplayTime(lateRunner.first_ms)} and pulls its first batch.`,
			source: "server",
		});
	}

	if (recording.killed.at_ms !== null) {
		const countText = expiredLease ? `${expiredLease.files.length}-file` : "active";
		out.push({
			id: "kill",
			atMS: recording.killed.at_ms,
			label: "Killed",
			caption: `Machine ${recording.killed.machine} is killed (SIGKILL) at ${formatReplayTime(recording.killed.at_ms)}, recorded by the harness. Its ${countText} lease stays held until the ${ttlSec}s TTL.`,
			source: "harness",
		});
	}

	if (expiredLease) {
		out.push({
			id: "expiry",
			atMS: expiredLease.endMS,
			label: "Lease expires",
			caption: `Server expires machine ${expiredLease.machine}'s lease at ${formatReplayTime(expiredLease.endMS)}. ${expiredLease.files.length} files return to the queue.`,
			source: "server",
		});
	}

	if (firstRetry) {
		out.push({
			id: "retry",
			atMS: firstRetry.startMS,
			label: "Reassigned",
			caption: `Surviving machines finish first attempts and pull machine ${recording.killed.machine}'s ${recoveredCount} expired files one by one (generation 2).`,
			source: "server",
		});
	}

	out.push({
		id: "passed",
		atMS: recording.duration_ms,
		label: "Passed",
		caption: `Build passed in ${formatReplayTime(recording.duration_ms)}: all ${recording.counts.total} files accepted once (${recoveredCount} retried after machine ${recording.killed.machine} died).`,
		source: "server",
	});

	return out.sort((a, b) => a.atMS - b.atMS);
}

export function collectEventTimes(recording: ReplayRecording): number[] {
	const times = new Set<number>([0, recording.duration_ms]);
	if (recording.killed.at_ms !== null) {
		times.add(recording.killed.at_ms);
	}
	for (const r of recording.runners) {
		times.add(r.first_ms);
	}
	for (const test of recording.tests) {
		for (const a of test.a) {
			times.add(a[4]);
			times.add(a[5]);
		}
	}
	return [...times].filter((t) => t >= 0 && t <= recording.duration_ms).sort((a, b) => a - b);
}

function shortFileName(path: string): string {
	const parts = path.split("/");
	return parts[parts.length - 1] || path;
}

/**
 * Pure, deterministic snapshot of a recorded live-queue build at time `rawTimeMS`
 * (relative to build creation at 0 ms). Reads no clock and uses no randomness,
 * so seeking forward, backward, or jumping to `t` produces identical state.
 */
export function stateAt(recording: ReplayRecording, rawTimeMS: number): ReplayFrame {
	const durationMS = Math.max(1, recording.duration_ms);
	const t = Math.max(0, Math.min(durationMS, Math.round(rawTimeMS)));

	const leases = buildLeases(recording);
	const milestones = buildMilestones(recording, leases);

	const acceptedByMachine = new Map<number, number>();
	let waiting = 0;
	let leased = 0;
	let passed = 0;
	let failed = 0;
	let skipped = 0;
	let requeuedWaiting = 0;
	let expiredAttempts = 0;
	let recoveredDone = 0;

	for (let i = 0; i < recording.tests.length; i++) {
		const attempts = recording.tests[i].a;
		let isLeased = false;
		let terminal: AttemptStatus | null = null;
		let terminalGen = 0;
		let hadExpired = false;

		for (let j = 0; j < attempts.length; j++) {
			const [, machine, gen, status, startMS, endMS] = attempts[j];
			if (startMS <= t && t < endMS) {
				isLeased = true;
			} else if (endMS <= t) {
				if (status === "expired") {
					expiredAttempts++;
					hadExpired = true;
				} else if (status === "passed" || status === "failed" || status === "skipped") {
					terminal = status;
					terminalGen = gen;
					acceptedByMachine.set(machine, (acceptedByMachine.get(machine) ?? 0) + 1);
				}
			}
		}

		if (isLeased) {
			leased++;
		} else if (terminal !== null) {
			if (terminal === "passed") passed++;
			else if (terminal === "failed") failed++;
			else if (terminal === "skipped") skipped++;
			if (terminalGen > 1) recoveredDone++;
		} else {
			waiting++;
			if (hadExpired) requeuedWaiting++;
		}
	}

	const done = passed + failed + skipped;
	const killedAtMS = recording.killed.at_ms;
	const killedVisible = killedAtMS !== null && t >= killedAtMS;

	const leasesByMachine = new Map<number, LeaseSpan[]>();
	for (const l of leases) {
		const list = leasesByMachine.get(l.machine);
		if (list) list.push(l);
		else leasesByMachine.set(l.machine, [l]);
	}

	const lanes: MachineLaneState[] = [...recording.runners]
		.sort((a, b) => a.machine - b.machine)
		.map((r) => {
			const machineLeases = leasesByMachine.get(r.machine) ?? [];
			const isKilled = r.machine === recording.killed.machine;
			const isLate = r.machine === recording.late_machine;
			const bars: MachineBar[] = [];
			let activeLease: LeaseSpan | null = null;
			let hasFutureLease = false;

			for (const l of machineLeases) {
				if (l.startMS > t) {
					hasFutureLease = true;
					continue;
				}
				if (t < l.endMS) {
					activeLease = l;
					const dying = isKilled && killedVisible && l.leaseID === recording.killed.lease_id;
					bars.push({
						leaseID: l.leaseID,
						startMS: l.startMS,
						drawEndMS: t,
						endMS: l.endMS,
						kind: dying ? "dying" : "running",
						fileCount: l.files.length,
						isRetry: l.isRetry,
						firstFile: l.files[0] ?? "",
					});
				} else {
					const kind: BarKind =
						l.finalStatus === "expired" ? "expired" : l.isRetry ? "retried" : "passed";
					bars.push({
						leaseID: l.leaseID,
						startMS: l.startMS,
						drawEndMS: l.endMS,
						endMS: l.endMS,
						kind,
						fileCount: l.files.length,
						isRetry: l.isRetry,
						firstFile: l.files[0] ?? "",
					});
				}
			}

			let statusKind: LaneStatusKind;
			let statusText: string;

			if (isKilled && killedVisible) {
				if (activeLease) {
					const leftS = Math.max(0, (activeLease.endMS - t) / 1000).toFixed(1);
					statusKind = "killed";
					statusText = `killed · expires in ${leftS}s`;
				} else {
					statusKind = "offline";
					statusText = "offline (killed)";
				}
			} else if (activeLease) {
				if (activeLease.isRetry) {
					statusKind = "retried";
					statusText = `retry · ${shortFileName(activeLease.files[0] ?? "")}`;
				} else {
					statusKind = "running";
					statusText = `${activeLease.files.length} in batch`;
				}
			} else if (t < r.first_ms) {
				statusKind = "idle";
				statusText = isLate ? "starts late" : "starting";
			} else if (t < durationMS && hasFutureLease) {
				statusKind = "idle";
				statusText = "requesting batch";
			} else {
				statusKind = "done";
				statusText = "done";
			}

			return {
				machine: r.machine,
				speed: r.speed,
				firstMS: r.first_ms,
				isLate,
				isKilled,
				acceptedAtT: acceptedByMachine.get(r.machine) ?? 0,
				totalAccepted: r.accepted,
				statusKind,
				statusText,
				bars,
			};
		});

	let activeMilestoneIndex = 0;
	for (let i = 0; i < milestones.length; i++) {
		if (milestones[i].atMS <= t) {
			activeMilestoneIndex = i;
		}
	}

	const verdict: ReplayFrame["verdict"] =
		t >= durationMS
			? (recording.verdict as ReplayFrame["verdict"])
			: done === recording.counts.total
				? (recording.verdict as ReplayFrame["verdict"])
				: "running";

	return {
		timeMS: t,
		durationMS,
		verdict,
		counts: {
			total: recording.counts.total,
			waiting,
			leased,
			done,
			passed,
			failed,
			skipped,
			requeuedWaiting,
			expiredAttempts,
			recoveredDone,
		},
		lanes,
		milestones,
		activeMilestoneIndex,
		activeMilestone: milestones[activeMilestoneIndex],
		killedVisible,
	};
}
