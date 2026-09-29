// Refresh the Connector Hub data: src/data/connectors.json from the newest CLI
// release's export, and src/data/crates.json from the crates.io API
// (first-party stats plus community faucet-source-* / faucet-sink-* crates).
// Each file is only rewritten after a complete, successful fetch, so an
// outage keeps the last good data and never fails the build.
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

// The engine attaches its `faucet conformance --export` feed to every CLI
// release; take the newest one that has it, and keep the committed snapshot
// unless it is complete.
async function refreshSnapshot() {
  const res = await fetch('https://api.github.com/repos/faucet-hq/faucet-stream/releases?per_page=50', {
    headers: { 'User-Agent': UA, Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`releases: HTTP ${res.status}`);
  const release = (await res.json()).find(
    (r) => r.tag_name?.startsWith('faucet-cli-v') && !r.draft && r.assets?.some((a) => a.name === 'connectors.json'),
  );
  if (!release) return console.log('connectors.json: no CLI release carries the export yet; keeping the snapshot');
  const asset = release.assets.find((a) => a.name === 'connectors.json');
  const feed = await (
    await fetch(asset.browser_download_url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  ).json();
  const complete =
    feed?.format === 'faucet-connector-export' &&
    feed.version === 1 &&
    Array.isArray(feed.connectors) &&
    feed.connectors.length > 0 &&
    feed.connectors.every((c) => c.id && c.crate && c.config_schema);
  if (!complete) throw new Error(`${release.tag_name} connectors.json is incomplete; keeping the snapshot`);
  writeFileSync(SNAPSHOT, JSON.stringify(feed, null, 2) + '\n');
  console.log(`connectors.json: ${feed.connectors.length} connectors from ${release.tag_name}`);
}

async function main() {
  await refreshSnapshot().catch((e) => console.warn(`connector export refresh failed (${e.message})`));
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
