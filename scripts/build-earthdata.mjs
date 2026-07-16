// build-earthdata: bakes Natural Earth public-domain vectors into
// src/earthdata.js — data-in-code (the moorsgeo trick at planet scale;
// invariant: no binary asset files at runtime).
//
// Inputs (downloaded, gitignored — see README):
//   tools/ne_50m_land.geojson      — coastline polygons
//   tools/ne_50m_rivers.geojson    — river centrelines
//   tools/ne_10m_regions.geojson   — geography regions (mountain ranges)
// Output: src/earthdata.js (generated, committed)
//
// Encoding: coords quantized to 0.01 degrees, thinned, absolute Int16 pairs
// [lon, lat] flat; per-table Int32 offset arrays mark ring/line boundaries.
// Land rings are CLOSED; river lines are OPEN; mountain rings are CLOSED.

import { readFileSync, writeFileSync } from 'node:fs';

const SCALE = 100;
const MASK_W = 720, MASK_H = 360;

function quantizeLines(lineArrays, thin) {
  const out = [];
  for (const line of lineArrays) {
    const q = [];
    let plon = null, plat = null;
    for (const [lon, lat] of line) {
      const ql = Math.round(lon * SCALE), qa = Math.round(lat * SCALE);
      if (plon !== null && Math.abs(ql - plon) < thin && Math.abs(qa - plat) < thin) continue;
      q.push(ql, qa);
      plon = ql; plat = qa;
    }
    if (q.length >= 4 && q[0] === q[q.length - 2] && q[1] === q[q.length - 1]) q.length -= 2;
    if (q.length >= 4) out.push(q);
  }
  return out;
}

function ringsOf(features) {
  const lines = [];
  for (const f of features) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates]
      : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
    for (const poly of polys) for (const ring of poly) lines.push(ring);
  }
  return lines;
}

function linesOf(features) {
  const lines = [];
  for (const f of features) {
    const ls = f.geometry.type === 'LineString' ? [f.geometry.coordinates]
      : f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [];
    for (const l of ls) lines.push(l);
  }
  return lines;
}

function pack(rings) {
  const total = rings.reduce((s, r) => s + r.length / 2, 0);
  const offsets = new Int32Array(rings.length + 1);
  const coords = new Int16Array(total * 2);
  let w = 0;
  rings.forEach((r, i) => { offsets[i] = w / 2; coords.set(r, w); w += r.length; });
  offsets[rings.length] = w / 2;
  return { offsets, coords, total };
}

// ---- land ----
const landGJ = JSON.parse(readFileSync('tools/ne_50m_land.geojson', 'utf8'));
const landRings = quantizeLines(ringsOf(landGJ.features), 2)
  .filter((r) => r.length >= 8);
const land = pack(landRings);

// ---- rivers (all scaleranks; thinned harder — they read from sail distance) ----
const riverGJ = JSON.parse(readFileSync('tools/ne_50m_rivers.geojson', 'utf8'));
const riverLines = quantizeLines(linesOf(riverGJ.features), 3);
const rivers = pack(riverLines);

// ---- mountain ranges (10m regions, Range/mtn only, thinned hard) ----
const regGJ = JSON.parse(readFileSync('tools/ne_10m_regions.geojson', 'utf8'));
const mtnFeatures = regGJ.features.filter((f) => f.properties.FEATURECLA === 'Range/mtn');
const mtnRings = quantizeLines(ringsOf(mtnFeatures), 5).filter((r) => r.length >= 8);
const mtns = pack(mtnRings);

// ---- land mask: even-odd scanline per 0.5-deg row ----
const mask = new Uint8Array((MASK_W * MASK_H) / 8);
for (let row = 0; row < MASK_H; row++) {
  const qlat = (90 - (row + 0.5) * (180 / MASK_H)) * SCALE;
  const xs = [];
  for (const r of landRings) {
    const n = r.length / 2;
    for (let i = 0; i < n; i++) {
      const x1 = r[i * 2], y1 = r[i * 2 + 1];
      const j = (i + 1) % n;
      const x2 = r[j * 2], y2 = r[j * 2 + 1];
      if ((y1 <= qlat && y2 > qlat) || (y2 <= qlat && y1 > qlat)) {
        xs.push(x1 + (qlat - y1) * (x2 - x1) / (y2 - y1));
      }
    }
  }
  xs.sort((a, b) => a - b);
  for (let k = 0; k + 1 < xs.length; k += 2) {
    const c0 = Math.ceil((xs[k] / SCALE + 180) / (360 / MASK_W) - 0.5);
    const c1 = Math.floor((xs[k + 1] / SCALE + 180) / (360 / MASK_W) - 0.5);
    for (let c = Math.max(0, c0); c <= Math.min(MASK_W - 1, c1); c++) {
      const bit = row * MASK_W + c;
      mask[bit >> 3] |= 1 << (bit & 7);
    }
  }
}

// ---- sanity before writing ----
const landAt = (lat, lon) => {
  const col = Math.min(MASK_W - 1, Math.max(0, Math.round((lon + 180) / (360 / MASK_W) - 0.5)));
  const row = Math.min(MASK_H - 1, Math.max(0, Math.round((90 - lat) / (180 / MASK_H) - 0.5)));
  const bit = row * MASK_W + col;
  return !!(mask[bit >> 3] & (1 << (bit & 7)));
};
for (const [name, lat, lon, want] of [
  ['London', 51.5, -0.1, true], ['Kansas', 38.5, -98.4, true],
  ['Sahara', 23.0, 10.0, true], ['Siberia', 65.0, 100.0, true],
  ['mid-Atlantic', 30.0, -45.0, false], ['mid-Pacific', 0.0, -150.0, false],
  ['North Sea', 56.5, 3.0, false], ['Jamaica', 18.11, -77.28, true],
]) {
  if (landAt(lat, lon) !== want) { console.error(`SANITY FAIL: ${name}`); process.exit(1); }
}

const b64 = (arr) => Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString('base64');
const out = `// GENERATED by scripts/build-earthdata.mjs from Natural Earth (public
// domain): 50m land, 50m rivers, 10m geography regions. Do not edit by hand.
// land: ${landRings.length} rings / ${land.total} pts; rivers: ${riverLines.length} lines / ${rivers.total} pts;
// mountain ranges: ${mtnRings.length} rings / ${mtns.total} pts. 0.01-deg quantized.
export const COORD_SCALE = ${SCALE};
export const MASK_W = ${MASK_W};
export const MASK_H = ${MASK_H};
export const RING_OFFSETS_B64 = '${b64(land.offsets)}';
export const COORDS_B64 = '${b64(land.coords)}';
export const MASK_B64 = '${b64(mask)}';
export const RIVER_OFFSETS_B64 = '${b64(rivers.offsets)}';
export const RIVER_COORDS_B64 = '${b64(rivers.coords)}';
export const MTN_OFFSETS_B64 = '${b64(mtns.offsets)}';
export const MTN_COORDS_B64 = '${b64(mtns.coords)}';
`;
writeFileSync('src/earthdata.js', out);
console.log(`earthdata: land ${landRings.length}/${land.total}, rivers ${riverLines.length}/${rivers.total}, `
  + `mtns ${mtnRings.length}/${mtns.total}, ${(out.length / 1024).toFixed(0)} KB JS — sanity green`);
