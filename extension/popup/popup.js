/* FinShield popup — Phase 1.
   Paste / right-click → analyze() (shared engine) → render shared result UI.
   All on-device; the popup never makes a network request. */

import { analyze, EXAMPLES } from '../detector.js';
import { resultToHtml } from '../shared/render.js';

const $ = (id) => document.getElementById(id);
const input = $('input');
const scanBtn = $('scanBtn');
const pasteBtn = $('pasteBtn');
const clearBtn = $('clearBtn');
const charCount = $('charCount');
const result = $('result');
const chips = $('chips');

function runScan(text) {
  const value = (text ?? input.value).trim();
  if (!value) { input.focus(); return; }
  const r = analyze(value);
  result.innerHTML = resultToHtml(r);
  result.hidden = false;
}

function syncInput() {
  const len = input.value.length;
  charCount.textContent = len ? `${len} chars` : '';
  clearBtn.hidden = !len;
}

scanBtn.addEventListener('click', () => runScan());
input.addEventListener('input', syncInput);
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) runScan();
});

clearBtn.addEventListener('click', () => {
  input.value = '';
  syncInput();
  result.hidden = true;
  input.focus();
});

pasteBtn.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (!text) return;
    input.value = text;
    syncInput();
    runScan();
  } catch {
    input.focus(); // clipboard blocked — let the user paste manually
  }
});

/* example chips, straight from the shared engine's EXAMPLES */
chips.innerHTML = EXAMPLES
  .map((ex, i) => `<button class="chip" data-ex="${i}">${ex.label}</button>`)
  .join('');
chips.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-ex]');
  if (!btn) return;
  input.value = EXAMPLES[+btn.dataset.ex].text;
  syncInput();
  runScan();
});

/* if opened from the right-click "Scan with FinShield" menu, the background
   worker left the text here — pick it up, scan, and clear the badge */
(async () => {
  try {
    const { pendingScan } = await chrome.storage.session.get('pendingScan');
    if (pendingScan?.text) {
      await chrome.storage.session.remove('pendingScan');
      chrome.action.setBadgeText({ text: '' });
      input.value = pendingScan.text;
      syncInput();
      runScan();
    }
  } catch { /* storage unavailable — normal manual use */ }
  input.focus();
})();
