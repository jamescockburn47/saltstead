// The Earth — pure geography module, no THREE, no DOM. verify-earth.mjs
// guards it. Decodes the baked Natural Earth coastlines (src/earthdata.js)
// and answers the questions everything else asks:
//
//   latLonToWorld / worldToLatLon — the map projection + game scale
//   isLand(lat, lon)              — which side of the coast am I on
//   coastDistGame(lat, lon)       — game metres to the nearest coastline
//   elevation(lat, lon)           — terrain height / seabed depth (game m)
//   gaitFactor(coastDist)         — the open-sea speed multiplier
//
// Scale: ~1:250 (M_PER_DEG game metres per real degree). Equirectangular —
// distortion at high latitude is accepted for now; the world is for sailing,
// not surveying.

import {
  COORD_SCALE, MASK_W, MASK_H, RING_OFFSETS_B64, COORDS_B64, MASK_B64,
} from './earthdata.js';
import { fbm2 } from './noise.js';

export const M_PER_DEG = 444;

export function latLonToWorld(lat, lon) {
  return { x: lon * M_PER_DEG, z: -lat * M_PER_DEG };
}
export function worldToLatLon(x, z) {
  return { lat: -z / M_PER_DEG, lon: x / M_PER_DEG };
}

// ---------- decode the baked tables ----------
function b64ToBytes(b64) {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
function toTyped(b64, Ctor) {
  const bytes = b64ToBytes(b64);
  const copy = new Uint8Array(bytes.length); // alignment-safe view
  copy.set(bytes);
  return new Ctor(copy.buffer);
}

const OFFSETS = toTyped(RING_OFFSETS_B64, Int32Array); // point index per ring
const COORDS = toTyped(COORDS_B64, Int16Array);        // flat [lon, lat] * 1e2
const MASK = b64ToBytes(MASK_B64);
export const RING_COUNT = OFFSETS.length - 1;
export const POINT_COUNT = COORDS.length / 2;

function maskLand(lat, lon) {
  const col = Math.min(MASK_W - 1, Math.max(0, Math.round((lon + 180) / (360 / MASK_W) - 0.5)));
  const row = Math.min(MASK_H - 1, Math.max(0, Math.round((90 - lat) / (180 / MASK_H) - 0.5)));
  const bit = row * MASK_W + col;
  return !!(MASK[bit >> 3] & (1 << (bit & 7)));
}

// ---------- edge spatial index (built once at import) ----------
const CELL = 0.25; // degrees
const GRID_W = Math.ceil(360 / CELL), GRID_H = Math.ceil(180 / CELL);
const grid = new Map(); // cellKey -> [edgeIndex...]; edge i = point i -> next-in-ring

const edgeRing = new Int32Array(POINT_COUNT); // which ring owns edge i
{
  for (let r = 0; r < RING_COUNT; r++) {
    for (let p = OFFSETS[r]; p < OFFSETS[r + 1]; p++) edgeRing[p] = r;
  }
  const cellOf = (lon, lat) => {
    const cx = Math.min(GRID_W - 1, Math.max(0, Math.floor((lon + 180) / CELL)));
    const cy = Math.min(GRID_H - 1, Math.max(0, Math.floor((90 - lat) / CELL)));
    return cy * GRID_W + cx;
  };
  for (let i = 0; i < POINT_COUNT; i++) {
    const r = edgeRing[i];
    const j = (i + 1 < OFFSETS[r + 1]) ? i + 1 : OFFSETS[r]; // ring wraps
    const x1 = COORDS[i * 2] / COORD_SCALE, y1 = COORDS[i * 2 + 1] / COORD_SCALE;
    const x2 = COORDS[j * 2] / COORD_SCALE, y2 = COORDS[j * 2 + 1] / COORD_SCALE;
    if (Math.abs(x1 - x2) > 180) continue; // antimeridian-spanning stub: skip
    const c1 = cellOf(Math.min(x1, x2), Math.max(y1, y2));
    const c2 = cellOf(Math.max(x1, x2), Math.min(y1, y2));
    const cx1 = c1 % GRID_W, cy1 = (c1 / GRID_W) | 0;
    const cx2 = c2 % GRID_W, cy2 = (c2 / GRID_W) | 0;
    for (let cy = cy1; cy <= cy2; cy++) {
      for (let cx = cx1; cx <= cx2; cx++) {
        const key = cy * GRID_W + cx;
        let arr = grid.get(key);
        if (!arr) grid.set(key, arr = []);
        arr.push(i);
      }
    }
  }
}

// nearest coastline edge to (lat, lon), searching an expanding ring of cells.
// Returns { distDeg } or null beyond maxCells. Distance only — the land/sea
// side comes from the even-odd ray cast below (a single nearest edge cannot
// decide the side reliably at concave corners, and shapefile winding lies).
function nearestEdge(lat, lon, maxCells = 8) {
  const cLat = Math.cos((lat * Math.PI) / 180) || 1e-6;
  const cx0 = Math.floor((lon + 180) / CELL), cy0 = Math.floor((90 - lat) / CELL);
  let best = null, bestD = Infinity, foundAt = -1;
  for (let r = 0; r <= maxCells; r++) {
    if (foundAt >= 0 && r > foundAt + 1) break; // one extra ring guarantees true nearest
    for (let cy = cy0 - r; cy <= cy0 + r; cy++) {
      if (cy < 0 || cy >= GRID_H) continue;
      for (let cx = cx0 - r; cx <= cx0 + r; cx++) {
        if (Math.max(Math.abs(cx - cx0), Math.abs(cy - cy0)) !== r) continue; // ring shell only
        const arr = grid.get(cy * GRID_W + ((cx % GRID_W) + GRID_W) % GRID_W);
        if (!arr) continue;
        for (const i of arr) {
          const ring = edgeRing[i];
          const j = (i + 1 < OFFSETS[ring + 1]) ? i + 1 : OFFSETS[ring];
          const ax = COORDS[i * 2] / COORD_SCALE, ay = COORDS[i * 2 + 1] / COORD_SCALE;
          const bx = COORDS[j * 2] / COORD_SCALE, by = COORDS[j * 2 + 1] / COORD_SCALE;
          // weighted degree space: lon shrinks by cos(lat)
          const pax = (lon - ax) * cLat, pay = lat - ay;
          const bax = (bx - ax) * cLat, bay = by - ay;
          const len2 = bax * bax + bay * bay;
          const t = len2 > 0 ? Math.max(0, Math.min(1, (pax * bax + pay * bay) / len2)) : 0;
          const dx = pax - bax * t, dy = pay - bay * t;
          const d = dx * dx + dy * dy;
          if (d < bestD) {
            bestD = d;
            best = { distDeg: 0 };
            if (foundAt < 0) foundAt = r;
          }
        }
      }
    }
  }
  if (best) best.distDeg = Math.sqrt(bestD);
  return best;
}

// even-odd ray cast: walk the grid row east of the point, count coastline
// crossings; odd = inside land. Exact regardless of ring winding. Memoized
// at 0.01-degree resolution because terrain builds hammer it.
const landMemo = new Map();
function rayCastLand(lat, lon) {
  const qlat = lat;
  const cy = Math.min(GRID_H - 1, Math.max(0, Math.floor((90 - lat) / CELL)));
  const cx0 = Math.min(GRID_W - 1, Math.max(0, Math.floor((lon + 180) / CELL)));
  let crossings = 0;
  const seen = new Set();
  for (let cx = cx0; cx < GRID_W; cx++) {
    const arr = grid.get(cy * GRID_W + cx);
    if (!arr) continue;
    for (const i of arr) {
      if (seen.has(i)) continue;
      seen.add(i);
      const ring = edgeRing[i];
      const j = (i + 1 < OFFSETS[ring + 1]) ? i + 1 : OFFSETS[ring];
      const y1 = COORDS[i * 2 + 1] / COORD_SCALE, y2 = COORDS[j * 2 + 1] / COORD_SCALE;
      if (!((y1 <= qlat && y2 > qlat) || (y2 <= qlat && y1 > qlat))) continue;
      const x1 = COORDS[i * 2] / COORD_SCALE, x2 = COORDS[j * 2] / COORD_SCALE;
      const xc = x1 + ((qlat - y1) * (x2 - x1)) / (y2 - y1);
      if (xc > lon) crossings++;
    }
  }
  return (crossings & 1) === 1;
}

export function isLand(lat, lon) {
  // far from any coast the mask is authoritative and cheap
  const e = nearestEdge(lat, lon, 3);
  if (!e) return maskLand(lat, lon);
  const key = Math.round(lat * 100) * 65536 + Math.round(lon * 100);
  let v = landMemo.get(key);
  if (v === undefined) {
    if (landMemo.size > 400000) landMemo.clear();
    v = rayCastLand(lat, lon);
    landMemo.set(key, v);
  }
  return v;
}

export const COAST_CAP = 5 * M_PER_DEG; // beyond ~5 deg everything is "open sea"

export function coastDistGame(lat, lon) {
  const e = nearestEdge(lat, lon, 20);
  return e ? Math.min(COAST_CAP, e.distDeg * M_PER_DEG) : COAST_CAP;
}

// signed coast distance in game metres: positive inland, negative offshore
export function signedCoastGame(lat, lon) {
  const e = nearestEdge(lat, lon, 20);
  if (!e) return maskLand(lat, lon) ? COAST_CAP : -COAST_CAP;
  const d = Math.min(COAST_CAP, e.distDeg * M_PER_DEG);
  return isLand(lat, lon) ? d : -d;
}

// terrain height (game metres, sea level = 0). Beach flats at the waterline,
// rising interior with deterministic fractal relief; offshore shelf falling
// away to the deep.
export function elevation(lat, lon) {
  const d = signedCoastGame(lat, lon);
  const n = fbm2(lon * 3.1, lat * 3.1); // ~[0,1], stable everywhere
  if (d >= 0) {
    const ramp = 1 - Math.exp(-d / 260);
    return 0.8 + d * 0.02 + 30 * ramp * (0.35 + 0.65 * n);
  }
  const s = -d;
  const shelf = 1 - Math.exp(-s / 320);
  return -(1.6 + 42 * shelf * (0.55 + 0.45 * n));
}

// open-sea gait: sailing is 1:1 near coasts where the game happens, and the
// empty crossings compress. Ramps 1x -> 4x between 800 m and 2000 m offshore.
export function gaitFactor(coastDist) {
  const t = Math.max(0, Math.min(1, (coastDist - 800) / 1200));
  return 1 + 3 * t * t * (3 - 2 * t);
}
