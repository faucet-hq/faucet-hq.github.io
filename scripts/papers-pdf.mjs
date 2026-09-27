// Render every built paper (dist/papers/<slug>/index.html) to dist/papers/<slug>.pdf
// with headless Chrome, so each PDF always matches the HTML it was built from.
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const DIST = new URL('../dist/', import.meta.url).pathname;
const BASE = (process.env.BASE_PATH || '/').replace(/\/?$/, '/');
const PAPERS = join(DIST, 'papers');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};

function findChrome() {
  const candidates = [
    process.env.CHROME,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  return candidates.find((p) => p && existsSync(p));
}

function serve() {
  const server = createServer((req, res) => {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.startsWith(BASE)) path = '/' + path.slice(BASE.length);
    let file = normalize(join(DIST, path));
    if (!file.startsWith(DIST)) return res.writeHead(403).end();
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const slugs = existsSync(PAPERS)
  ? readdirSync(PAPERS).filter((d) => existsSync(join(PAPERS, d, 'index.html')))
  : [];
if (slugs.length === 0) {
  console.log('papers-pdf: no papers found, nothing to render');
  process.exit(0);
}

const chrome = findChrome();
if (!chrome) {
  if (process.env.CI) {
    console.error('papers-pdf: Chrome not found; set CHROME to its path');
    process.exit(1);
  }
  console.warn('papers-pdf: Chrome not found, skipping PDFs (set CHROME to render them)');
  process.exit(0);
}

const server = await serve();
const { port } = server.address();
try {
  for (const slug of slugs) {
    const out = join(PAPERS, `${slug}.pdf`);
    await run(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--no-pdf-header-footer',
      '--virtual-time-budget=10000',
      `--print-to-pdf=${out}`,
      `http://127.0.0.1:${port}${BASE}papers/${slug}/`,
    ]);
    if (!existsSync(out) || statSync(out).size === 0) throw new Error(`empty PDF for ${slug}`);
    console.log(`papers-pdf: ${slug}.pdf (${Math.round(statSync(out).size / 1024)} KiB)`);
  }
} finally {
  server.close();
}
