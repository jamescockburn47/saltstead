// gen-icons.mjs — procedurally draw the PWA icons (no deps; pure Node zlib PNG encoder).
// Same identity rule as the rest of the repo: no binary assets without a generator.
// A square sea scene with a sailing ship on the game's palette (bg #0a1622).
// Usage: node scripts/gen-icons.mjs  → writes public/icons/icon-192.png + icon-512.png
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_TABLE[n] = c; }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, pix) {
  const stride = 1 + w * 3;
  const raw = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = pix(x, y);
    const o = y * stride + 1 + x * 3;
    raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// point-in-triangle by cross-product signs (all same side, zeros allowed)
function inTri(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

// the scene, per-pixel over u,v in [0,1] — ship held in the central 80% so the
// same art survives a maskable crop.
function scene(size) {
  return (x, y) => {
    const u = x / size, v = y / size;
    let r, g, b;
    if (v <= 0.48) {
      // sky: dawn-grey gradient down to the horizon
      const t = v / 0.48;
      r = Math.round(26 + (94 - 26) * t);
      g = Math.round(42 + (124 - 42) * t);
      b = Math.round(58 + (148 - 58) * t);
    } else {
      // sea: deepens toward the bottom, with wave glints
      const d = (v - 0.48) / 0.52;
      r = Math.round(22 - 8 * d);
      g = Math.round(50 - 14 * d);
      b = Math.round(74 - 18 * d);
      if (Math.sin(u * 40 + v * 90) > 0.7) { r += 14; g += 14; b += 14; }
    }
    // sails over the sky
    if (inTri(u, v, 0.505, 0.22, 0.505, 0.60, 0.74, 0.58)) { r = 236; g = 240; b = 244; }
    else if (inTri(u, v, 0.495, 0.26, 0.495, 0.60, 0.30, 0.585)) { r = 222; g = 230; b = 238; }
    // hull and mast over everything
    if (u > 0.30 && u < 0.72 && v > 0.62 && v < 0.70) { r = 46; g = 30; b = 20; }
    if (Math.abs(u - 0.50) < 0.009 && v > 0.20 && v < 0.63) { r = 60; g = 44; b = 30; }
    return [r, g, b];
  };
}

mkdirSync(new URL('../public/icons/', import.meta.url), { recursive: true });
for (const size of [192, 512]) {
  const out = new URL(`../public/icons/icon-${size}.png`, import.meta.url);
  writeFileSync(out, png(size, size, scene(size)));
  console.log(`icon-${size}.png written`);
}
