import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { formatSeconds, trials, workedExample } from "../src/data/benchmarks";
import { LATEST_VERSION, releases } from "../src/data/releases";

describe("design constraints (global.css)", () => {
	const css = readFileSync("src/styles/global.css", "utf8");

	test("uses at most 3 font families", () => {
		const fontVars = [...css.matchAll(/--font-[a-z-]+:/g)];
		expect(fontVars.length).toBeLessThanOrEqual(3);
	});

	test("uses at most 3 font sizes across the stylesheet", () => {
		const sizeVars = [...css.matchAll(/--fs-[a-z-]+:/g)];
		expect(sizeVars.length).toBeLessThanOrEqual(3);

		// Every font-size declaration outside :root and html base (16px) must reference one of the 3 --fs-* tokens.
		const declarations = [...css.matchAll(/font-size:\s*([^;]+);/g)].map((m) => m[1].trim());
		for (const val of declarations) {
			const allowed = val === "16px" || /^var\(--fs-(display|body|small)\)$/.test(val);
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

	test("latest release matches changelog top entry", () => {
		expect(releases[0]?.version).toBe(LATEST_VERSION);
	});
});

describe("built static output (when dist/ exists)", () => {
	const hasDist = existsSync("dist/index.html");

	test.if(hasDist)("all required pages are built", () => {
		for (const page of [
			"dist/index.html",
			"dist/install/index.html",
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
			"dist/demo.gif",
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
			for (const m of html.matchAll(/(?:href|src)="(\/[^"#?]*)"/g)) {
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
