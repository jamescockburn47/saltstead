// The Earth — pure geography module, no THREE, no DOM. verify-earth.mjs
// guards it. Decodes the baked Natural Earth tables (src/earthdata.js) and
// answers the questions everything else asks:
//
//   latLonToWorld / worldToLatLon — projection + game scale
//   isLand(lat, lon)              — exact even-odd against real coastlines
//   coastDistGame / signedCoastGame — game metres to the nearest coast
//   riverDistGame(lat, lon)       — game metres to the nearest river line
//   mountainness(lat, lon)        — 1 inside a real range, fading outside
//   elevation(lat, lon)           — terrain height / seabed depth (game m)
//   gaitFactor(coastDist)         — the open-sea speed multiplier
//
// Scale ~1:250 (M_PER_DEG game metres per real degree), equirectangular.

import {
  COORD_SCALE, MASK_W, MASK_H, RING_OFFSETS_B64, COORDS_B64, MASK_B64,
  RIVER_OFFSETS_B64, RIVER_COORDS_B64, MTN_OFFSETS_B64, MTN_COORDS_B64,
} from './earthdata.js';
import { fbm2, valueNoise2 } from './noise.js';

export const M_PER_DEG = 444;

export function latLonToWorld(lat, lon) {
  return { x: lon * M_PER_DEG, z: -lat * M_PER_DEG };
}
export function worldToLatLon(x, z) {
  return { lat: -z / M_PER_DEG, lon: x / M_PER_DEG };
}

// ---------- decode ----------
function b64ToBytes(b64) {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
function toTyped(b64, Ctor) {
  const bytes = b64ToBytes(b64);
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return new Ctor(copy.buffer);
}

const MASK = b64ToBytes(MASK_B64);
function maskLand(lat, lon) {
  const col = Math.min(MASK_W - 1, Math.max(0, Math.round((lon + 180) / (360 / MASK_W) - 0.5)));
  const row = Math.min(MASK_H - 1, Math.max(0, Math.round((90 - lat) / (180 / MASK_H) - 0.5)));
  const bit = row * MASK_W + col;
  return !!(MASK[bit >> 3] & (1 << (bit & 7)));
}

// ---------- generic polyline spatial index ----------
// closed=true joins each ring's last point back to its first.
const CELL = 0.25;
const GRID_W = Math.ceil(360 / CELL), GRID_H = Math.ceil(180 / CELL);

function buildIndex(offB64, coordB64, closed) {
  const offsets = toTyped(offB64, Int32Array);
  const coords = toTyped(coordB64, Int16Array);
  const ringCount = offsets.length - 1;
  const pointCount = coords.length / 2;
  const owner = new Int32Array(pointCount);
  for (let r = 0; r < ringCount; r++) {
    for (let p = offsets[r]; p < offsets[r + 1]; p++) owner[p] = r;
  }
  const grid = new Map();
  const cellOf = (lon, lat) => {
    const cx = Math.min(GRID_W - 1, Math.max(0, Math.floor((lon + 180) / CELL)));
    const cy = Math.min(GRID_H - 1, Math.max(0, Math.floor((90 - lat) / CELL)));
    return [cx, cy];
  };
  const edgeEnd = (i) => {
    const r = owner[i];
    if (i + 1 < offsets[r + 1]) return i + 1;
    return closed ? offsets[r] : -1;
  };
  for (let i = 0; i < pointCount; i++) {
    const j = edgeEnd(i);
    if (j < 0) continue;
    const x1 = coords[i * 2] / COORD_SCALE, y1 = coords[i * 2 + 1] / COORD_SCALE;
    const x2 = coords[j * 2] / COORD_SCALE, y2 = coords[j * 2 + 1] / COORD_SCALE;
    if (Math.abs(x1 - x2) > 180) continue; // antimeridian stub
    const [cx1, cyA] = cellOf(Math.min(x1, x2), Math.max(y1, y2));
    const [cx2, cyB] = cellOf(Math.max(x1, x2), Math.min(y1, y2));
    for (let cy = cyA; cy <= cyB; cy++) {
      for (let cx = cx1; cx <= cx2; cx++) {
        const key = cy * GRID_W + cx;
        let arr = grid.get(key);
        if (!arr) grid.set(key, arr = []);
        arr.push(i);
      }
    }
  }
  return { offsets, coords, owner, grid, edgeEnd, ringCount, pointCount };
}

const LAND = buildIndex(RING_OFFSETS_B64, COORDS_B64, true);
const RIVERS = buildIndex(RIVER_OFFSETS_B64, RIVER_COORDS_B64, false);
const MTNS = buildIndex(MTN_OFFSETS_B64, MTN_COORDS_B64, true);
export const RING_COUNT = LAND.ringCount;
export const POINT_COUNT = LAND.pointCount;
export const RIVER_COUNT = RIVERS.ringCount;
export const MTN_COUNT = MTNS.ringCount;

// nearest edge distance (degrees, cos-lat weighted) on an index, expanding
// cell-ring search. null beyond maxCells.
function nearestDeg(idx, lat, lon, maxCells) {
  const cLat = Math.cos((lat * Math.PI) / 180) || 1e-6;
  const cx0 = Math.floor((lon + 180) / CELL), cy0 = Math.floor((90 - lat) / CELL);
  let bestD = Infinity, foundAt = -1;
  for (let r = 0; r <= maxCells; r++) {
    if (foundAt >= 0 && r > foundAt + 1) break;
    for (let cy = cy0 - r; cy <= cy0 + r; cy++) {
      if (cy < 0 || cy >= GRID_H) continue;
      for (let cx = cx0 - r; cx <= cx0 + r; cx++) {
        if (Math.max(Math.abs(cx - cx0), Math.abs(cy - cy0)) !== r) continue;
        const arr = idx.grid.get(cy * GRID_W + ((cx % GRID_W) + GRID_W) % GRID_W);
        if (!arr) continue;
        for (const i of arr) {
          const j = idx.edgeEnd(i);
          if (j < 0) continue;
          const ax = idx.coords[i * 2] / COORD_SCALE, ay = idx.coords[i * 2 + 1] / COORD_SCALE;
          const bx = idx.coords[j * 2] / COORD_SCALE, by = idx.coords[j * 2 + 1] / COORD_SCALE;
          const pax = (lon - ax) * cLat, pay = lat - ay;
          const bax = (bx - ax) * cLat, bay = by - ay;
          const len2 = bax * bax + bay * bay;
          const t = len2 > 0 ? Math.max(0, Math.min(1, (pax * bax + pay * bay) / len2)) : 0;
          const dx = pax - bax * t, dy = pay - bay * t;
          const d = dx * dx + dy * dy;
          if (d < bestD) { bestD = d; if (foundAt < 0) foundAt = r; }
        }
      }
    }
  }
  return foundAt < 0 ? null : Math.sqrt(bestD);
}

// even-odd ray cast eastward along the grid row: exact inside test for a
// closed-ring index, regardless of winding.
function rayCastInside(idx, lat, lon) {
  const cy = Math.min(GRID_H - 1, Math.max(0, Math.floor((90 - lat) / CELL)));
  const cx0 = Math.min(GRID_W - 1, Math.max(0, Math.floor((lon + 180) / CELL)));
  let crossings = 0;
  const seen = new Set();
  for (let cx = cx0; cx < GRID_W; cx++) {
    const arr = idx.grid.get(cy * GRID_W + cx);
    if (!arr) continue;
    for (const i of arr) {
      if (seen.has(i)) continue;
      seen.add(i);
      const j = idx.edgeEnd(i);
      if (j < 0) continue;
      const y1 = idx.coords[i * 2 + 1] / COORD_SCALE, y2 = idx.coords[j * 2 + 1] / COORD_SCALE;
      if (!((y1 <= lat && y2 > lat) || (y2 <= lat && y1 > lat))) continue;
      const x1 = idx.coords[i * 2] / COORD_SCALE, x2 = idx.coords[j * 2] / COORD_SCALE;
      const xc = x1 + ((lat - y1) * (x2 - x1)) / (y2 - y1);
      if (xc > lon) crossings++;
    }
  }
  return (crossings & 1) === 1;
}

// ---------- land / coast ----------
const landMemo = new Map();
export function isLand(lat, lon) {
  const near = nearestDeg(LAND, lat, lon, 3);
  if (near === null) return maskLand(lat, lon);
  const key = Math.round(lat * 100) * 65536 + Math.round(lon * 100);
  let v = landMemo.get(key);
  if (v === undefined) {
    if (landMemo.size > 400000) landMemo.clear();
    v = rayCastInside(LAND, lat, lon);
    landMemo.set(key, v);
  }
  return v;
}

export const COAST_CAP = 5 * M_PER_DEG;

export function coastDistGame(lat, lon) {
  const d = nearestDeg(LAND, lat, lon, 20);
  return d === null ? COAST_CAP : Math.min(COAST_CAP, d * M_PER_DEG);
}

export function signedCoastGame(lat, lon) {
  const d = nearestDeg(LAND, lat, lon, 20);
  if (d === null) return maskLand(lat, lon) ? COAST_CAP : -COAST_CAP;
  const g = Math.min(COAST_CAP, d * M_PER_DEG);
  return isLand(lat, lon) ? g : -g;
}

// ---------- rivers ----------
export const RIVER_CAP = 2 * M_PER_DEG;
export function riverDistGame(lat, lon) {
  const d = nearestDeg(RIVERS, lat, lon, 8);
  return d === null ? RIVER_CAP : Math.min(RIVER_CAP, d * M_PER_DEG);
}

// ---------- mountains ----------
const mtnMemo = new Map();
export function mountainness(lat, lon) {
  const d = nearestDeg(MTNS, lat, lon, 3);
  if (d === null) return 0; // far from every range boundary: assume lowland
  const key = Math.round(lat * 50) * 65536 + Math.round(lon * 50);
  let inside = mtnMemo.get(key);
  if (inside === undefined) {
    if (mtnMemo.size > 200000) mtnMemo.clear();
    inside = rayCastInside(MTNS, lat, lon);
    mtnMemo.set(key, inside);
  }
  if (inside) return 1;
  return Math.max(0, 1 - d / 0.35); // foothills fade outside the range
}

// ---------- elevation ----------
// ridged noise for crags: folds valueNoise around 0.5
function ridged(x, z) {
  return 1 - Math.abs(2 * valueNoise2(x, z) - 1);
}

export const RIVER_HALF = 26;    // game metres: half-width of a river channel
const RIVER_VALLEY = 110;        // valley shoulder width

export function elevation(lat, lon) {
  const d = signedCoastGame(lat, lon);
  const n = fbm2(lon * 3.1, lat * 3.1);
  if (d < 0) {
    const s = -d;
    const shelf = 1 - Math.exp(-s / 320);
    return -(1.6 + 42 * shelf * (0.55 + 0.45 * n));
  }
  const ramp = 1 - Math.exp(-d / 260);
  // interior rise flattens out: plains stay plains, only ranges make mountains
  let h = 0.8 + Math.min(d, 900) * 0.012 + 24 * ramp * (0.35 + 0.65 * n);
  const m = mountainness(lat, lon);
  if (m > 0) {
    const r = ridged(lon * 5.7, lat * 5.7);
    h += m * ramp * (35 + 150 * r * r);
  }
  const rv = riverDistGame(lat, lon);
  if (rv < RIVER_VALLEY) {
    const vt = 1 - rv / RIVER_VALLEY;             // valley shoulders
    h *= 1 - 0.55 * vt * vt;
    if (rv < RIVER_HALF) {
      const ct = 1 - rv / RIVER_HALF;             // the channel itself
      h = h * (1 - 0.8 * ct) - 3.5 * ct;          // cut below local ground
    }
  }
  return h;
}

// open-sea gait: 1x inshore, ramping to 4x between 800 m and 2000 m offshore
export function gaitFactor(coastDist) {
  const t = Math.max(0, Math.min(1, (coastDist - 800) / 1200));
  return 1 + 3 * t * t * (3 - 2 * t);
}
