// giscus votes widget plus list vote counts; plain script so client-rendered pages can call FaucetVotes.mount().
(function () {
  const ORIGIN = 'https://giscus.app';
  const COUNTS_URL = 'https://raw.githubusercontent.com/faucet-hq/faucet-hq.github.io/data/votes.json';
  const darkMq = window.matchMedia('(prefers-color-scheme: dark)');
  // giscus returns from GitHub sign-in to this page with ?giscus=<session>; client.js strips it once loaded.
  const returningFromSignIn = new URLSearchParams(location.search).has('giscus');

  function theme() {
    const t = document.documentElement.getAttribute('data-theme');
    if (t === 'dark' || t === 'light') return t;
    return darkMq.matches ? 'dark' : 'light';
  }

  function syncTheme() {
    const frame = document.querySelector('iframe.giscus-frame');
    if (frame && frame.contentWindow) {
      frame.contentWindow.postMessage({ giscus: { setConfig: { theme: theme() } } }, ORIGIN);
    }
  }

  function returnToBox(host) {
    const box = host.closest('section') || host;
    const go = () => box.scrollIntoView({ block: 'start' });
    go();
    // The iframe grows once it loads, so settle the scroll again after its first messages.
    let settles = 0;
    window.addEventListener('message', function onMsg(e) {
      if (e.origin !== ORIGIN) return;
      go();
      if (++settles >= 3) window.removeEventListener('message', onMsg);
    });
  }

  let mounted = false;
  function mount(host, cfg) {
    if (mounted || !host) return;
    mounted = true;
    const target = document.createElement('div');
    target.className = 'giscus';
    host.appendChild(target);
    const s = document.createElement('script');
    s.src = ORIGIN + '/client.js';
    s.async = true;
    s.crossOrigin = 'anonymous';
    const attrs = {
      repo: cfg.repo,
      'repo-id': cfg.repoId,
      category: cfg.category,
      'category-id': cfg.categoryId,
      mapping: cfg.mapping,
      term: cfg.term,
      strict: cfg.mapping === 'specific' ? '1' : '0',
      'reactions-enabled': '1',
      'emit-metadata': '0',
      'input-position': 'bottom',
      theme: theme(),
      lang: 'en',
      loading: 'lazy',
    };
    for (const [k, v] of Object.entries(attrs)) {
      if (v != null && v !== '') s.setAttribute('data-' + k, v);
    }
    host.appendChild(s);
    if (returningFromSignIn) returnToBox(host);
  }

  async function counts() {
    const slots = document.querySelectorAll('[data-votes-term]');
    if (!slots.length) return;
    let votes;
    try {
      const r = await fetch(COUNTS_URL, { cache: 'no-cache' });
      if (!r.ok) return;
      votes = (await r.json()).votes || {};
    } catch (e) {
      return;
    }
    for (const el of slots) {
      const n = votes[el.dataset.votesTerm] || 0;
      if (n > 0) {
        el.textContent = '★ ' + n;
        el.title = n + (n === 1 ? ' vote' : ' votes');
        el.hidden = false;
      }
    }
  }

  new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  darkMq.addEventListener('change', syncTheme);

  window.FaucetVotes = { mount };
  document.querySelectorAll('[data-votes-mount]').forEach((el) => mount(el, el.dataset));
  counts();
})();
