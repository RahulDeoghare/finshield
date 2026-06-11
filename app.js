import { analyze, EXAMPLES } from './detector.js';

/* ------------------------------------------------------------------ dom */
const $ = (id) => document.getElementById(id);
const inputText = $('inputText');
const scanBtn = $('scanBtn');
const pasteBtn = $('pasteBtn');
const clearBtn = $('clearBtn');
const charCount = $('charCount');
const resultSection = $('resultSection');
const verdictCard = $('verdictCard');
const ringValue = $('ringValue');
const scoreNum = $('scoreNum');
const verdictBadge = $('verdictBadge');
const verdictBlurb = $('verdictBlurb');
const positives = $('positives');
const previewCard = $('previewCard');
const messagePreview = $('messagePreview');
const urlCards = $('urlCards');
const findingsCard = $('findingsCard');
const findingsList = $('findingsList');
const findingsCount = $('findingsCount');
const nextSteps = $('nextSteps');
const historyCard = $('historyCard');
const historyList = $('historyList');
const notifToggle = $('notifToggle');
const testNotifBtn = $('testNotifBtn');
const installBtn = $('installBtn');
const toast = $('toast');

const RING_CIRC = 2 * Math.PI * 52;
const HISTORY_KEY = 'finshield-history';
const SETTINGS_KEY = 'finshield-settings';

const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{"notify":false}');
const saveSettings = () => localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));

/* ------------------------------------------------------------------ utils */
let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* merge overlapping highlight ranges, keeping the highest severity */
function mergeHighlights(ranges) {
  const rank = { low: 0, medium: 1, high: 2 };
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const out = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
      if (rank[r.severity] > rank[last.severity]) last.severity = r.severity;
    } else {
      out.push({ ...r });
    }
  }
  return out;
}

function highlightedHtml(text, ranges) {
  const merged = mergeHighlights(ranges);
  let html = '';
  let pos = 0;
  for (const r of merged) {
    html += escapeHtml(text.slice(pos, r.start));
    html += `<mark class="m-${r.severity}">${escapeHtml(text.slice(r.start, r.end))}</mark>`;
    pos = r.end;
  }
  html += escapeHtml(text.slice(pos));
  return html;
}

/* ------------------------------------------------------------------ render */
function renderResult(result) {
  resultSection.hidden = false;

  verdictCard.className = `card verdict-card v-${result.verdict.level}`;
  verdictBadge.textContent = result.verdict.label;
  verdictBlurb.textContent = result.verdict.blurb;

  // animate score ring
  scoreNum.textContent = result.score;
  ringValue.style.strokeDashoffset = RING_CIRC;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    ringValue.style.strokeDashoffset = RING_CIRC * (1 - result.score / 100);
  }));

  positives.hidden = !result.positives.length;
  positives.innerHTML = result.positives.map((p) => `<p>✓ ${escapeHtml(p)}</p>`).join('');

  // highlighted message (only useful when it's more than a bare link)
  const showPreview = result.highlights.length > 0 && result.text.length > 12;
  previewCard.hidden = !showPreview;
  if (showPreview) messagePreview.innerHTML = highlightedHtml(result.text, result.highlights);

  // per-URL cards
  urlCards.innerHTML = result.urls.map((u) => `
    <div class="card url-card">
      <p class="url-host">🔗 ${escapeHtml(u.host)}</p>
      <p class="url-domain">registered domain: ${escapeHtml(u.domain)}</p>
      <span class="url-status ${u.findings.length ? 'bad' : 'ok'}">
        ${u.findings.length
          ? `⚠ ${u.findings.length} red flag${u.findings.length > 1 ? 's' : ''} in this link`
          : u.trusted ? '✓ Matches a known official domain' : '✓ No obvious red flags in this link'}
      </span>
    </div>`).join('');

  // findings
  findingsCard.hidden = !result.findings.length;
  findingsCount.textContent = result.findings.length;
  findingsList.innerHTML = result.findings.map((f) => `
    <li class="finding f-${f.severity}">
      <div class="finding-head"><span class="sev">${f.severity}</span>${escapeHtml(f.title)}</div>
      <p class="finding-detail">${escapeHtml(f.detail)}</p>
      ${f.evidence ? `<span class="finding-evidence">${escapeHtml(f.evidence)}</span>` : ''}
    </li>`).join('');

  nextSteps.hidden = result.verdict.level !== 'high';
}

/* ------------------------------------------------------------------ history */
const getHistory = () => JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');

function pushHistory(result) {
  const items = getHistory();
  items.unshift({
    ts: Date.now(),
    score: result.score,
    level: result.verdict.level,
    label: result.verdict.label,
    text: result.text.slice(0, 500),
  });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 20)));
  renderHistory();
}

function renderHistory() {
  const items = getHistory();
  historyCard.hidden = !items.length;
  historyList.innerHTML = items.map((h, i) => `
    <li data-i="${i}">
      <span class="dot v-${h.level}"></span>
      <div class="h-text">
        <p class="h-excerpt">${escapeHtml(h.text.slice(0, 80))}</p>
        <p class="h-meta">${h.label} · ${new Date(h.ts).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</p>
      </div>
      <span class="h-score v-${h.level}">${h.score}</span>
    </li>`).join('');
}

historyList.addEventListener('click', (e) => {
  const li = e.target.closest('li[data-i]');
  if (!li) return;
  const item = getHistory()[+li.dataset.i];
  if (!item) return;
  inputText.value = item.text;
  runScan({ silent: true });
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

$('clearHistoryBtn').addEventListener('click', () => {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
  showToast('History cleared');
});

/* ------------------------------------------------------------------ notifications */
async function notifyScam(result) {
  if (!settings.notify || Notification.permission !== 'granted') return;
  const reg = await navigator.serviceWorker?.ready;
  if (!reg) return;
  reg.showNotification(`⚠ ${result.verdict.label} — risk ${result.score}/100`, {
    body: result.findings[0]
      ? `${result.findings[0].title}. Don't click, pay, or share OTPs.`
      : 'Scam patterns detected in the scanned message.',
    icon: 'icons/icon-192.png',
    badge: 'icons/badge-96.png',
    tag: 'finshield-alert',
    vibrate: [120, 60, 120],
    data: { url: './index.html' },
  });
}

notifToggle.addEventListener('change', async () => {
  if (notifToggle.checked) {
    if (!('Notification' in window)) {
      notifToggle.checked = false;
      showToast('Notifications are not supported in this browser');
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      notifToggle.checked = false;
      showToast('Permission denied — enable notifications in browser settings');
      return;
    }
    settings.notify = true;
    showToast('Scam alerts enabled 🔔');
  } else {
    settings.notify = false;
  }
  saveSettings();
  testNotifBtn.hidden = !settings.notify;
});

testNotifBtn.addEventListener('click', async () => {
  const reg = await navigator.serviceWorker.ready;
  reg.showNotification('⚠ Likely scam — risk 86/100', {
    body: 'Test alert: this is how FinShield warns you about a detected scam.',
    icon: 'icons/icon-192.png',
    badge: 'icons/badge-96.png',
    vibrate: [120, 60, 120],
  });
});

/* ------------------------------------------------------------------ scan */
function runScan({ silent = false, fromShare = false } = {}) {
  const text = inputText.value.trim();
  if (!text) {
    showToast('Paste a link or message first');
    inputText.focus();
    return;
  }
  scanBtn.disabled = true;
  scanBtn.classList.add('scanning');
  scanBtn.querySelector('.scan-label').textContent = 'Scanning';

  // tiny delay so the scanning state is perceivable
  setTimeout(() => {
    const result = analyze(text);
    renderResult(result);
    if (!silent) pushHistory(result);

    scanBtn.disabled = false;
    scanBtn.classList.remove('scanning');
    scanBtn.querySelector('.scan-label').textContent = 'Scan for scams';

    resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    if (result.verdict.level !== 'low' && (fromShare || document.visibilityState === 'hidden')) {
      notifyScam(result);
    }
  }, 350);
}

scanBtn.addEventListener('click', () => runScan());
inputText.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) runScan();
});
inputText.addEventListener('input', () => {
  const len = inputText.value.length;
  charCount.textContent = len ? `${len} chars` : '';
  clearBtn.hidden = !len;
});

clearBtn.addEventListener('click', () => {
  inputText.value = '';
  inputText.dispatchEvent(new Event('input'));
  resultSection.hidden = true;
  inputText.focus();
});

pasteBtn.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (!text) return showToast('Clipboard is empty');
    inputText.value = text;
    inputText.dispatchEvent(new Event('input'));
    runScan();
  } catch {
    showToast('Clipboard access denied — paste manually');
    inputText.focus();
  }
});

/* example chips */
$('exampleChips').innerHTML = EXAMPLES
  .map((ex, i) => `<button class="chip-btn" data-ex="${i}">${ex.label}</button>`)
  .join('');
$('exampleChips').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-ex]');
  if (!btn) return;
  inputText.value = EXAMPLES[+btn.dataset.ex].text;
  inputText.dispatchEvent(new Event('input'));
  runScan({ silent: true });
});

/* ------------------------------------------------------------------ share target */
(function handleShareTarget() {
  const params = new URLSearchParams(location.search);
  const shared = [params.get('title'), params.get('text'), params.get('url')]
    .filter(Boolean).join('\n').trim();
  if (!shared) return;
  history.replaceState(null, '', location.pathname);
  inputText.value = shared;
  inputText.dispatchEvent(new Event('input'));
  runScan({ fromShare: true });
})();

/* ------------------------------------------------------------------ install */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.hidden = false;
});
installBtn.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if (outcome === 'accepted') installBtn.hidden = true;
  deferredPrompt = null;
});
window.addEventListener('appinstalled', () => {
  installBtn.hidden = true;
  showToast('FinShield installed — share messages to it from any app');
});

/* ------------------------------------------------------------------ init */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

notifToggle.checked = settings.notify && typeof Notification !== 'undefined'
  && Notification.permission === 'granted';
settings.notify = notifToggle.checked;
testNotifBtn.hidden = !settings.notify;

renderHistory();
