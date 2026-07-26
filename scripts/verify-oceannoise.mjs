// verify-oceannoise: the water's decorative fbm must stay NOISE — everywhere on
// earth, in float32, for the whole of a long session (src/oceannoise.js).
//
// THIS GATE EXISTS BECAUSE ITS ABSENCE COST THREE INVESTIGATIONS. The east-west
// grating James reported was the ocean shader's own hash running out of float32
// mantissa at real play coordinates: the "noise" collapsed to a one-dimensional
// staircase locked to a world axis, at 0.4-0.7 m spacing. Two prose laws in
// ocean.js ("the detail is ISOTROPIC", "no periodic ripple fields") were being
// violated by the arithmetic itself, and prose cannot fail a build. The spatial
// probe that hunted it searched 1.2-80 m and never looked below a metre, so it
// was blind by construction; sea v2 rebuilt the entire wave model and the
// grating survived, because it was never in the waves.
//
// What is checked, in order:
//   1. PURITY + WIRING — the module is pure, the shader consumes the emitted
//      GLSL, and the dead hash is really gone from ocean.js.
//   2. THE SCALES ARE THE REAL ONES — every scale measured here is a scale
//      ocean.js actually asks the noise for.
//   3. DIMENSION — at play coordinates worldwide, at every one of those scales,
//      no single world axis may carry more than AXIS_MAX of the field's
//      variance and the field must keep a lattice's worth of distinct values.
//      This is the assertion the bug violated at 1.000 and 2 values.
//   4. MANTISSA HEADROOM — float32 must agree with float64 to a rounding. This
//      is the same check as 3 from the other side, and it is the one that would
//      have failed the DAY the noise was handed world coordinates.
//   5. CONTINUITY — the lattice wrap must not put a seam in the water.
//   6. STATISTICS PRESERVED — the fbm's mean and spread must still be the ones
//      the shader's smoothstep thresholds were tuned against, or the fix would
//      have silently retuned every whitecap in the game.
//   7. THE COUNTER-EXAMPLE — the OLD hash is re-run here and must FAIL check 3,
//      so this gate carries proof that it catches the thing it was built for.
import { readFileSync } from 'node:fs';
import { ONOISE, glslOceanNoise, makeOceanNoise, OCEAN_NOISE_SCALES } from '../src/oceannoise.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

const srcNoise = readFileSync(new URL('../src/oceannoise.js', import.meta.url), 'utf8');
const srcOcean = readFileSync(new URL('../src/ocean.js', import.meta.url), 'utf8');
const glsl = glslOceanNoise();

// ---- 1. purity and wiring ---------------------------------------------------
ok(!/from '(three|\.\/earthdata)/.test(srcNoise) && !/\b(document|window)\./.test(srcNoise),
  'oceannoise.js is pure — no THREE, no DOM');
ok(!/Math\.random/.test(srcNoise), 'no Math.random anywhere in the noise');
ok(/oH21/.test(glsl) && /oVnoise/.test(glsl) && /oFbm/.test(glsl), 'GLSL emits all three functions');
ok(glsl.includes(`* ${ONOISE.hashMul}`), 'the emitted GLSL carries ONOISE.hashMul');
ok(glsl.includes(`mod(i, ${ONOISE.wrap.toFixed(1)})`), 'the emitted GLSL carries ONOISE.wrap');
ok(/glslOceanNoise\(\)/.test(srcOcean) && /from '\.\/oceannoise\.js'/.test(srcOcean),
  'ocean.js consumes the emitted GLSL rather than inlining a hash');
ok(!/234\.34|435\.345/.test(srcOcean),
  'the dead float32-overrunning hash is gone from ocean.js');

// ---- 2. the scales under test are the shader's own --------------------------
for (const { scale, what } of OCEAN_NOISE_SCALES)
  ok(srcOcean.includes(`* ${scale}`), `ocean.js still uses the ${what} scale ${scale}`);

// ---- the instrument --------------------------------------------------------
const F32 = makeOceanNoise(Math.fround);
const F64 = makeOceanNoise((x) => x);

// How much of a lattice-sampled field's variance is carried by variation along
// ONE world axis alone? 1.000 means the field is a stripe pattern and has lost
// a dimension; isotropic noise sits near 1/N by chance.
const N = 96;
function dimension(fn, wx, wz, scale, tOff = 0) {
  const g = [];
  for (let j = 0; j < N; j++) {
    const row = [];
    for (let i = 0; i < N; i++)
      row.push(fn((wx + i / scale) * scale + tOff, (wz + j / scale) * scale + tOff * 0.64));
    g.push(row);
  }
  const all = g.flat();
  const mean = all.reduce((a, b) => a + b, 0) / all.length;
  const V = all.reduce((s, v) => s + (v - mean) ** 2, 0) / all.length;
  const rowM = g.map((r) => r.reduce((a, b) => a + b, 0) / N);
  const colM = Array.from({ length: N }, (_, i) => g.reduce((s, r) => s + r[i], 0) / N);
  const ew = rowM.reduce((s, v) => s + (v - mean) ** 2, 0) / N;
  const ns = colM.reduce((s, v) => s + (v - mean) ** 2, 0) / N;
  return {
    V,
    axis: V > 0 ? Math.max(ew, ns) / V : 1,
    distinct: new Set(all.map((v) => v.toFixed(6))).size,
  };
}

// M_PER_DEG is 444 (earth.js), so these are the real corners of the playable
// world plus the two places James reported the grating from.
const M_PER_DEG = 444;
const SPOTS = [
  ['origin 0N 0E', 0, 0],
  ['Channel 50.50N 1.16W', -1.16, 50.50],
  ['Indian Ocean 4.59S 72.96E', 72.96, -4.59],
  ['Caribbean 18N 77W', -77, 18],
  ['mid-Atlantic 44N 35W', -35, 44],
  ['Singapore 1N 104E', 104, 1],
  ['Cape Horn 56S 67W', -67, -56],
  ['antimeridian 0N 179E', 179, 0],
  ['far corner 89S 179W', -179, -89],
].map(([n, lon, lat]) => [n, lon * M_PER_DEG, -lat * M_PER_DEG]);

// the noise input also carries uTime (up to 1.1 per second at the sparkle
// scale), so a long session pushes the coordinate further out still
const SESSIONS = [['fresh', 0], ['10 h at sea', 36000 * 1.1]];

// ---- 3. DIMENSION, and the same field in float64 ---------------------------
// A hash is discontinuous by design, so comparing float32 against float64
// POINT BY POINT is meaningless: one bit of input rounding legitimately flips
// which lattice bucket a sample lands in, and the two fields then differ by
// O(1) at that point while both remain perfectly good noise. What must agree
// is the field's SHAPE — how many values it takes, how its variance is
// distributed over the two world axes, and its mean and spread. That is what
// collapsed to a staircase, and that is what is checked here.
const AXIS_MAX = 0.25;      // 1.000 was the bug; isotropic noise sits near 0.02
const DISTINCT_MIN = 3000;  // of 9216 lattice samples; the bug reached 2
let worstAxis = { a: 0 }, worstDist = { d: 1e9 }, worstShape = 0;
for (const [label, tOff] of SESSIONS) {
  for (const [name, wx, wz] of SPOTS) {
    for (const { scale, what } of OCEAN_NOISE_SCALES) {
      const fn = scale >= 1 ? F32.vnoise : F32.fbm; // the sub-metre lattices are
      const ref = scale >= 1 ? F64.vnoise : F64.fbm; // where the collapse bites
      const d = dimension(fn, wx, wz, scale, tOff);
      const r = dimension(ref, wx, wz, scale, tOff);
      const where = `${what} (scale ${scale}) at ${name}, ${label}`;
      ok(d.axis <= AXIS_MAX, `${where}: one axis carries ${d.axis.toFixed(3)} of the variance`);
      ok(d.distinct >= DISTINCT_MIN, `${where}: only ${d.distinct} distinct values`);
      // float32's variance must be float64's variance. A collapsing hash does
      // not merely move samples about, it changes how much the field VARIES —
      // the old one ran anywhere from 0.19x to 5x of the intended variance.
      const shape = r.V > 0 ? Math.abs(Math.log(d.V / r.V)) : 9;
      ok(shape < 0.22, `${where}: float32 variance ${d.V.toExponential(2)} vs float64`
        + ` ${r.V.toExponential(2)} — the field changed shape, not just phase`);
      if (d.axis > worstAxis.a) worstAxis = { a: d.axis, where };
      if (d.distinct < worstDist.d) worstDist = { d: d.distinct, where };
      worstShape = Math.max(worstShape, shape);
    }
  }
}

// ---- 4. MANTISSA HEADROOM, stated as arithmetic ----------------------------
// The two places float32 can run out, named and bounded rather than inferred.
const eps32 = (v) => {
  const a = Math.abs(Math.fround(v));
  if (a === 0) return 2 ** -149;
  return 2 ** (Math.floor(Math.log2(a)) - 23);
};
{
  // (a) the hash's own fract input. Bounded by the lattice wrap, so it is a
  //     constant of the code and not a function of where the player sails.
  const hashIn = ONOISE.wrap * ONOISE.hashMul;
  const levels = 1 / eps32(hashIn);
  ok(levels >= 4096, `the hash keeps ${Math.round(levels)} fract levels`
    + ` (input bounded by wrap*mul = ${hashIn.toFixed(1)})`);
  // (b) the cell fraction. This one DOES grow with the world: the biggest
  //     coordinate the shader can build is the widest scale times half the
  //     globe, plus the session clock's own drift term.
  const M_WORLD = 180 * M_PER_DEG;                 // half the world, east-west
  const maxScale = Math.max(...OCEAN_NOISE_SCALES.map((s) => s.scale));
  const maxCoord = maxScale * M_WORLD + 36000 * 1.1;
  const cellFrac = eps32(maxCoord);
  ok(cellFrac < 0.05, `the interpolation keeps the cell to ${(cellFrac * 100).toFixed(2)}%`
    + ` at the world's edge (coordinate ${maxCoord.toExponential(2)})`);
  // (c) the OLD hash, for the record: what the bound above is protecting.
  const oldIn = maxScale * M_WORLD * 435.345;
  ok(1 / eps32(oldIn) < 1, `the retired hash had NO fract levels left`
    + ` (input ${oldIn.toExponential(2)}, spacing ${eps32(oldIn)})`);
}

// ---- 5. the wrap must not put a seam in the water --------------------------
// The lattice period is ONOISE.wrap cells. Step across that boundary in tiny
// increments and the field must not jump: value noise wraps continuously only
// if both corners of every cell wrap the same way.
let worstJump = 0;
for (const base of [ONOISE.wrap, -ONOISE.wrap, ONOISE.wrap * 7]) {
  for (let k = -6; k <= 6; k++) {
    const a = F64.vnoise(base + k * 0.05, 12.7), b = F64.vnoise(base + (k + 1) * 0.05, 12.7);
    worstJump = Math.max(worstJump, Math.abs(a - b));
    const c = F64.vnoise(9.3, base + k * 0.05), e = F64.vnoise(9.3, base + (k + 1) * 0.05);
    worstJump = Math.max(worstJump, Math.abs(c - e));
  }
}
ok(worstJump < 0.12, `no seam at the lattice wrap (worst step ${worstJump.toFixed(4)})`);
ok(Math.abs(F64.vnoise(0.37, 0.61) - F64.vnoise(ONOISE.wrap + 0.37, ONOISE.wrap + 0.61)) < 1e-12,
  'the wrap is a true period, not an approximation');

// ---- 6. the statistics the shader's thresholds were tuned against ----------
// oFbm sums four octaves at gain 0.5 over a uniform hash, so its mean must sit
// at 0.5 * (1 + 1/2 + 1/4 + 1/8) / 2 = 0.469. Every smoothstep in the water
// shader (whitecap patches at 0.50/0.80 and 0.33/0.58, the chop patch, the
// churn rag) reads that distribution; move it and the sea silently retunes.
{
  const vals = [];
  for (let j = 0; j < 200; j++) for (let i = 0; i < 200; i++)
    vals.push(F32.fbm(1000.7 + i * 0.31, -2000.3 + j * 0.29));
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
  const lo = vals.reduce((a, b) => Math.min(a, b), Infinity);
  const hi = vals.reduce((a, b) => Math.max(a, b), -Infinity);
  ok(Math.abs(mean - 0.469) < 0.02, `oFbm mean ${mean.toFixed(4)} (want 0.469)`);
  ok(sd > 0.10 && sd < 0.22, `oFbm spread ${sd.toFixed(4)} in [0.10, 0.22]`);
  ok(lo > 0 && hi < 0.9376, `oFbm stays inside [0, 0.9375] (${lo.toFixed(3)} .. ${hi.toFixed(3)})`);
  const uni = [];
  for (let i = 0; i < 4000; i++) uni.push(F32.h21(i % 977, Math.floor(i / 977) * 13 + 5));
  const um = uni.reduce((a, b) => a + b, 0) / uni.length;
  ok(Math.abs(um - 0.5) < 0.03, `the hash is uniform (mean ${um.toFixed(4)})`);
}

// ---- 7. determinism --------------------------------------------------------
ok(F32.fbm(12.34, -56.78) === F32.fbm(12.34, -56.78), 'deterministic');
ok(F32.vnoise(-9e4, 3.3e4) === F32.vnoise(-9e4, 3.3e4), 'deterministic at world extremes');

// ---- 8. THE COUNTER-EXAMPLE ------------------------------------------------
// The hash that shipped until 2026-07-26, in float32, at the Channel. If this
// ever PASSES the dimension test the test has stopped working.
{
  const f = Math.fround;
  const fract = (x) => f(x - Math.floor(x));
  const oldH21 = (px, pz) => {
    let x = fract(f(px * 234.34)), z = fract(f(pz * 435.345));
    const d = f(f(x * f(x + 34.23)) + f(z * f(z + 34.23)));
    x = f(x + d); z = f(z + d);
    return fract(f(x * z));
  };
  const oldV = (px, pz) => {
    const ix = Math.floor(px), iz = Math.floor(pz);
    let fx = f(px - ix), fz = f(pz - iz);
    fx = f(f(fx * fx) * f(3 - 2 * fx)); fz = f(f(fz * fz) * f(3 - 2 * fz));
    const lo = f(oldH21(ix, iz) + f(f(oldH21(ix + 1, iz) - oldH21(ix, iz)) * fx));
    const hi = f(oldH21(ix, iz + 1) + f(f(oldH21(ix + 1, iz + 1) - oldH21(ix, iz + 1)) * fx));
    return f(lo + f(f(hi - lo) * fz));
  };
  const bug = dimension(oldV, -1.16 * M_PER_DEG, 50.50 * M_PER_DEG, 2.3);
  ok(bug.axis > 0.9 && bug.distinct < 200,
    `the gate catches the shipped bug (old hash at the Channel: axis ${bug.axis.toFixed(3)},`
    + ` ${bug.distinct} distinct values)`);
}

if (failed) { console.error(`verify-oceannoise: ${failed} FAILED`); process.exit(1); }
console.log(`verify-oceannoise: OK — the water's fbm keeps both dimensions at ${SPOTS.length} places`
  + ` on earth x ${OCEAN_NOISE_SCALES.length} scales x ${SESSIONS.length} session lengths;`
  + ` worst single-axis share ${worstAxis.a.toFixed(3)} (ceiling ${AXIS_MAX}),`
  + ` fewest distinct values ${worstDist.d},`
  + ` worst float32-vs-float64 variance ratio ${Math.exp(worstShape).toFixed(3)}x`);
