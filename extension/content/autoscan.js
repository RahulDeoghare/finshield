/* FinShield auto-scan — Phase 2.
   Extracts the page's text + links, asks the background worker to run the
   shared analyze() on it, and shows a slim, dismissible top banner when the
   page looks like a scam. Detection runs in the background (off this thread);
   this script only reads the DOM and draws the banner. */

(() => {
  // guard against double-injection (e.g. bfcache restores)
  if (window.__finshieldAutoScan) return;
  window.__finshieldAutoScan = true;

  const BANNER_THRESHOLD = 25;      // matches the engine's "Suspicious" cutoff
  const MAX_TEXT = 20000;           // cap page text so huge pages stay fast
  const MAX_LINKS = 300;
  const DEBOUNCE_MS = 600;

  const dismissed = new Set();      // URLs the user dismissed this session
  let lastScanUrl = null;
  let lastBlobLen = 0;
  let bannerHost = null;

  /* -------------------------------------------------- extraction */
  function extractBlob() {
    const parts = [location.href, document.title || ''];
    parts.push((document.body?.innerText || '').slice(0, MAX_TEXT));

    const seen = new Set();
    const hrefs = [];
    for (const a of document.querySelectorAll('a[href]')) {
      const h = a.href;
      if (!h || seen.has(h) || !/^https?:/i.test(h)) continue;
      seen.add(h);
      hrefs.push(h);
      if (hrefs.length >= MAX_LINKS) break;
    }
    parts.push(hrefs.join('\n'));
    return parts.join('\n');
  }

  /* -------------------------------------------------- banner (shadow DOM) */
  const COLORS = {
    medium: { bar: '#fbbf24', text: '#1a1505', btn: 'rgba(0,0,0,.18)' },
    high: { bar: '#ff5d6c', text: '#1a0507', btn: 'rgba(0,0,0,.18)' },
  };

  function removeBanner() {
    if (bannerHost) { bannerHost.remove(); bannerHost = null; }
  }

  function showBanner(summary, blob) {
    removeBanner();
    const c = COLORS[summary.level] || COLORS.medium;

    bannerHost = document.createElement('div');
    bannerHost.style.cssText =
      'all:initial;position:fixed;top:0;left:0;right:0;z-index:2147483647;';
    const root = bannerHost.attachShadow({ mode: 'open' });

    const detail = summary.top ? ` — ${summary.top}` : '';
    root.innerHTML = `
      <style>
        .bar{
          font:600 13.5px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
          display:flex;align-items:center;gap:10px;
          padding:9px 14px;color:${c.text};background:${c.bar};
          box-shadow:0 2px 10px rgba(0,0,0,.25);
        }
        .ico{font-size:16px;flex:none}
        .msg{flex:1;min-width:0}
        .msg b{font-weight:800}
        .msg .det{font-weight:600;opacity:.92}
        button{
          font:inherit;font-weight:700;cursor:pointer;white-space:nowrap;
          border:none;border-radius:7px;padding:5px 11px;color:${c.text};
          background:${c.btn};
        }
        button:hover{filter:brightness(1.08)}
        .x{background:transparent;font-size:17px;padding:4px 8px;line-height:1}
        @media (max-width:520px){ .det{display:none} }
      </style>
      <div class="bar" role="alert">
        <span class="ico">🛡️</span>
        <span class="msg"><b>FinShield: ${esc(summary.label)} (${summary.score}/100)</b><span class="det">${esc(detail)}</span></span>
        <button class="details" type="button">View details</button>
        <button class="x" type="button" title="Dismiss" aria-label="Dismiss">✕</button>
      </div>`;

    root.querySelector('.details').addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'openReport', text: blob });
    });
    root.querySelector('.x').addEventListener('click', () => {
      dismissed.add(location.href);
      removeBanner();
    });

    document.documentElement.appendChild(bannerHost);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (ch) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    ));
  }

  /* -------------------------------------------------- scan orchestration */
  async function scan() {
    if (!document.body) return;

    // respect the popup's on/off switch (default on)
    let enabled = true;
    try {
      const s = await chrome.storage.local.get('autoScan');
      enabled = s.autoScan !== false;
    } catch { /* storage unavailable — default on */ }
    if (!enabled) { removeBanner(); return; }

    const blob = extractBlob();
    const urlChanged = location.href !== lastScanUrl;
    const grew = Math.abs(blob.length - lastBlobLen) > 500;
    if (!urlChanged && !grew && lastScanUrl !== null) return; // nothing new

    if (urlChanged) { dismissed.delete(lastScanUrl); removeBanner(); }
    lastScanUrl = location.href;
    lastBlobLen = blob.length;

    let summary;
    try {
      summary = await chrome.runtime.sendMessage({ type: 'scan', text: blob });
    } catch { return; } // background asleep / context invalidated
    if (!summary || summary.trusted) return;

    if (summary.score >= BANNER_THRESHOLD && !dismissed.has(location.href)) {
      showBanner(summary, blob);
    } else {
      removeBanner();
    }
  }

  /* -------------------------------------------------- triggers */
  let timer = null;
  const scheduleScan = () => {
    clearTimeout(timer);
    timer = setTimeout(() => requestIdle(scan), DEBOUNCE_MS);
  };
  const requestIdle = (fn) =>
    (window.requestIdleCallback || ((f) => setTimeout(f, 1)))(fn);

  // initial scan
  requestIdle(scan);

  // re-scan on SPA content/URL changes (debounced)
  const obs = new MutationObserver(scheduleScan);
  if (document.body) {
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      obs.observe(document.body, { childList: true, subtree: true, characterData: true });
      scheduleScan();
    }, { once: true });
  }
})();
