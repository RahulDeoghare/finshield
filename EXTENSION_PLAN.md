# FinShield Browser Extension — Plan

A Chrome + Firefox extension that reuses FinShield's existing on-device scam-detection
engine to scan messages and links **inside the browser**, where people actually read
their email and WhatsApp Web.

Everything runs locally. No text ever leaves the device — the same privacy guarantee as
the PWA, and a strong point in store review.

---

## 1. Why this is straightforward

The detection engine ([`detector.js`](detector.js)) is a **pure, DOM-free ES module**.
Its entire public surface is:

```js
export function analyze(text) -> { score, verdict, findings, urls, positives, highlights, text }
export const EXAMPLES
```

It has **zero dependency** on the DOM, the PWA's UI, or the network. That means the engine
is reused in the extension **byte-for-byte, with no changes**. Only the glue/UI layer
([`app.js`](app.js)) is PWA-specific and gets re-implemented per surface.

`detector.js` stays the **single source of truth** shared by the PWA, the Flutter app, and
the extension, so detection rules never drift.

---

## 2. Feasibility at a glance

| Capability                              | Chrome | Firefox | Mechanism |
|-----------------------------------------|:------:|:-------:|-----------|
| Reuse `detector.js` unchanged           |  ✅    |   ✅    | pure logic |
| "Paste & check" popup                   |  ✅    |   ✅    | port of the PWA UI |
| Right-click selected text → scan        |  ✅    |   ✅    | `contextMenus` |
| Auto-scan Gmail / WhatsApp Web inline   |  ✅    |   ✅    | content script + `MutationObserver` |
| Toolbar badge (⚠ count)                 |  ✅    |   ✅    | `action.setBadgeText` |
| Desktop notification on detection       |  ✅    |   ✅    | `notifications` |
| 100% on-device (no network)             |  ✅    |   ✅    | same as PWA |

Both browsers support **Manifest V3** (Firefox 121+), so one codebase covers both with a
small manifest patch.

---

## 3. Architecture

```
extension/
├─ manifest.json              # MV3, shared (Firefox gets a tiny patch)
├─ detector.js                # ← copied UNCHANGED from repo root (single source of truth)
├─ background.js              # service worker: context menu, badge, notifications, history
├─ content.js                # injected into Gmail / WhatsApp Web — scans + flags inline
├─ popup/
│  ├─ popup.html             # paste-a-message UI (port of index.html)
│  ├─ popup.js               # imports analyze(), reuses the verdict-card renderer
│  └─ popup.css              # reuse of styles.css
├─ options/
│  ├─ options.html           # per-site auto-scan toggles, clear history
│  └─ options.js
└─ icons/                    # reuse existing icons/
```

**Four entry points, one engine:**

1. **Popup** (`type="module"`) — paste a message or link, get the same verdict card as the
   PWA. ~90% lift-and-shift of `index.html` + `app.js` + `styles.css`.
2. **Context menu** — select suspicious text on *any* page → right-click → "Scan with
   FinShield" → result in a notification / popup.
3. **Content-script auto-scan** — on `mail.google.com` and `web.whatsapp.com`, a
   `MutationObserver` watches incoming messages, runs `analyze()` on their text, injects an
   inline warning banner, and sets the toolbar badge. **This is the real value-add over the
   PWA.**
4. **Background worker** — owns the context menu, badge state, `chrome.storage.local` scan
   history, and optional desktop notifications.

---

## 4. Key technical decisions

- **No build step (matches the PWA's no-build ethos).**
  Content scripts can't use top-level `import`. Instead of adding a bundler, the content
  script loads the engine dynamically:
  ```js
  const { analyze } = await import(chrome.runtime.getURL('detector.js'));
  ```
  This works in MV3 and lets `detector.js` stay a single shared file (declared as a
  `web_accessible_resource`). The popup and service worker use normal ES modules.
  **No bundler, no npm.**

- **Single source of truth.** `detector.js` is copied (or symlinked) from the repo root so
  rules update in one place for PWA + extension + Flutter app.

- **Cross-browser.** One `manifest.json`; Firefox adds
  `browser_specific_settings.gecko.id` and, if needed, a `background.scripts` fallback. A
  ~5-line `build-firefox` script (`cp` + `sed`) handles the diff — no real toolchain.

- **Minimal permissions** (smoother store review):
  `activeTab`, `contextMenus`, `storage`, `scripting`, `notifications`, plus host
  permissions limited to `https://mail.google.com/*` and `https://web.whatsapp.com/*`.

---

## 5. Manifest sketch (Chrome MV3)

```jsonc
{
  "manifest_version": 3,
  "name": "FinShield — scam & phishing detector",
  "version": "0.1.0",
  "description": "Spot finance scams, phishing links and fraud messages — 100% on-device.",
  "action": { "default_popup": "popup/popup.html", "default_icon": "icons/icon-128.png" },
  "background": { "service_worker": "background.js", "type": "module" },
  "permissions": ["activeTab", "contextMenus", "storage", "scripting", "notifications"],
  "host_permissions": [
    "https://mail.google.com/*",
    "https://web.whatsapp.com/*"
  ],
  "content_scripts": [
    {
      "matches": ["https://mail.google.com/*", "https://web.whatsapp.com/*"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "web_accessible_resources": [
    { "resources": ["detector.js"], "matches": ["https://mail.google.com/*", "https://web.whatsapp.com/*"] }
  ],
  "icons": { "128": "icons/icon-128.png" }
}
```

Firefox variant adds:
```jsonc
"browser_specific_settings": { "gecko": { "id": "finshield@rahuldeoghare", "strict_min_version": "121.0" } }
```

---

## 6. Phased delivery

- **Phase 1 — Popup MVP (fastest win).** Scaffold `extension/`, copy `detector.js`, port the
  paste-and-check UI. Loadable as an unpacked extension in both browsers. *Working
  extension in one sitting.*
- **Phase 2 — Context menu.** "Scan selected text" from any page.
- **Phase 3 — Auto-scan content scripts.** Gmail + WhatsApp Web inline flagging with badge +
  notifications. The hard/valuable part.
- **Phase 4 — Polish & packaging.** Options page (per-site toggle, clear history), Firefox
  manifest variant, store assets, zip packaging for Chrome Web Store / AMO.

---

## 7. Open considerations

- **Store review.** Chrome Web Store and Firefox AMO both require a privacy policy and
  justification for host permissions. The on-device design satisfies this cleanly, but it's
  a real step before public distribution.
- **DOM selectors are brittle.** Gmail and WhatsApp Web change their markup. The content
  script should target stable-ish containers and fail soft (never break the host page).
- **Performance.** Debounce the `MutationObserver` and skip already-scanned nodes so busy
  inboxes stay smooth.
- **Highlighting inline.** The engine already returns `highlights` (char ranges). Reusing
  them to mark up live message DOM is possible but fiddly; the MVP can show a per-message
  banner first and add inline highlighting later.

---

## 8. Suggested next step

Branch off `main` (clean base — shared `detector.js`/styles/icons, none of the Flutter
`app/` folder) and start **Phase 1**: a working popup loadable unpacked in both browsers.
