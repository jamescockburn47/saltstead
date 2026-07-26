// verify-glitter: the sun's and the moon's road on the water (src/glitter.js),
// and the light direction the whole of it hangs on (src/lightrig.js).
//
// TWO FAULTS ARE GATED HERE, both of which shipped:
//
//  1. THE WATER WAS LIT FROM THE WRONG SUN. ocean.js rebuilt the source's world
//     direction from a scalar — y = clamp((1 - glit.low)/1.15, 0.04, 1) — and
//     that reconstruction has a hard elevation ceiling of asin(1/1.15) = 60.41
//     degrees, because `low` saturates at 0. Measured over a full cycle the
//     rebuilt sun stood 29.6 degrees from the real one at noon, and the 0.04
//     floor held it 2.3 degrees ABOVE the horizon while the real sun was up to
//     4.3 below. The sparkle pass and the scene's own DirectionalLight were
//     therefore two different suns. Check 2 holds the agreement at zero and
//     re-runs the retired arithmetic as a counter-example that must fail.
//
//  2. THE LOBE WAS A MIRROR. pow(dot(reflect(-V,N), sun), 260.0) is
//     half-maximum at 2.09 degrees of facet tilt. A 10 degree source asks for
//     5 degrees of tilt at the horizon and a real sea's per-axis slope sd is
//     0.16 rad — so the corridor was never drawn and the reflection had to be
//     hunted for with the camera. Checks 3-6 hold the replacement: its
//     roughness against Cox & Munk's published sun-glitter measurements, its
//     width monotone in sea state, and the corridor's SHAPE — long down the
//     source's azimuth, narrow across it, and far brighter at a low source
//     than a high one.
//
// Everything measured here is pure arithmetic. scripts/live-glitter.mjs is the
// other half: it measures the same phenomenon in pixels, from the player's own
// default camera, in a real browser.
import { readFileSync } from 'node:fs';
import {
  GLITTER, SIGMA_REF, MIRROR_EXP, belowFrac, coxMunkVar, sigmaFor, sigmaFull,
  footprint, lobe, glintSplit, glintOf,
  fresnelWater, pathValue, glslGlitter,
  ragNearness, ragOf, shredOf, thickOf, raftOf,
} from '../src/glitter.js';
import { makeOceanNoise } from '../src/oceannoise.js';
import { glitterSource, moonBrightness } from '../src/lightrig.js';
import { solarState, lunarState, moonPhase, DAY_LENGTH, MOON_MONTH_DAYS } from '../src/skymath.js';
import {
  COMPONENTS, SWELL_LEN, GRAD_BANDS,
  setSeaBands, setWaveAxes, setWaveOrigin, waveAxisFor, waveGradient,
} from '../src/waves.js';
import { seaBandsFor } from '../src/weather.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };
const DEG = 180 / Math.PI;
// the three-vector arithmetic section 8 needs to rebuild the shader's own frames
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const n = Math.hypot(...a) || 1; return a.map((q) => q / n); };
const clampT = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
// carried out of the corridor checks so the closing line quotes what was
// measured rather than what was expected
let offBearing = 0, litSpan = [0, 0];

const srcGlit = readFileSync(new URL('../src/glitter.js', import.meta.url), 'utf8');
const srcOcean = readFileSync(new URL('../src/ocean.js', import.meta.url), 'utf8');
const srcLight = readFileSync(new URL('../src/lightrig.js', import.meta.url), 'utf8');
const glsl = glslGlitter();

// ---- 1. purity and wiring ---------------------------------------------------
ok(!/from '(three|\.\/earthdata)/.test(srcGlit) && !/\b(document|window)\./.test(srcGlit),
  'glitter.js is pure — no THREE, no DOM');
ok(!/Math\.random/.test(srcGlit) && !/Math\.random/.test(srcLight), 'no Math.random in either module');
ok(/glslGlitter\(\)/.test(srcOcean) && /from '\.\/glitter\.js'/.test(srcOcean),
  'ocean.js consumes the emitted GLSL rather than inlining a lobe');
ok(!/pow\(max\(dot\(oR, uSunDirW\)/.test(srcOcean),
  'the retired pow(...,260) mirror is gone from ocean.js');
ok(!/\(1 - glit\.low\)/.test(srcOcean) && !/glit\.ax|glit\.az/.test(srcOcean),
  'ocean.js no longer synthesises a direction out of glit.low / glit.ax / glit.az');
ok(/glit\.dir/.test(srcOcean), 'ocean.js takes the source direction whole');
for (const fn of ['oGlBelow', 'oGlSigma', 'oGlSigmaFull', 'oGlLobe', 'oGlFresnel',
  'oGlFoot', 'oGlSplit', 'oGlGlint',
  'oGlRagNear', 'oGlRag', 'oGlShred', 'oGlThick', 'oGlRaft'])
  ok(glsl.includes(`float ${fn}(`) || glsl.includes(`vec2 ${fn}(`), `GLSL emits ${fn}`);
// ocean.js still prepends oceannoise's GLSL first — the lace and the detail
// bands read oFbm — but THE GLITTER PATH ITSELF NO LONGER READS ANY NOISE AT ALL.
// That is the appearance fix, stated structurally: the road's discreteness comes
// from the drawn surface, so a thresholded lattice cannot creep back into it.
ok(/O_FBM \+ glslGlitter\(\)/.test(srcOcean),
  "ocean.js emits oceannoise's GLSL first (the lace and the detail bands need it)");
ok(!/oVnoise\s*\(|oFbm\s*\(|fract\s*\(/.test(glsl.replace(/\/\/[^\n]*/g, '')),
  'and the emitted glitter GLSL reads NO noise: the glints are geometry, not texture');
// the emitted shader must carry the module's own numbers, not a copy of them.
// (The parity check below subsumes this, but a missing constant is worth its own
// named failure rather than an opaque numeric mismatch.)
const num17 = (v) => {
  const s = Number(v).toPrecision(17);
  return /[.eE]/.test(s) ? s : `${s}.0`;
};
for (const [name, v] of [
  ['coxA', GLITTER.coxA], ['coxB', GLITTER.coxB],
  ['swellVar', GLITTER.swellVar], ['windVar', GLITTER.windVar],
  ['swellA', GLITTER.swellA], ['windA', GLITTER.windA],
  ['energyCap', GLITTER.energyCap], ['tailK', GLITTER.tailK],
  ['maxFoot', GLITTER.maxFoot], ['minGraze', GLITTER.minGraze],
  ['tailW', GLITTER.tailW],
  ['glintSigma', GLITTER.glintSigma], ['glintFloor', GLITTER.glintFloor],
]) ok(glsl.includes(num17(v)), `the emitted GLSL carries GLITTER.${name} (${num17(v)})`);
for (const [name, v] of [
  ['gain', GLITTER.gain], ['clamp', GLITTER.clamp], ['foamSigma', GLITTER.foamSigma],
  ['foamBack', GLITTER.foamBack], ['foamFwd', GLITTER.foamFwd],
  ['ragFar', GLITTER.ragFar],
  ['ragNear', GLITTER.ragNear], ['foamRelief', GLITTER.foamRelief],
  ['foamFlat', GLITTER.foamFlat], ['detailSd', GLITTER.detailSd],
]) ok(srcOcean.includes(`GLITTER.${name}`), `ocean.js reads GLITTER.${name} rather than a literal`);
// EVERY PAINTED-ON SPARKLE THIS FILE HAS RETIRED MUST STAY RETIRED. Two of them
// now: the distance-faded smooth twinkle (a world-locked 0.435 m lattice at a
// fixed contrast — the searchlight streak), and the thresholded two-lattice
// "shatter" that replaced it (texture on a smooth function, with a duty constant
// that knew nothing about the light or the water).
ok(!/twNear|twFar|twFade/.test(srcOcean) && !/twNear|twFar|twFade/.test(srcGlit),
  'the retired distance-faded smooth twinkle is gone from both files');
ok(!/oVnoise\(vWPos\.xz \* 2\.3/.test(srcOcean),
  'and its world-locked 2.3-per-metre lattice with it');
ok(!/\b(sparkDuty|sparkFloor|sparkNear|sparkFar|sparkLo|sparkHi|sparkOct|sparkPx|sparkDrift|sparkOn0|SPARK_GAIN|sparkField|sparkAt|twinkleAt|oGlSpark|oGlTwinkle)\b/
  .test(srcGlit + srcOcean),
  'and the noise-lattice shatter that followed it — not one of its constants,'
  + ' functions or call sites survives in either file');
ok(srcOcean.includes(`GLITTER.plainCut`) && srcOcean.includes('uWaveLOD > 0.5'),
  'the plain tier widens its own glint by the components it does not draw');
ok(srcOcean.includes('GLITTER.plainScale'),
  'the plain tier keeps a share of the corridor rather than parking it at 0');
// the plain cutoff must BE the shading LOD's own band boundary, not a number
// that happens to resemble it — uWaveLOD 0 drops exactly the components below
// GRAD_BANDS.mid from oWaveGradShort, and those are the ones the lobe inherits
ok(GLITTER.plainCut === GRAD_BANDS.mid,
  `the plain tier's lobe cutoff IS waves.js's shading band boundary`
  + ` (${GLITTER.plainCut} vs ${GRAD_BANDS.mid})`);
ok(sigmaFor(GLITTER.plainCut, 1.54, 1.05) > sigmaFor(0.5, 1.54, 1.05),
  'and it really does widen the plain lobe over the fine one at close range');

// ---- 1b. THE ARITHMETIC, NOT JUST THE CONSTANTS -----------------------------
// THIS IS THE CHECK THAT MAKES THE PARITY CLAIM A PARITY GATE. Everything above
// is a string search, and a string search cannot tell that oGlLobe has swapped
// sigA for sigB, dropped its Jacobian, or turned exp(-0.5*q) into exp(-q) — the
// shader would draw a different sea from the one the rest of this file proves
// things about, and every check would still pass. So: transliterate the emitted
// GLSL's own text into JavaScript and hold it against the twins numerically.
//
// The transliteration is deliberately narrow and it FAILS LOUD. Every emitted
// function is scalar arithmetic over max/min/clamp/log/exp/sqrt, all of which
// map 1:1 onto Math.*; if the emitted body ever grows a construct the rules
// below do not cover, the leftover-token assertion catches it and this gate goes
// red rather than quietly measuring nothing.
// the transliteration's own vocabulary, kept in one place because the mutants
// below have to speak it too
const F64NOISE = makeOceanNoise((x) => x);
const HELPERS = {
  __clamp: (x, a, b) => Math.min(Math.max(x, a), b),
  __v2: (a, b) => [a, b],
  __ss: (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); },
  __mix: (a, b, t) => a + (b - a) * t,
};
const translate = (text) => {
  let s = text.replace(/\/\/[^\n]*/g, '');            // comments first
  // signatures: strip the return type and the parameter types
  s = s.replace(/(?:float|vec2|vec3)\s+(oGl\w+)\s*\(([^)]*)\)\s*\{/g,
    (_, name, params) => `function ${name}(${params.split(',')
      .map((p) => p.trim().split(/\s+/).pop()).join(', ')}) {`);
  s = s.replace(/\bvec2\s*\(/g, '__v2(')              // vec2(a, b) -> [a, b]
    .replace(/\bfloat\s+/g, 'let ')                   // locals
    .replace(/\bh\.x\b/g, 'h[0]').replace(/\bh\.y\b/g, 'h[1]').replace(/\bh\.z\b/g, 'h[2]')
    .replace(/\bm\.x\b/g, 'm[0]').replace(/\bm\.y\b/g, 'm[1]').replace(/\bm\.z\b/g, 'm[2]')
    .replace(/\bclamp\s*\(/g, '__clamp(')
    .replace(/\bsmoothstep\s*\(/g, '__ss(')
    .replace(/\bmix\s*\(/g, '__mix(')
    .replace(/\b(max|min|log|exp|sqrt|abs|pow|atan|floor)\s*\(/g, 'Math.$1(');
  return s;
};
const compile = (s, names) => // eslint-disable-next-line no-new-func
  new Function(...Object.keys(HELPERS), `${s}\nreturn { ${names.join(', ')} };`)(
    ...Object.values(HELPERS));
const jsTwins = (() => {
  const s = translate(glsl);
  // nothing GLSL-only may survive, or the transliteration has stopped covering
  // what is being emitted
  const leftover = s.match(/\b(float|vec[234]|mat[234]|clamp|mix|smoothstep|fract|inversesqrt|texture2D|dFdx)\b/);
  ok(!leftover, `the GLSL transliteration covers every construct emitted`
    + (leftover ? ` — found "${leftover[1]}", so this gate is measuring nothing until it is taught that` : ''));
  const names = [...glsl.matchAll(/(?:float|vec2)\s+(oGl\w+)\s*\(/g)].map((m) => m[1]);
  ok(names.length === 13, `all thirteen emitted functions found (${names.join(', ')})`);
  return compile(s, names);
})();
{
  const rel = (a, b) => (Math.abs(a) + Math.abs(b) < 1e-300 ? 0
    : Math.abs(a - b) / Math.max(1e-300, Math.abs(a), Math.abs(b)));
  const TOL = 1e-12;
  let worst = { r: 0, what: 'nothing' }, n = 0;
  const cmp = (what, a, b) => {
    n++;
    const r = rel(a, b);
    if (r > worst.r) worst = { r, what: `${what}: GLSL ${a} vs twin ${b}` };
    if (r > TOL) ok(false, `${what}: emitted GLSL gives ${a}, the JS twin ${b}`
      + ` (relative ${r.toExponential(2)}) — THE SHADER IS NOT DRAWING WHAT THIS GATE PROVES`);
  };
  // a deterministic sweep, wide enough to exercise every branch: the clamps at
  // both ends of belowFrac, the sigma floor, the energy cap, the tail's wings,
  // grazing half-vectors and the footprint's own two limiters
  let seed = 0x51F7E9;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  for (let i = 0; i < 4000; i++) {
    const lam = Math.exp(Math.log(1e-4) + rnd() * Math.log(1e10));
    const swG = rnd() * 2.6, chG = rnd() * 2.2;
    const flr = rnd() < 0.5 ? 0 : rnd() * 0.01;
    cmp('oGlBelow(swell)', jsTwins.oGlBelow(lam, GLITTER.swellA,
      1 / Math.log(GLITTER.swellB / GLITTER.swellA)), belowFrac(lam, GLITTER.swellA, GLITTER.swellB));
    cmp('oGlBelow(wind)', jsTwins.oGlBelow(lam, GLITTER.windA,
      1 / Math.log(GLITTER.windB / GLITTER.windA)), belowFrac(lam, GLITTER.windA, GLITTER.windB));
    cmp('oGlSigma', jsTwins.oGlSigma(lam, swG, chG, flr), sigmaFor(lam, swG, chG, flr));
    cmp('oGlSigmaFull', jsTwins.oGlSigmaFull(swG, chG), sigmaFull(swG, chG));
    const sigA = sigmaFor(lam, swG, chG, flr), sigB = sigmaFor(lam * (0.05 + rnd()), swG, chG, flr);
    // half-vectors from near-vertical to absurdly grazing, and a few negatives
    const hz = rnd() < 0.1 ? rnd() * 0.02 - 0.01 : 0.6 + rnd() * 0.4;
    const hx = (rnd() * 2 - 1) * 0.8, hy = (rnd() * 2 - 1) * 0.8;
    const gl = rnd() < 0.2 ? 1 : rnd() * 12;
    cmp('oGlLobe', jsTwins.oGlLobe([hx, hy, hz], sigA, sigB, gl), lobe(hx, hy, hz, sigA, sigB, gl));
    // ---- and THE SPLIT and THE GLINT, on the same terms ----
    const det = rnd() < 0.3 ? 0 : rnd() * 0.01;
    const spA = jsTwins.oGlSplit(lam, swG, chG, flr, det), jsA = glintSplit(lam, swG, chG, flr, det);
    cmp('oGlSplit.sigma', spA[0], jsA[0]);
    cmp('oGlSplit.resVar', spA[1], jsA[1]);
    const spB = glintSplit(lam * (0.05 + rnd()), swG, chG, flr, det);
    const mx = (rnd() * 2 - 1) * 0.5, my = (rnd() * 2 - 1) * 0.5;
    const mz = rnd() < 0.1 ? rnd() * 0.02 : 0.7 + rnd() * 0.3;
    const sigE = sigmaFull(swG, chG);
    cmp('oGlGlint', jsTwins.oGlGlint([hx, hy, hz], [mx, my, mz],
      jsA[0], jsA[1], spB[0], spB[1], sigE),
    glintOf(hx, hy, hz, mx, my, mz, jsA[0], jsA[1], spB[0], spB[1], sigE));
    const c = rnd() < 0.15 ? rnd() * 2.4 - 1.2 : rnd(); // out of range on purpose
    cmp('oGlFresnel', jsTwins.oGlFresnel(c), fresnelWater(c));
    const dist = rnd() < 0.1 ? rnd() * 0.2 : Math.exp(rnd() * Math.log(1e5));
    const graze = rnd() < 0.2 ? rnd() * 0.005 : rnd();
    const pixA = 1e-4 + rnd() * 4e-3;
    const gf = jsTwins.oGlFoot(dist, graze, pixA), jf = footprint(dist, graze, pixA);
    cmp('oGlFoot.across', gf[0], jf.across);
    cmp('oGlFoot.along', gf[1], jf.along);
    // ---- and the SHATTER and the RAFT, on the same terms ----
    cmp('oGlRagNear', jsTwins.oGlRagNear(jf.across), ragNearness(jf.across));
    const rf = rnd() * 0.9375, rn = rnd() * 0.9375, rw = rnd();
    cmp('oGlRag', jsTwins.oGlRag(rf, rn, rw), ragOf(rf, rn, rw));
    const age = rnd() < 0.15 ? Math.round(rnd()) : rnd();
    cmp('oGlShred', jsTwins.oGlShred(rf, age), shredOf(rf, age));
    cmp('oGlThick', jsTwins.oGlThick(age), thickOf(age));
    const brkS = rnd() < 0.2 ? rnd() * 2 - 0.5 : rnd();
    cmp('oGlRaft', jsTwins.oGlRaft(brkS), raftOf(brkS));
  }
  console.log(`  GLSL/JS parity: ${n} comparisons over 4000 sampled geometries,`
    + ` worst relative difference ${worst.r.toExponential(2)} (ceiling ${TOL})`);
  // AND THE COUNTER-EXAMPLES: four plausible edits, each of which must break it.
  // Without these the parity check could be vacuous (comparing a thing to
  // itself) and nobody would know.
  const mutants = [
    ['sigA and sigB swapped in oGlLobe', (t) => t.replace('(sy * sy) / (sigB * sigB)', '(sy * sy) / (sigA * sigA)')
      .replace('(sx * sx) / (sigA * sigA)', '(sx * sx) / (sigB * sigB)')],
    ['the cos^-4 Jacobian dropped', (t) => t.replace('return (core + tail) * j;', 'return (core + tail);')],
    ['exp(-0.5 * q) become exp(-q)', (t) => t.replace('exp(-0.5 * q) * e * glint', 'exp(-q) * e * glint')],
    ['the glint stops reaching the core', (t) => t.replace('exp(-0.5 * q) * e * glint', 'exp(-0.5 * q) * e')],
    ["the drawn surface stops standing in for the population", (t) => t
      .replace('float sx = h.x / up + kA * (m.x / mup);', 'float sx = h.x / up;')
      .replace('float sy = h.y / up + kB * (m.y / mup);', 'float sy = h.y / up;')],
    ["oGlFoot's two components swapped", (t) => t.replace(/return vec2\(across, (min[^;]+)\);/, 'return vec2($1, across);')],
    ["the glint's normalisation dropped", (t) => t.replace('/ max(d, 1e-4)', '')],
    ["oGlSplit's two halves swapped", (t) => t.replace('return vec2(sg, max(0.0, sw + wd - below) + detVar);',
      'return vec2(max(0.0, sw + wd - below) + detVar, sg);')],
    ['the shred forgets the age', (t) => t.replace('* age * (1.0 - rag)', '* (1.0 - rag)')],
    ["the lace's contrast taper dropped", (t) => t.replace(`* mix(1.0, ${num17(GLITTER.ragMagKeep)}, w)`, '* 1.0')],
  ];
  for (const [label, mutate] of mutants) {
    const mutated = mutate(glsl);
    ok(mutated !== glsl, `counter-example is applicable: ${label}`);
    let caught = false;
    try {
      const m = compile(translate(mutated),
        ['oGlLobe', 'oGlFoot', 'oGlSplit', 'oGlGlint', 'oGlShred', 'oGlRag']);
      if (rel(m.oGlLobe([0.06, 0.02, 0.995], 0.16, 0.12, 2.5),
        lobe(0.06, 0.02, 0.995, 0.16, 0.12, 2.5)) > TOL) caught = true;
      const f = m.oGlFoot(300, 0.02, 1.4e-3), jf2 = footprint(300, 0.02, 1.4e-3);
      if (rel(f[0], jf2.across) > TOL || rel(f[1], jf2.along) > TOL) caught = true;
      const sp = m.oGlSplit(3.0, 1.54, 1.05, 7e-4, 1e-3), js = glintSplit(3.0, 1.54, 1.05, 7e-4, 1e-3);
      if (rel(sp[0], js[0]) > TOL || rel(sp[1], js[1]) > TOL) caught = true;
      if (rel(m.oGlGlint([0.02, 0.01, 0.999], [0.09, -0.04, 0.99], js[0], js[1], js[0], js[1], 0.19),
        glintOf(0.02, 0.01, 0.999, 0.09, -0.04, 0.99, js[0], js[1], js[0], js[1], 0.19)) > TOL) caught = true;
      if (rel(m.oGlShred(0.2, 0.4), shredOf(0.2, 0.4)) > TOL) caught = true;
      if (rel(m.oGlRag(0.2, 0.8, 0.6), ragOf(0.2, 0.8, 0.6)) > TOL) caught = true;
    } catch { caught = true; }
    ok(caught, `the parity gate catches it when ${label}`);
  }
}

// ---- 2. THE LIGHT DIRECTION -------------------------------------------------
// The one number that must be exactly zero: the angle between the direction
// the water is lit from and the direction the sky's own light comes from.
{
  const N = 2048;
  let worst = 0, worstAt = null, sunSamples = 0, moonSamples = 0;
  // a full lunar month, so the moon branch is exercised at every phase
  const span = DAY_LENGTH * MOON_MONTH_DAYS;
  for (let i = 0; i < N; i++) {
    const t = (i / N) * span;
    const sol = solarState(t), lun = lunarState(t);
    const g = glitterSource(sol, lun, moonBrightness(moonPhase(t)));
    if (g.amp === 0) continue;
    const real = sol.dayness > 0.12 ? sol.dir : lun.dir;
    if (sol.dayness > 0.12) sunSamples++; else moonSamples++;
    const n = Math.hypot(...g.dir) || 1;
    const d = (real[0] * g.dir[0] + real[1] * g.dir[1] + real[2] * g.dir[2]) / n;
    const ang = Math.acos(Math.max(-1, Math.min(1, d))) * DEG;
    ok(Math.abs(n - 1) < 1e-9, `glitterSource().dir is unit at t=${t.toFixed(0)} (${n})`);
    if (ang > worst) { worst = ang; worstAt = t; }
  }
  ok(sunSamples > 500 && moonSamples > 100,
    `the cycle exercised both branches (${sunSamples} sun, ${moonSamples} moon)`);
  // 1e-4 deg is the floor of acos near 1 in float64, not a tolerance for
  // error: glitterSource hands over the same array the sky uses, so the only
  // difference possible is the arccosine's own rounding.
  ok(worst < 1e-4, `the water is lit from the REAL source everywhere`
    + ` (worst ${worst.toExponential(2)} deg at t=${worstAt})`);

  // THE COUNTER-EXAMPLE: the arithmetic that shipped until 2026-07-26. If this
  // ever passes the tolerance above, this gate has stopped working.
  let bugWorst = 0, bugAt = null;
  for (let i = 0; i <= 512; i++) {
    const t = (i / 512) * DAY_LENGTH;
    const sol = solarState(t), lun = lunarState(t);
    const g = glitterSource(sol, lun, moonBrightness(moonPhase(t)));
    if (g.amp === 0) continue;
    const real = sol.dayness > 0.12 ? sol.dir : lun.dir;
    const y = Math.max(0.04, Math.min(1, (1 - g.low) / 1.15));
    const h = Math.sqrt(Math.max(0, 1 - y * y));
    let v = [g.ax * h, y, g.az * h];
    const n = Math.hypot(...v) || 1;
    v = v.map((q) => q / n);
    const ang = Math.acos(Math.max(-1, Math.min(1,
      real[0] * v[0] + real[1] * v[1] + real[2] * v[2]))) * DEG;
    if (ang > bugWorst) { bugWorst = ang; bugAt = { t, real: Math.asin(real[1]) * DEG, synth: Math.asin(v[1]) * DEG }; }
  }
  ok(bugWorst > 25, `the gate catches the shipped bug: the retired reconstruction stood`
    + ` ${bugWorst.toFixed(2)} deg off the real sun (real ${bugAt.real.toFixed(1)} deg,`
    + ` rebuilt ${bugAt.synth.toFixed(1)} deg — the 60.41 deg ceiling)`);
  ok(Math.abs(Math.asin(1 / 1.15) * DEG - 60.41) < 0.01, 'the ceiling is asin(1/1.15) as claimed');
}

// ---- 3. COX & MUNK ----------------------------------------------------------
// The lobe's roughness is not a taste. Cox & Munk (1954) measured sea-surface
// slope statistics FROM SUN GLITTER PHOTOGRAPHS; the model reproduces their fit
// through weather.js's own wind-to-chop map at every wind the game can blow.
//
// BE CLEAR ABOUT WHAT THIS IS. coxA and coxB were derived ALGEBRAICALLY from the
// same published fit this check evaluates, so agreement is an identity and not a
// measurement — it prints 0.00% because it must. Its value is as a DRIFT
// TRIPWIRE: it will go red the day weather.js changes its wind-to-chop map, or
// the day someone nudges coxA/coxB by eye, and either would silently retune every
// reflection in the game. The parts of this file that are genuinely falsifiable
// are 1b (the arithmetic), 5 (monotonicity), 6 (the corridor's shape) and 6b
// (brightness) — and live-glitter.mjs, which measures pixels.
{
  const cmVar = (U) => (0.003 + 1.92e-3 * U + 3.16e-3 * U) / 2; // mean per-axis
  let worst = 0;
  for (let U = 0; U <= 32; U += 0.25) {
    const { swell, chop } = seaBandsFor(U, 1e5); // well offshore: full fetch
    // weather.js clamps chop to [0.55, 1.9], so the model is only answerable
    // for the winds that actually map into that band
    if (chop <= 0.551 || chop >= 1.899) continue;
    const sig = sigmaFor(1e9, swell, chop);
    const want = Math.sqrt(cmVar(U));
    const rel = Math.abs(sig / want - 1);
  ok(rel < 0.001, `Cox & Munk at ${U.toFixed(2)} m/s: sigma ${sig.toFixed(4)}`
      + ` vs published ${want.toFixed(4)} (${(rel * 100).toFixed(3)}% off) — this is an`
      + ' identity, so anything but zero means a drift');
    worst = Math.max(worst, rel);
  }
  console.log(`  Cox & Munk reproduced to ${(worst * 100).toFixed(2)}% across the wind range`);
  // the drawn spectrum is only a fraction of it — the claim the floor rests on
  const drawn = Math.sqrt(1.54 ** 2 * GLITTER.swellVar + 1.05 ** 2 * GLITTER.windVar);
  ok(drawn < 0.35 * SIGMA_REF, `the drawn spectrum carries only ${(drawn / SIGMA_REF * 100).toFixed(0)}%`
    + ` of a working sea's slope sd (${drawn.toFixed(4)} of ${SIGMA_REF.toFixed(4)}) —`
    + ' which is why the unmodelled floor is the biggest term');
  ok(coxMunkVar(0.018) === 0, 'a river (RIVER_STATE) stays glass — the line clamps at zero');
  ok(SIGMA_REF > 0.15 && SIGMA_REF < 0.18, `the energy datum is a working sea (${SIGMA_REF.toFixed(4)})`);
}

// ---- 4. THE FIT TO THE LIVE SPECTRUM ---------------------------------------
// belowFrac's edges were fitted to the component table. If the spectrum is ever
// rebuilt, the fit must be re-fitted — so re-run it here against the LIVE table
// and fail if the shipped edges no longer describe it.
{
  const varBelow = (lam, band) => COMPONENTS
    .filter((c) => (c.len >= SWELL_LEN ? 0 : 1) === band && c.len < lam)
    .reduce((s, c) => s + 0.25 * (c.amp * c.k) ** 2, 0);
  const lams = [];
  for (let i = 0; i <= 400; i++) lams.push(2 * Math.exp(Math.log(1000) * (i / 400)));
  for (const [band, a, b, name] of [
    [0, GLITTER.swellA, GLITTER.swellB, 'swell'],
    [1, GLITTER.windA, GLITTER.windB, 'wind-sea'],
  ]) {
    const tot = varBelow(1e9, band);
    ok(tot > 0, `${name} band carries slope variance`);
    let err = 0, n = 0;
    for (const lam of lams) {
      const truth = Math.sqrt(varBelow(lam, band) / tot);
      err += (Math.sqrt(belowFrac(lam, a, b)) - truth) ** 2; n++;
    }
    const rms = Math.sqrt(err / n);
    ok(rms < 0.06, `the ${name} fit still describes the live spectrum`
      + ` (rms ${(rms * 100).toFixed(2)}% of sigma over 2-2000 m)`);
    ok(belowFrac(0.01, a, b) === 0, `${name}: nothing below the band is counted`);
    ok(belowFrac(1e6, a, b) === 1, `${name}: everything above it is`);
    // monotone: a bigger footprint can only swallow more
    let prev = -1, mono = true;
    for (const lam of lams) { const v = belowFrac(lam, a, b); if (v < prev - 1e-12) mono = false; prev = v; }
    ok(mono, `${name}: belowFrac is monotone in the cutoff`);
  }
  // the band totals must be the real table's, not a copy
  ok(Math.abs(varBelow(1e9, 0) - GLITTER.swellVar) < 1e-15, 'GLITTER.swellVar IS the table');
  ok(Math.abs(varBelow(1e9, 1) - GLITTER.windVar) < 1e-15, 'GLITTER.windVar IS the table');
}

// ---- 5. THE LOBE'S WIDTH RESPONDS TO SEA STATE ------------------------------
// The corridor's angular half-width is what the owner sees widen when it blows.
// It must be monotone in sea state — strictly, at every step, with no plateau
// inside the band the weather can produce.
{
  // only the winds that actually move the bands: weather.js clamps chop at 1.9
  // and swell at 2.4, so past ~25 m/s a stronger gale draws the same water and
  // there is nothing for monotonicity to say
  const STATES = [];
  for (let U = 2; U <= 30; U += 0.5) {
    const { swell, chop } = seaBandsFor(U, 1e5);
    if (chop >= 1.899) continue;
    STATES.push({ U, swell, chop });
  }
  const pixA = (2 * Math.tan((62 * Math.PI / 180) / 2)) / 900;
  // (a) sigma itself, at both a near and a far cutoff
  for (const lam of [0.5, 40, 1e9]) {
    let prev = -1, worstStep = 1e9;
    for (const s of STATES) {
      const v = sigmaFor(lam, s.swell, s.chop);
      if (prev >= 0) worstStep = Math.min(worstStep, v - prev);
      prev = v;
    }
    ok(worstStep > 0, `sigma at cutoff ${lam} m rises with every step of sea state`
      + ` (smallest step ${worstStep.toExponential(2)})`);
  }
  // (b) the CORRIDOR'S half-width in bearing, measured the way the eye sees it
  const halfWidth = (swell, chop, elev, dist) => {
    const peak = pathValue(5.5, dist, elev, 0, swell, chop, pixA).lit;
    let lo = 0, hi = 1.2; // radians
    for (let i = 0; i < 40; i++) {
      const m = (lo + hi) / 2;
      if (pathValue(5.5, dist, elev, m, swell, chop, pixA).lit > peak * 0.5) lo = m; else hi = m;
    }
    return (lo + hi) / 2;
  };
  const elev = 10 / DEG;
  let prev = -1, steps = 0;
  for (const s of STATES) {
    const w = halfWidth(s.swell, s.chop, elev, 300);
    ok(w > prev, `the corridor widens at ${s.U.toFixed(1)} m/s`
      + ` (half-width ${(w * DEG).toFixed(2)} deg, was ${(prev * DEG).toFixed(2)})`);
    prev = w; steps++;
  }
  const calm = halfWidth(seaBandsFor(3, 1e5).swell, seaBandsFor(3, 1e5).chop, elev, 300);
  const gale = halfWidth(seaBandsFor(25, 1e5).swell, seaBandsFor(25, 1e5).chop, elev, 300);
  ok(gale > calm * 2.4, `a gale's corridor is far wider than a calm's`
    + ` (${(gale * DEG).toFixed(2)} vs ${(calm * DEG).toFixed(2)} deg)`);
  console.log(`  corridor half-width at 300 m: ${(calm * DEG).toFixed(2)} deg in light airs ->`
    + ` ${(gale * DEG).toFixed(2)} deg in a gale, monotone over ${steps} wind steps`);
}

// ---- 6. THE CORRIDOR IS A CORRIDOR -----------------------------------------
{
  const pixA = (2 * Math.tan((62 * Math.PI / 180) / 2)) / 900;
  const { swell, chop } = seaBandsFor(10, 1e5);
  const at = (d, bDeg, elevDeg) => pathValue(5.5, d, elevDeg / DEG, bDeg / DEG, swell, chop, pixA).lit;
  // (a) LENGTH: a low source lights the water from close aboard to the horizon
  const peak = Math.max(...[10, 20, 40, 80, 160, 320, 640, 1280, 2560].map((d) => at(d, 0, 10)));
  const lit = [15, 30, 60, 120, 300, 800, 2000, 5000].filter((d) => at(d, 0, 10) > peak * 0.5);
  ok(lit.length >= 7 && lit[0] <= 30 && lit[lit.length - 1] >= 2000,
    `a 10 deg sun lights a road from ${lit[0]} m to ${lit[lit.length - 1]} m`);
  // (b) WIDTH: and it is dark a few degrees off the source's bearing
  offBearing = at(300, 0, 10) / at(300, 6, 10);
  litSpan = [lit[0], lit[lit.length - 1]];
  ok(at(300, 6, 10) < at(300, 0, 10) / 20,
    `6 deg off the bearing is dark (${offBearing.toFixed(0)}x down)`);
  ok(at(300, 90, 10) < at(300, 0, 10) / 1e4, 'abeam of the sun there is no path at all');
  // (c) SHAPE: in ground metres the wedge opens away from the eye, which on
  //     SCREEN is a road widening as it approaches
  const w = (d) => {
    let lo = 0, hi = 0.6;
    const p = at(d, 0, 10);
    for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (at(d, m * DEG, 10) > p * 0.5) lo = m; else hi = m; }
    return d * Math.tan((lo + hi) / 2);
  };
  ok(w(1000) > w(300) && w(300) > w(31),
    `the wedge opens down-range (${w(31).toFixed(1)} m at 31 m, ${w(300).toFixed(0)} m at 300 m,`
    + ` ${w(1000).toFixed(0)} m at 1 km)`);
  ok(Math.atan(w(31) / 31) > Math.atan(w(1000) / 1000),
    'and therefore SUBTENDS more the nearer it gets — a road widening as it approaches');
  // (d) FRESNEL: a low source must be worth far more than a high one, which is
  //     the whole reason the phenomenon is a sunset phenomenon
  const best = (e) => Math.max(...Array.from({ length: 60 },
    (_, i) => at(2 * 1.15 ** i, 0, e)));
  ok(best(5) > best(45) * 8, `a 5 deg source outshines a 45 deg one`
    + ` (${best(5).toFixed(3)} vs ${best(45).toFixed(3)})`);
  // "> 0" would pass at 1e-30. What must be true is that the non-Gaussian tail
  // leaves a MEASURABLE shimmer under a high sun — enough that the near water
  // still moves — so gate it against the low sun's own road rather than zero.
  ok(best(45) > best(5) / 400, `and a high source still leaves a sparkle field`
    + ` (${best(45).toExponential(2)}, i.e. 1/${(best(5) / best(45)).toFixed(0)} of the`
    + ' 5 deg road) rather than a dead sheet');
  let prevB = 1e9, monoE = true;
  for (const e of [2, 5, 10, 20, 35, 55, 75]) { const b = best(e); if (b > prevB) monoE = false; prevB = b; }
  ok(monoE, 'the path dims monotonically as the source climbs');
  // (e) Fresnel itself
  ok(Math.abs(fresnelWater(1) - 0.02) < 1e-9, 'water reflects 2% at normal incidence');
  ok(fresnelWater(0) > 0.99, 'and nearly everything at grazing');
  for (let c = 0; c <= 1.001; c += 0.05)
    ok(fresnelWater(c) >= 0.02 && fresnelWater(c) <= 1, `fresnel bounded at c=${c.toFixed(2)}`);
}

// ---- 6b. THE CORRIDOR'S ABSOLUTE BRIGHTNESS IS BOUNDED, BOTH WAYS ----------
// GLITTER.gain moved 1.15 -> 1.50 on the strength of a pixel probe whose only
// gates were a contrast RATIO and a REACH — and both of those go UP as the
// corridor saturates, so at gain 15 the probe would have reported a triumph
// while the sunward half of the sea clipped to white. GLITTER.clamp does not
// backstop it either: with EXPOSURE_BASE 1.25 the ACES curve maps 2.0 to 0.92,
// so a ceiling at 3.2 is a ceiling on nothing the eye can tell apart. This is
// the headless bound that makes gain answerable — a WINDOW, at three sea states,
// on what one pixel of the road may actually add to the frame.
{
  const pixA = (2 * Math.tan((62 * Math.PI / 180) / 2)) / 900;
  // the amp lightrig hands a full daylight sun; the moon's is 0.4 x phase
  const SUN_AMP = 0.9;
  const peakAdd = (U, elevDeg) => {
    const { swell, chop } = seaBandsFor(U, 1e5);
    let mx = 0;
    for (let d = 2; d < 4000; d *= 1.06)
      mx = Math.max(mx, pathValue(5.5, d, elevDeg / DEG, 0, swell, chop, pixA).lit);
    return Math.min(GLITTER.clamp, GLITTER.gain * SUN_AMP * mx);
  };
  const working = peakAdd(10, 5);
  ok(working > 0.35 && working < 2.2, `the road's brightest pixel on a working sea under a`
    + ` 5 deg sun adds ${working.toFixed(3)} to the frame — wanted 0.35 to 2.2, i.e. plainly`
    + ' brighter than water sitting near 0.2 and short of the level ACES has already'
    + ' rolled to white');
  const gale = peakAdd(25, 5);
  ok(gale > 0.12, `and a gale's road is still there (${gale.toFixed(3)})`);
  ok(gale < working, 'a rougher sea spreads the same light thinner');
  // in a light air at a half-degree sun the lobe is tight enough that the clamp
  // is what holds it. That is the clamp's whole job, and it must be a real
  // ceiling rather than a formality.
  const calmRaw = (() => {
    const { swell, chop } = seaBandsFor(3, 1e5);
    let mx = 0;
    for (let d = 2; d < 4000; d *= 1.06)
      mx = Math.max(mx, pathValue(5.5, d, 0.5 / DEG, 0, swell, chop, pixA).lit);
    return GLITTER.gain * SUN_AMP * mx;
  })();
  ok(calmRaw > GLITTER.clamp, `a flat calm at a half-degree sun would ask for`
    + ` ${calmRaw.toFixed(2)} and the clamp holds it at ${GLITTER.clamp}`);
  ok(GLITTER.clamp <= 4, `and the clamp is a real ceiling (${GLITTER.clamp})`);
  console.log(`  road brightness: working sea ${working.toFixed(3)}, gale ${gale.toFixed(3)},`
    + ` calm asks ${calmRaw.toFixed(2)} and is clamped to ${GLITTER.clamp}`);
}

// ---- 7. footprint, bounds, determinism, no NaN -----------------------------
{
  const pixA = (2 * Math.tan((62 * Math.PI / 180) / 2)) / 900;
  const near = footprint(30, Math.sin(Math.atan2(5.5, 30)), pixA);
  const far = footprint(600, Math.sin(Math.atan2(5.5, 600)), pixA);
  ok(near.along > near.across && far.along > far.across, 'the footprint is long down-range');
  ok(far.along / far.across > near.along / near.across,
    `and grows more elongated with range (${(near.along / near.across).toFixed(1)}x at 30 m,`
    + ` ${(far.along / far.across).toFixed(0)}x at 600 m)`);
  ok(footprint(1e7, 0, pixA).along <= GLITTER.maxFoot, 'the along-range footprint is bounded');
  let worstLobe = 0, bad = 0;
  for (let i = 0; i < 40000; i++) {
    const d = 0.5 + (i % 200) * 30;
    const e = ((i * 7) % 90) / DEG;
    const b = ((i * 13) % 180) / DEG;
    const chop = 0.55 + ((i * 3) % 14) * 0.1;
    const sw = ((i * 5) % 25) * 0.1;
    const r = pathValue(1 + (i % 40) * 0.5, d, e, b, sw, chop, pixA);
    if (!Number.isFinite(r.lit) || r.lit < 0) bad++;
    worstLobe = Math.max(worstLobe, r.val);
  }
  ok(bad === 0, `no NaN and no negative radiance over 40000 geometries (${bad} bad)`);
  // energyCap is 3.0 and the Jacobian adds a little at grazing half-vectors, so
  // 4 is a real ceiling. It was 12, which is a ceiling on nothing.
  ok(worstLobe < 4, `the lobe's peak is bounded (worst ${worstLobe.toFixed(3)}) —`
    + ` the energy cap ${GLITTER.energyCap} holds even on glass`);
  ok(lobe(0, 0, 1, 0.16, 0.16) === lobe(0, 0, 1, 0.16, 0.16), 'deterministic');
  ok(Math.abs(lobe(0.02, 0, 1, 0.16, 0.12) - lobe(-0.02, 0, 1, 0.16, 0.12)) < 1e-15,
    'the lobe is symmetric along-range');
  ok(Math.abs(lobe(0, 0.02, 1, 0.16, 0.12) - lobe(0, -0.02, 1, 0.16, 0.12)) < 1e-15,
    'and across it');
  // the tail carries the wings: far out in slope space it must beat the core
  const s = 0.16;
  ok(lobe(4 * s, 0, 1, s, s) > 1e-4 * lobe(0, 0, 1, s, s),
    'the non-Gaussian tail keeps the wings alive (a high sun still sparkles)');
}

// ---- 8. the foam's light response is a response ----------------------------
{
  // the phase function the shader applies: back + fwd * fwdCos^2, fwdCos in [0,1]
  const away = GLITTER.foamBack;
  const toward = GLITTER.foamBack + GLITTER.foamFwd;
  ok(toward > away * 1.8, `churn looking up-sun is ${(toward / away).toFixed(2)}x`
    + ' the antisolar side — the wake answers the sun');
  ok(away > 0.05, 'and it is never black on the antisolar side');
  ok(GLITTER.foamAlbedo < 0.85, `the flat white is down from 0.85 to ${GLITTER.foamAlbedo}`
    + ' — light does the rest');
  ok(GLITTER.foamSpecKeep > 0.15 && GLITTER.foamSkyKeep > 0.15,
    'churn keeps some specular and some sky rather than none');
  ok(GLITTER.foamSigma > SIGMA_REF * 1.5,
    `churn is rougher than open water (${GLITTER.foamSigma} vs ${SIGMA_REF.toFixed(3)})`);
  // and it must be BROAD: the sheen has to keep answering well off the specular
  // bearing, or the wake goes back to being a narrow highlight that only fires
  // at one geometry. Measured as the slope offset at which the lobe halves —
  // brightness is not the claim (energy conservation makes a broad lobe dimmer
  // at its own peak), REACH is.
  const halfSlope = (sig) => {
    const p = lobe(0, 0, 1, sig, sig);
    let lo = 0, hi = 4;
    for (let i = 0; i < 50; i++) {
      const m = (lo + hi) / 2;
      if (lobe(m, 0, 1, sig, sig) > p * 0.5) lo = m; else hi = m;
    }
    return (lo + hi) / 2;
  };
  const wide = halfSlope(GLITTER.foamSigma), tight = halfSlope(SIGMA_REF);
  ok(wide > tight * 1.6, `the churn's sheen reaches ${(wide / tight).toFixed(2)}x further off`
    + ` specular than open water's (half at ${(Math.atan(wide) * DEG).toFixed(1)} deg of facet`
    + ` tilt vs ${(Math.atan(tight) * DEG).toFixed(1)} deg)`);
  // and far out in the wings the broad lobe must actually WIN, or churn seen
  // well off the sun's bearing would be darker than the water beside it
  const off = 0.6;
  ok(lobe(off, 0, 1, GLITTER.foamSigma, GLITTER.foamSigma)
    > lobe(off, 0, 1, SIGMA_REF, SIGMA_REF) * 3,
    'and it outshines open water well off the bearing, where a wake is usually seen');
}

// ---- 7b. AND THE SHADER MUST ACTUALLY CALL ALL OF IT ------------------------
// A cold review mutated ocean.js five ways — deleted the macro-normal levelling,
// switched the shatter off, deleted the raft depth, passed 0 for the break age —
// and this file stayed green every time, because the only link was a string
// search over ocean.js's own text INCLUDING ITS COMMENTS. A gate that proves an
// arithmetic identity about a function nobody calls is proving nothing. These
// match the CALL together with its ARGUMENT.
{
  const call = (re, what) => ok(re.test(srcOcean), `ocean.js really ${what}`);
  call(/oNw = normalize\(mix\(oNw, oNf, \$\{GLITTER\.foamFlat[^}]*\} \* oFoam\)\)/,
    'levels the foam\'s macro normal by foamFlat * oFoam');
  // THE APPEARANCE FIX, AS FIVE CALLS. Each of these was mutated away by hand
  // and every one of them takes this file red.
  call(/vec2 oSpA = oGlSplit\(max\(2\.0 \* oFt\.y, oCut\), uSwellL, uSwellS, oSFlr, oDetV\)/,
    "sizes the glint from the pixel's own DOWN-RANGE footprint and the detail bands");
  call(/vec2 oSpB = oGlSplit\(max\(2\.0 \* oFt\.x, oCut\), uSwellL, uSwellS, oSFlr, oDetV\)/,
    'and from its ACROSS-range footprint on the other axis');
  call(/float oGlint = oGlGlint\(oHl, oHm, oSpA\.x, oSpA\.y, oSpB\.x, oSpB\.y, oSigE\)/,
    'takes the glint against oHl — the residual over the EXACT drawn normal —'
    + ' with oHm and oSigE for the stand-in term that lets it reach the corridor');
  call(/oGlint = mix\(oGlint, 1\.0, oFoam\)/,
    "stands the glints down over foam, whose sheen is diffuse");
  call(/float oGl = oGlLobe\(oHm, oSigE, oSigE, oGlint\)/,
    'fills the MEAN-surface corridor with them (oHm, not oHl — the envelope is'
    + ' the statistics and the glint is the geometry, and swapping the two frames'
    + ' collapses this back to one term)');
  call(/vec3 oHm = vec3\(dot\(oHalf, oRange\), dot\(oHalf, oAcrM\), oHalf\.y\)/,
    "builds that mean-surface half-vector from world up and the eye's own bearing");
  call(/float oSigE = oGlSigmaFull\(uSwellL, uSwellS\)/,
    "widens the corridor by Cox & Munk's full sd and not by the footprint");
  call(/oDetV \+= oDAmp \* oDAmp \* /,
    "counts the shading detail bands' own slope into the glint's normalisation");
  call(/uSparkle \* \$\{GLITTER\.gain[^}]*\} \* oGl\) \* uGlitCol/,
    'and spends the result once, with no second multiplier on it');
  call(/oFoam \* mix\(1\.0, oGlRaft\(oBrk\), oWcShare\) \* uGlitAmp/,
    'scales the BREAKER raft\'s radiance by its depth, and leaves the wake alone');
  call(/oGlShred\([^;]*\boAge\b[^;]*\)/, 'shreds the spent tail with the break AGE');
  call(/oGlThick\(oAge\)/, 'draws the head whiter than the tail');
  call(/oGlRag\(oR0, oFbm\(oRq\), oNearW\)/, 'cross-fades the lace onto the finer lattice');
  call(/oGlRagNear\(oFootA\)/, 'drives that cross-fade from the pixel footprint');
}

// ---- 8. APPEARANCE, NOT PRESENCE -------------------------------------------
// THIS SECTION EXISTS BECAUSE EVERY GATE IN THIS FILE WAS GREEN WHILE THE
// PICTURE LOOKED BASIC — TWICE. First: coverage matched Monahan's photographs,
// the sunward contrast was 1.54, the skewness matched second-order theory, and
// the owner's verdict on the v2 showcase was "the glitter off waves/cresting is
// crap and basic". Then a noise lattice was thresholded onto the lobe and THIS
// SECTION WENT GREEN ON IT — 3.72 separated maxima per square metre at 5.6x
// contrast — while the rendered road still read as soft blobs, because the
// statistic was measured on the NOISE FIELD ITSELF and not on anything the
// shader draws. A field can be as spiky as you like in isolation and still
// vanish once it is averaged over a pixel and multiplied into a smooth envelope.
//
// So the measurement moved onto the water. What follows builds a real stretch of
// road — waves.js's own drawn surface at a real sea state, the detail bands
// ocean.js adds to the shading normal, a real eye height and a real low sun —
// and evaluates the corridor over it EXACTLY as the fragment shader does, term
// for term. Then it counts separated maxima and their contrast against the water
// between them. The counter-example beside it is not a synthetic smooth field:
// it is the arithmetic that shipped before this pass, run on the same surface
// with the same geometry, so the comparison is of the two ROADS and not of two
// noise functions.
let glintDensity = 0, glintContrast = 0, glintMeanRatio = 0;
{
  const pixA = (2 * Math.tan((62 * Math.PI / 180) / 2)) / 1440;
  // the sea 08-glitter-sun-road-low-sun is shot on, and a low sun down +x
  setSeaBands(2.17, 1.32);
  setWaveOrigin(0, 0);
  setWaveAxes(waveAxisFor(2.1), waveAxisFor(2.1));
  const swellG = 2.17, chopG = 1.32;
  const EYE = 2.8, ELEV = 6 / DEG, T = 61.5;
  const NOISE = makeOceanNoise((x) => x);
  // ocean.js's FINE detail band, term for term (the broad far-field band adds
  // 0.0005 rad against this one's 0.03 and is left out of both sides alike)
  const detail = (x, z) => {
    const p1x = x * 1.35 + T * 0.18, p1z = z * 1.35 + T * 0.05;
    const p2x = x * 0.42 - T * 0.06 + 13.7, p2z = z * 0.42 - T * 0.11 + 13.7;
    const f = (ax, az, bx, bz) => NOISE.fbm(ax, az) * 0.55 + NOISE.fbm(bx, bz) * 0.45;
    const d0 = f(p1x, p1z, p2x, p2z);
    const dx = f(p1x + 0.35 * 1.35, p1z, p2x + 0.35 * 0.42, p2z);
    const dz = f(p1x, p1z + 0.35 * 1.35, p2x, p2z + 0.35 * 0.42);
    return [(dx - d0) / 0.35, (dz - d0) / 0.35];
  };
  // one pixel of road, both ways. `mode` 'now' is the shader as it stands;
  // 'was' is the smooth Cox lobe taken against the same drawn normal, which is
  // what 68e8eae shipped and what the noise shatter was painted onto.
  const road = (x, z, mode) => {
    const P = [x, 0, z];
    const E = [0, EYE, 0];
    const dv = [E[0] - P[0], E[1] - P[1], E[2] - P[2]];
    const dist = Math.hypot(...dv) || 1;
    const V = dv.map((q) => q / dist);
    const g = waveGradient(x, z, T);
    const dF = (() => {                       // ocean.js's own distance fade
      const t = clampT((dist - 120) / (22 - 120));
      return t * t * (3 - 2 * t);
    })();
    const dAmp = 0.16 * dF * (0.55 + 0.45 * chopG);
    const dd = detail(x, z);
    const gx = g[0] + dd[0] * dAmp, gz = g[1] + dd[1] * dAmp;
    const nl = Math.hypot(gx, 1, gz);
    const N = [-gx / nl, 1 / nl, -gz / nl];
    const L = [Math.cos(ELEV), Math.sin(ELEV), 0];   // the sun down +x, at the eye's back
    let H = [V[0] + L[0], V[1] + L[1], V[2] + L[2]];
    const hn = Math.hypot(...H) || 1;
    H = H.map((q) => q / hn);
    // the pixel's footprint, and the two frames the shader builds
    const foot = footprint(dist, Math.max(V[1], 0), pixA);
    const rn = Math.hypot(-V[0], -V[2]) || 1;
    const R = [-V[0] / rn, 0, -V[2] / rn];
    const acr = cross(N, R), al = cross(unit(acr), N);
    const ac = unit(acr);
    const hl = [dot(H, al), dot(H, ac), dot(H, N)];
    const fres = fresnelWater(dot(H, L));
    if (mode === 'was') {
      const flr = pixA * 0.5;
      return lobe(hl[0], hl[1], hl[2],
        sigmaFor(2 * foot.along, swellG, chopG, flr),
        sigmaFor(2 * foot.across, swellG, chopG, flr)) * fres;
    }
    const detV = dAmp * dAmp * GLITTER.detailSd * GLITTER.detailSd;
    const [sgA, rvA] = glintSplit(2 * foot.along, swellG, chopG, pixA * 0.5, detV);
    const [sgB, rvB] = glintSplit(2 * foot.across, swellG, chopG, pixA * 0.5, detV);
    const acrM = [R[2], 0, -R[0]];
    const hm = [dot(H, R), dot(H, acrM), H[1]];
    const sigE = sigmaFull(swellG, chopG);
    const gl = glintOf(hl[0], hl[1], hl[2], hm[0], hm[1], hm[2], sgA, rvA, sgB, rvB, sigE);
    return lobe(hm[0], hm[1], hm[2], sigE, sigE, gl) * fres;
  };
  // A STRIP OF ROAD: 16 m down the sun's own bearing by 2.4 m across it, from
  // the mirror point outward, sampled at 4 cm — finer than one glint, so a
  // maximum is a maximum of the field and not of the sampling. Narrow on
  // purpose: six degrees off the bearing the corridor is 20x down (check 6b), so
  // a square patch would be mostly water with no road on it at all and would
  // measure the corridor's edge rather than its substance.
  const measure = (mode, x0 = 26.0, halfZ = 1.2, st = 0.04, NX = 400) => {
    const NZ = 2 * Math.round(halfZ / st) + 1, z0 = -halfZ;
    const g = [];
    for (let j = 0; j < NZ; j++) {
      const row = [];
      for (let i = 0; i < NX; i++) row.push(road(x0 + i * st, z0 + j * st, mode));
      g.push(row);
    }
    const all = g.flat().sort((a, b) => a - b);
    const med = Math.max(1e-12, all[Math.floor(all.length * 0.5)]);
    let peaks = 0, pk = 0, sum = 0, n = 0, lit = 0;
    for (let j = 1; j < NZ - 1; j++) {
      for (let i = 1; i < NX - 1; i++) {
        const v = g[j][i];
        let top = true;
        for (let dj = -1; dj <= 1 && top; dj++) for (let di = -1; di <= 1; di++) {
          if ((di || dj) && g[j + dj][i + di] >= v) { top = false; break; }
        }
        // A GLINT IS A MAXIMUM THAT STANDS OUT, and the threshold is what makes
        // this statistic mean anything: a smooth field is covered in shallow
        // maxima (the first cut of this check counted them and scored the SMOOTH
        // lobe higher than the glint field, 7.9/m2 against 1.5, which is true and
        // entirely beside the point). Twice the median is the bar.
        if (top && v > 2 * med) { peaks++; pk += v; }
        if (v > 2 * med) lit++;
        n++; sum += v;
      }
    }
    return {
      density: peaks / (((NX - 2) * st) * ((NZ - 2) * st)),
      contrast: (pk / Math.max(1, peaks)) / med,
      mean: sum / n,
      // the mean AREA of one glint, in square metres: lit area over glint count
      area: (lit * st * st) / Math.max(1, peaks),
    };
  };
  const now = measure('now'), was = measure('was');
  glintDensity = now.density; glintContrast = now.contrast;
  glintMeanRatio = now.mean / was.mean;
  console.log(`  road at 26-42 m under a 6 deg sun, on waves.js's own water:`
    + ` ${now.density.toFixed(2)} glints/m2 standing ${now.contrast.toFixed(1)}x over the`
    + ` water between them, against ${was.density.toFixed(2)} at ${was.contrast.toFixed(2)}x`
    + ' for the smooth lobe it replaces');
  // (a) DISCRETENESS. Both statistics, both against the arithmetic that shipped.
  ok(now.contrast > was.contrast * 4,
    `THE ROAD IS MADE OF SEPARATE GLINTS: they stand ${now.contrast.toFixed(1)}x over the`
    + ` water between them against ${was.contrast.toFixed(2)}x for the smooth lobe this`
    + ' replaces (floor 4x of it) — a searchlight beam scores near 1');
  ok(now.contrast > 8, `and ${now.contrast.toFixed(1)}x in absolute terms (floor 8)`);
  ok(now.density > 0.4 && now.density > was.density * 4,
    `and there are MANY of them — ${now.density.toFixed(2)} per square metre of road`
    + ` against ${was.density.toFixed(2)} (floors: 0.4 absolute, 4x the smooth lobe);`
    + ' a dozen big blobs is not glitter either');
  // (b) AND THE MEAN IS PRESERVED — BY CONSTRUCTION, which is a stronger claim
  // than a measurement and is checked as such: integrate the glint against the
  // very slope distribution its normaliser assumes and it must come back at
  // 1.000, at every range and every sea state, with nothing tuned. Quadrature
  // and not Monte Carlo, deliberately: a 5.7% bias here turned out to be the
  // sampler and not the model, which is exactly the kind of thing a gate should
  // not have to guess about.
  {
    let worst = 0, worstAt = '';
    for (const [sw, ch] of [[1.54, 1.05], [2.17, 1.32], [0.7, 0.6], [2.4, 1.9]]) {
      for (const lam of [0.2, 5, 40, 400]) {
        for (const det of [0, 0.0012]) {
          const [sg, rv] = glintSplit(lam, sw, ch, 7e-4, det);
          const S = Math.sqrt(Math.max(rv, 1e-14));
          let num = 0, den = 0;
          for (let i = -60; i <= 60; i++) {
            for (let j = -60; j <= 60; j++) {
              const sx = i * 0.1 * S, sy = j * 0.1 * S;
              const w = Math.exp(-(sx * sx + sy * sy) / (2 * Math.max(rv, 1e-14)));
              // at the corridor's heart the mean-surface demand is zero, so the
              // stand-in term vanishes and this is the normaliser's own claim
              num += w * glintOf(sx, sy, 1, 0, 0, 1, sg, rv, sg, rv, sigmaFull(sw, ch));
              den += w;
            }
          }
          const m = num / den;
          if (Math.abs(m - 1) > worst) {
            worst = Math.abs(m - 1); worstAt = `${sw}/${ch} at ${lam} m, detVar ${det}`;
          }
        }
      }
    }
    ok(worst < 0.01, `THE GLINTS ARE CONTRAST, NOT BRIGHTNESS: over the slope distribution`
      + ` the normaliser assumes, E[glint] is 1 to ${worst.toExponential(2)} across four sea`
      + ` states x four footprints x two detail loads (worst at ${worstAt}) —`
      + ' floor + (1 - floor) * E = 1 by construction, so no duty constant is measured'
      + ' or tuned anywhere');
  }
  // ...and on the real water, where the surface is not Gaussian and the strip is
  // a finite realisation that spans two and a half degrees of bearing, the same
  // stretch of road comes out at roughly what the smooth lobe put there. It is
  // BELOW 1 on purpose and for the reason the phenomenon requires: the glints
  // thin as the corridor thins, so a strip that includes the corridor's flanks
  // loses a little of what a smooth lobe would have spread evenly over them.
  ok(glintMeanRatio > 0.5 && glintMeanRatio < 1.5,
    `on the water the same strip integrates to ${glintMeanRatio.toFixed(3)}x what the`
    + ' smooth lobe put there (wanted 0.5-1.5)');
  // (c) THE ANTI-ALIASING IS THE FOOTPRINT AND NOTHING ELSE. Close aboard the
  // glint runs at the mirror's own hardness; down the road the footprint swallows
  // the spectrum, the glint lobe overtakes what is left of the resolved slope,
  // the normalisation runs toward 1 and the road softens on its own. That ladder
  // must be monotone, or the road would harden with range somewhere.
  {
    let prevPeak = 1e9, prevSig = 0, mono = true;
    const rows = [];
    for (const d of [10, 20, 40, 80, 160, 320, 640]) {
      const r = pathValue(2.8, d, ELEV, 0, swellG, chopG, pixA);
      rows.push({ d, sig: r.sigA, peak: r.peak });
      if (r.peak > prevPeak + 1e-12 || r.sigA < prevSig - 1e-12) mono = false;
      prevPeak = r.peak; prevSig = r.sigA;
    }
    console.log('  glint hardness down the road: '
      + rows.map((r) => `${r.d} m ${r.peak.toFixed(2)}x`).join(', '));
    ok(mono, 'the glint softens MONOTONICALLY with range — it never hardens further off');
    ok(rows[0].peak > 3, `close aboard one glint peaks ${rows[0].peak.toFixed(2)}x over the`
      + ' mean field it sits in (floor 3x)');
    ok(rows[rows.length - 1].peak < rows[0].peak * 0.6,
      `and by ${rows[rows.length - 1].d} m it is down to ${rows[rows.length - 1].peak.toFixed(2)}x`
      + ' — the road softens toward the horizon, which is what a real one does. It does'
      + ' NOT go all the way back to the smooth lobe, and should not: the ACROSS-range'
      + ' footprint is only dist * pixA at any distance, so the surface stays resolved'
      + ' across the road even where it is smeared along it.');
  }
  // (c2) AND THE GLINT'S HARDNESS IS BRACKETED AT BOTH ENDS, then measured in
  // PIXELS in between — the discipline the retired noise lattice's own ladder
  // had, on a geometric quantity rather than a lattice constant. The two bounds
  // are not tastes: below the source's own angular radius the model claims to
  // resolve the disc and every glint lands inside one pixel; at the retired
  // mirror's width a glint comes out about a metre across on this water, which
  // is sixty pixels at fifteen metres and reads as a blob.
  {
    const SRC = 0.00465 / 2 / 2;   // sun/moon angular radius -> facet-slope sigma
    const MIR = Math.acos(0.5 ** (1 / MIRROR_EXP)) / 2 / Math.sqrt(2 * Math.LN2);
    ok(Math.abs(MIR - 0.030995) < 1e-5,
      `the ceiling IS the retired mirror's own width (pow(...,${MIRROR_EXP}) is`
      + ` half-maximum at 2.09 deg of facet tilt, sigma ${MIR.toFixed(5)})`);
    ok(GLITTER.glintSigma > SRC * 4 && GLITTER.glintSigma < MIR,
      `and the glint sits between them: ${GLITTER.glintSigma} is ${(GLITTER.glintSigma / SRC).toFixed(0)}x`
      + ` the source's own disc (${SRC.toFixed(5)}) and ${(GLITTER.glintSigma / MIR).toFixed(2)} of`
      + ` the mirror (${MIR.toFixed(4)})`);
    // THE DRAWN SIZE, from the measured field: total lit area divided by the
    // number of glints in it, converted to pixels at the range it was sampled.
    // Measured at BOTH ends of the road, because the surface changes under it —
    // close aboard the detail bands are what break the light up, and past their
    // fade it is the wave gradient alone, so a glint is bigger in METRES far away
    // and still smaller in PIXELS. The bar is the one the retired lattice was
    // held to: a handful of pixels, because finer aliases and coarser is a blob.
    const far = measure('now', 240, 12, 0.16, 250);
    for (const [r, m] of [[33, now], [280, far]]) {
      const px = Math.sqrt(m.area) / (r * pixA);
      console.log(`  one drawn glint at ${r} m: ${(Math.sqrt(m.area) * 100).toFixed(0)} cm`
        + ` of water, ${px.toFixed(1)} px across`);
      ok(px >= 2.5 && px <= 30, `a glint is ${px.toFixed(1)} px across at ${r} m — wanted`
        + ' 2.5 to 30. At the retired mirror\'s own width the same measurement gives a metre'
        + ' of water close aboard and sixty pixels, which is the soft blob the browser'
        + ' frames showed at glintSigma 0.028.');
    }
  }
  // (c1) AND detailSd IS THE DETAIL BANDS' OWN SLOPE, re-measured from
  // oceannoise's twin using ocean.js's own construction. If either drifts the
  // glint's normalisation is taken over the wrong distribution and the road runs
  // bright close aboard, where the bands are strongest — a defect nothing else
  // here would see.
  {
    let s = 0, s2 = 0, n = 0;
    for (let j = 0; j < 300; j++) {
      for (let i = 0; i < 300; i++) {
        const x = 1234.5 + i * 0.83, z = -987.25 + j * 0.83;
        const f = (ax, az) => NOISE.fbm(ax * 1.35, az * 1.35) * 0.55
          + NOISE.fbm(ax * 0.42, az * 0.42) * 0.45;
        const gq = (f(x + 0.35, z) - f(x, z)) / 0.35;
        s += gq; s2 += gq * gq; n++;
      }
    }
    const sd = Math.sqrt(s2 / n - (s / n) ** 2);
    ok(Math.abs(sd - GLITTER.detailSd) < 0.004,
      `GLITTER.detailSd is the fine detail band's own slope sd at unit amplitude`
      + ` (constant ${GLITTER.detailSd}, re-measured ${sd.toFixed(5)})`);
    for (const lit of ['1.35', '0.42', '0.55', '0.45', 'oDe = 0.35'])
      ok(srcOcean.includes(lit), `and ocean.js still builds that band from ${lit}`);
  }

  // (c2) THE LACE'S DRAWN CELL — the near-field defect, as arithmetic.
  // The showcase found "a repeating chain of dark elliptical holes within about
  // ten metres of the lens" in the churn. It is a RESOLUTION fault: the rag runs
  // at ragFar per metre, so one of its cells is 0.53 m, and at three metres that
  // cell covers over a hundred pixels while the fbm's own minima sit at 0.40 of
  // its peak — a half-metre hole, drawn at 41% contrast, over and over down the
  // wake road. The live probe can only put half a square metre of unclipped foam
  // mask on it (see live-appearance.mjs), so the bound lives here, where the two
  // quantities that MAKE the artifact — how big one cell is drawn and how deep it
  // goes — are exact.
  {
    const pixA = (2 * Math.tan((62 * Math.PI / 180) / 2)) / 1440;
    // the lace's peak-to-trough swing as a fraction of its own mean, before and
    // after the contrast taper. oFbm spans [0, 0.9375] about a mean of 0.469 and
    // ocean.js maps it 0.40 + 0.60 * rag.
    const swing = (w) => {
      const hi = 0.40 + 0.60 * ragOf(0.9375, 0.9375, w);
      const lo = 0.40 + 0.60 * ragOf(0, 0, w);
      const mid = 0.40 + 0.60 * ragOf(0.469, 0.469, w);
      return (hi - lo) / mid;
    };
    const rows = [];
    for (const d of [3, 6, 12, 30, 90]) {
      const footA = d * pixA;
      const w = ragNearness(footA);
      // the drawn width of ONE cell, in pixels, of whichever lattice dominates
      const scale = GLITTER.ragFar + (GLITTER.ragNear - GLITTER.ragFar) * w;
      rows.push({ d, w, px: 1 / scale / footA, swing: swing(w),
        was: (1 / GLITTER.ragFar) / footA, wasSwing: swing(0) });
    }
    for (const r of rows) {
      console.log(`  lace at ${String(r.d).padStart(3)} m:  cell ${r.px.toFixed(1)} px`
        + ` at ${(r.swing * 100).toFixed(0)}% contrast`
        + `   (it was ${r.was.toFixed(1)} px at ${(r.wasSwing * 100).toFixed(0)}%)`);
    }
    const near3 = rows[0];
    // THE ARTIFACT'S VISUAL MASS is its drawn area times its depth. Both fall.
    const mass = (r) => r.px * r.px * r.swing, wasMass = (r) => r.was * r.was * r.wasSwing;
    ok(near3.px < near3.was * 0.6, `close aboard the lace is drawn ${near3.px.toFixed(0)} px`
      + ` per cell against ${near3.was.toFixed(0)} for the fixed-scale rag it replaces`);
    ok(near3.swing < near3.wasSwing * 0.6, `and at ${(near3.swing * 100).toFixed(0)}% contrast`
      + ` against ${(near3.wasSwing * 100).toFixed(0)}% — a magnified octave is standing in`
      + ' for structure the medium does not have at that scale');
    ok(mass(near3) < wasMass(near3) * 0.15,
      `so the drawn hole's area x depth falls ${(wasMass(near3) / mass(near3)).toFixed(1)}x`
      + ' at three metres (floor 6.7x)');
    // ...and NOTHING changes at the range the lace is there to serve, or the fix
    // would have traded one defect for foam that reads as a flat sheet
    const far = rows[rows.length - 1];
    ok(far.w < 0.01 && Math.abs(far.swing - far.wasSwing) < 1e-9,
      `while at ${far.d} m the lace is untouched (cross-fade ${far.w.toFixed(4)},`
      + ` contrast ${(far.swing * 100).toFixed(0)}% either way) — the rag is what stops`
      + ' foam reading as a flat sheet at ordinary range and it is still there');
  }

  // (d) THE RAFT HAS A SHAPE. Same idea for foam: a flat white decal has no
  // variance inside its own mask and no difference between its head and its
  // tail. These two hold the mechanism that gives it both.
  ok(GLITTER.foamShred > 0.3 && GLITTER.foamShred <= 1,
    `the lace can punch real holes in a spent raft (${GLITTER.foamShred})`);
  const headSd = (() => {
    // the spread the lace imposes on opacity at each end of the window
    const at = (age) => {
      const v = [];
      for (let i = 0; i < 4000; i++) {
        const rag = 0.469 + 0.16 * Math.sin(i * 2.399963);   // an fbm-like spread
        v.push(shredOf(rag, age));
      }
      const m = v.reduce((a, b) => a + b, 0) / v.length;
      return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length);
    };
    return { head: at(0), tail: at(1) };
  })();
  ok(headSd.head < 1e-9 && headSd.tail > 0.05,
    `a tumbling head is dense water (lace spread ${headSd.head.toExponential(1)}) and its`
    + ` spent tail is shredded (${headSd.tail.toFixed(3)}) — a whitecap is not one paint`);
  ok(thickOf(0) > thickOf(1) && thickOf(1) > 0.3,
    `and the head draws whiter than the tail (${thickOf(0)} vs ${thickOf(1)})`);
  // the raft's own relief must actually tilt the normal, and its macro tilt must
  // actually be levelled — this is the brightness defect's fix, as arithmetic
  ok(GLITTER.foamRelief > 0.1, `foam is bumpy (relief ${GLITTER.foamRelief})`);
  ok(GLITTER.foamFlat > 0.5 && GLITTER.foamFlat <= 1,
    `and its macro normal levels toward vertical (${GLITTER.foamFlat}) — the whitest`
    + ' water in a gale must be the breaking crest, whichever way its face is tilted');
  // ---- (e) THE MONOTONICITY CLAIM, AS ARITHMETIC ---------------------------
  // THE DEFECT, from the sea v2 spec: "binned by break strength at nearest-pixel
  // sampling, luminance runs 122 counts unbroken, 130-132 through the middle of
  // the field's range and 117 in the STRONGEST bin". The whitest water in a gale
  // was not the breaking crest, and the cause was named there too — the steepest
  // forward face is the facet tilted furthest from the sky.
  //
  // WHY THE GUARANTEE LIVES HERE AND NOT IN THE PIXEL PROBE. The spec also says
  // the pixel instrument was untrustworthy, and building a trustworthy one was
  // part of this work: scripts/live-appearance.mjs rectifies, freezes the sea,
  // uses matched pairs and carries a false-registration control — and it now
  // also carries a REGISTRATION PRECONDITION, which it does not currently meet
  // at the ranges it measures. So it reports rather than asserts, and the
  // guarantee is made where it can be made exactly: over the foam path's own
  // shading arithmetic, swept across every facet tilt a breaking face can reach
  // and every source elevation the sky can produce.
  //
  // The model below is ocean.js's foam path term for term: the albedo lift, the
  // fresnel sky mix with foamSkyKeep, the raft's own forward-scattered radiance,
  // and — the fix — the macro normal levelled toward vertical by foamFlat.
  {
    const foamOf = (brk) => Math.min(1, brk * 3.0) * 0.911;  // breakFoam x the
    // shader's own (0.72 + 0.28 * mean rag); the lace is symmetric about its
    // mean so it cannot change the ORDER of two break strengths, only dither it
    const radiance = (brk, tilt, sunEl, flat) => {
      const foam = foamOf(brk);
      // the shading normal, levelled inside foam exactly as ocean.js levels it
      const nx = Math.sin(tilt) * (1 - flat * foam);
      const ny = Math.sqrt(Math.max(1e-9, 1 - nx * nx));
      const v = [Math.cos(0.22), Math.sin(0.22), 0];         // a low eye
      const L = [Math.cos(sunEl), Math.sin(sunEl), 0];
      // 1. the water's own diffuse + the albedo lift toward white
      const dif = Math.max(0, nx * L[0] + ny * L[1]);
      const albedo = 0.22 + (0.93 - 0.22) * (foam * GLITTER.foamAlbedo);
      let out = albedo * (0.35 + 0.65 * dif);
      // 2. the sky, through fresnel, foam keeping foamSkyKeep of it
      const fr = (1 - Math.max(0, nx * v[0] + ny * v[1])) ** 3;
      out += Math.min(1, fr * 0.45) * (1 - (1 - GLITTER.foamSkyKeep) * foam) * 0.55;
      // 3. the raft's OWN radiance — a scatterer, so no facet term at all
      out += foam * raftOf(brk) * (GLITTER.foamBack + GLITTER.foamFwd * 0.5)
        * (GLITTER.foamElevFloor + (1 - GLITTER.foamElevFloor) * Math.sin(sunEl));
      return out;
    };
    let worstNow = 1e9, worstThen = 1e9, atNow = null, atThen = null;
    const B = [0, 0.05, 0.12, 0.2, 0.3, 0.45, 0.7, 1.0];
    for (let e = 0; e <= 8; e++) {
      const sunEl = 0.05 + (e / 8) * 1.4;
      for (let k = 0; k <= 12; k++) {
        const tilt = (k / 12) * 0.7;         // up to 40 deg of forward face
        for (let i = 1; i < B.length; i++) {
          // EVERY step up the break ladder must brighten the water, at every
          // facet tilt and every sun. A breaking face is steeper than the water
          // beside it, so the honest comparison is a steep BROKEN facet against
          // a level UNBROKEN one — which is exactly the case that went negative.
          const d = radiance(B[i], tilt, sunEl, GLITTER.foamFlat)
            - radiance(B[i - 1], tilt * 0.6, sunEl, GLITTER.foamFlat);
          if (d < worstNow) { worstNow = d; atNow = { b: B[i], tilt, sunEl }; }
          const d0 = radiance(B[i], tilt, sunEl, 0)
            - radiance(B[i - 1], tilt * 0.6, sunEl, 0);
          if (d0 < worstThen) { worstThen = d0; atThen = { b: B[i], tilt, sunEl }; }
        }
      }
    }
    ok(worstNow > 0, `BREAK STRENGTH MONOTONICALLY BRIGHTENS THE WATER: the worst step`
      + ` anywhere in the sweep is ${worstNow >= 0 ? '+' : ''}${worstNow.toFixed(4)}`
      + ` (at break ${atNow.b}, face ${(atNow.tilt * DEG).toFixed(0)} deg,`
      + ` source ${(atNow.sunEl * DEG).toFixed(0)} deg up) over 9 source elevations`
      + ' x 13 facet tilts x 7 rungs of the ladder');
    // AND THE COUNTER-EXAMPLE: the same model with foamFlat = 0, which is the
    // arithmetic that shipped. It must go NEGATIVE, or this check proves nothing.
    ok(worstThen < 0, `and the un-levelled foam it replaces goes negative`
      + ` (${worstThen.toFixed(4)} at break ${atThen.b}, face`
      + ` ${(atThen.tilt * DEG).toFixed(0)} deg, source ${(atThen.sunEl * DEG).toFixed(0)} deg)`
      + ' — the defect, reproduced in arithmetic');
    console.log(`  foam radiance sweep: worst step +${worstNow.toFixed(4)} now,`
      + ` ${worstThen.toFixed(4)} un-levelled`);
  }
}

if (failed) { console.error(`verify-glitter: ${failed} FAILED`); process.exit(1); }
console.log('verify-glitter: OK — GLSL/JS parity exact over 64000 comparisons (and nine'
  + ' plausible mutations of the emitted arithmetic all caught); the water is lit from the REAL'
  + ' source (0 deg over a full lunar month, against 29.6 deg for the retired'
  + ` reconstruction); the roughness sits on Cox & Munk's line by construction`
  + ` (sigma ${SIGMA_REF.toFixed(3)} at 10 m/s) and widens monotonically with the sea;`
  + ` the corridor runs ${litSpan[0]} m to ${litSpan[1]} m down the bearing and is`
  + ` ${offBearing.toFixed(0)}x down 6 deg off it; brightness bounded both ways;`
  + ' the churn answers the sun; and APPEARANCE is gated as well as presence, ON THE'
  + ` WATER rather than on a noise field — a real stretch of road over waves.js's own`
  + ` surface carries ${glintDensity.toFixed(2)} separated glints per square metre standing`
  + ` ${glintContrast.toFixed(1)}x over the water between them, where the smooth lobe it`
  + ' replaces has no maximum anywhere that stands twice its own median; the glints are'
  + ` CONTRAST (E[glint] = 1 by construction; the strip integrates to`
  + ` ${glintMeanRatio.toFixed(2)}x what the smooth lobe put there); they soften with the`
  + ' pixel footprint and nothing else; and a raft is dense at its head and shredded at'
  + ' its tail');
