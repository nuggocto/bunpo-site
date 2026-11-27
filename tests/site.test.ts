import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { formatSeconds, trials, workedExample } from "../src/data/benchmarks";
import {
	INSTALL_PS1,
	INSTALL_PS1_SHA256,
	INSTALL_SH,
	INSTALL_SH_SHA256,
} from "../src/data/install-scripts";
import { CLI_ASSETS, LATEST_VERSION, releases } from "../src/data/releases";
import { SECURITY_TXT } from "../src/pages/.well-known/security.txt";

describe("design constraints (global.css)", () => {
	const css = readFileSync("src/styles/global.css", "utf8");

	test("uses at most 3 font families", () => {
		const fontVars = [...css.matchAll(/--font-[a-z-]+:/g)];
		expect(fontVars.length).toBeLessThanOrEqual(3);
	});

	test("uses at most 4 font sizes across the stylesheet", () => {
		const sizeVars = [...css.matchAll(/--fs-[a-z-]+:/g)];
		expect(sizeVars.length).toBeLessThanOrEqual(4);

		// Every font-size declaration outside :root and html base (16px) must reference one of the 4 --fs-* tokens.
		const declarations = [...css.matchAll(/font-size:\s*([^;]+);/g)].map((m) => m[1].trim());
		for (const val of declarations) {
			const allowed = val === "16px" || /^var\(--fs-(display|title|body|small)\)$/.test(val);
			expect(allowed, `unexpected font-size declaration: ${val}`).toBe(true);
		}
	});

	test("uses only calm neutral paper surfaces (no colored or gradient backgrounds)", () => {
		const bgMatches = [...css.matchAll(/background(?:-color)?:\s*([^;]+);/g)].map((m) =>
			m[1].trim(),
		);
		const allowed = new Set([
			"var(--bg)",
			"var(--bg-subtle)",
			"var(--surface)",
			"var(--rule)",
			"var(--ink)",
			"var(--honey)",
			"transparent",
			"none",
		]);
		for (const val of bgMatches) {
			expect(allowed.has(val), `unexpected background value: ${val}`).toBe(true);
		}
		expect(css).not.toContain("gradient(");
	});
});

describe("site content & data integrity", () => {
	test("worked example is genuinely alphabetical by name and balances 22m/12m into 17m/17m", () => {
		const byNameOrder = workedExample.byName.flatMap((m) => m.files.map((f) => f.name));
		expect(byNameOrder).toEqual([...byNameOrder].sort());

		const byTimingFiles = workedExample.byTiming.flatMap((m) => m.files.map((f) => f.name)).sort();
		expect(byTimingFiles).toEqual(byNameOrder);

		const byNameTotals = workedExample.byName.map((m) =>
			m.files.reduce((sum, f) => sum + f.minutes, 0),
		);
		const byTimingTotals = workedExample.byTiming.map((m) =>
			m.files.reduce((sum, f) => sum + f.minutes, 0),
		);
		expect(byNameTotals).toEqual([22, 12]);
		expect(byTimingTotals).toEqual([17, 17]);
	});

	test("all five runner guides exist and enforce bash pipefail + bunpo@v0", () => {
		const expected = ["jest.md", "playwright.md", "pytest.md", "rspec.md", "vitest.md"];
		const actual = readdirSync("src/content/guides").sort();
		expect(actual).toEqual(expected);

		for (const file of actual) {
			const text = readFileSync(join("src/content/guides", file), "utf8");
			expect(text).toContain("shell: bash");
			expect(text).toContain("nuggocto/bunpo@v0");
			expect(text).toContain(LATEST_VERSION);
			expect(text).toContain("## Live queue");
			expect(text).toContain("0.1.0");
		}
	});

	test("trial scenarios pair before/after bars cleanly and preserve total file counts", () => {
		expect(formatSeconds(5.095)).toBe("5.10s");
		expect(formatSeconds(5.042)).toBe("5.04s");
		expect(formatSeconds(127.6)).toBe("2m 08s");

		for (const t of trials) {
			expect(t.beforeBars.length).toBe(t.afterBars.length);
			const beforeFiles = t.beforeBars.reduce((s, b) => s + b.files, 0);
			const afterFiles = t.afterBars.reduce((s, b) => s + b.files, 0);
			expect(beforeFiles, `${t.id} file count mismatch`).toBe(afterFiles);

			// Notes below bars must appear symmetrically across both columns so rows stay aligned.
			for (let i = 0; i < t.beforeBars.length; i++) {
				expect(Boolean(t.beforeBars[i]?.note), `${t.id} row ${i} note symmetry`).toBe(
					Boolean(t.afterBars[i]?.note),
				);
			}
		}
	});

	test("headline gains compare against a count split and match the bars", () => {
		const slowest = (bars: { seconds: number }[]) => Math.max(...bars.map((b) => b.seconds));
		let checked = 0;
		for (const t of trials) {
			if (t.gainLabel !== "saved vs count") continue;
			const before = slowest(t.beforeBars);
			const after = slowest(t.afterBars);
			const percent = Math.round((1 - after / before) * 100);
			expect(t.beforeHeadline, t.id).toBe(formatSeconds(before));
			expect(t.afterHeadline, t.id).toBe(formatSeconds(after));
			expect(t.gainHeadline, t.id).toContain(`${percent}% less`);
			expect(t.gainHeadline, t.id).toStartWith(
				formatSeconds(before - after)
					.replace(/^0m /, "")
					.replace(/\.\d+s$/, "s"),
			);
			checked++;
		}
		expect(checked).toBe(3);
	});

	test("homepage result claims match the trial: half the wait, 7s apart instead of 3 min", () => {
		const trial = trials.find((t) => t.id === "majlisna-backend");
		const before = trial?.beforeBars.map((b) => b.seconds) ?? [];
		const after = trial?.afterBars.map((b) => b.seconds) ?? [];
		const spread = (times: number[]) => Math.max(...times) - Math.min(...times);
		expect(Math.max(...after) / Math.max(...before)).toBeCloseTo(0.5, 2);
		expect(Math.round(spread(after))).toBe(7);
		expect(Math.round(spread(before) / 60)).toBe(3);
	});

	test("latest release matches changelog top entry", () => {
		expect(releases[0]?.version).toBe(LATEST_VERSION);
	});

	test("latest release provides valid SHA-256 hashes for all six CLI assets", () => {
		const latest = releases.find((r) => r.version === LATEST_VERSION);
		expect(latest, `missing release entry for ${LATEST_VERSION}`).toBeDefined();
		expect(latest?.checksums, `missing checksums for ${LATEST_VERSION}`).toBeDefined();
		for (const asset of CLI_ASSETS) {
			const hash = latest?.checksums?.[asset];
			expect(hash, `missing SHA-256 for ${asset}`).toBeDefined();
			expect(hash, `invalid SHA-256 for ${asset}`).toMatch(/^[0-9a-f]{64}$/);
		}
		expect(INSTALL_SH).toContain(`PINNED_VERSION='${LATEST_VERSION}'`);
		expect(INSTALL_PS1).toContain(`$pinnedVersion = "${LATEST_VERSION}"`);
		expect(createHash("sha256").update(INSTALL_SH, "utf8").digest("hex")).toBe(INSTALL_SH_SHA256);
		expect(createHash("sha256").update(INSTALL_PS1, "utf8").digest("hex")).toBe(INSTALL_PS1_SHA256);
	});

	test("install.ps1 has no variable directly followed by a colon", () => {
		// PowerShell reads "$name:" as a drive-qualified variable and refuses to parse
		// the whole script, so write "${name}:" instead. $env: is the one intended use.
		const bad = INSTALL_PS1.match(/\$(?!env:)[A-Za-z_]\w*:/g) ?? [];
		expect(bad).toEqual([]);
	});

	test("security.txt names both contacts and expires within a year", () => {
		// RFC 9116: Contact and Expires are required, and Expires should be under a year away.
		expect(SECURITY_TXT).toContain("Contact: mailto:security@bunpo.org\n");
		expect(SECURITY_TXT).toContain(
			"Contact: https://github.com/nuggocto/bunpo/security/advisories/new\n",
		);
		const expires = Date.parse(SECURITY_TXT.match(/^Expires: (.+)$/m)?.[1] ?? "");
		const days = (expires - Date.now()) / 86_400_000;
		expect(days).toBeGreaterThan(300);
		expect(days).toBeLessThan(365);
	});
});

describe("built static output (when dist/ exists)", () => {
	const hasDist = existsSync("dist/index.html");

	test.if(hasDist)("all required pages are built", () => {
		for (const page of [
			"dist/index.html",
			"dist/install/index.html",
			"dist/install.sh",
			"dist/install.ps1",
			"dist/cli/index.html",
			"dist/queue/index.html",
			"dist/llms.txt",
			"dist/llms-full.txt",
			"dist/404.html",
			"dist/guides/index.html",
			"dist/guides/pytest/index.html",
			"dist/guides/jest/index.html",
			"dist/guides/vitest/index.html",
			"dist/guides/rspec/index.html",
			"dist/guides/playwright/index.html",
			"dist/benchmarks/index.html",
			"dist/changelog/index.html",
			"dist/_headers",
			"dist/favicon.png",
			"dist/robots.txt",
			"dist/sitemap.xml",
			"dist/brand/og.png",
			"dist/brand/mitsu.webp",
			"dist/brand/mitsu.png",
			"dist/brand/mitsu-404.webp",
			"dist/brand/mitsu-404.png",
			"dist/brand/logo-mark.webp",
			"dist/brand/logo-mark.png",
			"dist/brand/logo-mono.svg",
			"dist/brand/logo-lockup.svg",
		]) {
			expect(existsSync(page), `missing built artifact: ${page}`).toBe(true);
		}

		const queueHtml = readFileSync("dist/queue/index.html", "utf8");
		expect(queueHtml).toContain("data-queue-replay");
		expect(queueHtml).toContain('id="cloudflare"');
		expect(queueHtml).toContain("2026-11-25-cloudflare-free-trial.md");

		const homeHtml = readFileSync("dist/index.html", "utf8");
		expect(homeHtml).toContain("/queue#replay");

		const sitemap = readFileSync("dist/sitemap.xml", "utf8");
		expect(sitemap).toContain("https://bunpo.org/cli/");
		expect(sitemap).toContain("https://bunpo.org/queue/");

		const llms = readFileSync("dist/llms.txt", "utf8");
		expect(llms).toContain("https://bunpo.org/cli/");
		expect(llms).toContain("https://bunpo.org/queue/");
		expect(llms).toContain("https://bunpo.org/llms-full.txt");
		expect(llms).toContain(LATEST_VERSION);
		expect(llms.toLowerCase()).not.toContain("upcoming");

		const llmsFull = readFileSync("dist/llms-full.txt", "utf8");
		expect(llmsFull).toContain("bunpo split");
		expect(llmsFull).toContain("bunpo --queue");
		expect(llmsFull).toContain("bunpo-server");
		expect(llmsFull).toContain("Guide: Bunpō with pytest");
		expect(llmsFull).toContain("Guide: Bunpō with Playwright");
	});

	test.if(hasDist)("every brand image URL carries a content hash", () => {
		for (const page of ["dist/index.html", "dist/404.html", "dist/install/index.html"]) {
			const urls = [...readFileSync(page, "utf8").matchAll(/"[^"]*(\/brand\/[^"]+)"/g)];
			expect(urls.length).toBeGreaterThan(0);
			for (const [, url] of urls) expect(url, page).toMatch(/\?v=[0-9a-f]{10}$/);
		}
	});

	test.if(hasDist)("internal links resolve to built files", () => {
		const htmlFiles: string[] = [];
		const walk = (dir: string) => {
			for (const entry of readdirSync(dir, { withFileTypes: true })) {
				const full = join(dir, entry.name);
				if (entry.isDirectory()) walk(full);
				else if (entry.name.endsWith(".html")) htmlFiles.push(full);
			}
		};
		walk("dist");

		for (const file of htmlFiles) {
			const html = readFileSync(file, "utf8");
			for (const m of html.matchAll(/(?:href|src|srcset)="(\/[^"#?]*)(?:[?#][^"]*)?"/g)) {
				const target = m[1];
				const asFile = join("dist", target);
				const asIndex = join("dist", target, "index.html");
				expect(
					existsSync(asFile) || existsSync(asIndex),
					`broken internal link ${target} in ${file}`,
				).toBe(true);
			}
		}
	});
});
