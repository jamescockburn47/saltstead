// The coast map — the shore field the shore-aware sea reads (waves.js).
// signedCoastGame (earth.js) baked into a small texture that follows the
// ship: R = signed coast distance in game metres (negative offshore,
// positive inland), clamped to ±CLAMP. The SAME Float32Array feeds a CPU
// bilinear sampler handed to waves.js setShoreSampler, so the hull's
// buoyancy and the drawn surface read one field — the parity doctrine.
//
// Baking is amortized: ROWS_PER_UPDATE rows of signedCoastGame per frame
// into a back buffer, swapped whole when complete (the live field never
// shows a half-baked seam). The bilinear 20 m texel is a feature, not a
// compromise — it rounds the quantized coastline polylines into the smooth
// field the shore-parallel wavefronts want to ride.

import * as THREE from 'three';
import { signedCoastGame, worldToLatLon } from './earth.js';

export const COASTMAP_METRES = 2560; // world metres the map covers
const N = 128;                       // texels per side (20 m/texel)
const CLAMP = 1200;                  // metres past this read as pure blue water
const ROWS_PER_UPDATE = 8;
const FAR = 1e9;                     // uv centre parked here = no field yet

export class CoastMapLayer {
  constructor(x, z) {
    this.texel = COASTMAP_METRES / N;
    this.field = null;                       // active Float32Array, row-major
    this.center = new THREE.Vector2();       // active field's centre
    this.uvCenter = new THREE.Vector2(FAR, FAR); // what the shader gets
    this.half = new Uint16Array(N * N);
    this.texture = new THREE.DataTexture(
      this.half, N, N, THREE.RedFormat, THREE.HalfFloatType);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.needsUpdate = true;
    this.pending = { cx: this.snap(x), cz: this.snap(z), row: 0, field: new Float32Array(N * N) };
    // the CPU twin of the shader's texture2D: bilinear over the active field
    this.sampler = (sx, sz) => this.sample(sx, sz);
  }

  snap(v) { return Math.round(v / this.texel) * this.texel; }

  // world position of texel (i, j)'s centre — matches texture2D's footprint
  texelWorld(cx, cz, i, j) {
    return {
      x: cx + ((i + 0.5) / N - 0.5) * COASTMAP_METRES,
      z: cz + ((j + 0.5) / N - 0.5) * COASTMAP_METRES,
    };
  }

  update(x, z) {
    if (!this.pending) {
      const far = Math.max(Math.abs(x - this.center.x), Math.abs(z - this.center.y));
      if (far > COASTMAP_METRES / 4) {
        this.pending = { cx: this.snap(x), cz: this.snap(z), row: 0, field: new Float32Array(N * N) };
      }
      return;
    }
    const p = this.pending;
    const rows = Math.min(ROWS_PER_UPDATE, N - p.row);
    for (let r = 0; r < rows; r++, p.row++) {
      for (let i = 0; i < N; i++) {
        const w = this.texelWorld(p.cx, p.cz, i, p.row);
        const ll = worldToLatLon(w.x, w.z);
        const d = signedCoastGame(ll.lat, ll.lon);
        p.field[p.row * N + i] = Math.max(-CLAMP, Math.min(CLAMP, d));
      }
    }
    if (p.row >= N) {
      // swap whole: the live field and texture change together
      this.field = p.field;
      this.center.set(p.cx, p.cz);
      this.uvCenter.set(p.cx, p.cz);
      for (let k = 0; k < N * N; k++) this.half[k] = THREE.DataUtils.toHalfFloat(p.field[k]);
      this.texture.needsUpdate = true;
      this.pending = null;
    }
  }

  // bilinear read of the active field at world (x, z) — null outside it
  bilinear(x, z) {
    const fi = ((x - this.center.x) / COASTMAP_METRES + 0.5) * N - 0.5;
    const fj = ((z - this.center.y) / COASTMAP_METRES + 0.5) * N - 0.5;
    const i0 = Math.floor(fi), j0 = Math.floor(fj);
    if (i0 < 0 || j0 < 0 || i0 >= N - 1 || j0 >= N - 1) return null;
    const tx = fi - i0, tz = fj - j0;
    const F = this.field;
    const a = F[j0 * N + i0], b = F[j0 * N + i0 + 1];
    const c = F[(j0 + 1) * N + i0], d = F[(j0 + 1) * N + i0 + 1];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  }

  sample(x, z) {
    if (!this.field) return null;
    const d = this.bilinear(x, z);
    if (d === null) return null;
    // landward unit gradient by central difference of the bilinear field
    const h = this.texel / 2;
    const dxp = this.bilinear(x + h, z), dxm = this.bilinear(x - h, z);
    const dzp = this.bilinear(x, z + h), dzm = this.bilinear(x, z - h);
    if (dxp === null || dxm === null || dzp === null || dzm === null) return null;
    let gx = dxp - dxm, gz = dzp - dzm;
    const len = Math.hypot(gx, gz);
    if (len > 1e-6) { gx /= len; gz /= len; } else { gx = 0; gz = 0; }
    return { d, gx, gz };
  }
}
