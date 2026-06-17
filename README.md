# FinShield — Finance Scam Detector

Paste a payment link, loan message, or suspicious banking URL and FinShield
checks it for fraud patterns — fake domains, typosquatting, risky wording,
KYC/OTP/UPI scam patterns. Everything runs **on-device**; no text is uploaded.

This repo ships **two implementations** that share the same detection engine
and rules:

| Flavour | Location | Distribution |
| --- | --- | --- |
| **PWA** (vanilla HTML/CSS/JS) | repo root | installable web app / any static host |
| **Android app** (Flutter) | [`app/`](app/) | sideloadable APK; can read incoming SMS directly |

The Android port (`app/lib/detector.dart`) is a faithful translation of the
web engine (`detector.js`) — a parity test suite (`app/test/detector_test.dart`)
asserts both produce identical risk scores, verdicts, and findings.

## Run locally (PWA)

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

## Android app (Flutter)

A native Android build lives in [`app/`](app/). It reuses the exact detection
logic as a Dart library and adds platform capabilities the web can't reach —
most notably **reading incoming SMS on-device** to flag scams automatically.

### Build the APK

Requires the Flutter SDK + Android toolchain (`flutter doctor` should be green
for the Android section; iOS/Xcode is not needed).

```sh
cd app
flutter pub get
flutter test                 # runs the JS↔Dart parity suite
flutter build apk --release
```

The APK is written to
`app/build/app/outputs/flutter-apk/app-release.apk` — copy it to a phone and
install (enable "install unknown apps" for your file manager).

### App layout

| File | Purpose |
| --- | --- |
| `app/lib/detector.dart` | Detection engine — Dart port of `detector.js` |
| `app/lib/main.dart` | UI: Scan / History / Learn / Settings, score ring, dark theme |
| `app/lib/sms_service.dart` | Tier C — listens for incoming SMS (foreground + background isolate) and scans them |
| `app/lib/notifications.dart` | Local scam-alert notifications |
| `app/lib/storage.dart` | History + settings via `shared_preferences` |
| `app/test/detector_test.dart` | Parity tests vs the JS engine |

### Permissions & Play Store note

The SMS-monitoring feature requests `RECEIVE_SMS` / `READ_SMS`. Google Play
**heavily restricts** these permissions — fraud-scanner apps requesting SMS are
frequently rejected unless they pass a manual permissions declaration (or ship
as the device's default SMS handler). The sideloaded APK works fully regardless;
Play Store distribution is a separate, later step.

## Deploying the PWA

PWA install + notifications require **HTTPS** (localhost is exempt).
Any static host works: GitHub Pages, Netlify, Vercel, Cloudflare Pages —
just upload the folder as-is.

After deploying, bump the `CACHE` version in `sw.js` whenever you ship
changes so installed clients pick them up.

## How "background detection" works (and its limits)

On the **web (PWA)**, see **[BACKGROUND.md](BACKGROUND.md)** for the full
pipeline. Short version — a web app cannot read your WhatsApp/SMS inbox by
itself (browsers forbid it by design), so FinShield hooks the moments the
platform does allow:

- **Share target (Android)**: long-press a WhatsApp message → Share →
  FinShield → instant scan + notification if it's a scam.
- **Clipboard auto-scan**: opt-in toggle; copy a message anywhere, open
  FinShield, it's scanned with no pasting.
- **Local alerts**: medium/high verdicts from share/clipboard scans fire a
  service-worker notification; tapping it focuses the app.
- **Web Push**: `sw.js` already handles `push` events. To send real server
  pushes (e.g. fleet-wide scam-pattern alerts), add a backend with VAPID keys
  and call `registration.pushManager.subscribe()` in `app.js`.

On the **Android app**, the native build goes further: it reads incoming SMS
directly (Tier C) and scans each one as it arrives, firing a local notification
for medium/high verdicts — even when the app is backgrounded.

WhatsApp-specific detection: `wa.me` / `chat.whatsapp.com` link checks,
"Hi mum new number", verification-code theft, job-offer groups, and automatic
stripping of `[12/05/26, 10:31] Name:` prefixes when a whole chat is pasted.

## Adding detection rules

The PWA and the Android app share the same rules, so **edit both engines
together** to keep them in sync (`app/test/detector_test.dart` guards parity).

In `detector.js` (web) and `app/lib/detector.dart` (Android):

- `TEXT_RULES` / `textRules` — add `{ id, points, severity, re, title, detail }`.
- `TRUSTED_DOMAINS` / `BRANDS` — extend the allowlist and impersonation targets.
- Scores ≥55 → "Likely scam", 25–54 → "Suspicious", else low risk.
