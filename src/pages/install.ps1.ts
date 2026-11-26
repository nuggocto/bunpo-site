import type { APIRoute } from "astro";
import { INSTALL_PS1 } from "../data/install-scripts";

export const GET: APIRoute = () =>
	new Response(INSTALL_PS1, {
		headers: { "Content-Type": "text/plain; charset=utf-8" },
	});
