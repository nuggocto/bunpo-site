# bunpo-site

Static Astro site for [bunpo.org](https://bunpo.org), deployed on Cloudflare Pages.

## Development

Uses Bun (`1.4.5`, pinned in `.bun-version` and `package.json`).

```sh
bun install
bun run dev
```

## Checks and build

```sh
bun run fmt:check
bun run lint
bun run check
bun run build
bun test
```

## Deployment

Deployed automatically on Cloudflare Pages (`bunpo-site` -> `bunpo.org`) from the `shrek` branch:

- **Build command:** `bun run build`
- **Build output directory:** `dist`
- **Custom domain:** `bunpo.org` (with `www.bunpo.org` redirecting 301 to `https://bunpo.org`)

## Releases

On each `bunpo` release, update `LATEST_VERSION`, the release entry, and its six CLI SHA-256 hashes in `src/data/releases.ts` (`bun test` fails if any hash is missing or invalid).
