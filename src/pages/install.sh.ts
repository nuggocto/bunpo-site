import type { APIRoute } from "astro";
import { INSTALL_SH } from "../data/install-scripts";

export const GET: APIRoute = () =>
	new Response(INSTALL_SH, {
		headers: { "Content-Type": "text/plain; charset=utf-8" },
	});
