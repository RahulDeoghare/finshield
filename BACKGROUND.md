# How FinShield's background scanning works

FinShield is a PWA, so "background scanning" doesn't mean a daemon reading your
inbox — browsers deliberately make that impossible (see
[Hard limits](#hard-limits-what-a-web-app-can-never-do)). Instead, FinShield
intercepts a message **at the moment you'd act on it**, through three entry
points that each end in the same scan → alert pipeline.

```
 WhatsApp / SMS / email                FinShield
┌──────────────────────┐
│ ① Share sheet        │──┐
│   (long-press →      │  │   ┌─────────────────┐    ┌──────────────────┐
│    Share → FinShield)│  │   │ detector.js     │    │ sw.js            │
├──────────────────────┤  ├──▶│ analyze(text)   │──▶ │ showNotification │
│ ② Copied text        │  │   │ rules + URL     │    │ + notification-  │
│   (clipboard sweep   │  │   │ checks, 0–100   │    │   click → focus  │
│    on app open/focus)│  │   │ risk score      │    │   the app        │
├──────────────────────┤  │   └─────────────────┘    └──────────────────┘
│ ③ Manual paste /     │──┘     runs 100% on-device
│   example chips      │        nothing is uploaded
└──────────────────────┘
```

## Entry point ① — Share sheet (Android, the headline flow)

**Files:** `manifest.webmanifest` → `share_target`, `app.js` → `handleShareTarget()`

1. `manifest.webmanifest` declares a GET `share_target`. When the PWA is
   installed (Chrome on Android), Android lists **FinShield** in every app's
   share sheet — including WhatsApp.
2. User long-presses a WhatsApp message → Share → FinShield. Android launches
   the app at `index.html?title=…&text=…&url=…`.
3. `handleShareTarget()` (an IIFE that runs on page load) reads those query
   params, strips them from the URL bar, fills the textarea, and calls
   `runScan({ fromShare: true })`.
4. `fromShare: true` means: if the verdict is *medium* or *high*, fire a
   notification through the service worker (`notifyScam()`), in addition to the
   on-screen result.

This is a **launch**, not a silent background job — the OS opens the app to
hand it the text. That's the deepest hook the web platform offers, and in
practice it feels instant: share → verdict + alert in under a second.

> iOS does not support Web Share Target at all, which is why entry point ② exists.

## Entry point ② — Clipboard auto-scan (`Auto-check copied text` toggle)

**Files:** `app.js` → `clipboardSweep()`, `clipToggle`

1. User enables the toggle (the click is the user gesture browsers require for
   the clipboard permission prompt).
2. On every app **open / tab focus / return from background**
   (`focus` + `visibilitychange` listeners and once on startup),
   `clipboardSweep()` reads the clipboard.
3. A small hash of the clipboard text is kept in `localStorage`
   (`settings.lastClip`) so the same copy is never scanned or alerted twice.
   The sweep also refuses to overwrite a scan already on screen.
4. New text → auto-filled, scanned, and (like ①) a notification fires when it's
   a scam.

The user flow on a phone: copy the suspicious WhatsApp message → switch to
FinShield → verdict is already on screen. Clipboard contents never leave the
device; nothing is read while FinShield itself is unfocused.

Browser support: Chrome/Edge (Android + desktop) work after one permission
grant. iOS Safari requires a user gesture per read, so the sweep silently
no-ops there and the user taps **📋 Paste from clipboard** instead. Firefox
doesn't expose `clipboard.readText()` to websites — same graceful no-op.

## The alert leg — service-worker notifications

**Files:** `app.js` → `notifyScam()`, `sw.js` → `notificationclick`, `push`

- `notifyScam()` runs when a scan scores medium/high **and** came from share /
  clipboard / a hidden tab. It requires the **Scam alerts** toggle on and
  `Notification.permission === 'granted'`, then calls
  `registration.showNotification()` — so the alert renders even if the page is
  backgrounded or already closed mid-scan.
- `sw.js`'s `notificationclick` handler focuses the existing FinShield window
  or opens a new one.
- `sw.js` also has a `push` handler: the plumbing for **server-sent** alerts
  (e.g. "new scam wave targeting SBI customers") is ready, but dormant until a
  push backend with VAPID keys exists (deliberately deferred).

## Offline — why scanning always works

`detector.js` is pure client-side heuristics (no API calls), and `sw.js`
pre-caches the entire app shell (`finshield-v3`). After the first visit, every
entry point above works with no connectivity — airplane-mode scans behave
identically. Bump `CACHE` in `sw.js` whenever you ship changes.

## What works where

| Capability | Android (installed PWA) | iPhone (installed) | iPhone (Safari tab) | Desktop Chrome/Edge |
|---|---|---|---|---|
| Appears in WhatsApp's share sheet | ✅ | ❌ no Web Share Target on iOS | ❌ | n/a |
| Auto-scan copied text on open | ✅ | ⚠️ manual 📋 Paste (gesture required per read) | ⚠️ same | ✅ |
| Notification when scan finds a scam | ✅ | ✅ iOS 16.4+ | ❌ iOS only allows it when installed | ✅ |
| Notification tap re-opens app | ✅ | ✅ | — | ✅ |
| WhatsApp-specific rules (`wa.me`, group invites, "Hi mum", code theft, chat-export parsing) | ✅ | ✅ | ✅ | ✅ |
| Silent monitoring of incoming messages | ❌ | ❌ | ❌ | ❌ — impossible for any web app |

## Hard limits — what a web app can *never* do

Be careful never to market past this line:

- **No web app can read WhatsApp messages on its own.** Apps are sandboxed
  from each other; WhatsApp is end-to-end encrypted; browsers expose no API to
  other apps' notifications or message stores. The user must hand FinShield
  the text via share, copy, or paste.
- **No persistent background process.** Service workers wake for specific
  events (push, fetch, notification clicks) and are killed after seconds.
  Periodic Background Sync exists on Chrome but is useless here — there's no
  new data to fetch, because messages can't be observed in the first place.
- **Push ≠ scanning.** Web Push lets a *server* wake the SW; it cannot peek at
  anything on the device.

Honest pitch: *"FinShield checks any message the moment you share, copy, or
paste it — and warns you before you reply."* Not: "monitors your WhatsApp."

### If true auto-monitoring ever becomes a requirement

Only native code can do it, e.g. an Android companion app using
`NotificationListenerService` (reads notification *text* of incoming WhatsApp
messages — Play-Store-sensitive but legal) that feeds the same `detector.js`
rules via a WebView or port of the rules. iOS offers no equivalent to any app.
A browser extension watching Gmail's DOM is the desktop analogue. Both are
deferred, matching the current project scope.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| FinShield missing from Android share sheet | App must be **installed** (Chrome → ⋮ → Add to Home screen / Install). Served over HTTPS (or localhost). Re-check after a re-install if `manifest.webmanifest` changed. |
| No notifications | Both the in-app **Scam alerts** toggle *and* the OS-level notification permission for the browser/PWA must be on. Try **Send test alert**. |
| Clipboard toggle does nothing on iPhone | Expected — iOS requires a tap per clipboard read. Use 📋 Paste. |
| Notifications on iPhone | Only iOS 16.4+ **and** only after Add to Home Screen. |
| Changes not appearing in installed app | Bump `CACHE` in `sw.js` (currently `finshield-v3`), reload twice. |
| Share opens app but nothing scans | The shared payload must include `title`, `text`, or `url` — some apps share files only; FinShield is text-only by design. |
