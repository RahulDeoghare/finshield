/* FinShield service worker — Phase 1.
   Wires the right-click "Scan with FinShield" menu to the popup.
   No detection logic lives here: the menu hands the selected text/link to
   the popup, which runs the shared detector.js entirely on-device. */

const MENU_ID = 'finshield-scan';

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

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== MENU_ID) return;
  const text = (info.selectionText || info.linkUrl || '').trim();
  if (!text) return;

  // hand the text to the popup; it auto-scans on open and clears this
  await chrome.storage.session.set({ pendingScan: { text, ts: Date.now() } });

  try {
    // Chrome 127+ / Firefox: open the popup straight from the user gesture
    await chrome.action.openPopup();
  } catch {
    // older browsers can't open the popup programmatically — nudge the toolbar
    // icon so the queued scan runs the next time the user clicks it
    chrome.action.setBadgeText({ text: '1' });
    chrome.action.setBadgeBackgroundColor({ color: '#ff5d6c' });
  }
});
