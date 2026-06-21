/* FinShield extension build — assembles a per-browser package from the shared
   source. The only cross-browser difference is the manifest's `background`
   block: Chrome MV3 requires `service_worker`, Firefox MV3 requires `scripts`.
   Everything else (detector.js, content scripts, popup, icons) is identical.

   Usage:  node scripts/build.mjs [chrome|firefox|all]   (default: all)        */

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = join(root, 'dist');

// shared files/dirs copied verbatim into every target
const SHARED = ['detector.js', 'background.js', 'content', 'popup', 'shared', 'icons'];

function loadBaseManifest() {
  return JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
}

function chromeManifest() {
  // base manifest is already Chrome-shaped (service_worker)
  return loadBaseManifest();
}

function firefoxManifest() {
  const m = loadBaseManifest();
  // Firefox MV3 uses an event page, not a service worker
  m.background = { scripts: ['background.js'], type: 'module' };
  // openPopup() + solid module-background support land in 121
  m.browser_specific_settings ??= { gecko: {} };
  m.browser_specific_settings.gecko ??= {};
  m.browser_specific_settings.gecko.strict_min_version = '121.0';
  return m;
}

function build(target) {
  const make = target === 'firefox' ? firefoxManifest : chromeManifest;
  const out = join(distRoot, target);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  for (const item of SHARED) {
    cpSync(join(root, item), join(out, item), { recursive: true });
  }
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(make(), null, 2) + '\n');
  console.log(`✓ built dist/${target}`);
}

const arg = (process.argv[2] || 'all').toLowerCase();
const targets = arg === 'all' ? ['chrome', 'firefox'] : [arg];
for (const t of targets) {
  if (t !== 'chrome' && t !== 'firefox') {
    console.error(`unknown target "${t}" — use chrome | firefox | all`);
    process.exit(1);
  }
  build(t);
}
