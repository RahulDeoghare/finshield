/* Generates FinShield PWA icons (PNG) with zero dependencies.
   Usage: node tools/make-icons.mjs */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
mkdirSync(outDir, { recursive: true });

/* ----------------------------- PNG encoder ----------------------------- */
const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ----------------------------- drawing ----------------------------- */
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => c1.map((v, i) => lerp(v, c2[i], t));

const NAVY_TOP = [22, 30, 64];
const NAVY_BOT = [11, 16, 32];
const GREEN_TOP = [52, 227, 176];
const GREEN_BOT = [18, 173, 134];
const CHECK = [8, 14, 28];

function inRoundedSquare(x, y, r) {
  const dx = Math.max(Math.abs(x - 0.5) - (0.5 - r), 0);
  const dy = Math.max(Math.abs(y - 0.5) - (0.5 - r), 0);
  return Math.hypot(dx, dy) <= r;
}

/* shield: flat-ish top at y0, sides taper quadratically to a point at y1 */
function shieldHalfWidth(y) {
  const y0 = 0.245, ym = 0.56, y1 = 0.795, w0 = 0.215;
  if (y < y0 || y > y1) return -1;
  if (y <= ym) return w0;
  const t = (y - ym) / (y1 - ym);
  return w0 * (1 - t * t);
}
const inShield = (x, y) => {
  const h = shieldHalfWidth(y);
  return h >= 0 && Math.abs(x - 0.5) <= h;
};

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
const inCheck = (x, y) =>
  distToSegment(x, y, 0.405, 0.50, 0.475, 0.575) < 0.034 ||
  distToSegment(x, y, 0.475, 0.575, 0.615, 0.405) < 0.034;

function render(size, { badge = false } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const SS = 3; // supersampling grid
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const nx = (x + (sx + 0.5) / SS) / size;
          const ny = (y + (sy + 0.5) / SS) / size;
          let c = null;
          if (badge) {
            // monochrome white shield on transparency (notification badge)
            if (inShield(nx, ny)) c = [255, 255, 255, 255];
          } else {
            if (inRoundedSquare(nx, ny, 0.21)) c = [...mix(NAVY_TOP, NAVY_BOT, ny), 255];
            if (inShield(nx, ny)) c = [...mix(GREEN_TOP, GREEN_BOT, (ny - 0.24) / 0.56), 255];
            if (inCheck(nx, ny) && inShield(nx, ny)) c = [...CHECK, 255];
          }
          if (c) { r += c[0]; g += c[1]; b += c[2]; a += c[3]; }
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      px[i] = Math.round(r / n);
      px[i + 1] = Math.round(g / n);
      px[i + 2] = Math.round(b / n);
      px[i + 3] = Math.round(a / n);
    }
  }
  return encodePng(size, px);
}

for (const size of [512, 192, 180]) {
  writeFileSync(join(outDir, `icon-${size}.png`), render(size));
  console.log(`icons/icon-${size}.png`);
}
writeFileSync(join(outDir, 'badge-96.png'), render(96, { badge: true }));
console.log('icons/badge-96.png');
