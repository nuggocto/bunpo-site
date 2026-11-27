import type { APIRoute } from "astro";

// RFC 9116 wants Expires less than a year ahead. Building it from the build
// date means every deploy renews it, so it never goes stale.
const DAY_MS = 24 * 60 * 60 * 1000;
const expires = new Date(Date.now() + 360 * DAY_MS);
expires.setUTCHours(0, 0, 0, 0);

export const SECURITY_TXT = `Contact: mailto:security@bunpo.org
Contact: https://github.com/nuggocto/bunpo/security/advisories/new
Expires: ${expires.toISOString()}
Preferred-Languages: en
Policy: https://github.com/nuggocto/bunpo/blob/shrek/SECURITY.md
Canonical: https://bunpo.org/.well-known/security.txt
`;

export const GET: APIRoute = () =>
	new Response(SECURITY_TXT, {
		headers: { "Content-Type": "text/plain; charset=utf-8" },
	});
