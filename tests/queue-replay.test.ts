import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
	buildLeases,
	buildMilestones,
	collectEventTimes,
	formatMachineSpeed,
	maxReachableSliderValue,
	type ReplayRecording,
	SEEK_STEP_MS,
	stateAt,
} from "../src/lib/queue-replay";

const rawText = readFileSync("src/data/queue-replay.json", "utf8");
const recording = JSON.parse(rawText) as ReplayRecording;

describe("queue replay recording & pure stateAt(t)", () => {
	test("recording is sanitized, spans 60 to 90 s, and accepts every file once", () => {
		expect(recording.synthetic).toBe(true);
		expect(recording.verdict).toBe("passed");
		expect(recording.config.machines).toBe(8);
		expect(recording.duration_ms).toBeGreaterThanOrEqual(60_000);
		expect(recording.duration_ms).toBeLessThanOrEqual(90_000);

		// No absolute host paths or home directories leaked into the committed JSON.
		expect(rawText).not.toMatch(/\/home\/|\/Users\/|\/tmp\//);
		for (const t of recording.tests) {
			expect(t.t).toMatch(/^tests\/[a-z]+\/test_\d+\.py$/);
			const accepted = t.a.filter(
				(a) => a[3] === "passed" || a[3] === "failed" || a[3] === "skipped",
			);
			expect(accepted.length, `file ${t.t} accepted count`).toBe(1);
		}

		const end = stateAt(recording, recording.duration_ms);
		expect(end.verdict).toBe("passed");
		expect(end.counts.done).toBe(recording.counts.total);
		expect(end.counts.passed).toBe(recording.counts.total);
		expect(end.counts.waiting).toBe(0);
		expect(end.counts.leased).toBe(0);

		const laneAcceptedSum = end.lanes.reduce((sum, l) => sum + l.acceptedAtT, 0);
		expect(laneAcceptedSum).toBe(recording.counts.total);
	});

	test("counts add up to total at every recorded event time", () => {
		const times = collectEventTimes(recording);
		expect(times.length).toBeGreaterThan(20);

		for (const t of times) {
			const f = stateAt(recording, t);
			expect(f.counts.waiting + f.counts.leased + f.counts.done, `sum mismatch at t=${t}`).toBe(
				f.counts.total,
			);
			expect(f.counts.done, `done sum at t=${t}`).toBe(
				f.counts.passed + f.counts.failed + f.counts.skipped,
			);
		}
	});

	test("last reachable slider value reaches the final passed verdict", () => {
		const lastReachable = maxReachableSliderValue(recording.duration_ms, SEEK_STEP_MS);
		expect(lastReachable).toBe(recording.duration_ms);
		const endFrame = stateAt(recording, lastReachable);
		expect(endFrame.verdict).toBe("passed");
		expect(endFrame.counts.done).toBe(recording.counts.total);
		expect(endFrame.counts.leased).toBe(0);
		expect(endFrame.counts.waiting).toBe(0);

		// Also verify non-divisible durations reach their exact end with SEEK_STEP_MS.
		expect(maxReachableSliderValue(71_653, SEEK_STEP_MS)).toBe(71_653);
		expect(formatMachineSpeed(0.72)).toBe("1.4× speed");
		expect(formatMachineSpeed(1.58)).toBe("0.6× speed");
	});

	test("before expiry, killed machine's leased files are not shown as done or waiting", () => {
		const leases = buildLeases(recording);
		const expiredLease = leases.find((l) => l.leaseID === recording.killed.lease_id);
		expect(expiredLease).toBeDefined();
		if (!expiredLease) throw new Error("missing expired lease");

		const killedAt = recording.killed.at_ms;
		expect(killedAt).not.toBeNull();
		if (killedAt === null) throw new Error("missing kill timestamp");
		expect(killedAt).toBeGreaterThanOrEqual(expiredLease.startMS);
		expect(killedAt).toBeLessThan(expiredLease.endMS);

		// Just before expiry: lease is still held (dying), files are running, none of them done.
		const beforeExpiry = stateAt(recording, expiredLease.endMS - 1);
		const victimBefore = beforeExpiry.lanes.find((l) => l.machine === recording.killed.machine);
		expect(victimBefore?.statusKind).toBe("killed");
		const dyingBar = victimBefore?.bars.find((b) => b.leaseID === expiredLease.leaseID);
		expect(dyingBar?.kind).toBe("dying");
		expect(beforeExpiry.counts.expiredAttempts).toBe(0);
		expect(beforeExpiry.counts.recoveredDone).toBe(0);

		// At expiry: lease becomes expired and files return to waiting (requeued).
		const atExpiry = stateAt(recording, expiredLease.endMS);
		const victimAt = atExpiry.lanes.find((l) => l.machine === recording.killed.machine);
		expect(victimAt?.statusKind).toBe("offline");
		const expBar = victimAt?.bars.find((b) => b.leaseID === expiredLease.leaseID);
		expect(expBar?.kind).toBe("expired");
		expect(atExpiry.counts.expiredAttempts).toBe(expiredLease.files.length);
		expect(atExpiry.counts.requeuedWaiting).toBeGreaterThan(0);

		// At the end: every expired file was accepted on generation 2 by a surviving machine.
		const atEnd = stateAt(recording, recording.duration_ms);
		expect(atEnd.counts.recoveredDone).toBe(expiredLease.files.length);
	});

	test("seeking backward and forward produces deeply equal frames", () => {
		const milestones = buildMilestones(recording);
		const probes = [
			0,
			...milestones.map((m) => m.atMS),
			Math.round(recording.duration_ms * 0.25),
			Math.round(recording.duration_ms * 0.5),
			Math.round(recording.duration_ms * 0.75),
			recording.duration_ms,
		];

		const forward = probes.map((t) => stateAt(recording, t));
		const backward = [...probes]
			.reverse()
			.map((t) => stateAt(recording, t))
			.reverse();
		expect(backward).toEqual(forward);

		// Out-of-bounds seeks clamp deterministically to 0 and duration_ms.
		expect(stateAt(recording, -5000)).toEqual(stateAt(recording, 0));
		expect(stateAt(recording, recording.duration_ms + 99_999)).toEqual(
			stateAt(recording, recording.duration_ms),
		);
	});
});
