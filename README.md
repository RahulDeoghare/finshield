# FinShield — Finance Scam Detector (PWA)

Paste a payment link, loan message, or suspicious banking URL and FinShield
checks it for fraud patterns — fake domains, typosquatting, risky wording,
KYC/OTP/UPI scam patterns. Everything runs **on-device**; no text is uploaded.

## Run locally

```sh
python3 -m http.server 4173
# open http://localhost:4173
```

No build step — plain HTML/CSS/JS modules.

## Files

| File | Purpose |
| --- | --- |
| `index.html` / `styles.css` / `app.js` | Mobile-first UI (score ring, findings, history, settings) |
| `detector.js` | Detection engine: ~20 text rules + ~14 URL checks, weighted 0–100 risk score |
| `sw.js` | Service worker: offline cache, notifications, push handler |
| `manifest.webmanifest` | Install metadata, share target, shortcuts |
| `tools/make-icons.mjs` | Regenerates `icons/*.png` (zero-dependency): `node tools/make-icons.mjs` |

## Deploying

PWA install + notifications require **HTTPS** (localhost is exempt).
Any static host works: GitHub Pages, Netlify, Vercel, Cloudflare Pages —
just upload the folder as-is.

After deploying, bump the `CACHE` version in `sw.js` whenever you ship
changes so installed clients pick them up.

## How "background detection" works (and its limits)

A pure web app cannot read your SMS/email inbox in the background — browsers
don't expose that, by design. FinShield gets as close as the web platform
allows:

- **Share target**: once installed, FinShield appears in the Android share
  sheet. Share any SMS/email/link to it → it launches, scans instantly, and
  fires a notification if it's a scam.
- **Local alerts**: scans that detect a scam while the app is backgrounded
  trigger a service-worker notification.
- **Web Push**: `sw.js` already handles `push` events. To send real server
  pushes (e.g. fleet-wide scam-pattern alerts), add a backend with VAPID keys
  and call `registration.pushManager.subscribe()` in `app.js`.

For true automatic inbox scanning you'd need a companion browser extension
(content script watching Gmail) or a native Android app with SMS permissions.

## Adding detection rules

Open `detector.js`:

- `TEXT_RULES` — add `{ id, points, severity, re, title, detail }`.
- `TRUSTED_DOMAINS` / `BRANDS` — extend the allowlist and impersonation targets.
- Scores ≥55 → "Likely scam", 25–54 → "Suspicious", else low risk.
