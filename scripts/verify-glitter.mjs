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
  GLITTER, SIGMA_REF, belowFrac, coxMunkVar, sigmaFor, footprint, lobe,
  fresnelWater, pathValue, glslGlitter,
} from '../src/glitter.js';
import { glitterSource, moonBrightness } from '../src/lightrig.js';
import { solarState, lunarState, moonPhase, DAY_LENGTH, MOON_MONTH_DAYS } from '../src/skymath.js';
import { COMPONENTS, SWELL_LEN, GRAD_BANDS } from '../src/waves.js';
import { seaBandsFor } from '../src/weather.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };
const DEG = 180 / Math.PI;
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
for (const fn of ['oGlBelow', 'oGlSigma', 'oGlLobe', 'oGlFresnel', 'oGlFoot'])
  ok(glsl.includes(`float ${fn}(`) || glsl.includes(`vec2 ${fn}(`), `GLSL emits ${fn}`);
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
]) ok(glsl.includes(num17(v)), `the emitted GLSL carries GLITTER.${name} (${num17(v)})`);
for (const [name, v] of [
  ['gain', GLITTER.gain], ['clamp', GLITTER.clamp], ['foamSigma', GLITTER.foamSigma],
  ['foamBack', GLITTER.foamBack], ['foamFwd', GLITTER.foamFwd],
  ['twNear', GLITTER.twNear], ['twFar', GLITTER.twFar],
]) ok(srcOcean.includes(`GLITTER.${name}`), `ocean.js reads GLITTER.${name} rather than a literal`);
ok(srcOcean.includes(`GLITTER.plainCut`) && srcOcean.includes('uWaveLOD > 0.5'),
  'the plain tier widens its own lobe by the components it does not draw');
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
const jsTwins = (() => {
  let s = glsl.replace(/\/\/[^\n]*/g, '');            // comments first
  // signatures: strip the return type and the parameter types
  s = s.replace(/(?:float|vec2|vec3)\s+(oGl\w+)\s*\(([^)]*)\)\s*\{/g,
    (_, name, params) => `function ${name}(${params.split(',')
      .map((p) => p.trim().split(/\s+/).pop()).join(', ')}) {`);
  s = s.replace(/\bvec2\s*\(/g, '__v2(')              // vec2(a, b) -> [a, b]
    .replace(/\bfloat\s+/g, 'let ')                   // locals
    .replace(/\bh\.x\b/g, 'h[0]').replace(/\bh\.y\b/g, 'h[1]').replace(/\bh\.z\b/g, 'h[2]')
    .replace(/\bclamp\s*\(/g, '__clamp(')
    .replace(/\b(max|min|log|exp|sqrt|abs|pow)\s*\(/g, 'Math.$1(');
  // nothing GLSL-only may survive, or the transliteration has stopped covering
  // what is being emitted
  const leftover = s.match(/\b(float|vec[234]|mat[234]|clamp|mix|smoothstep|fract|inversesqrt|texture2D|dFdx)\b/);
  ok(!leftover, `the GLSL transliteration covers every construct emitted`
    + (leftover ? ` — found "${leftover[1]}", so this gate is measuring nothing until it is taught that` : ''));
  const names = [...glsl.matchAll(/(?:float|vec2)\s+(oGl\w+)\s*\(/g)].map((m) => m[1]);
  ok(names.length === 5, `all five emitted functions found (${names.join(', ')})`);
  const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
  const v2 = (a, b) => [a, b];
  // eslint-disable-next-line no-new-func
  return new Function('__clamp', '__v2', `${s}\nreturn { ${names.join(', ')} };`)(clamp, v2);
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
    const sigA = sigmaFor(lam, swG, chG, flr), sigB = sigmaFor(lam * (0.05 + rnd()), swG, chG, flr);
    // half-vectors from near-vertical to absurdly grazing, and a few negatives
    const hz = rnd() < 0.1 ? rnd() * 0.02 - 0.01 : 0.6 + rnd() * 0.4;
    const hx = (rnd() * 2 - 1) * 0.8, hy = (rnd() * 2 - 1) * 0.8;
    cmp('oGlLobe', jsTwins.oGlLobe([hx, hy, hz], sigA, sigB), lobe(hx, hy, hz, sigA, sigB));
    const c = rnd() < 0.15 ? rnd() * 2.4 - 1.2 : rnd(); // out of range on purpose
    cmp('oGlFresnel', jsTwins.oGlFresnel(c), fresnelWater(c));
    const dist = rnd() < 0.1 ? rnd() * 0.2 : Math.exp(rnd() * Math.log(1e5));
    const graze = rnd() < 0.2 ? rnd() * 0.005 : rnd();
    const pixA = 1e-4 + rnd() * 4e-3;
    const gf = jsTwins.oGlFoot(dist, graze, pixA), jf = footprint(dist, graze, pixA);
    cmp('oGlFoot.across', gf[0], jf.across);
    cmp('oGlFoot.along', gf[1], jf.along);
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
    ['exp(-0.5 * q) become exp(-q)', (t) => t.replace('exp(-0.5 * q) * e', 'exp(-q) * e')],
    ["oGlFoot's two components swapped", (t) => t.replace(/return vec2\(across, (min[^;]+)\);/, 'return vec2($1, across);')],
  ];
  for (const [label, mutate] of mutants) {
    const mutated = mutate(glsl);
    ok(mutated !== glsl, `counter-example is applicable: ${label}`);
    let caught = false;
    try {
      let s = mutated.replace(/\/\/[^\n]*/g, '')
        .replace(/(?:float|vec2|vec3)\s+(oGl\w+)\s*\(([^)]*)\)\s*\{/g,
          (_, name, params) => `function ${name}(${params.split(',')
            .map((p) => p.trim().split(/\s+/).pop()).join(', ')}) {`)
        .replace(/\bvec2\s*\(/g, '__v2(').replace(/\bfloat\s+/g, 'let ')
        .replace(/\bh\.x\b/g, 'h[0]').replace(/\bh\.y\b/g, 'h[1]').replace(/\bh\.z\b/g, 'h[2]')
        .replace(/\bclamp\s*\(/g, '__clamp(')
        .replace(/\b(max|min|log|exp|sqrt|abs|pow)\s*\(/g, 'Math.$1(');
      // eslint-disable-next-line no-new-func
      const m = new Function('__clamp', '__v2', `${s}\nreturn { oGlLobe, oGlFoot };`)(
        (x, a, b) => Math.min(Math.max(x, a), b), (a, b) => [a, b]);
      if (rel(m.oGlLobe([0.06, 0.02, 0.995], 0.16, 0.12), lobe(0.06, 0.02, 0.995, 0.16, 0.12)) > TOL) caught = true;
      const f = m.oGlFoot(300, 0.02, 1.4e-3), jf2 = footprint(300, 0.02, 1.4e-3);
      if (rel(f[0], jf2.across) > TOL || rel(f[1], jf2.along) > TOL) caught = true;
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

if (failed) { console.error(`verify-glitter: ${failed} FAILED`); process.exit(1); }
console.log('verify-glitter: OK — GLSL/JS parity exact over 28000 comparisons (and four'
  + ' plausible mutations of the emitted lobe all caught); the water is lit from the REAL'
  + ' source (0 deg over a full lunar month, against 29.6 deg for the retired'
  + ` reconstruction); the roughness sits on Cox & Munk's line by construction`
  + ` (sigma ${SIGMA_REF.toFixed(3)} at 10 m/s) and widens monotonically with the sea;`
  + ` the corridor runs ${litSpan[0]} m to ${litSpan[1]} m down the bearing and is`
  + ` ${offBearing.toFixed(0)}x down 6 deg off it; brightness bounded both ways;`
  + ' and the churn answers the sun');
