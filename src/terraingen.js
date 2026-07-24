// Terrain chunk generation — pure, no THREE, no DOM. verify-terraingen.mjs
// guards it. A chunk is a low-poly heightfield sampled from the Earth module,
// coloured by height: seabed shallows, wet sand, dune grass, moor, crag.
//
// THE SMOOTH SHORELINE (2026-07-24): chunks that carry the waterline sample
// at double resolution (3 m), and every vertex carries an ANALYTIC normal —
// a centred finite difference of the elevation field itself, so normals agree
// across chunk seams by construction. The scene layer blends those smooth
// normals in near the waterline and falls back to faceted shading on the
// uplands (terrain.js), the same amendment the sea itself got: the flat-shaded
// law holds where the land is high and dry; the water's edge reads smooth.

import {
  elevation, worldToLatLon, coastDistGame, riverDistGame, isLand,
  coastCharacter, mountainness, RIVER_HALF,
} from './earth.js';
import { fbm2 } from './noise.js';

export const CHUNK = 96;      // metres square
export const RES = 16;        // quads per side inland (17x17 verts)
export const RES_SHORE = 32;  // quads per side where the waterline runs

// land the ship can never SEE is never built: with shore leave retired the
// lens always rides a hull on water, so any visible chunk sits within the
// terrain ring (~740 m) of a waterline — coast or river. Beyond INLAND_KEEP
// of both, the interior is skipped like the deep sea. (Must sit BELOW
// riverDistGame's cap of 2 deg = 888 m, or the test never bites.)
export const INLAND_KEEP = 800;

// deep-WATER chunks are skipped entirely — 99% of the planet costs nothing —
// and so is the deep INTERIOR: land builds only within sight of a coast or a
// river corridor (a ship up a river still sees ground bank to bank).
export function chunkWorthBuilding(cx, cz) {
  const half = CHUNK / 2;
  const { lat, lon } = worldToLatLon(cx * CHUNK + half, cz * CHUNK + half);
  const coast = coastDistGame(lat, lon);
  if (coast < CHUNK * 2.2) return true;      // the shore band, wet or dry
  if (!isLand(lat, lon)) return false;       // open sea
  if (coast < INLAND_KEEP || riverDistGame(lat, lon) < INLAND_KEEP) return true;
  // coastal MOUNTAIN backdrops are kept further inland than plain ground:
  // the silhouette of a range behind the shore is worth its chunks, and if
  // the view distance ever grows the ranges are already building
  return mountainness(lat, lon) > 0.35 && coast < 2600;
}

// the waterline chunks earn the fine grid; a chunk whose centre is farther
// from the coast than this can never touch the h=0 crossing (half-diagonal
// is 68 m), so it keeps the cheap inland grid
export function chunkRes(cx, cz) {
  const half = CHUNK / 2;
  const { lat, lon } = worldToLatLon(cx * CHUNK + half, cz * CHUNK + half);
  return coastDistGame(lat, lon) < CHUNK * 1.6 ? RES_SHORE : RES;
}

const mix3 = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t,
];

const DEEP = [0.13, 0.25, 0.33];
const WETSAND = [0.72, 0.68, 0.5];
const BEACH = [0.83, 0.76, 0.55];
const WETROCK = [0.4, 0.41, 0.4];
const DRYROCK = [0.56, 0.54, 0.5];
const SHINGLE = [0.62, 0.58, 0.5];
const MARSH = [0.44, 0.5, 0.32];
const MANGROVE = [0.2, 0.38, 0.22];
const ICESHORE = [0.85, 0.87, 0.9];

const smt = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// the dry-land palette above the beach: snow, desert belts, green, moor,
// crag — every LATITUDE seam blends over a few degrees instead of cutting
// (the abrupt zone walls read as painted stripes from the sea)
function upland(h, aLat, lon, lat) {
  const snowline = Math.max(6, 60 - (aLat - 40) * 1.6);
  const SNOW = [0.92, 0.93, 0.95];
  if (h > snowline) return SNOW;
  // desert belts (~15-33 deg), noise-broken so edges aren't stripes
  if (aLat > 14 && aLat < 34 && h < 26 && fbm2(lon * 0.6 + 9, lat * 0.6) > 0.42) {
    return [0.78, 0.66, 0.44];
  }
  let c;
  if (h < 9) {
    // tropical green eases into the temperate green through 22-32 deg
    c = mix3([0.3, 0.55, 0.26], [0.38, 0.52, 0.28], smt(22, 32, aLat));
  } else if (h < 24) {
    // rainforest holds its green far above the temperate moorline — the
    // Amazon's valley shoulders must read jungle, not Yorkshire; the
    // moor takes over through 16-26 deg
    c = mix3([0.26, 0.48, 0.24], [0.42, 0.44, 0.3], smt(16, 26, aLat));
  } else {
    c = [0.52, 0.5, 0.47];                 // crag
  }
  // the polar rim whitens gradually from 62 to 70 deg, not at a wall
  return mix3(c, SNOW, smt(62, 70, aLat));
}

// which pair of low/high shore colours this stretch of coast wears — not
// every shore is a beach (2026-07-24): rock cliffs where the coast is rocky
// or the ground stands steep, shingle on the half-rocky stretches, reedy
// marsh on dead-flat river ground (mangrove-dark in the tropics), ice past
// the polar rim, sand elsewhere.
function shoreBand(aLat, rock, slope, riverD) {
  if (aLat > 66) return [ICESHORE, ICESHORE];
  if (rock > 0.55 || slope > 0.75) return [WETROCK, DRYROCK];
  if (rock > 0.32) return [mix3(WETSAND, SHINGLE, 0.7), SHINGLE];
  if (riverD < 220 && slope < 0.16) {
    return aLat < 20 ? [mix3(WETSAND, MANGROVE, 0.6), MANGROVE] : [mix3(WETSAND, MARSH, 0.6), MARSH];
  }
  return [WETSAND, BEACH];
}

// height + latitude -> biome palette (RGB 0..1). Deterministic. The bands
// around the waterline blend instead of cutting hard — a hard colour step is
// half of what made the old shoreline read faceted. slope, rock and riverD
// (optional — the mesh builder supplies them) pick the shore's CHARACTER.
export function colourFor(h, lat = 45, lon = 0, slope = 0, rock = 0, riverD = 1e9) {
  const aLat = Math.abs(lat);
  const [lo, hi] = shoreBand(aLat, rock, slope, riverD);
  if (h < -7) return DEEP;
  if (h < -5) return mix3(DEEP, lo, (h + 7) / 2);
  if (h < -0.6) return lo;
  if (h < -0.2) return mix3(lo, hi, (h + 0.6) / 0.4);
  if (h < 1.8) return hi;
  const up = upland(h, aLat, lon, lat);
  if (h < 2.6) return mix3(hi, up, (h - 1.8) / 0.8);
  return up;
}

export const RIVER_COLOUR = [0.2, 0.42, 0.52];

// positions (world-space), colours, ANALYTIC normals and triangle indices for
// chunk (cx, cz). Deterministic: same chunk, same mesh, every client
// (invariant 6). Fine (shore) chunks stitch their edges against coarse
// neighbours — odd edge vertices snap onto the coarse segment — so mixed
// resolutions never crack.
export function buildChunkData(cx, cz) {
  const res = chunkRes(cx, cz);
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  const n = res + 1;
  const step = CHUNK / res;
  const an = n + 2; // heights carry a one-vertex apron for the normals

  // rock is a trait of the COAST: riverbanks deep inland must never paint
  // as sea cliffs, so the character fades out past ~250 m from salt water
  // (one distance query per chunk — the falloff is regional, not per-vertex)
  const cc = worldToLatLon(x0 + CHUNK / 2, z0 + CHUNK / 2);
  const cd = coastDistGame(cc.lat, cc.lon);
  const t = Math.max(0, Math.min(1, (cd - 250) / 300));
  const coastFall = 1 - t * t * (3 - 2 * t);

  // heights over the apron grid (i, j in -1..n)
  const H = new Float32Array(an * an);
  for (let j = -1; j <= n; j++) {
    for (let i = -1; i <= n; i++) {
      const { lat, lon } = worldToLatLon(x0 + i * step, z0 + j * step);
      H[(j + 1) * an + (i + 1)] = elevation(lat, lon);
    }
  }

  // stitch fine edges to coarse neighbours: the odd vertices lie mid-segment
  if (res === RES_SHORE) {
    const snapCol = (i) => { // column i, odd j
      for (let j = 1; j < n - 1; j += 2) {
        const k = (j + 1) * an + (i + 1);
        H[k] = (H[k - an] + H[k + an]) / 2;
      }
    };
    const snapRow = (j) => { // row j, odd i
      for (let i = 1; i < n - 1; i += 2) {
        const k = (j + 1) * an + (i + 1);
        H[k] = (H[k - 1] + H[k + 1]) / 2;
      }
    };
    if (chunkRes(cx - 1, cz) === RES) snapCol(0);
    if (chunkRes(cx + 1, cz) === RES) snapCol(n - 1);
    if (chunkRes(cx, cz - 1) === RES) snapRow(0);
    if (chunkRes(cx, cz + 1) === RES) snapRow(n - 1);
  }

  const pos = new Float32Array(n * n * 3);
  const col = new Float32Array(n * n * 3);
  const nrm = new Float32Array(n * n * 3);
  let hasDry = false;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = x0 + i * step, z = z0 + j * step;
      const { lat, lon } = worldToLatLon(x, z);
      const h = H[(j + 1) * an + (i + 1)];
      if (h > -1.5) hasDry = true;
      const k = (j * n + i) * 3;
      pos[k] = x; pos[k + 1] = h; pos[k + 2] = z;
      // centred difference of the height field — the smooth analytic normal
      const dhdx = (H[(j + 1) * an + (i + 2)] - H[(j + 1) * an + i]) / (2 * step);
      const dhdz = (H[(j + 2) * an + (i + 1)] - H[j * an + (i + 1)]) / (2 * step);
      const inv = 1 / Math.hypot(dhdx, 1, dhdz);
      nrm[k] = -dhdx * inv; nrm[k + 1] = inv; nrm[k + 2] = -dhdz * inv;
      const riverD = riverDistGame(lat, lon);
      // the river tint marks the SHALLOW margin only — braided networks
      // (the Amazon) put a third of the bank within a polyline's reach, and
      // painting carved slopes teal read as ice cliffs, not water
      const c = (h > -0.4 && h < 1.2 && riverD < RIVER_HALF * 0.9)
        ? RIVER_COLOUR
        : colourFor(h, lat, lon, Math.hypot(dhdx, dhdz),
          coastCharacter(lat, lon) * coastFall, riverD);
      col[k] = c[0]; col[k + 1] = c[1]; col[k + 2] = c[2];
    }
  }
  const idx = [];
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  return { pos, col, nrm, idx, hasDry, res };
}
