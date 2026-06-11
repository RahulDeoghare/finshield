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

See **[BACKGROUND.md](BACKGROUND.md)** for the full pipeline. Short version —
a web app cannot read your WhatsApp/SMS inbox by itself (browsers forbid it by
design), so FinShield hooks the moments the platform does allow:

- **Share target (Android)**: long-press a WhatsApp message → Share →
  FinShield → instant scan + notification if it's a scam.
- **Clipboard auto-scan**: opt-in toggle; copy a message anywhere, open
  FinShield, it's scanned with no pasting.
- **Local alerts**: medium/high verdicts from share/clipboard scans fire a
  service-worker notification; tapping it focuses the app.
- **Web Push**: `sw.js` already handles `push` events. To send real server
  pushes (e.g. fleet-wide scam-pattern alerts), add a backend with VAPID keys
  and call `registration.pushManager.subscribe()` in `app.js`.

WhatsApp-specific detection: `wa.me` / `chat.whatsapp.com` link checks,
"Hi mum new number", verification-code theft, job-offer groups, and automatic
stripping of `[12/05/26, 10:31] Name:` prefixes when a whole chat is pasted.

## Adding detection rules

Open `detector.js`:

- `TEXT_RULES` — add `{ id, points, severity, re, title, detail }`.
- `TRUSTED_DOMAINS` / `BRANDS` — extend the allowlist and impersonation targets.
- Scores ≥55 → "Likely scam", 25–54 → "Suspicious", else low risk.
