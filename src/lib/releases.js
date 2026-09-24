// Build-time changelog data: every GitHub release of faucet-stream, grouped into
// release days. release-plz publishes one GitHub release per crate, so a single
// release of the project is dozens of releases with overlapping notes; this
// folds them back into one entry per day with the notes deduplicated.

const REPO = 'faucet-hq/faucet-stream';
const HEADLINE_CRATES = ['faucet-cli', 'faucet-stream', 'faucet-core'];
const SECTION_ORDER = ['Features', 'Bug Fixes', 'Performance'];

async function fetchAll() {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'faucet-hq-site' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const all = [];
  for (let page = 1; page <= 30; page++) {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=100&page=${page}`, { headers });
    if (!r.ok) throw new Error(`GitHub releases: HTTP ${r.status}`);
    const batch = await r.json();
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

// "faucet-source-rest-v1.6.0" → { crate: "faucet-source-rest", version: "1.6.0" }
export function splitTag(tag) {
  const m = /^(.*)-v(\d+\.\d+\.\d+.*)$/.exec(tag || '');
  return m ? { crate: m[1], version: m[2] } : { crate: tag, version: '' };
}

// A release body is release-plz / git-cliff markdown: "### Section" headings over "- item" bullets.
export function parseBody(body) {
  const sections = {};
  let current = 'Other';
  for (const raw of (body || '').split('\n')) {
    const line = raw.trim();
    const h = /^#{2,4}\s+(.+)$/.exec(line);
    if (h) { current = h[1].replace(/[^\w\s]/g, '').trim() || 'Other'; continue; }
    const b = /^[-*]\s+(.+)$/.exec(line);
    // Dependency-bump boilerplate from the release tooling says nothing to a reader.
    if (b && !/^Updated the following local packages/i.test(b[1])) (sections[current] ||= []).push(b[1]);
  }
  return sections;
}

// "text ([#577](https://…/pull/577))" → { text, pr: 577, url }
export function splitItem(item) {
  const m = /\s*\(\[#(\d+)\]\(([^)]+)\)\)\s*$/.exec(item);
  let text = m ? item.slice(0, m.index).trim() : item.trim();
  // git-cliff writes the conventional-commit scope as "*(scope)* ".
  const sc = /^\*\(([^)]+)\)\*\s*/.exec(text);
  const scope = sc ? sc[1].split(',').map((x) => x.trim()).filter(Boolean) : [];
  if (sc) text = text.slice(sc[0].length);
  return { text, scope, pr: m ? Number(m[1]) : null, url: m ? m[2] : null };
}

export function group(releases) {
  const days = new Map();
  for (const r of releases) {
    if (r.draft || r.prerelease || !r.published_at) continue;
    const day = r.published_at.slice(0, 10);
    const { crate, version } = splitTag(r.tag_name);
    if (!days.has(day)) days.set(day, { day, crates: [], sections: new Map() });
    const d = days.get(day);
    d.crates.push({ crate, version, url: r.html_url });
    for (const [name, items] of Object.entries(parseBody(r.body))) {
      if (!d.sections.has(name)) d.sections.set(name, new Map());
      for (const it of items) {
        const item = splitItem(it);
        const key = item.text.toLowerCase();
        const seen = d.sections.get(name).get(key);
        if (seen) seen.crates.add(crate);
        else d.sections.get(name).set(key, { ...item, crates: new Set([crate]) });
      }
    }
  }
  return [...days.values()]
    .sort((a, b) => b.day.localeCompare(a.day))
    .map((d) => {
      d.crates.sort((a, b) => a.crate.localeCompare(b.crate));
      const head = HEADLINE_CRATES.map((c) => d.crates.find((x) => x.crate === c)).find(Boolean) || d.crates[0];
      const names = [...d.sections.keys()].sort((a, b) => {
        const ia = SECTION_ORDER.indexOf(a), ib = SECTION_ORDER.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
      });
      return {
        day: d.day,
        head,
        crates: d.crates,
        sections: names.map((n) => ({ name: n, items: [...d.sections.get(n).values()].map((i) => ({ ...i, crates: [...i.crates].sort() })) })),
      };
    });
}

export async function loadReleases() {
  try {
    return { entries: group(await fetchAll()), error: null };
  } catch (e) {
    return { entries: [], error: String(e.message || e) };
  }
}
