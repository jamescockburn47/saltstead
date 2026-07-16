// Terrain chunk generation — pure, no THREE, no DOM. verify-terraingen.mjs
// guards it. A chunk is a low-poly heightfield sampled from the Earth module,
// coloured by height: seabed shallows, wet sand, dune grass, moor, crag.

import { elevation, worldToLatLon, coastDistGame } from './earth.js';

export const CHUNK = 96;   // metres square
export const RES = 16;     // quads per side (17x17 verts)

// deep-water chunks are skipped entirely — 99% of the planet costs nothing
export function chunkWorthBuilding(cx, cz) {
  const half = CHUNK / 2;
  const { lat, lon } = worldToLatLon(cx * CHUNK + half, cz * CHUNK + half);
  return coastDistGame(lat, lon) < CHUNK * 2.2;
}

// height -> flat-shaded palette (RGB 0..1)
export function colourFor(h) {
  if (h < -6) return [0.13, 0.25, 0.33];   // deep shelf
  if (h < -0.4) return [0.72, 0.68, 0.5];  // shallows / drying sand
  if (h < 2.2) return [0.83, 0.76, 0.55];  // beach
  if (h < 9) return [0.38, 0.52, 0.28];    // grass
  if (h < 20) return [0.42, 0.44, 0.3];    // moor
  return [0.52, 0.5, 0.47];                // crag
}

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
      const c = colourFor(h);
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
