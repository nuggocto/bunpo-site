import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/* Adds a content hash to a public/ URL, so a changed file never hits a stale CDN or browser cache. */
export function asset(path: string): string {
	const file = readFileSync(join(process.cwd(), "public", path));
	return `${path}?v=${createHash("sha256").update(file).digest("hex").slice(0, 10)}`;
}
