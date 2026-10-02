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
const TEAM = 'github:faucet-hq:owners';

async function page(query, n, teamId) {
  const scope = teamId ? `team_id=${teamId}` : `q=${encodeURIComponent(query)}`;
  const url = `https://crates.io/api/v1/crates?${scope}&per_page=100&page=${n}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

async function teamCrates() {
  const res = await fetch(`https://crates.io/api/v1/teams/${TEAM}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`team ${TEAM}: HTTP ${res.status}`);
  return search('', (await res.json()).team.id);
}

async function search(query, teamId) {
  const found = [];
  for (let n = 1; n <= 10; n++) {
    const body = await page(query, n, teamId);
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
// release. release-plz publishes one GitHub release per crate, so the CLI
// release can sit hundreds deep in the release list: resolve the CLI tags
// directly, newest version first, and take the first one carrying the feed.
const GH = 'https://api.github.com/repos/faucet-hq/faucet-stream';
const ghHeaders = () => ({
  'User-Agent': UA,
  Accept: 'application/vnd.github+json',
  ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
});

function cliVersions(refs) {
  const parse = (ref) => /^refs\/tags\/faucet-cli-v(\d+)\.(\d+)\.(\d+)$/.exec(ref)?.slice(1).map(Number);
  return refs
    .map((r) => ({ tag: r.ref.slice('refs/tags/'.length), v: parse(r.ref) }))
    .filter((r) => r.v)
    .sort((a, b) => b.v[0] - a.v[0] || b.v[1] - a.v[1] || b.v[2] - a.v[2])
    .map((r) => r.tag);
}

function isCompleteFeed(feed) {
  return (
    feed?.format === 'faucet-connector-export' &&
    feed.version === 1 &&
    Array.isArray(feed.connectors) &&
    feed.connectors.length > 0 &&
    feed.connectors.every((c) => c.id && c.crate && c.config_schema)
  );
}

async function gh(path) {
  const res = await fetch(`${GH}${path}`, { headers: ghHeaders(), signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

async function refreshSnapshot() {
  const tags = cliVersions((await gh('/git/matching-refs/tags/faucet-cli-v')) ?? []);
  for (const tag of tags.slice(0, 5)) {
    const release = await gh(`/releases/tags/${tag}`);
    const asset = release && !release.draft && release.assets?.find((a) => a.name === 'connectors.json');
    if (!asset) {
      console.log(`connectors.json: ${tag} has no export yet; trying the previous CLI release`);
      continue;
    }
    const res = await fetch(asset.browser_download_url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`${tag} connectors.json: HTTP ${res.status}`);
    const feed = await res.json();
    if (!isCompleteFeed(feed)) throw new Error(`${tag} connectors.json is incomplete; keeping the snapshot`);
    writeFileSync(SNAPSHOT, JSON.stringify(feed, null, 2) + '\n');
    return console.log(`connectors.json: ${feed.connectors.length} connectors from ${tag}`);
  }
  console.log('connectors.json: no recent CLI release carries the export; keeping the snapshot');
}

async function main() {
  await refreshSnapshot().catch((e) => console.warn(`connector export refresh failed (${e.message})`));
  const snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
  const firstParty = new Set(snapshot.connectors.map((c) => c.crate));
  const owned = new Map((await teamCrates()).map((c) => [c.name, c]));
  const crates = {};
  for (const name of [...firstParty].sort()) if (owned.has(name)) crates[name] = entry(owned.get(name));
  const seen = new Map();
  for (const q of ['faucet-source', 'faucet-sink']) {
    for (const c of await search(q)) seen.set(c.name, c);
  }
  const community = [];
  for (const [name, c] of [...seen].sort(([a], [b]) => a.localeCompare(b))) {
    if (!owned.has(name) && !firstParty.has(name) && NAME_RE.test(name)) community.push(entry(c));
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
