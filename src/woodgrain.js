// Procedural plank/wood-grain pixels — pure, no THREE, no DOM, no assets.
// verify-wood.mjs guards it. ship.js wraps the bytes in a THREE.DataTexture.
//
// The look: planks running along U, each with its own tone drawn from a small
// palette spread, long grain streaks inside the plank, dark caulked seams
// between planks, and the odd knot. Deterministic for a given seed
// (invariant 6: same ship on every client).

import { hash2f, valueNoise2 } from './noise.js';

// clamp helper, bytes stay bytes
const b = (v) => Math.max(0, Math.min(255, Math.round(v)));

export const SEAM_DARK = 0.55;   // seams sit at ~55% of the plank tone

// base: [r,g,b] 0..255. Returns { w, h, data: Uint8Array (w*h*4, RGBA) } —
// four channels because that's what THREE.DataTexture wants since r137.
// Planks run along x (U); nPlanks bands across y (V).
export function woodPixels({
  w = 128, h = 64, nPlanks = 8, seed = 7,
  base = [110, 74, 47], vary = 0.16, grain = 0.10,
} = {}) {
  const data = new Uint8Array(w * h * 4);
  const plankH = h / nPlanks;
  for (let y = 0; y < h; y++) {
    const p = Math.floor(y / plankH);              // which plank
    const fy = y / plankH - p;                     // 0..1 inside the plank
    // per-plank tone + a stagger so grain doesn't line up across seams
    const tone = 1 + (hash2f(seed * 31 + p, seed) - 0.5) * 2 * vary;
    const shift = hash2f(seed, seed * 17 + p) * 64;
    const seam = fy < 0.10 || fy > 0.90;           // caulking at plank edges
    for (let x = 0; x < w; x++) {
      // grain: noise stretched hard along the plank, wobbling with y
      const g = valueNoise2((x + shift) * 0.35, (p * 7.3 + fy * 2.2) + seed);
      const streak = 1 + (g - 0.5) * 2 * grain;
      // knots: rare dark pips
      const kn = hash2f(Math.floor((x + shift) / 9), seed * 13 + p * 5 + Math.floor(fy * 3));
      const knot = kn > 0.985 ? 0.72 : 1;
      let k = tone * streak * knot;
      if (seam) k *= SEAM_DARK;
      const i = (y * w + x) * 4;
      data[i] = b(base[0] * k);
      data[i + 1] = b(base[1] * k);
      data[i + 2] = b(base[2] * k);
      data[i + 3] = 255;
    }
  }
  return { w, h, data };
}

// mean brightness of a horizontal stripe [y0, y1) — used by the verify script
// and handy for tuning
export function stripeMean({ w, data }, y0, y1) {
  let s = 0, n = 0;
  for (let y = y0; y < y1; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      s += (data[i] + data[i + 1] + data[i + 2]) / 3; n++;
    }
  return s / n;
}
