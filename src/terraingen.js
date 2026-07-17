// Terrain chunk generation — pure, no THREE, no DOM. verify-terraingen.mjs
// guards it. A chunk is a low-poly heightfield sampled from the Earth module,
// coloured by height: seabed shallows, wet sand, dune grass, moor, crag.

import { elevation, worldToLatLon, coastDistGame, riverDistGame, isLand, RIVER_HALF } from './earth.js';
import { fbm2 } from './noise.js';

export const CHUNK = 96;   // metres square
export const RES = 16;     // quads per side (17x17 verts)

// deep-WATER chunks are skipped entirely — 99% of the planet costs nothing.
// Land always builds, however far inland: a ship up a river must see ground,
// not the ocean plane showing through an unbuilt chunk.
export function chunkWorthBuilding(cx, cz) {
  const half = CHUNK / 2;
  const { lat, lon } = worldToLatLon(cx * CHUNK + half, cz * CHUNK + half);
  return coastDistGame(lat, lon) < CHUNK * 2.2 || isLand(lat, lon);
}

// height + latitude -> flat-shaded biome palette (RGB 0..1). Deterministic.
export function colourFor(h, lat = 45, lon = 0) {
  if (h < -6) return [0.13, 0.25, 0.33];   // deep shelf
  if (h < -0.4) return [0.72, 0.68, 0.5];  // shallows / drying sand
  if (h < 2.2) return [0.83, 0.76, 0.55];  // beach
  const aLat = Math.abs(lat);
  // snow: polar always; elsewhere the snowline drops as latitude climbs
  const snowline = Math.max(6, 60 - (aLat - 40) * 1.6);
  if (aLat > 66 || h > snowline) return [0.92, 0.93, 0.95];
  // desert belts (~15-33 deg), noise-broken so edges aren't stripes
  if (aLat > 14 && aLat < 34 && h < 26 && fbm2(lon * 0.6 + 9, lat * 0.6) > 0.42) {
    return [0.78, 0.66, 0.44];
  }
  if (h < 9) return aLat < 28 ? [0.3, 0.55, 0.26] : [0.38, 0.52, 0.28]; // tropics greener
  if (h < 24) return [0.42, 0.44, 0.3];    // moor
  return [0.52, 0.5, 0.47];                // crag
}

export const RIVER_COLOUR = [0.2, 0.42, 0.52];

// positions (world-space), RGBA-free colours, and triangle indices for chunk
// (cx, cz). Deterministic: same chunk, same mesh, every client (invariant 6).
export function buildChunkData(cx, cz) {
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  const n = RES + 1;
  const pos = new Float32Array(n * n * 3);
  const col = new Float32Array(n * n * 3);
  let hasDry = false;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = x0 + (i / RES) * CHUNK, z = z0 + (j / RES) * CHUNK;
      const { lat, lon } = worldToLatLon(x, z);
      const h = elevation(lat, lon);
      if (h > -1.5) hasDry = true;
      const k = (j * n + i) * 3;
      pos[k] = x; pos[k + 1] = h; pos[k + 2] = z;
      const c = (h > -0.4 && riverDistGame(lat, lon) < RIVER_HALF * 0.9)
        ? RIVER_COLOUR : colourFor(h, lat, lon);
      col[k] = c[0]; col[k + 1] = c[1]; col[k + 2] = c[2];
    }
  }
  const idx = [];
  for (let j = 0; j < RES; j++) {
    for (let i = 0; i < RES; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  return { pos, col, idx, hasDry };
}
