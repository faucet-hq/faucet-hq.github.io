// Refresh src/data/crates.json from the crates.io API: first-party connector
// stats plus community faucet-source-* / faucet-sink-* crates. The file is
// only rewritten after a complete, successful fetch, so an outage keeps the
// last good data and never fails the build.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const OUT = new URL('../src/data/crates.json', import.meta.url);
const SNAPSHOT = new URL('../src/data/connectors.json', import.meta.url);
const UA = 'faucet-hq.github.io connector hub (https://github.com/faucet-hq/faucet-hq.github.io)';
const TIMEOUT_MS = 10_000;
const NAME_RE = /^faucet-(source|sink)-[a-z0-9][a-z0-9_-]*$/;

async function page(query, n) {
  const url = `https://crates.io/api/v1/crates?q=${encodeURIComponent(query)}&per_page=100&page=${n}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

async function search(query) {
  const found = [];
  for (let n = 1; n <= 10; n++) {
    const body = await page(query, n);
    found.push(...(body.crates ?? []));
    if ((body.crates ?? []).length < 100) break;
    await new Promise((r) => setTimeout(r, 1100));
  }
  return found;
}

const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : null);

function entry(c) {
  return {
    name: c.name,
    version: text(c.max_stable_version ?? c.max_version, 40),
    downloads: Number.isFinite(c.downloads) ? c.downloads : null,
    recent_downloads: Number.isFinite(c.recent_downloads) ? c.recent_downloads : null,
    updated_at: text(c.updated_at, 40),
    description: text(c.description, 300),
    repository: text(c.repository, 300),
  };
}

async function main() {
  const snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
  const firstParty = new Set(snapshot.connectors.map((c) => c.crate));
  const seen = new Map();
  for (const q of ['faucet-source', 'faucet-sink']) {
    for (const c of await search(q)) seen.set(c.name, c);
  }
  const crates = {};
  const community = [];
  for (const [name, c] of [...seen].sort(([a], [b]) => a.localeCompare(b))) {
    if (firstParty.has(name)) crates[name] = entry(c);
    else if (NAME_RE.test(name)) community.push(entry(c));
  }
  if (Object.keys(crates).length === 0) throw new Error('no first-party crates found; refusing to overwrite the cache');
  const data = { fetched_at: new Date().toISOString(), crates, community };
  writeFileSync(OUT, JSON.stringify(data, null, 2) + '\n');
  console.log(`crates.json: ${Object.keys(crates).length} first-party, ${community.length} community`);
}

main().catch((e) => {
  const kept = existsSync(OUT) ? 'keeping the last good crates.json' : 'no cache yet; pages render without crates.io stats';
  console.warn(`crates.io refresh failed (${e.message}); ${kept}`);
});
