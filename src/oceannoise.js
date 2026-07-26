// THE OCEAN'S DECORATIVE NOISE — pure module, no THREE, no DOM. One source of
// truth for the fbm the water shader uses to break up its own analytic
// surface: the GLSL the GPU compiles is EMITTED from here, and the float32
// twins below are the gate's instrument (verify-oceannoise.mjs).
//
// ============================ WHY THIS MODULE EXISTS ============================
// It was extracted from ocean.js on 2026-07-26 because the noise that lived
// inlined there was BROKEN EVERYWHERE EXCEPT THE GULF OF GUINEA, and had been
// since the Marsstead port. This is the east-west grating three
// investigations failed to localise.
//
// The old hash was the family one-liner:
//     fract(p * vec2(234.34, 435.345)); p += dot(p, p + 34.23); fract(p.x*p.y)
// fed the RAW WORLD LATTICE INDEX. Play happens 15-80 km from the world origin
// (M_PER_DEG is 444, so one degree of longitude is 444 game metres), and at the
// noise scales the water uses — 2.3, 1.9 and 1.35 per metre — the lattice index
// reaches 5e4 to 2e5. Multiply that by 234 or 435 and the product lands between
// 2^23 and 2^25, where a float32 has NO FRACTIONAL BITS LEFT: `fract` returns a
// value quantised to a handful of levels, and past 2^24 it returns exactly zero.
//
// The failure is not a loss of quality, it is a change of DIMENSION. When one
// channel's fract collapses, `dot(p, p + 34.23)` makes the hash a function of
// the surviving channel alone, so the "noise" becomes a one-dimensional
// staircase locked to a world axis. Measured (float32 emulation, 96x96 lattice
// cells, all three sub-metre scales):
//
//   world origin 0N 0E     ~5,900 distinct values, 1-2% of variance on an axis
//   Channel 50.5N 1.16W        54 distinct values, 100% of variance on ONE axis
//   Indian Ocean 4.6S 73E      16 distinct values, 100% on the other axis
//   Caribbean 18N 77W           4 distinct values, 100% on one axis
//   mid-Atlantic 44N 35W        2 distinct values, 100% on one axis
//
// Which axis dies first is set by which multiplier is bigger: the z channel
// (435.345) loses its last bit past |lat| ~19 deg, the x channel (234.34) past
// |lon| ~35 deg. So the visible grating runs NORTH-SOUTH in European latitudes
// on the prime meridian and EAST-WEST in the tropics far from it — and where
// both channels are dead the ocean has no detail normals and no whitecaps at
// all. Confirmed in pixels by scripts/live-grating.mjs: axis-locked sub-metre
// filament amplitude 0.39 luminance counts at the origin, 12.24 in the Channel
// (north-south lines), 4.09 in the Indian Ocean (east-west lines), with the
// detail-normal path carrying essentially the whole of it.
//
// Sea v2 rebuilt the entire wave model to a LOCAL FRAME for exactly this
// reason — "k.p reaches 1e5 radians; a GPU float carries ~7 digits" — and the
// grating survived the rebuild untouched, because nobody carried the lesson
// across to the decorative noise. Hence: same lesson, same fix, and now a gate.
//
// ============================ THE FIX ============================
// Two independent halves, because either alone leaves a margin:
//   1. THE LATTICE INDEX IS WRAPPED to WRAP cells before it is hashed. Value
//      noise stays exactly continuous under this (both corners of every cell
//      wrap the same way, and cell WRAP-1's right corner IS cell 0's left one),
//      so the field simply becomes periodic — and the hash's input is bounded
//      by WRAP for every coordinate the earth can hand it, whatever the
//      longitude and whatever the session clock.
//   2. THE HASH USES A SMALL MULTIPLIER (0.1031, the hash-without-sine
//      family) instead of 234/435, so even the wrapped maximum leaves ~17 bits
//      of fraction where the old one left none.
// Plus a per-octave ROTATION in the fbm, so the four octaves' lattices do not
// stack on the same world axes — the residual anisotropy of any value noise is
// axis-aligned by construction, and stacking four octaves on it was compounding
// the very thing that went wrong.
//
// The period is deliberately long: WRAP cells is 445 m at the sparkle scale,
// 758 m at the detail scale, tens of kilometres for the patch masks, and the
// per-octave rotation means the octaves' periods are not commensurate, so
// nothing repeats visibly.

export const ONOISE = {
  hashMul: 0.1031,      // small enough that a wrapped index keeps its fraction
  hashAdd: 33.33,
  wrap: 1024,           // lattice period in CELLS — a power of two, so the
                        // wrap itself is exact in float32 at any magnitude
  octaves: 4,
  gain: 0.5,
  lacunarity: 2.03,
  // per-octave turn: (cos, sin) of ~36.87 deg. Determinant is exactly 1
  // (0.8^2 + 0.6^2), so no octave silently gains or loses scale.
  rotC: 0.8, rotS: 0.6,
};

// The GLSL the ocean shader inlines. Names are o-prefixed against chunk
// collisions, exactly as the inlined version was. Every number comes from
// ONOISE above, so the emitted shader and the twins below cannot drift.
export function glslOceanNoise() {
  const { hashMul, hashAdd, wrap, octaves, gain, lacunarity, rotC, rotS } = ONOISE;
  return /* glsl */`
  // hash-without-sine over a WRAPPED lattice index: the whole float32 fix
  float oH21(vec2 p){ vec3 q = fract(vec3(p.x, p.y, p.x) * ${hashMul});
    q += dot(q, q.yzx + ${hashAdd.toFixed(2)}); return fract((q.x + q.y) * q.z); }
  float oVnoise(vec2 p){ vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    vec2 a = mod(i, ${wrap.toFixed(1)}), b = mod(i + 1.0, ${wrap.toFixed(1)});
    return mix(mix(oH21(a), oH21(vec2(b.x, a.y)), f.x),
               mix(oH21(vec2(a.x, b.y)), oH21(b), f.x), f.y); }
  float oFbm(vec2 p){ float a = ${gain}, s = 0.;
    for (int i = 0; i < ${octaves}; i++){ s += a * oVnoise(p);
      p = vec2(${rotC} * p.x + ${rotS} * p.y, ${-rotS} * p.x + ${rotC} * p.y) * ${lacunarity};
      a *= ${gain}; }
    return s; }
`;
}

// ---- the twins ---------------------------------------------------------------
// ONE implementation, two precisions. `makeOceanNoise(Math.fround)` is what the
// GPU does; `makeOceanNoise((x) => x)` is what the maths INTENDS. The gate holds
// them against each other: if float32 ever drifts from float64 by more than a
// rounding, the shader has lost its mantissa somewhere and the sea is about to
// grow a grating. Nothing at runtime calls these — the GPU has the GLSL.
export function makeOceanNoise(r) {
  const { hashMul, hashAdd, wrap, octaves, gain, lacunarity, rotC, rotS } = ONOISE;
  const fract = (x) => r(x - Math.floor(x));
  const h21 = (px, pz) => {
    let qx = fract(r(px * hashMul)), qy = fract(r(pz * hashMul)), qz = qx;
    const d = r(r(qx * r(qy + hashAdd)) + r(r(qy * r(qz + hashAdd)) + r(qz * r(qx + hashAdd))));
    qx = r(qx + d); qy = r(qy + d); qz = r(qz + d);
    return fract(r(r(qx + qy) * qz));
  };
  const wrapI = (v) => r(v - wrap * Math.floor(v / wrap));
  const vnoise = (px, pz) => {
    const ix = Math.floor(px), iz = Math.floor(pz);
    let fx = r(px - ix), fz = r(pz - iz);
    fx = r(r(fx * fx) * r(3 - 2 * fx)); fz = r(r(fz * fz) * r(3 - 2 * fz));
    const ax = wrapI(ix), az = wrapI(iz);
    const bx = wrapI(ix + 1), bz = wrapI(iz + 1);
    const lo = r(h21(ax, az) + r(r(h21(bx, az) - h21(ax, az)) * fx));
    const hi = r(h21(ax, bz) + r(r(h21(bx, bz) - h21(ax, bz)) * fx));
    return r(lo + r(r(hi - lo) * fz));
  };
  const fbm = (px, pz) => {
    let a = gain, s = 0, x = px, z = pz;
    for (let i = 0; i < octaves; i++) {
      s = r(s + r(a * vnoise(x, z)));
      const nx = r(r(rotC * x) + r(rotS * z)), nz = r(r(-rotS * x) + r(rotC * z));
      x = r(nx * lacunarity); z = r(nz * lacunarity);
      a = r(a * gain);
    }
    return s;
  };
  return { h21, vnoise, fbm };
}

// The noise scales the water actually asks for, so the gate measures the field
// the water uses rather than a field of the gate's own choosing. Keep in step
// with the shader body (verify-oceannoise asserts every one of them appears in
// src/ocean.js OR in the GLSL glitter.js emits into it).
//
// EVERY SCALE HERE IS A FIXED WORLD SCALE, and that is not an accident — it is
// the lesson of a cold review. A lattice whose cell is sized PER PIXEL aliases
// catastrophically away from the origin for reasons that have nothing to do with
// float32: the screen gradient of W/c carries a term in |W|, which at seventeen
// kilometres out turns a "five-pixel cell" into a one-pixel random sample. Range
// is spent as a CROSS-FADE between fixed levels instead, so every lattice the
// shader can ask for is a constant and can be listed and bounded here. 4 per
// metre is the ceiling check 4(b) allows: the widest coordinate the earth can
// hand the hash is then 3.2e5, where a float32 step is 3% of a cell.
//
// THE GLINT LATTICE IS GONE FROM THIS TABLE (2026-07-26, second pass) and that
// is the point: the sun's road is no longer made of noise at all. Its glints are
// the reflection taken against the drawn surface's own normal, so there is
// nothing here to bound — see glitter.js oGlGlint.
export const OCEAN_NOISE_SCALES = [
  { scale: 4.0, what: 'near lace', find: 'GLITTER.ragNear', konst: 'ragNear' },
  { scale: 1.9, what: 'churn rag', find: 'GLITTER.ragFar', konst: 'ragFar' },
  { scale: 1.35, what: 'detail ripple, fine band' },
  { scale: 0.42, what: 'detail chop, fine band' },
  { scale: 0.28, what: 'gale windrow, across the wind' },
  { scale: 0.045, what: 'far-field band' },
  { scale: 0.021, what: 'chop patch' },
  { scale: 0.02, what: 'gale windrow, along the wind' },
  { scale: 0.013, what: 'whitecap broad mask' },
  { scale: 0.012, what: 'far-field broad band' },
];
