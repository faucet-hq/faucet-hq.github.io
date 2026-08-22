# faucet-stream website

Marketing site for [**faucet-stream**](https://github.com/faucet-hq/faucet-stream) — the
fast, config-driven way to move data in Rust.

Built with [Astro](https://astro.build) as a fully static site. Deployed to
**GitHub Pages** from `faucet-hq/faucet-hq.github.io` via `.github/workflows/deploy.yml`.

## Develop

```bash
npm install
npm run dev        # http://localhost:4321
```

## Build

```bash
npm run build      # → dist/
npm run preview    # serve the production build locally
```

## Deploy (GitHub Pages)

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds and publishes
`dist/` to GitHub Pages. One-time setup:

1. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. This is an org **user site** (`faucet-hq.github.io`) so it serves at the root —
   `base` stays `/`.

### Custom domain

1. Register the domain and point DNS at GitHub Pages (apex `A`/`AAAA` records, or a
   `CNAME` for `www`/subdomains — see GitHub's docs).
2. Add `public/CNAME` containing just the domain (e.g. `faucetstream.dev`).
3. Change `site` in `astro.config.mjs` to `https://<domain>` so canonical URLs resolve.

## Structure

```
public/            static assets — fonts, favicon, _headers, robots.txt
src/
  assets/          brand SVGs (mark, wordmark)
  components/      section components (Hero, Benchmark, Connectors, …)
  layouts/         Base.astro — <head>, meta, reveal + copy scripts
  pages/           index.astro — single-page composition
  styles/          global.css — design tokens & base
```

## Brand

- Teal `#14B8A6`, deep teal `#0D9488`, slate ink `#0F172A`
- Typefaces: **Geist** (display/body) + **Geist Mono** (utility/data), self-hosted
- Numbers (712k rows/s, ~96×, 66 connectors) come from the library's
  [`BENCHMARKS.md`](https://github.com/faucet-hq/faucet-stream/blob/main/BENCHMARKS.md)
  and README — keep them in sync when those change.
