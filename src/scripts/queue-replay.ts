import {
	formatReplayTime,
	KEYBOARD_SEEK_STEP_MS,
	type MachineBar,
	type ReplayFrame,
	type ReplayRecording,
	stateAt,
} from "../lib/queue-replay";

const SVG_NS = "http://www.w3.org/2000/svg";
const VIEW_W = 1000;
const BAR_Y = 2;
const BAR_H = 14;

const SYMBOL_BY_STATUS: Record<string, string> = {
	running: "▸",
	retried: "↻",
	killed: "✕",
	offline: "⊘",
	done: "✓",
	idle: "·",
};

function svgEl<K extends keyof SVGElementTagNameMap>(
	tag: K,
	attrs: Record<string, string>,
): SVGElementTagNameMap[K] {
	const el = document.createElementNS(SVG_NS, tag);
	for (const [k, v] of Object.entries(attrs)) {
		el.setAttribute(k, v);
	}
	return el;
}

function renderBarSVG(bar: MachineBar, durationMS: number, patternPrefix: string): SVGElement {
	const x = (bar.startMS / durationMS) * VIEW_W;
	const rawW = ((bar.drawEndMS - bar.startMS) / durationMS) * VIEW_W;
	const w = Math.max(
		bar.kind === "running" || bar.kind === "dying" ? 2 : 3.5,
		Math.min(rawW, VIEW_W - x),
	);

	if (bar.kind === "passed") {
		return svgEl("rect", {
			x: x.toFixed(1),
			y: String(BAR_Y),
			width: w.toFixed(1),
			height: String(BAR_H),
			fill: "#3B9B76",
			stroke: "#1F7A5A",
			"stroke-width": "1",
		});
	}
	if (bar.kind === "retried") {
		return svgEl("rect", {
			x: x.toFixed(1),
			y: String(BAR_Y),
			width: w.toFixed(1),
			height: String(BAR_H),
			fill: `url(#${patternPrefix}-retry)`,
			stroke: "#1F7A5A",
			"stroke-width": "1.2",
		});
	}
	if (bar.kind === "expired") {
		return svgEl("rect", {
			x: x.toFixed(1),
			y: String(BAR_Y),
			width: w.toFixed(1),
			height: String(BAR_H),
			fill: `url(#${patternPrefix}-expired)`,
			stroke: "#B42D3F",
			"stroke-width": "1.2",
		});
	}
	if (bar.kind === "dying") {
		return svgEl("rect", {
			x: x.toFixed(1),
			y: String(BAR_Y),
			width: w.toFixed(1),
			height: String(BAR_H),
			fill: "#FAF8F5",
			stroke: "#B42D3F",
			"stroke-width": "1.4",
			"stroke-dasharray": "5 3",
		});
	}
	return svgEl("rect", {
		x: x.toFixed(1),
		y: String(BAR_Y),
		width: w.toFixed(1),
		height: String(BAR_H),
		fill: "#F6ECD9",
		stroke: "#C47F17",
		"stroke-width": "1.2",
	});
}

function initReplay(root: HTMLElement): void {
	const dataEl = root.querySelector<HTMLScriptElement>("script[data-replay-json]");
	if (!dataEl?.textContent) return;
	const recording = JSON.parse(dataEl.textContent) as ReplayRecording;
	const durationMS = Math.max(1, recording.duration_ms);
	const patternPrefix = root.dataset.patternPrefix || "replay";

	const controlsBar = root.querySelector<HTMLElement>(".replay-controls");
	const milestonesBar = root.querySelector<HTMLElement>(".replay-milestones");
	if (controlsBar) controlsBar.hidden = false;
	if (milestonesBar) milestonesBar.hidden = false;

	const playBtn = root.querySelector<HTMLButtonElement>("[data-replay-play]");
	const restartBtn = root.querySelector<HTMLButtonElement>("[data-replay-restart]");
	const speedBtns = [...root.querySelectorAll<HTMLButtonElement>("[data-replay-speed]")];
	const seekInput = root.querySelector<HTMLInputElement>("[data-replay-seek]");
	const milestoneBtns = [...root.querySelectorAll<HTMLButtonElement>("[data-replay-milestone]")];

	const timeOut = root.querySelector<HTMLElement>("[data-replay-time]");
	const doneOut = root.querySelector<HTMLElement>("[data-replay-done]");
	const queueOut = root.querySelector<HTMLElement>("[data-replay-queue]");
	const verdictOut = root.querySelector<HTMLElement>("[data-replay-verdict]");
	const captionText = root.querySelector<HTMLElement>("[data-replay-caption]");
	const captionSource = root.querySelector<HTMLElement>("[data-replay-source]");
	const liveRegion = root.querySelector<HTMLElement>("[data-replay-live]");

	const laneEls = new Map<
		number,
		{
			statusEl: HTMLElement | null;
			countEl: HTMLElement | null;
			barsGroup: SVGGElement | null;
			playhead: SVGLineElement | null;
			killMark: SVGLineElement | null;
		}
	>();

	for (const row of root.querySelectorAll<HTMLElement>("[data-replay-lane]")) {
		const m = Number(row.dataset.replayLane);
		laneEls.set(m, {
			statusEl: row.querySelector<HTMLElement>("[data-lane-status]"),
			countEl: row.querySelector<HTMLElement>("[data-lane-count]"),
			barsGroup: row.querySelector<SVGGElement>("[data-lane-bars]"),
			playhead: row.querySelector<SVGLineElement>("[data-lane-playhead]"),
			killMark: row.querySelector<SVGLineElement>("[data-lane-kill]"),
		});
	}

	const reducedMotion =
		typeof window !== "undefined" &&
		typeof window.matchMedia === "function" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches;

	let currentMS = reducedMotion ? durationMS : 0;
	let speed = 4;
	let playing = false;
	let hasAutoStarted = reducedMotion;
	let userInteracted = false;
	let rafID: number | null = null;
	let lastPerfMS = 0;
	let lastAnnouncedMilestone = -1;

	const updatePlayButton = () => {
		if (!playBtn) return;
		playBtn.textContent = playing ? "Pause" : currentMS >= durationMS ? "Replay" : "Play";
		playBtn.setAttribute("aria-pressed", String(playing));
	};

	const setSpeed = (nextSpeed: number) => {
		speed = nextSpeed;
		for (const btn of speedBtns) {
			const active = Number(btn.dataset.replaySpeed) === speed;
			btn.setAttribute("aria-pressed", String(active));
		}
	};

	const renderFrame = (frame: ReplayFrame, announce: boolean) => {
		if (timeOut) {
			timeOut.textContent = `${formatReplayTime(frame.timeMS)} / ${formatReplayTime(frame.durationMS)}`;
		}
		if (doneOut) {
			const retryNote =
				frame.counts.recoveredDone > 0 ? ` (${frame.counts.recoveredDone} retried)` : "";
			doneOut.textContent = `${frame.counts.done} / ${frame.counts.total}${retryNote}`;
		}
		if (queueOut) {
			const reqNote =
				frame.counts.requeuedWaiting > 0 ? ` (${frame.counts.requeuedWaiting} expired)` : "";
			queueOut.textContent = `${frame.counts.leased} leased · ${frame.counts.waiting} waiting${reqNote}`;
		}
		if (verdictOut) {
			verdictOut.textContent = frame.verdict === "passed" ? "✓ passed" : frame.verdict;
			verdictOut.dataset.verdict = frame.verdict;
		}
		if (seekInput) {
			seekInput.value = String(frame.timeMS);
			seekInput.setAttribute(
				"aria-valuetext",
				`${formatReplayTime(frame.timeMS)}, ${frame.activeMilestone.label}, ${frame.counts.done} of ${frame.counts.total} files done`,
			);
		}
		if (captionText) {
			captionText.textContent = frame.activeMilestone.caption;
		}
		if (captionSource) {
			captionSource.textContent =
				frame.activeMilestone.source === "harness" ? "harness record" : "server API";
		}

		for (const btn of milestoneBtns) {
			const idx = Number(btn.dataset.replayMilestone);
			btn.setAttribute("aria-current", idx === frame.activeMilestoneIndex ? "step" : "false");
		}

		// Announce only when crossing into a new milestone (never on every animation frame).
		if (liveRegion && announce && frame.activeMilestoneIndex !== lastAnnouncedMilestone) {
			lastAnnouncedMilestone = frame.activeMilestoneIndex;
			liveRegion.textContent = frame.activeMilestone.caption;
		}

		const playheadX = ((frame.timeMS / frame.durationMS) * VIEW_W).toFixed(1);
		for (const lane of frame.lanes) {
			const dom = laneEls.get(lane.machine);
			if (!dom) continue;

			if (dom.statusEl) {
				const sym = SYMBOL_BY_STATUS[lane.statusKind] ?? "·";
				dom.statusEl.textContent = `${sym} ${lane.statusText}`;
				dom.statusEl.dataset.kind = lane.statusKind;
			}
			if (dom.countEl) {
				dom.countEl.textContent = `${lane.acceptedAtT} done`;
			}
			if (dom.barsGroup) {
				const frag = document.createDocumentFragment();
				for (const bar of lane.bars) {
					frag.appendChild(renderBarSVG(bar, frame.durationMS, patternPrefix));
				}
				dom.barsGroup.replaceChildren(frag);
			}
			if (dom.playhead) {
				dom.playhead.setAttribute("x1", playheadX);
				dom.playhead.setAttribute("x2", playheadX);
			}
			if (dom.killMark && lane.isKilled && recording.killed.at_ms !== null) {
				const showKill = frame.killedVisible;
				dom.killMark.style.display = showKill ? "" : "none";
			}
		}
	};

	const stopLoop = () => {
		if (rafID !== null) {
			cancelAnimationFrame(rafID);
			rafID = null;
		}
	};

	const tick = (nowPerfMS: number) => {
		if (!playing) {
			rafID = null;
			return;
		}
		if (lastPerfMS === 0) lastPerfMS = nowPerfMS;
		const dt = Math.min(100, Math.max(0, nowPerfMS - lastPerfMS));
		lastPerfMS = nowPerfMS;
		currentMS = Math.min(durationMS, currentMS + dt * speed);
		renderFrame(stateAt(recording, currentMS), true);
		if (currentMS >= durationMS) {
			playing = false;
			updatePlayButton();
			rafID = null;
			return;
		}
		rafID = requestAnimationFrame(tick);
	};

	const startLoop = () => {
		stopLoop();
		playing = true;
		lastPerfMS = 0;
		updatePlayButton();
		rafID = requestAnimationFrame(tick);
	};

	const pauseLoop = () => {
		playing = false;
		stopLoop();
		updatePlayButton();
	};

	playBtn?.addEventListener("click", () => {
		userInteracted = true;
		if (playing) {
			pauseLoop();
		} else {
			if (currentMS >= durationMS) {
				currentMS = 0;
				lastAnnouncedMilestone = -1;
			}
			startLoop();
		}
	});

	restartBtn?.addEventListener("click", () => {
		userInteracted = true;
		currentMS = 0;
		lastAnnouncedMilestone = -1;
		renderFrame(stateAt(recording, 0), true);
		if (reducedMotion) {
			pauseLoop();
		} else {
			startLoop();
		}
	});

	for (const btn of speedBtns) {
		btn.addEventListener("click", () => {
			const s = Number(btn.dataset.replaySpeed);
			if (s > 0) setSpeed(s);
		});
	}

	const seekTo = (nextMS: number) => {
		userInteracted = true;
		pauseLoop();
		currentMS = Math.max(0, Math.min(durationMS, Math.round(nextMS)));
		renderFrame(stateAt(recording, currentMS), true);
	};

	seekInput?.addEventListener("input", () => {
		const nextMS = Number(seekInput.value);
		if (!Number.isFinite(nextMS)) return;
		seekTo(nextMS);
	});

	// Keep step="1" so dragging reaches the exact end, while arrow keys move in 1 s jumps.
	seekInput?.addEventListener("keydown", (event) => {
		let nextMS: number | null = null;
		switch (event.key) {
			case "ArrowLeft":
			case "ArrowDown":
				nextMS = currentMS - KEYBOARD_SEEK_STEP_MS;
				break;
			case "ArrowRight":
			case "ArrowUp":
				nextMS = currentMS + KEYBOARD_SEEK_STEP_MS;
				break;
			case "PageDown":
				nextMS = currentMS - KEYBOARD_SEEK_STEP_MS * 5;
				break;
			case "PageUp":
				nextMS = currentMS + KEYBOARD_SEEK_STEP_MS * 5;
				break;
			case "Home":
				nextMS = 0;
				break;
			case "End":
				nextMS = durationMS;
				break;
		}
		if (nextMS === null) return;
		event.preventDefault();
		seekTo(nextMS);
	});

	for (const btn of milestoneBtns) {
		btn.addEventListener("click", () => {
			const targetMS = Number(btn.dataset.replayAt);
			if (!Number.isFinite(targetMS)) return;
			userInteracted = true;
			pauseLoop();
			currentMS = Math.max(0, Math.min(durationMS, targetMS));
			lastAnnouncedMilestone = -1;
			renderFrame(stateAt(recording, currentMS), true);
		});
	}

	document.addEventListener("visibilitychange", () => {
		if (document.hidden && playing) {
			pauseLoop();
		}
	});

	setSpeed(speed);
	updatePlayButton();
	renderFrame(stateAt(recording, currentMS), false);

	if (!reducedMotion) {
		const triggerAutoplay = () => {
			if (hasAutoStarted || userInteracted || document.hidden) return;
			hasAutoStarted = true;
			startLoop();
		};

		const lanesEl = root.querySelector<HTMLElement>(".replay-lanes") ?? root;
		if (typeof IntersectionObserver === "function") {
			const lanesH = lanesEl.getBoundingClientRect().height;
			const viewH = window.innerHeight || 900;
			const threshold = lanesH > 0 ? Math.max(0.2, Math.min(0.85, (viewH * 0.7) / lanesH)) : 0.75;
			const observer = new IntersectionObserver(
				(entries) => {
					for (const entry of entries) {
						if (entry.isIntersecting && entry.intersectionRatio >= threshold) {
							observer.disconnect();
							triggerAutoplay();
							break;
						}
					}
				},
				{ threshold },
			);
			observer.observe(lanesEl);
		} else {
			triggerAutoplay();
		}
	}
}

for (const el of document.querySelectorAll<HTMLElement>("[data-queue-replay]")) {
	initReplay(el);
}
