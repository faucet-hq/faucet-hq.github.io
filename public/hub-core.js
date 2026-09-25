/* Template Hub — shared by /hub and /hub/template. Loads the catalog's
   index.json and renders cards and the pairing widget. Plain script: it
   defines window.HubCore and needs no build step. */
(() => {
  const INDEX_URLS = [
    'https://raw.githubusercontent.com/faucet-hq/template-hub/main/index.json',
    'https://cdn.jsdelivr.net/gh/faucet-hq/template-hub@main/index.json',
  ];
  const HUB_REPO = 'https://github.com/faucet-hq/template-hub';
  const OFFICIAL_OWNER = 'faucet-hq';
  const BASE = (window.HUB_BASE || '/').replace(/\/?$/, '/');

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  async function load() {
    for (const url of INDEX_URLS) {
      try {
        const r = await fetch(url, { cache: 'no-cache' });
        if (r.ok) return catalog(await r.json());
      } catch (e) { /* try the next */ }
    }
    throw new Error('catalog unreachable');
  }

  // The loaded catalog plus the lookups every view needs.
  function catalog(idx) {
    const sources = idx.sources || [];
    const sinks = idx.sinks || [];
    const cells = new Map((idx.matrix || []).map((c) => [c.source + '\u0000' + c.sink, c]));
    return {
      idx, sources, sinks,
      cell: (s, k) => cells.get(s + '\u0000' + k),
      find: (kind, id) => (kind === 'sink' ? sinks : sources).find((t) => idOf(t) === id),
      compatiblePairs: (idx.matrix || []).filter((c) => c.compatible).length,
    };
  }

  const idOf = (t) => t.id || t.name;
  const isOfficial = (t) => t.owner === OFFICIAL_OWNER || t.official === true;
  const trustOf = (t) => t.trust || {};
  const starsOf = (t) => trustOf(t).stars || 0;
  const updatedOf = (t) => trustOf(t).updated || '';
  // Natural order, so vendor2 sorts before vendor10.
  const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  const byId = (a, b) => natural(idOf(a), idOf(b));
  // Recommended: official first, then stars, then freshness — same order as `faucet hub list`.
  const SORTS = {
    rank: (a, b) => (isOfficial(b) - isOfficial(a)) || (starsOf(b) - starsOf(a)) || updatedOf(b).localeCompare(updatedOf(a)) || byId(a, b),
    stars: (a, b) => (starsOf(b) - starsOf(a)) || SORTS.rank(a, b),
    updated: (a, b) => updatedOf(b).localeCompare(updatedOf(a)) || byId(a, b),
    name: byId,
  };

  // The facet value for a template's owner: faucet-hq for the official set, '' when unscoped.
  const ownerKey = (t) => (isOfficial(t) ? OFFICIAL_OWNER : t.owner || '');
  const detailUrl = (kind, t) => `${BASE}hub/template/?kind=${kind}&id=${encodeURIComponent(idOf(t))}`;
  const titleOf = (t) => (t.owner ? `<span class="ns">${esc(t.owner)}/</span>${esc(t.name)}` : esc(t.name));
  const typeOf = (kind, t) => (kind === 'sink' ? t.sink_type : t.source_type) || '';
  // A plain-text owner tag, safe inside a card that is itself a link.
  const ownerTag = (t) => (isOfficial(t)
    ? `<span class="official" title="maintained by the faucet-hq org">official</span>`
    : t.owner ? `<span class="owner">@${esc(t.owner)}</span>` : `<span class="owner">unscoped</span>`);
  const ownerBadge = (t) => (isOfficial(t)
    ? `<a class="official" href="https://github.com/${OFFICIAL_OWNER}" target="_blank" rel="noopener noreferrer" title="maintained by the faucet-hq org">official · @${OFFICIAL_OWNER}</a>`
    : t.owner
      ? `<a class="owner" href="https://github.com/${esc(t.owner)}" target="_blank" rel="noopener noreferrer" title="published by ${esc(t.owner)}">@${esc(t.owner)}</a>`
      : `<span class="owner" title="unscoped template">unscoped</span>`);

  // A catalog card: just enough to recognise and compare. Everything else is on the template's page.
  function card(kind, t) {
    const tr = trustOf(t);
    const foot = [
      tr.stars != null ? `<span class="star">★ ${starsOf(t)}</span>` : '',
      tr.updated ? `<span>updated ${esc(tr.updated)}</span>` : '',
    ].filter(Boolean).join('<span aria-hidden="true">·</span>');
    return `<a class="card card--link" href="${detailUrl(kind, t)}" data-owner="${esc(ownerKey(t))}" data-type="${esc(typeOf(kind, t))}" data-search="${esc([idOf(t), t.owner, t.description, typeOf(kind, t), ...(t.tags || [])].join(' ').toLowerCase())}">
      <h3 class="mono">${titleOf(t)}</h3>
      <div class="badges">${ownerTag(t)}<span class="kind">${esc(typeOf(kind, t))}</span></div>
      ${t.description ? `<p class="desc">${esc(t.description)}</p>` : ''}
      ${foot ? `<div class="card-foot">${foot}</div>` : ''}
    </a>`;
  }

  const fitOf = (cat, sid, kid) => {
    const c = cat.cell(sid, kid);
    return c?.compatible ? 'ok' : (c?.streams || []).length ? 'partial' : 'bad';
  };
  const FIT_RANK = { ok: 0, partial: 1, bad: 2 };

  function planHtml(c) {
    if (!c) return '';
    const rows = (c.streams || []).map((p) =>
      `<li class="ok"><span class="mono">${esc(p.stream)}</span><span class="mode">${esc(p.write_mode)}${p.satisfies ? ` <em>for ${esc(p.satisfies)}</em>` : ''}</span></li>`)
      .concat((c.incompatible || []).map((i) => `<li class="bad"><span class="mono">${esc(i.stream)}</span><span class="mode">✗ ${esc(i.reason)}</span></li>`));
    const n = (c.streams || []).length + (c.incompatible || []).length;
    return `<div class="plan-head"><span class="plan-title">Streams <span class="plan-count">${n}</span></span><span class="plan-verdict ${c.compatible ? 'is-ok' : 'is-bad'}">${c.compatible ? '✓ compatible' : `✗ ${(c.incompatible || []).length} stream(s) have no viable write mode`}</span></div><ul>${rows.join('')}</ul>`;
  }

  /* The pairing widget. `fixed` pins one side: { source: id } on a source's
     page, { sink: id } on a sink's page, nothing on /hub. The free side is a
     <select>; the chips show how the chosen/fixed template fares against
     every template on the other side, capped with "+N more" and searchable
     once there are many. */
  function pairing(root, cat, fixed = {}, initial = {}) {
    const CHIPS_SHOWN = 12;
    const state = {
      source: fixed.source || initial.source || (cat.sources[0] && idOf(cat.sources[0])),
      sink: fixed.sink || initial.sink || (cat.sinks[0] && idOf(cat.sinks[0])),
      expanded: false,
      q: '',
    };
    // Chips run along the side that is not the anchor: sinks for a source, sources for a pinned sink.
    const axis = fixed.sink ? 'sources' : 'sinks';
    const option = (t, cur) => `<option value="${esc(idOf(t))}"${idOf(t) === cur ? ' selected' : ''}>${esc(idOf(t))}${isOfficial(t) ? ' (official)' : ''}</option>`;
    const select = (side) => `<label>${side}
        <select data-side="${side}" aria-label="${side === 'source' ? 'Source' : 'Sink'} template">${(side === 'source' ? cat.sources : cat.sinks).map((t) => option(t, state[side])).join('')}</select>
      </label>`;

    function chips() {
      const anchor = axis === 'sinks' ? state.source : state.sink;
      const list = axis === 'sinks' ? cat.sinks : cat.sources;
      const fit = (t) => (axis === 'sinks' ? fitOf(cat, anchor, idOf(t)) : fitOf(cat, idOf(t), anchor));
      const all = [...list].sort((a, b) => (FIT_RANK[fit(a)] - FIT_RANK[fit(b)]) || SORTS.rank(a, b));
      const full = all.filter((t) => fit(t) === 'ok').length;
      const partial = all.filter((t) => fit(t) === 'partial').length;
      const q = state.q.trim().toLowerCase();
      const matching = q ? all.filter((t) => [idOf(t), t.sink_type, t.source_type, t.description].join(' ').toLowerCase().includes(q)) : all;
      const shown = state.expanded || q ? matching : matching.slice(0, CHIPS_SHOWN);
      const noun = axis === 'sinks' ? 'sink' : 'source';
      const current = axis === 'sinks' ? state.sink : state.source;
      const chip = (t) => {
        const f = fit(t);
        const c = axis === 'sinks' ? cat.cell(anchor, idOf(t)) : cat.cell(idOf(t), anchor);
        const src = axis === 'sinks' ? cat.find('source', anchor) : t;
        const label = f === 'ok' ? '✓' : f === 'partial' ? `${(c.streams || []).length}/${(src?.streams || []).length}` : '✗';
        const title = f === 'ok' ? 'every stream has a write mode the sink supports' : f === 'partial' ? 'only some streams have a write mode the sink supports' : 'no stream can be written to the sink';
        return `<button type="button" class="fit-chip is-${f}${idOf(t) === current ? ' is-current' : ''}" data-pick="${esc(idOf(t))}" title="${title}"><span class="fit-mark">${label}</span>${esc(idOf(t))}</button>`;
      };
      const head = axis === 'sinks'
        ? `Runs fully on <b>${full}</b> of ${plural(list.length, 'sink')}${partial ? ` · partly on ${partial}` : ''}`
        : `<b>${full}</b> of ${plural(list.length, 'source')} run fully on it${partial ? ` · ${partial} partly` : ''}`;
      return `<div class="fit-head"><span>${head}</span>
          ${list.length > CHIPS_SHOWN ? `<input class="filter fit-filter" type="search" placeholder="find a ${noun}…" aria-label="Find a ${noun}" value="${esc(state.q)}" />` : ''}</div>
        <div class="fit-chips">${shown.map(chip).join('') || `<span class="fit-none">No ${noun} matches.</span>`}
          ${!q && matching.length > CHIPS_SHOWN ? `<button type="button" class="linkish fit-more">${state.expanded ? 'show fewer' : `+${matching.length - CHIPS_SHOWN} more`}</button>` : ''}</div>`;
    }

    function render(focusFilter) {
      const c = cat.cell(state.source, state.sink);
      root.innerHTML = `
        ${fixed.source || fixed.sink ? '' : `<div class="compose-row">${select('source')}</div>`}
        <div class="fit"><span class="fit-label">${axis === 'sinks' ? 'sink' : 'source'}</span>${chips()}</div>
        <div class="plan" aria-live="polite">${planHtml(c)}</div>
        ${c?.compatible && c.command ? `<div class="cmd"><pre><code><span class="cmd-note"># Install the CLI first (see below)</span>\n${esc(c.command)}</code></pre><button class="copy" type="button" aria-label="Copy command">copy</button></div>` : ''}`;
      if (focusFilter) {
        const f = root.querySelector('.fit-filter');
        if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); }
      }
    }

    root.addEventListener('change', (e) => {
      const side = e.target.dataset?.side;
      if (!side) return;
      state[side] = e.target.value;
      if (side === (axis === 'sinks' ? 'source' : 'sink')) { state.expanded = false; state.q = ''; }
      render();
    });
    root.addEventListener('input', (e) => {
      if (!e.target.classList.contains('fit-filter')) return;
      state.q = e.target.value;
      render(true);
    });
    root.addEventListener('click', async (e) => {
      const pick = e.target.closest('[data-pick]');
      if (pick) { state[axis === 'sinks' ? 'sink' : 'source'] = pick.dataset.pick; render(); return; }
      if (e.target.closest('.fit-more')) { state.expanded = !state.expanded; render(); return; }
      const copy = e.target.closest('.copy');
      if (copy) {
        try { await navigator.clipboard.writeText(root.querySelector('.cmd code').textContent); copy.textContent = 'copied'; setTimeout(() => (copy.textContent = 'copy'), 1200); } catch (err) { /* clipboard blocked */ }
      }
    });
    render();
    return {
      set(side, id) { state[side] = id; state.expanded = false; state.q = ''; render(); },
    };
  }

  window.HubCore = {
    HUB_REPO, OFFICIAL_OWNER, BASE, load, esc, plural, natural, idOf, isOfficial, trustOf, starsOf, SORTS,
    detailUrl, titleOf, typeOf, ownerKey, ownerTag, ownerBadge, card, pairing, fitOf, FIT_RANK,
  };
})();
