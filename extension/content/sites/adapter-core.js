/* FinShield site-adapter core — Phase 3.
   Shared plumbing for the per-message scanners (WhatsApp Web, Gmail).
   A site adapter calls FinShieldAdapter.init(config) with three things:
     - root():        the container element to watch (or null until it loads)
     - messageSelector: CSS selector for individual message nodes
     - extractText(node): text (+ links) to scan for one message
     - attachBadge(node, chip): place the chip on/in the message
   Everything else — enable toggle, debounced observation, "already scanned"
   dedupe, scanning via the background engine, chip rendering, aggregate
   toolbar badge — lives here so the adapters stay tiny. */

(() => {
  if (window.__finshieldAdapter) return;
  window.__finshieldAdapter = true;

  const DEBOUNCE_MS = 500;
  const MIN_TEXT = 12;

  const requestIdle = (fn) =>
    (window.requestIdleCallback || ((f) => setTimeout(f, 1)))(fn);

  async function isEnabled() {
    try {
      const s = await chrome.storage.local.get('autoScan');
      return s.autoScan !== false;
    } catch { return true; }
  }

  const CHIP = {
    high: { bg: '#ff5d6c', fg: '#1a0507', label: (s) => `⚠ Scam? ${s.score}` },
    medium: { bg: '#fbbf24', fg: '#1a1505', label: (s) => `⚠ Scam? ${s.score}` },
    low: { bg: '#2dd4a7', fg: '#04130d', label: () => '✓ Looks safe' },
  };

  function makeChip(summary, text) {
    const style = CHIP[summary.level] || CHIP.medium;
    const chip = document.createElement('span');
    chip.setAttribute('data-finshield-chip', '1');
    chip.style.cssText = `
      all:initial;display:inline-flex;align-items:center;gap:4px;vertical-align:middle;
      font:700 11px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
      color:${style.fg};background:${style.bg};border-radius:999px;padding:3px 8px;margin:2px 6px;
      cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.28);white-space:nowrap;`;
    chip.textContent = style.label(summary);
    chip.title = summary.level === 'low'
      ? 'FinShield: no scam patterns found (click for the full report)'
      : `FinShield: ${summary.label} — ${summary.top || 'multiple red flags'} (click for the full report)`;
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      chrome.runtime.sendMessage({ type: 'openReport', text });
    });
    return chip;
  }

  function init(config) {
    let worst = null;

    async function sweep() {
      if (!(await isEnabled())) return;
      const root = config.root() || document.body;
      if (!root) return;

      for (const node of root.querySelectorAll(config.messageSelector)) {
        if (node.dataset.finshield) continue;
        node.dataset.finshield = '1';           // mark before await → no double scan

        const text = (config.extractText(node) || '').trim();
        if (text.length < MIN_TEXT) continue;

        let summary;
        try {
          summary = await chrome.runtime.sendMessage({
            type: 'scan', text, badge: false, skipTrusted: true,
          });
        } catch {
          node.dataset.finshield = '';          // context invalidated — allow retry
          return;
        }
        if (!summary) continue;

        // chip every scanned message: green "Looks safe" for low, amber/red for risky
        try { config.attachBadge(node, makeChip(summary, text)); } catch { /* DOM moved */ }

        // raise the toolbar badge only to the worst risky level seen on this page
        if (summary.level === 'high' || (summary.level === 'medium' && worst !== 'high')) {
          worst = summary.level;
          chrome.runtime.sendMessage({ type: 'setBadge', level: worst });
        }
      }
    }

    let timer = null;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => requestIdle(sweep), DEBOUNCE_MS);
    };

    // SPA roots load late — poll briefly, then watch for new messages
    (function boot(tries = 0) {
      const root = config.root();
      if (!root && tries < 40) { setTimeout(() => boot(tries + 1), 500); return; }
      requestIdle(sweep);
      new MutationObserver(schedule)
        .observe(root || document.body, { childList: true, subtree: true, characterData: true });
    })();
  }

  window.FinShieldAdapter = { init };
})();
