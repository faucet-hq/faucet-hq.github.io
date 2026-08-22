// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Deployed to GitHub Pages (faucet-hq/faucet-hq.github.io) as a static build.
// This is an org *user site*, so it serves at the root — base stays "/".
// When the custom domain is live, (1) change `site` below to it and
// (2) add `public/CNAME` containing just the domain (e.g. "faucetstream.dev").
// BASE_PATH lets CI build the same tree under a subpath:
//   main → "/"  (production root),  dev → "/dev/"  (staging preview).
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  site: 'https://faucet-hq.github.io',
  base,
  trailingSlash: 'ignore',
  integrations: [sitemap()],
  build: {
    inlineStylesheets: 'auto',
  },
});
