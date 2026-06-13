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
const historyList = $('historyList');
const historyEmpty = $('historyEmpty');
const clearHistoryBtn = $('clearHistoryBtn');
const notifToggle = $('notifToggle');
const testNotifBtn = $('testNotifBtn');
const clipToggle = $('clipToggle');
const hapticToggle = $('hapticToggle');
const toast = $('toast');
const backBtn = $('backBtn');
const appbarTitle = $('appbarTitle');
const heroShield = $('heroShield');
const heroTitle = $('heroTitle');
const heroSub = $('heroSub');
const statScans = $('statScans');
const statThreats = $('statThreats');

const RING_CIRC = 2 * Math.PI * 52;
const HISTORY_KEY = 'finshield-history';
const SETTINGS_KEY = 'finshield-settings';

const settings = { notify: false, clipWatch: false, haptics: true, lastClip: '', ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
const saveSettings = () => localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));

let lastResult = null;

/* ------------------------------------------------------------------ utils */
let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function haptic(pattern = 12) {
  if (settings.haptics && navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch { /* ignore */ }
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* material-style ripple on any .ripple element */
function attachRipples() {
  document.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.ripple');
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const rip = document.createElement('span');
    rip.className = 'rip';
    rip.style.width = rip.style.height = `${size}px`;
    rip.style.left = `${e.clientX - rect.left - size / 2}px`;
    rip.style.top = `${e.clientY - rect.top - size / 2}px`;
    el.appendChild(rip);
    rip.addEventListener('animationend', () => rip.remove());
  }, { passive: true });
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

/* ------------------------------------------------------------------ navigation */
const SCREENS = ['scan', 'history', 'learn', 'settings'];
const TITLES = { scan: 'FinShield', history: 'Recent scans', learn: 'Learn', settings: 'Settings' };
const navItems = [...document.querySelectorAll('.nav-item')];
const screenEls = Object.fromEntries(SCREENS.map((s) => [s, $(`screen-${s}`)]));
let currentScreen = 'scan';

function navigate(name, { push = true } = {}) {
  if (!SCREENS.includes(name) || name === currentScreen) {
    if (name === currentScreen) screenEls[name].scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  for (const s of SCREENS) screenEls[s].hidden = s !== name;
  const target = screenEls[name];
  target.classList.remove('entering');
  void target.offsetWidth; // restart animation
  target.classList.add('entering');

  navItems.forEach((b) => b.classList.toggle('active', b.dataset.nav === name));
  appbarTitle.textContent = TITLES[name];
  currentScreen = name;
  haptic(8);

  if (name === 'history') renderHistory();
  if (push) history.pushState({ screen: name }, '', `#${name}`);
}

navItems.forEach((b) => b.addEventListener('click', () => navigate(b.dataset.nav)));
document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go) navigate(go.dataset.go);
});

/* hardware / browser back button */
window.addEventListener('popstate', (e) => {
  const name = e.state?.screen || 'scan';
  navigate(name, { push: false });
});

backBtn.addEventListener('click', () => history.back());

/* ------------------------------------------------------------------ dashboard */
function updateDashboard() {
  const items = getHistory();
  const threats = items.filter((h) => h.level !== 'low').length;
  statScans.textContent = items.length;
  statThreats.textContent = threats;
  const recentThreat = items[0] && items[0].level === 'high';
  heroShield.classList.toggle('alert', recentThreat);
  if (!items.length) {
    heroTitle.textContent = "You're protected";
    heroSub.textContent = 'On-device scanning is active. Nothing you check ever leaves your phone.';
  } else if (recentThreat) {
    heroTitle.textContent = 'Stay alert';
    heroSub.textContent = 'Your last scan looked like a scam. Don\'t click, pay, or share any codes.';
  } else {
    heroTitle.textContent = "You're protected";
    heroSub.textContent = `${items.length} message${items.length > 1 ? 's' : ''} checked · ${threats} threat${threats === 1 ? '' : 's'} caught so far.`;
  }
}

/* ------------------------------------------------------------------ render */
function renderResult(result) {
  lastResult = result;
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
  updateDashboard();
}

function renderHistory() {
  const items = getHistory();
  const empty = !items.length;
  historyEmpty.hidden = !empty;
  historyList.hidden = empty;
  clearHistoryBtn.hidden = empty;
  historyList.innerHTML = items.map((h, i) => `
    <li data-i="${i}" class="ripple">
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
  inputText.dispatchEvent(new Event('input'));
  navigate('scan');
  runScan({ silent: true });
});

clearHistoryBtn.addEventListener('click', () => {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
  updateDashboard();
  showToast('History cleared');
  haptic(20);
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

hapticToggle.addEventListener('change', () => {
  settings.haptics = hapticToggle.checked;
  saveSettings();
  if (hapticToggle.checked) haptic([20, 40, 20]);
});

/* ------------------------------------------------------------------ scan */
function runScan({ silent = false, fromShare = false } = {}) {
  const text = inputText.value.trim();
  if (!text) {
    showToast('Paste a link or message first');
    inputText.focus();
    return;
  }
  haptic(10);
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

    if (result.verdict.level === 'high') haptic([90, 50, 90, 50, 90]);
    else if (result.verdict.level === 'medium') haptic([40, 30, 40]);

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
  lastResult = null;
  inputText.focus();
});

$('rescanBtn').addEventListener('click', () => {
  inputText.value = '';
  inputText.dispatchEvent(new Event('input'));
  resultSection.hidden = true;
  lastResult = null;
  screenEls.scan.scrollTo({ top: 0, behavior: 'smooth' });
  inputText.focus();
});

$('shareResultBtn').addEventListener('click', async () => {
  if (!lastResult) return;
  const text = `FinShield scan — ${lastResult.verdict.label} (risk ${lastResult.score}/100).`
    + (lastResult.findings[0] ? ` Top flag: ${lastResult.findings[0].title}.` : '')
    + ' Checked on-device with FinShield.';
  try {
    if (navigator.share) {
      await navigator.share({ title: 'FinShield scan result', text });
    } else {
      await navigator.clipboard.writeText(text);
      showToast('Result copied to clipboard');
    }
  } catch { /* user cancelled */ }
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
  .map((ex, i) => `<button class="chip-btn ripple" data-ex="${i}">${ex.label}</button>`)
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

/* ------------------------------------------------------------------ clipboard auto-scan */
/* The closest a web app can get to background WhatsApp scanning without the
   share sheet: copy a message anywhere → open FinShield → it's scanned with
   no pasting. See BACKGROUND.md for the full pipeline and platform limits. */
const clipHash = (s) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
};

async function clipboardSweep() {
  if (!settings.clipWatch || !navigator.clipboard?.readText) return;
  let text;
  try { text = (await navigator.clipboard.readText()).trim(); } catch { return; } // no permission / no focus
  if (!text || text.length < 8) return;
  const h = clipHash(text);
  if (h === settings.lastClip) return; // this copy was already scanned
  const current = inputText.value.trim();
  if (current && clipHash(current) !== h) return; // don't clobber a scan in progress
  settings.lastClip = h;
  saveSettings();
  inputText.value = text;
  inputText.dispatchEvent(new Event('input'));
  navigate('scan');
  showToast('Auto-scanned the text you copied');
  runScan({ silent: true, fromShare: true }); // fromShare → notify if it's a scam
}

clipToggle.addEventListener('change', () => {
  settings.clipWatch = clipToggle.checked;
  saveSettings();
  if (clipToggle.checked) {
    showToast('Copied text is now checked whenever you open FinShield');
    clipboardSweep(); // user gesture → browser shows the clipboard permission prompt now
  }
});

window.addEventListener('focus', clipboardSweep);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') clipboardSweep();
});

/* ------------------------------------------------------------------ install */
let deferredPrompt = null;
const installBtn = $('installBtn');
const installBtn2 = $('installBtn2');
async function doInstall() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if (outcome === 'accepted') { installBtn.hidden = true; installBtn2.hidden = true; }
  deferredPrompt = null;
}
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.hidden = false;
  installBtn2.hidden = false;
});
installBtn.addEventListener('click', doInstall);
installBtn2.addEventListener('click', doInstall);
window.addEventListener('appinstalled', () => {
  installBtn.hidden = true;
  installBtn2.hidden = true;
  showToast('FinShield installed — share messages to it from any app');
});

/* ------------------------------------------------------------------ init */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

attachRipples();

notifToggle.checked = settings.notify && typeof Notification !== 'undefined'
  && Notification.permission === 'granted';
settings.notify = notifToggle.checked;
testNotifBtn.hidden = !settings.notify;
clipToggle.checked = !!settings.clipWatch;
hapticToggle.checked = settings.haptics !== false;

renderHistory();
updateDashboard();

// open the screen named in the URL hash (e.g. after a back-button restore)
const startScreen = SCREENS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'scan';
history.replaceState({ screen: startScreen }, '', `#${startScreen}`);
if (startScreen !== 'scan') navigate(startScreen, { push: false });

// dismiss splash once everything is wired
window.addEventListener('load', () => {
  setTimeout(() => $('splash').classList.add('hide'), 600);
});
setTimeout(() => $('splash').classList.add('hide'), 1400); // fallback

if (document.hasFocus()) clipboardSweep();
