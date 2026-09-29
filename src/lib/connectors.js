// Connector Hub data: the engine's `faucet connectors export` snapshot plus the
// last good crates.io refresh (scripts/refresh-crates.mjs). Everything is read
// at build time; pages make no network calls.
import snapshot from '../data/connectors.json';

const cratesModules = import.meta.glob('../data/crates.json', { eager: true });
const crates = Object.values(cratesModules)[0]?.default ?? { fetched_at: null, crates: {}, community: [] };

export const REPO = 'https://github.com/faucet-hq/faucet-stream';
export const DOCS = 'https://faucet-hq.github.io/faucet-stream';

const tierOrder = Object.fromEntries(snapshot.tiers.map((t, i) => [t.id, i]));
const categoryLabel = Object.fromEntries(snapshot.categories.map((c) => [c.id, c.label]));

export const categories = snapshot.categories;
export const tiers = snapshot.tiers;
export const faucetVersion = snapshot.faucet_version;
export const fetchedAt = crates.fetched_at;

export function connectors() {
  return snapshot.connectors
    .map((c) => ({
      ...c,
      slug: c.id,
      categoryLabel: categoryLabel[c.category] ?? c.category,
      tier: c.conformance?.tier ?? 'draft',
      score: c.conformance?.score ?? 0,
      published: crates.crates[c.crate] ?? null,
    }))
    .sort((a, b) => a.title.localeCompare(b.title) || a.kind.localeCompare(b.kind));
}

export function community() {
  return [...(crates.community ?? [])].sort((a, b) => (b.downloads ?? 0) - (a.downloads ?? 0));
}

export function tierLabel(id) {
  return tiers.find((t) => t.id === id)?.label ?? id;
}

export function byTier(a, b) {
  return (tierOrder[a] ?? 99) - (tierOrder[b] ?? 99);
}

export function fmtInt(n) {
  return typeof n === 'number' ? n.toLocaleString('en-US') : '—';
}

export function fmtDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

// Rustdoc intra-doc links (`[\`x\`](Self::x)`, `[\`X\`]`) read as plain `x`,
// including ones the engine truncated mid-link.
export function cleanDoc(s) {
  return (s ?? '').replace(/\[`([^`\]]+)`\](\([^)\n]*\)?)?/g, '`$1`');
}

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// First paragraph of a field doc as HTML: escaped, with `code` spans marked up.
export function docHtml(s) {
  const first = cleanDoc(s).split('\n\n')[0].replace(/\s+/g, ' ').trim();
  return escapeHtml(first).replace(/`([^`]+)`/g, '<code>$1</code>');
}

// A config default as it would be written in YAML: scalars bare, objects one
// `key: value` per line, nested values as inline flow.
function flow(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return `[${v.map(flow).join(', ')}]`;
  if (typeof v === 'object') return `{${Object.entries(v).map(([k, x]) => `${k}: ${flow(x)}`).join(', ')}}`;
  if (typeof v === 'string') return v === '' || /[:#{}[\],]|^\s|\s$/.test(v) ? JSON.stringify(v) : v;
  return String(v);
}

export function defaultLines(v) {
  if (v === null || v === undefined) return ['—'];
  if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0) {
    return Object.entries(v).map(([k, x]) => `${k}: ${flow(x)}`);
  }
  return [flow(v)];
}

export const DELIVERY = {
  deterministic: 'Deterministic replay',
  non_deterministic: 'Non-deterministic replay',
  at_least_once: 'At-least-once',
  atomic_watermark: 'Exactly-once (atomic watermark)',
  keyed_upsert: 'Effectively-once (keyed upsert)',
};

export function capabilityRows(c) {
  const cap = c.capabilities ?? {};
  const label = c.kind === 'source' ? 'Replay' : 'Delivery';
  const rows = [[label, DELIVERY[cap.delivery] ?? cap.delivery ?? '—']];
  const flag = (label, v) => rows.push([label, v ? 'Yes' : 'No']);
  if (c.kind === 'source') {
    flag('Exactly-once replay', cap.exactly_once);
    flag('Incremental', cap.incremental);
    flag('Dataset discovery', cap.discover);
    flag('Reports lag', cap.reports_lag);
  } else {
    rows.push(['Write modes', (cap.write_modes ?? []).join(', ') || 'append']);
    flag('Exactly-once writes', cap.exactly_once);
    flag('Schema evolution', cap.schema_evolution);
    flag('Scoped cleanup', cap.cleanup);
    flag('Staged bulk load', cap.staged_load);
    flag('Run rollback', cap.rollback);
  }
  flag('Compression', cap.compression);
  return rows;
}
