import { getCollection } from "astro:content";
import type { APIRoute } from "astro";
import { LATEST_VERSION } from "../data/releases";

export const GET: APIRoute = async ({ site }) => {
	const guides = (await getCollection("guides")).sort((a, b) => a.data.order - b.data.order);
	const url = (p: string) => new URL(p, site).href;

	const lines = [
		"# Bunpō",
		"",
		`> Split CI test suites across parallel machines by recorded file timings and verify every file was assigned once. Current release: ${LATEST_VERSION} (static mode). Live queue (--queue, bunpo-server, Cloudflare Worker) is upcoming in 0.1.0.`,
		"",
		"## Documentation",
		"",
		`- [Install](${url("/install/")}): GitHub Action (nuggocto/bunpo@v0), static binaries with SHA256SUMS, and Go install`,
		`- [CLI reference](${url("/cli/")}): every bunpo and bunpo-server command, flag, exit code, env var, and .bunpo/ file`,
		`- [Live queue (upcoming 0.1.0)](${url("/queue/")}): when to use static vs. --queue, Cloudflare Worker and bunpo-server overview`,
		`- [Benchmarks & trials](${url("/benchmarks/")}): measured runs on production suites and synthetic benchmarks`,
		`- [Changelog](${url("/changelog/")}): release history starting at v0.0.1`,
		`- [Full LLM reference](${url("/llms-full.txt")}): complete CLI reference, live queue summary, and all five runner guides in one text file`,
		"",
		"## Runner guides",
		"",
		...guides.map((g) => `- [${g.data.title}](${url(`/guides/${g.id}/`)}): ${g.data.summary}`),
		"",
		"## Source & specifications",
		"",
		"- [GitHub repository](https://github.com/nuggocto/bunpo)",
		"- [Queue HTTP protocol specification](https://github.com/nuggocto/bunpo/blob/shrek/docs/queue-protocol.md)",
		"- [Self-hosting guide](https://github.com/nuggocto/bunpo/blob/shrek/docs/self-hosting.md)",
		"",
	];

	return new Response(lines.join("\n"), {
		headers: { "Content-Type": "text/plain; charset=utf-8" },
	});
};
