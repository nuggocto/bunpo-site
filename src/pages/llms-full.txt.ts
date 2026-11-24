import { getCollection, getEntry } from "astro:content";
import type { APIRoute } from "astro";
import { LATEST_VERSION } from "../data/releases";

export const GET: APIRoute = async ({ site }) => {
	const cli = await getEntry("docs", "cli");
	if (!cli) throw new Error("Missing src/content/docs/cli.md");
	const guides = (await getCollection("guides")).sort((a, b) => a.data.order - b.data.order);
	const url = (p: string) => new URL(p, site).href;

	const sections: string[] = [
		`# Bunpō — Full documentation`,
		"",
		`Site: ${url("/")}`,
		`Current release: ${LATEST_VERSION} (static splitting). Live queue (--queue, bunpo-server, Cloudflare Worker) is upcoming in 0.1.0 and not yet released.`,
		"",
		"---",
		"",
		"# CLI reference",
		"",
		(cli.body ?? "").trim(),
		"",
		"---",
		"",
		"# Live queue overview (upcoming in 0.1.0)",
		"",
		"Use static splitting (bunpo split / verify) when machines are identical and start together, or on fork pull requests without secrets.",
		"Use bunpo --queue when machines have uneven speeds (x64 + ARM64), start minutes apart, or can be preempted mid-run.",
		"Two servers speak the same HTTP JSON v1 protocol and serve the same static read-only web dashboard:",
		"- Cloudflare Worker (worker/): SQLite-backed Durable Objects (BuildDO per build, BuildIndex for 200 recent builds) + Workers Static Assets.",
		"- Standalone Go server (bunpo-server): single static binary, in memory or CRC-32C persisted logs via --data DIR, TLS at reverse proxy.",
		"Protocol spec: https://github.com/nuggocto/bunpo/blob/shrek/docs/queue-protocol.md",
		"Self-hosting: https://github.com/nuggocto/bunpo/blob/shrek/docs/self-hosting.md",
		"",
	];

	for (const g of guides) {
		sections.push(
			"---",
			"",
			`# Guide: Bunpō with ${g.data.title}`,
			"",
			`URL: ${url(`/guides/${g.id}/`)}`,
			`Report format: ${g.data.reportFormat} | Selection: ${g.data.selection}`,
			"",
			(g.body ?? "").trim(),
			"",
		);
	}

	return new Response(sections.join("\n"), {
		headers: { "Content-Type": "text/plain; charset=utf-8" },
	});
};
