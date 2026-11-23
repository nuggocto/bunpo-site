import { getCollection } from "astro:content";
import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ site }) => {
	const guides = await getCollection("guides");
	const paths = [
		"/",
		"/install/",
		"/guides/",
		...guides.map((g) => `/guides/${g.id}/`),
		"/benchmarks/",
		"/changelog/",
	];
	const urls = paths.map((p) => `\t<url><loc>${new URL(p, site).href}</loc></url>`).join("\n");
	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
	return new Response(xml, { headers: { "Content-Type": "application/xml" } });
};
