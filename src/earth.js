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

// The world wraps east-west: the globe is WORLD_W game metres around (360 deg),
// so +180 deg and -180 deg are the same meridian. wrapX folds a world x back into
// [-WORLD_W/2, WORLD_W/2) (keep the ship's lon in range so geography stays valid);
// dxWrap gives the SHORTEST signed east-west delta from->to across the seam, so
// navigation, routing and currents can cross the antimeridian the short way.
export const WORLD_W = 360 * M_PER_DEG;
export function wrapX(x) { return x - Math.round(x / WORLD_W) * WORLD_W; }
export function dxWrap(fromX, toX) {
  const d = toX - fromX;
  return d - Math.round(d / WORLD_W) * WORLD_W;
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
export function maskLand(lat, lon) {
  const col = Math.min(MASK_W - 1, Math.max(0, Math.round((lon + 180) / (360 / MASK_W) - 0.5)));
  const row = Math.min(MASK_H - 1, Math.max(0, Math.round((90 - lat) / (180 / MASK_H) - 0.5)));
  const bit = row * MASK_W + col;
  return !!(MASK[bit >> 3] & (1 << (bit & 7)));
}

// ---------- generic polyline spatial index ----------
// closed=true joins each ring's last point back to its first.
const CELL = 0.25;
const GRID_W = Math.ceil(360 / CELL), GRID_H = Math.ceil(180 / CELL);

// coarse occupancy net: 1-degree cells (4x4 fine cells) marking where ANY
// edge lives, so a far-from-everything query can bail out in a few byte
// reads instead of walking thousands of empty fine cells (the Amazon
// interior and the blue-water gait check both hit that miss path hard).
const COARSE = 4;
const COARSE_W = GRID_W / COARSE, COARSE_H = GRID_H / COARSE;

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
  const coarse = new Uint8Array(COARSE_W * COARSE_H);
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
        coarse[Math.floor(cy / COARSE) * COARSE_W + Math.floor(cx / COARSE)] = 1;
      }
    }
  }
  return { offsets, coords, owner, grid, coarse, edgeEnd, ringCount, pointCount };
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
  // coarse pre-check: any edge at all within reach? (over-covers by one
  // coarse cell so it can never rule out an edge the fine walk would find)
  const cr = Math.ceil(maxCells / COARSE) + 1;
  const gx0 = Math.floor(cx0 / COARSE), gy0 = Math.floor(cy0 / COARSE);
  let any = false;
  for (let gy = Math.max(0, gy0 - cr); gy <= Math.min(COARSE_H - 1, gy0 + cr) && !any; gy++) {
    for (let gx = gx0 - cr; gx <= gx0 + cr; gx++) {
      if (idx.coarse[gy * COARSE_W + ((gx % COARSE_W) + COARSE_W) % COARSE_W]) { any = true; break; }
    }
  }
  if (!any) return null;
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

export const COAST_CAP = 10 * M_PER_DEG;

export function coastDistGame(lat, lon) {
  const d = nearestDeg(LAND, lat, lon, 40);
  return d === null ? COAST_CAP : Math.min(COAST_CAP, d * M_PER_DEG);
}

export function signedCoastGame(lat, lon) {
  const d = nearestDeg(LAND, lat, lon, 20);
  if (d === null) return maskLand(lat, lon) ? COAST_CAP : -COAST_CAP;
  const g = Math.min(COAST_CAP, d * M_PER_DEG);
  return isLand(lat, lon) ? g : -g;
}

// ---------- rivers ----------
// walk every baked river segment as (lon1, lat1, lon2, lat2) in degrees —
// the charts ink the river roads from this
export function eachRiverSegment(cb) {
  const { coords, offsets } = RIVERS;
  for (let r = 0; r < RIVERS.ringCount; r++) {
    for (let p = offsets[r]; p < offsets[r + 1] - 1; p++) {
      cb(coords[p * 2] / COORD_SCALE, coords[p * 2 + 1] / COORD_SCALE,
        coords[(p + 1) * 2] / COORD_SCALE, coords[(p + 1) * 2 + 1] / COORD_SCALE);
    }
  }
}

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

export const RIVER_HALF = 60;    // game metres: half-width of a river channel
const RIVER_VALLEY = 200;        // floodplain width beyond the channel
// channel depth at the centreline, in game metres BELOW WATER — an absolute
// cut, not ground-relative, so the Mississippi is as wet in high country as
// the Amazon at its mouth. Deep enough for every beaching hull with ease, a
// tight centreline for the frigate, and the galleon anchors and sends the
// longboat — the El Dorado thesis in one number (galleon groundLine -3.0).
export const RIVER_DEPTH = -3.2;

// THE COAST'S CHARACTER (2026-07-24): not every shore is a beach. A slow
// regional noise — sharpened where a mountain range meets the sea — says how
// ROCKY this stretch of coast is: 0 reads sand and dunes, 1 reads cliffs and
// shingle. Pure and deterministic; terraingen paints by it and elevation
// raises a bluff by it, so the colour and the silhouette always agree.
export function coastCharacter(lat, lon) {
  const n = fbm2(lon * 0.7 + 31, lat * 0.7 - 11);
  return Math.max(0, Math.min(1, (n - 0.36) * 2.4 + mountainness(lat, lon) * 0.5));
}

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
  // a rocky coast stands up out of the water: the bluff rises over the first
  // ~60 m inland, so cliffs meet the sea instead of every shore shelving
  // through the same sand. Land side only — the waterline itself never moves.
  const rock = coastCharacter(lat, lon);
  if (rock > 0.3 && d < 400) {
    const bluff = smooth01((d - 6) / 55) * (1 - smooth01((d - 220) / 180));
    h += (rock - 0.3) * 18 * bluff * (0.6 + 0.4 * n);
  }
  const m = mountainness(lat, lon);
  if (m > 0) {
    const r = ridged(lon * 5.7, lat * 5.7);
    h += m * ramp * (35 + 150 * r * r);
  }
  const rv = riverDistGame(lat, lon);
  if (rv < RIVER_VALLEY) {
    // the FLOODPLAIN (2026-07-24): a great river runs at land level through
    // flat low banks — the Amazon is a plain of water, not a gouged gulley.
    // The ground SETTLES onto a low bank surface toward the channel (never
    // raised, only lowered), so from the deck you see over the bank into
    // the country instead of up two walls.
    const t = smooth01(1 - rv / RIVER_VALLEY);    // 0 at the plain -> 1 at the water
    const plain = 1.8 + (1 - t) * 3.0;            // the bank: ~1.8 m at the edge
    h = h * (1 - t) + Math.min(h, plain) * t;
    if (rv < RIVER_HALF) {
      const ct = 1 - rv / RIVER_HALF;             // 1 at the centreline
      const s = ct * ct * (3 - 2 * ct);           // smooth shelving banks
      h = h * (1 - s) + RIVER_DEPTH * s;          // cut to honest water
    }
  }
  return h;
}

// open-sea gait, two stages: 1x inshore so harbours and coastlines are sailed
// at human scale, 5x once clear of the coast, then a second ramp to 10x in
// true blue water. (Halved from 20x — the fair current now makes up part of the
// difference; see currents.js.) The wind ALSO builds offshore (weather.js
// windProfile), so the three stack: blue water is fast because the world
// compresses, the wind fills in, and a favourable current sets you along.
const smooth01 = (t) => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };
export const GAIT_MAX = 10;
// The bands sit CLOSE in (playtest: the old 800/2200 m onsets left five dull
// minutes between weighing anchor and the sea starting to move): the current
// picks up 300 m off the beach and runs full blue-water gait by ~2.5 km.
export function gaitFactor(coastDist) {
  return 1
    + 4 * smooth01((coastDist - 300) / 700)       // coastal -> offshore
    + (GAIT_MAX - 5) * smooth01((coastDist - 1000) / 1500); // offshore -> blue water
}

// the current slackens in company: two hulls at 12x would close at ~200 m/s
// and never meet, so within hailing range the fair current dies and everyone
// sails at human speed. Symmetric by construction — both crews compute it
// from the same mutual distance, so no ship outruns the encounter.
export const ENCOUNTER_NEAR = 400;   // full stop of the current inside this
export const ENCOUNTER_FAR = 1600;   // untouched beyond this
export function encounterGait(gait, nearestShipDist) {
  const t = smooth01((nearestShipDist - ENCOUNTER_NEAR) / (ENCOUNTER_FAR - ENCOUNTER_NEAR));
  return 1 + (gait - 1) * t;
}
