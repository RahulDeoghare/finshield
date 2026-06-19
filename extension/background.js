/* FinShield service worker.
   - Right-click "Scan with FinShield" → popup (Phase 1)
   - Auto-scan: runs the shared analyze() on page text sent by the content
     script, sets the per-tab risk badge, and replies with a slim summary.
   Detection runs here, off the page's main thread, and detector.js is never
   exposed to the page. */

import { analyze, isTrustedPage } from './detector.js';

const MENU_ID = 'finshield-scan';

/* ---------------------------------------------------------- context menu */
function createMenu() {
  // remove first so re-installs / reloads don't throw "duplicate id"
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Scan with FinShield',
      contexts: ['selection', 'link'],
    });
  });
}
chrome.runtime.onInstalled.addListener(createMenu);
chrome.runtime.onStartup.addListener(createMenu);

/* hand text to the popup, which auto-scans on open */
async function openReport(text) {
  if (!text) return;
  await chrome.storage.session.set({ pendingScan: { text, ts: Date.now() } });
  try {
    // Chrome 127+ / Firefox: open the popup straight from the gesture
    await chrome.action.openPopup();
  } catch {
    // older browsers can't open the popup programmatically — nudge the toolbar
    // icon so the queued scan runs the next time the user clicks it
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#ff5d6c' });
  }
}

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== MENU_ID) return;
  openReport((info.selectionText || info.linkUrl || '').trim());
});

/* ---------------------------------------------------------- per-tab badge */
function setBadge(tabId, level) {
  if (tabId == null) return;
  const map = {
    high: { text: '!', color: '#ff5d6c' },
    medium: { text: '!', color: '#fbbf24' },
  };
  const b = map[level];
  chrome.action.setBadgeText({ tabId, text: b ? b.text : '' });
  if (b) chrome.action.setBadgeBackgroundColor({ tabId, color: b.color });
}

/* ---------------------------------------------------------- messages */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'openReport') {
    openReport(msg.text || '');
    return; // no response needed
  }

  // adapters (per-message scans) set the toolbar badge themselves
  if (msg?.type === 'setBadge') {
    setBadge(sender.tab?.id, msg.level);
    return;
  }

  if (msg?.type === 'scan') {
    const tabId = sender.tab?.id;
    const url = sender.tab?.url || '';
    const wantBadge = msg.badge !== false;

    // page-level auto-scan never flags the user's real bank / payment site.
    // per-message adapters pass skipTrusted (the page host is google.com etc.,
    // which is trusted, but the message content still needs scanning).
    if (!msg.skipTrusted && url && isTrustedPage(url)) {
      if (wantBadge) setBadge(tabId, 'low');
      sendResponse({ trusted: true });
      return;
    }

    const r = analyze(msg.text || '');
    if (wantBadge) setBadge(tabId, r.verdict.level);
    sendResponse({
      score: r.score,
      level: r.verdict.level,
      label: r.verdict.label,
      blurb: r.verdict.blurb,
      count: r.findings.length,
      top: r.findings[0]?.title || '',
      trusted: false,
    });
    return; // synchronous response
  }
});
