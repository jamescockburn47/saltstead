// verify-crest: CRESTING AND BREAKING (src/waves.js Phase C, src/shipphysics.js
// Phase D). The sea has always known the wind — sea v2 turns the wind-sea's
// spreading axis to follow it and the wind is a real latitude field — and the
// player could not SEE it. This gate holds the two things that changed that.
//
// WHAT IS PROVED HERE, IN ORDER:
//
//  1. THE ARITHMETIC, NOT THE CONSTANTS. Both emitted blocks (glslWaves and
//     glslBreak) are TRANSLITERATED into JavaScript and held against the module's
//     own twins numerically, over tens of thousands of sampled geometries, with
//     ten deliberate mutations as counter-examples that must all fail. That is
//     the standard verify-glitter set on 2026-07-26 and the reason for it applies
//     here twice over: a string search cannot see cos(2 phi) become cos(phi), a
//     transposed atan2 that puts the foam on the back of every wave, or a band
//     composer that has dropped the sea state's SQUARE.
//  2. THE MATHEMATICAL SAFETY LINE. sin(phi) - q cos(2 phi) has one crest per
//     period only while q < 1/4; past it the trough dimples and the wave grows a
//     second crest. The line is asserted as a number AND as an extremum count
//     run through the emitted arithmetic itself, with q = 0.30 as the
//     counter-example.
//  3. THE SHAPE ANSWERS THE SEA. Crest-versus-trough asymmetry (elevation
//     skewness, and the curvature conditioned on standing high or lying low)
//     must rise with sea state and vanish in a calm.
//  4. THE COVERAGE IS A CALCULATION, NOT A TASTE. A narrow-band sea's envelope
//     is Rayleigh and the phase window covers a fixed share of a period, so
//     whitecap coverage is answerable: near zero in the doldrums, monotone, and
//     inside a sane band in a gale. Monahan & O'Muircheartaigh (1980) fitted
//     W = 3.84e-6 U^3.41 to photographs — 0.09% at 5 m/s, 1.0% at 10, 3.9% at
//     15 — and the realised field is measured against that ladder.
//  5. THE THREE WIND CUES, HEADLESSLY. Crest lines lie ACROSS the wind (the
//     break field must decorrelate far faster along the wind than across it);
//     whitecaps favour the DOWNWIND face (the window's forward mass, and the
//     realised foam's own split by along-wind slope sign); and the gale's
//     windrows lie along the wind (ocean.js, checked structurally here and in
//     pixels by live-crest.mjs).
//  6. THE SHORE. Breaking is confined to the surf band and stood down entirely
//     by the strait gate — sheltered water does not break.
//  7. PHASE D. A breaker costs way and heading and NOTHING else: bounded,
//     monotone in the field, worse on the beam than on the bow, and incapable of
//     capsizing anybody.
//
// Pure module gate: no THREE, no DOM, no Math.random.
import { readFileSync } from 'node:fs';
import {
  COMPONENTS, NWAVE, NSWELL, CREST_Q, CREST_DIMPLE, CREST_MAX_FRAC,
  CREST_COEF, crestQ, MAX_HARM_SWELL, MAX_HARM_CHOP,
  BREAK, breakWindow, breakOf, breakOpen, breakShore, breakFoam, breaking,
  breakAge, breakAgeOpen, breakAgeShore,
  waveMix, waveGradMix, waveHeight, waveGradient, waveBandHeight, waveBandGrad,
  waveBandDir, waveAxisFor, setWaveAxes, setWaveOrigin, setSeaBands,
  setShoreSampler, shoreEnv, shoreHeight,
  packWaveUniforms, glslWaves, glslWavesHasLodBranch, glslBreak, glslShore,
  SEA_SWELL_MAX, SEA_STATE_MAX,
  RIVER_STATE,
} from '../src/waves.js';
import {
  BREAKER, breakerEffect, newShipState, SPECS, SLOOP, GALLEON,
} from '../src/shipphysics.js';
import { seaBandsFor, windProfile } from '../src/weather.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };
// deterministic sampling (LCG — no Math.random in the gate)
let seed = 20260726;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const TAU = Math.PI * 2;

const srcWaves = readFileSync(new URL('../src/waves.js', import.meta.url), 'utf8');
const srcOcean = readFileSync(new URL('../src/ocean.js', import.meta.url), 'utf8');
const srcShip = readFileSync(new URL('../src/shipphysics.js', import.meta.url), 'utf8');

// ---- 1. purity and wiring ---------------------------------------------------
ok(!/Math\.random\s*\(/.test(srcWaves) && !/Math\.random\s*\(/.test(srcShip),
  'no Math.random in the sea or in the hull');
ok(!/from '(three|\.\/earthdata)/.test(srcWaves) && !/\b(document|window)\.\w/.test(srcWaves),
  'waves.js is still pure — no THREE, no DOM');
ok(/glslBreak\(\)/.test(srcOcean), 'ocean.js consumes the emitted break block');
ok(/oBreakOpen\(/.test(srcOcean) && /oBreakShore\(/.test(srcOcean),
  'and calls BOTH halves of it — the open sea and the surf');
ok(/oWaveMix\(/.test(srcOcean) && /oWaveGradMix\(/.test(srcOcean),
  'ocean.js composes its bands through the emitted composer rather than a literal');
// THE RETIRED MASK MUST STAY RETIRED. Foam used to be a HEIGHT threshold on the
// normalised surface, gated on chop > 1.05 and diced by two fbm lotteries — it
// could not tell a wave's face from its back, which is the whole complaint.
// Comments are stripped first: ocean.js QUOTES the retired expression where it
// explains itself, and a gate that cannot tell code from prose is not a gate.
const oceanCode = srcOcean.replace(/\/\/[^\n]*/g, '');
ok(!/smoothstep\(0\.72, 0\.95, oCrest\)/.test(oceanCode),
  'the retired height-thresholded whitecap mask is gone from ocean.js');
ok(!/smoothstep\(1\.05, 1\.75, uSwellS\)/.test(oceanCode),
  'and so is its chop gate — the steepness criterion IS the wind gate now');
ok(/smoothstep\(0\.72, 0\.95, oCrest\)/.test(srcOcean),
  'and ocean.js still SAYS what it replaced, so the next reader knows why');
ok(/uWaveQ/.test(srcOcean) && /uWindDir/.test(srcOcean),
  'ocean.js carries the harmonic table and the wind axis as uniforms');
ok(/packWaveUniforms\(t, this\.uniforms\.uWave\.value, this\.uniforms\.uWaveQ\.value\)/.test(srcOcean),
  'ONE packing call fills both arrays, so a stale harmonic table cannot happen');
// the gale's windrows: sampled in the WIND's frame, at two scales, so they can
// never be a world-axis grating (live-grating.mjs measures that in pixels)
ok(/dot\(vWPos\.xz, uWindDir\)/.test(srcOcean)
  && /dot\(vWPos\.xz, vec2\(-uWindDir\.y, uWindDir\.x\)\)/.test(srcOcean),
  'the windrow noise is sampled in the wind\'s own frame, not the world\'s');
ok(/oWr\.x \* 0\.02, oWr\.y \* 0\.28/.test(srcOcean),
  'and it is anisotropic — 50 m of period down the wind against 3.6 m across it');

// ============ 2. THE TRANSLITERATED GLSL — THE PARITY GATE ============
// Both emitted blocks are scalar-or-small-vector arithmetic over a fixed set of
// GLSL builtins, every one of which maps onto Math.* or a three-line shim. The
// rules below are deliberately NARROW and the leftover assertion FAILS LOUD: if
// either block ever grows a construct the rules do not cover, this gate goes red
// rather than quietly measuring nothing.
const SHIMS = {
  __v2: (a, b) => ({ x: a, y: b === undefined ? a : b }),
  __v4: (a, b, c, d) => (b === undefined
    ? { x: a, y: a, z: a, w: a } : { x: a, y: b, z: c, w: d }),
  __add: (dst, src) => {
    dst.x += src.x; dst.y += src.y;
    if (src.z !== undefined) { dst.z += src.z; dst.w += src.w; }
  },
  __ss: (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  },
};
function translate(glsl) {
  let s = glsl.replace(/\/\/[^\n]*/g, '');            // comments first
  s = s.replace(/^\s*uniform [^\n]*\n/gm, '');        // uniforms are bound below
  // signatures: strip the return type and the parameter types
  s = s.replace(/(?:float|vec[234])\s+(o\w+)\s*\(([^)]*)\)\s*\{/g,
    (_, name, params) => `function ${name}(${params.split(',')
      .map((p) => p.trim().split(/\s+/).pop()).filter((p) => p).join(', ')}) {`);
  s = s.replace(/\b(?:float|int|vec[234])\s+(\w+)\s*=/g, 'let $1 =')  // locals
    .replace(/\bvec([24])\s*\(/g, '__v$1(')                           // constructors
    .replace(/(\w+)\s*\+=\s*(__v[24])\(([^;]*)\);/g, '__add($1, $2($3));')
    .replace(/\bsmoothstep\s*\(/g, '__ss(')
    .replace(/\bclamp\s*\(/g, '__clamp(')
    .replace(/\batan\s*\(/g, 'Math.atan2(')
    .replace(/\b(sin|cos|sqrt|abs|floor|max|min|pow|exp|log)\s*\(/g, 'Math.$1(');
  const leftover = s.match(
    /\b(float|int|vec[234]|mat[234]|uniform|mix|clamp|fract|dot|length|inversesqrt|texture2D|dFdx|step)\b/);
  ok(!leftover, 'the GLSL transliteration covers every construct emitted'
    + (leftover ? ` — found "${leftover[1]}", so this gate is measuring nothing`
      + ' until it is taught that' : ''));
  const names = [...glsl.matchAll(/(?:float|vec[234])\s+(o\w+)\s*\(/g)].map((m) => m[1]);
  // eslint-disable-next-line no-new-func
  return new Function('__v2', '__v4', '__add', '__ss', '__clamp',
    `let uWave = null, uWaveQ = null, uWaveLOD = 1;\n${s}\n`
    + `return { __set: (a, b, l) => { uWave = a; uWaveQ = b; uWaveLOD = l; },`
    + ` ${names.join(', ')} };`)(SHIMS.__v2, SHIMS.__v4, SHIMS.__add, SHIMS.__ss,
    (x, a, b) => Math.min(Math.max(x, a), b));
}
const waveBlock = glslWaves(), breakBlock = glslBreak();
const G = translate(waveBlock);
const B = translate(breakBlock);
for (const fn of ['oWaveMix', 'oWaveGradMix', 'oWaveSwell', 'oWaveWind',
  'oWaveGradLong', 'oWaveGradMid', 'oWaveGradShort']) {
  ok(typeof G[fn] === 'function', `the wave block's ${fn} transliterated`);
}
// THE STRUCTURAL FORM OF THE SAME PROMISE, and the one that survives a rewrite of
// the numeric clause below: no emitted sum may branch on the tier at all.
ok(!glslWavesHasLodBranch(),
  'no emitted wave function branches on uWaveLOD — the tier lever is ocean.js\'s '
  + 'business and it may not reach inside the sums the break field reads');
ok(!/oWaveWindLod/.test(waveBlock),
  'and the retired LOD twin of the height is gone with it');
ok(/uWaveLOD > 0\.5 \? 1\.0 : 0\.0/.test(oceanCode)
  && /oWGs \* oChop \* oFadeS \* oLodS/.test(oceanCode),
  'ocean.js applies the tier lever to the SHADING gradient at the call site');
ok(/oWaveMix\(oWaveWind\(oLP\), uSwellS\)/.test(oceanCode),
  'and the fragment reads the FULL wind band, exactly as the hull does');
for (const fn of ['oBreakWin', 'oBreak', 'oBreakOpen', 'oBreakShore',
  'oBreakAge', 'oBreakAgeOpen', 'oBreakAgeShore']) {
  ok(typeof B[fn] === 'function', `the break block's ${fn} transliterated`);
}
// the shader must SPEND the age, not merely be handed it: a whitecap drawn as one
// flat opacity was the v2 showcase's "torn-paper decal" (03-crest-gale...png)
ok(/oBreakAgeOpen\(/.test(srcOcean) && /oGlShred\(/.test(srcOcean),
  'ocean.js reads the break window\'s own age and shreds the spent tail with it');

const rel = (a, b) => (Math.abs(a) + Math.abs(b) < 1e-300 ? 0
  : Math.abs(a - b) / Math.max(1e-300, Math.abs(a), Math.abs(b)));
// ABSOLUTE first, relative as a fallback. A relative-only tolerance is the wrong
// instrument for a SUM: 28 components of amplitude ~0.1 m can cancel to 1e-5, and
// a 1e-13 m disagreement in metres then reads as 1e-8 "relative" while being a
// millionth of a millimetre of water. The absolute floor is the honest bit-level
// lock on a height field measured in metres; the relative term keeps the large
// values honest too.
const ABS_TOL = 1e-11, REL_TOL = 1e-12;
const off = (a, b) => Math.max(0, Math.abs(a - b) - ABS_TOL - REL_TOL
  * Math.max(Math.abs(a), Math.abs(b)));
// packWaveUniforms into PLAIN ARRAYS keeps the uniforms in float64, so this
// comparison measures the ARITHMETIC and not the GPU's own rounding (which
// verify-waves holds separately at the 2e-3 contract, against the real
// Float32Array).
//
// WHY THE FLOOR IS 1e-11 m AND NOT verify-glitter's 1e-12 RELATIVE. The packed
// phase is WRAPPED to [0, 2pi) — the float32-precision device the whole of sea v2
// exists for — while the CPU evaluator carries acc - omega*t unwrapped, and
// omega*t reaches 2e4 radians over a two-hour clock. The two sines are therefore
// handed arguments differing by an exact multiple of 2pi, and float64 sin of a
// 2e4-radian argument carries about 1e-12 of argument error. Measured worst
// disagreement over the sweep below: ~2e-13 m of water. That is the bit-level
// lock; it is not a tolerance for a wrong term, and the mutations prove it.
const uni = (t) => {
  const uq = [];
  const u = packWaveUniforms(t, new Array(NWAVE * 4), uq);
  const arr = [];
  for (let i = 0; i < NWAVE; i++) {
    arr.push({ x: u[i * 4], y: u[i * 4 + 1], z: u[i * 4 + 2], w: u[i * 4 + 3] });
  }
  return [arr, uq];
};
{
  let worstAbs = 0, n = 0;
  const cmp = (what, a, b) => {
    n++;
    worstAbs = Math.max(worstAbs, Math.abs(a - b));
    if (off(a, b) > 0) {
      ok(false, `${what}: emitted GLSL gives ${a}, the module ${b}`
        + ` (off by ${Math.abs(a - b).toExponential(2)}) — THE SHADER IS NOT DRAWING`
        + ' WHAT THIS GATE PROVES');
    }
  };
  for (const [ox, oz] of [[0, 0], [40000, -22000], [-120000, 95000]]) {
    for (const [asw, awd] of [[0, 0], [0.7, 2.4], [-1.9, 0.35]]) {
      setWaveOrigin(ox, oz);
      setWaveAxes(asw, awd);
      for (let it = 0; it < 90; it++) {
        const t = rnd() * 7200;
        const [arr, uq] = uni(t);
        G.__set(arr, uq, 1);
        const lx = (rnd() - 0.5) * 720, lz = (rnd() - 0.5) * 720;
        const lp = { x: lx, y: lz };
        const x = ox + lx, z = oz + lz;
        // the two band sums, each half
        const hS = G.oWaveSwell(lp), hW = G.oWaveWind(lp);
        const [cSl, cSh] = waveBandHeight(0, x, z, t);
        const [cWl, cWh] = waveBandHeight(1, x, z, t);
        cmp('oWaveSwell.linear', hS.x, cSl);
        cmp('oWaveSwell.harmonic', hS.y, cSh);
        cmp('oWaveWind.linear', hW.x, cWl);
        cmp('oWaveWind.harmonic', hW.y, cWh);
        // the composer, at split states
        const gs = 0.3 + rnd() * 2.1, gc = 0.3 + rnd() * 1.7;
        cmp('oWaveMix(swell)', G.oWaveMix(hS, gs), waveMix(cSl, cSh, gs));
        cmp('oWaveMix(wind)', G.oWaveMix(hW, gc), waveMix(cWl, cWh, gc));
        // the whole height, composed exactly as the shader composes it
        setSeaBands(gs, gc);
        cmp('the whole surface', G.oWaveMix(hS, gs) + G.oWaveMix(hW, gc),
          waveHeight(x, z, t));
        // the gradient, band by band and LOD band by LOD band
        const dL = G.oWaveGradLong(lp), dM = G.oWaveGradMid(lp), dSh = G.oWaveGradShort(lp);
        const [aSx, aSz, bSx, bSz] = waveBandGrad(0, x, z, t);
        const [aWx, aWz, bWx, bWz] = waveBandGrad(1, x, z, t);
        cmp('oWaveGradLong.linear.x', dL.x, aSx);
        cmp('oWaveGradLong.linear.z', dL.y, aSz);
        cmp('oWaveGradLong.harmonic.x', dL.z, bSx);
        cmp('oWaveGradLong.harmonic.z', dL.w, bSz);
        cmp('mid+short linear.x', dM.x + dSh.x, aWx);
        cmp('mid+short linear.z', dM.y + dSh.y, aWz);
        cmp('mid+short harmonic.x', dM.z + dSh.z, bWx);
        cmp('mid+short harmonic.z', dM.w + dSh.w, bWz);
        const mixed = G.oWaveGradMix(dL, gs);
        cmp('oWaveGradMix.x', mixed.x, waveGradMix(aSx, bSx, gs));
        cmp('oWaveGradMix.y', mixed.y, waveGradMix(aSz, bSz, gs));
        // ---- AND THE TIER CANNOT REACH INSIDE THE SUMS ----
        // This clause replaces two that a cold review convicted. One read
        //     ok(Math.abs(hLo.x) < Math.abs(hHi.x) + 1e9, 'a subset sum')
        // — 1e9, not 1e-9, so it was true of every finite pair of metres of water
        // and it was the ONLY guard on the tier lever. Under it, the plain tier's
        // break field was measured 4x weaker than the hull's with pointwise
        // divergences of 0.89. The lever is now a shading multiplier in ocean.js
        // and every emitted function is LOD-INDEPENDENT, which is a far stronger
        // thing to assert and cannot be satisfied by a typo: flip the uniform and
        // NOTHING may move.
        G.__set(arr, uq, 0);
        const hLo = G.oWaveWind(lp), dLo = G.oWaveGradShort(lp);
        G.__set(arr, uq, 1);
        const hHi = G.oWaveWind(lp), dHi = G.oWaveGradShort(lp);
        cmp('oWaveWind is the whole wind band', hHi.x, cWl);
        cmp('and its harmonic too', hHi.y, cWh);
        cmp('the height is LOD-independent (linear)', hLo.x, hHi.x);
        cmp('the height is LOD-independent (harmonic)', hLo.y, hHi.y);
        cmp('the short gradient is LOD-independent (linear x)', dLo.x, dHi.x);
        cmp('...(linear z)', dLo.y, dHi.y);
        cmp('...(harmonic x)', dLo.z, dHi.z);
        cmp('...(harmonic z)', dLo.w, dHi.w);
        setSeaBands(1, 1);
      }
    }
  }
  console.log(`  wave-block GLSL/JS parity: ${n} comparisons, worst absolute`
    + ` ${worstAbs.toExponential(2)} m (ceiling ${ABS_TOL} + ${REL_TOL} relative)`);
}

// the break block, over the whole space its two callers can hand it
{
  const TOL = 1e-12;
  let worst = 0, n = 0;
  const cmp = (what, a, b) => {
    n++;
    const r = rel(a, b);
    if (r > worst) worst = r;
    if (r > TOL) ok(false, `${what}: emitted GLSL gives ${a}, the module ${b} (${r.toExponential(2)})`);
  };
  for (let i = 0; i < 7000; i++) {
    const d = (rnd() - 0.5) * TAU * 2;            // the window, wrapped and not
    cmp('oBreakWin', B.oBreakWin(d), breakWindow(d));
    const rnd0 = rnd() * 1.2;
    const h = (rnd() - 0.5) * 8, gsl = (rnd() - 0.5) * 1.2;
    const kRef = 0.02 + rnd() * 0.9;
    const s0 = rnd() * 0.2, s1 = s0 + 1e-4 + rnd() * 0.3;
    cmp('oBreak', B.oBreak(h, gsl, kRef, s0, s1), breakOf(h, gsl, kRef, s0, s1));
    cmp('oBreakOpen', B.oBreakOpen(h, gsl), breakOpen(h, gsl));
    const sd = -(rnd() * 600) + 20;
    cmp('oBreakShore', B.oBreakShore(h, gsl, sd), breakShore(h, gsl, sd));
    cmp('oBreakFoam', B.oBreakFoam(rnd0), breakFoam(rnd0));
    cmp('oBreakAge', B.oBreakAge(h, gsl, kRef), breakAge(h, gsl, kRef));
    cmp('oBreakAgeOpen', B.oBreakAgeOpen(h, gsl), breakAgeOpen(h, gsl));
    cmp('oBreakAgeShore', B.oBreakAgeShore(h, gsl), breakAgeShore(h, gsl));
  }
  // ---- AND THE AGE MUST MEAN WHAT ITS NAME SAYS --------------------------
  // 0 at the tumbling head, 1 at the spent end. The whole point of exposing it is
  // that the shader can draw a whitecap with a shape; an age that ran the other
  // way would put the holes in the head and the dense water in the wake, and the
  // parity check above would not notice, because both sides would be wrong.
  {
    // sample the window by its own phase: hk = sin(phase-ish), gs = cos, so that
    // d walks the circle exactly as breakOf builds it
    const ageAt = (d) => {
      const a = -(d - BREAK.lead) / BREAK.trail;
      return a < 0 ? 0 : a > 1 ? 1 : a;
    };
    ok(ageAt(BREAK.lead) === 0 && ageAt(BREAK.lead + 0.5) === 0,
      'the age is 0 at the window peak and everywhere forward of it');
    ok(Math.abs(ageAt(BREAK.lead - BREAK.trail) - 1) < 1e-12,
      'and exactly 1 where the trailing decay has run out');
    let mono = true, prev = -1;
    for (let k = 0; k <= 200; k++) {
      const a = ageAt(BREAK.lead - (k / 200) * BREAK.trail);
      if (a < prev - 1e-12) mono = false;
      prev = a;
    }
    ok(mono, 'and it rises monotonically down the tail');
    // the age must agree with the window it is cut from: wherever the window has
    // died astern, the age has reached 1
    ok(breakWindow(BREAK.lead - BREAK.trail) < 1e-12 && ageAt(BREAK.lead - BREAK.trail) === 1,
      'the age and the window run out together');
    // and the arithmetic the SHADER will run must land on the same numbers as
    // this reasoning: drive breakAge through a real (h, gs) pair at the peak
    const kRef0 = 0.5;
    const hp = Math.sin(BREAK.lead + Math.PI / 2) / kRef0, gp = Math.cos(BREAK.lead + Math.PI / 2);
    ok(breakAge(hp, gp, kRef0) < 1e-9,
      `breakAge is 0 at the window's own peak driven through (h, gs)`
      + ` (${breakAge(hp, gp, kRef0).toExponential(2)})`);
  }
  console.log(`  break-block GLSL/JS parity: ${n} comparisons, worst relative`
    + ` ${worst.toExponential(2)} (ceiling ${TOL})`);
}

// ---- 2d. ONE FIELD, BOTH CONSUMERS, ON EVERY TIER --------------------------
// The claim in the headline is that the shader's whitecaps and the hull's breaker
// are the same function. The two blocks agreeing term-for-term does not establish
// that on its own: what the SHADER feeds oBreakOpen has to be what the CPU feeds
// breakOpen, and until a cold review measured it the plain tier fed it a wind band
// with every component under 20 m missing from BOTH inputs — mean field 1.06% on
// fine against 0.26% on plain, pointwise divergences to 0.89. So the shader's whole
// break path is reassembled here out of the emitted functions, exactly as ocean.js
// assembles it, and held against breaking() AT BOTH SETTINGS OF THE TIER LEVER.
{
  let worstFine = 0, worstPlain = 0, tierGap = 0, n = 0, sum = 0;
  setShoreSampler(null);
  for (const [ox, oz] of [[0, 0], [40000, -22000]]) {
    for (const [sw, ch] of [[1.54, 1.05], [2.17, 1.325], [0.42, 0.75]]) {
      setWaveOrigin(ox, oz);
      setWaveAxes(0.7, 2.4);
      setSeaBands(sw, ch);
      const [dx, dz] = waveBandDir(1);
      for (let it = 0; it < 260; it++) {
        const t = rnd() * 3600;
        const [arr, uq] = uni(t);
        const lx = (rnd() - 0.5) * 700, lz = (rnd() - 0.5) * 700;
        const lp = { x: lx, y: lz };
        const cpu = breaking(ox + lx, oz + lz, t);
        let fine = 0, plain = 0;
        for (const lod of [1, 0]) {
          G.__set(arr, uq, lod);
          // ocean.js: oHwd = oSAtt * oWaveMix(oWaveWind(oLP), uSwellS), and
          // oGsW = dot(oWGm + oWGs, uWindDir) with each band mixed by uSwellS
          const h = G.oWaveMix(G.oWaveWind(lp), ch);
          const gm = G.oWaveGradMix(G.oWaveGradMid(lp), ch);
          const gsh = G.oWaveGradMix(G.oWaveGradShort(lp), ch);
          const gs = (gm.x + gsh.x) * dx + (gm.y + gsh.y) * dz;
          const b = B.oBreakOpen(h, gs);
          if (lod === 1) fine = b; else plain = b;
        }
        worstFine = Math.max(worstFine, Math.abs(fine - cpu));
        worstPlain = Math.max(worstPlain, Math.abs(plain - cpu));
        tierGap = Math.max(tierGap, Math.abs(fine - plain));
        sum += cpu; n++;
      }
    }
  }
  ok(worstFine < 1e-9,
    `the SHADER's break field is the HULL's on the fine tier (worst `
    + `${worstFine.toExponential(2)} over ${n} points, mean field `
    + `${(100 * sum / n).toFixed(3)}%)`);
  ok(worstPlain < 1e-9,
    `AND ON THE PLAIN TIER (worst ${worstPlain.toExponential(2)}) — this is the clause `
    + 'that a 1e9 typo used to stand in for, and under it plain measured 4x weaker '
    + 'than the hull with pointwise divergences of 0.89');
  ok(tierGap === 0,
    `the two tiers draw the identical break field (gap ${tierGap}) — the tier may `
    + 'change the SHADING and nothing the criterion reads');
  setSeaBands(1, 1);
  setWaveAxes(0, 0);
  setWaveOrigin(0, 0);
}

// ---- 2b. THE COUNTER-EXAMPLES ----------------------------------------------
// Without these the parity checks above could be comparing a thing to itself and
// nobody would know. Each mutation is an edit somebody could plausibly make.
{
  const probe = (mod) => {
    // a fixed geometry that exercises every term of both blocks
    setWaveOrigin(40000, -22000);
    setWaveAxes(0.7, 2.4);
    const [arr, uq] = uni(123.5);
    const lp = { x: 41.3, y: -77.9 };
    mod.__set(arr, uq, 1);
    const hS = mod.oWaveSwell(lp), dL = mod.oWaveGradLong(lp);
    return [mod.oWaveMix(hS, 1.54), hS.y, dL.z, dL.w,
      mod.oWaveGradMix ? mod.oWaveGradMix(dL, 1.3).x : 0];
  };
  const base = probe(G);
  const waveMutants = [
    ['cos(2 phi) becomes cos(phi)', (s) => s.replace(/1\.0 - 2\.0 \* s \* s/g, '1.0 - s * s')],
    ["the band composer drops the state's SQUARE",
      (s) => s.replace('return g * h.x - g * g * h.y;', 'return g * h.x - g * h.y;')],
    ['the harmonic is ADDED instead of subtracted',
      (s) => s.replace('return g * h.x - g * g * h.y;', 'return g * h.x + g * g * h.y;')],
    ['the harmonic gradient factor is halved', (s) => s.replace(/4\.0 \* q \* s \* c/g, '2.0 * q * s * c')],
    ['the gradient lanes are swapped',
      (s) => s.replace(/vec4\(w\.x \* a, w\.y \* a, w\.x \* b, w\.y \* b\)/g,
        'vec4(w.x * b, w.y * b, w.x * a, w.y * a)')],
  ];
  for (const [label, mutate] of waveMutants) {
    const text = mutate(waveBlock);
    ok(text !== waveBlock, `counter-example is applicable: ${label}`);
    let caught = false;
    try {
      const m = translate(text);
      const got = probe(m);
      caught = got.some((v, i) => off(v, base[i]) > 0);
    } catch { caught = true; }
    ok(caught, `the parity gate catches it when ${label}`);
  }
  const bProbe = (mod) => [
    mod.oBreakWin(0.3), mod.oBreakWin(-1.2),
    mod.oBreak(0.42, -0.06, 0.25, 0.07, 0.16),
    mod.oBreakOpen(0.42, -0.06), mod.oBreakOpen(0.42, 0.06),
    // the shore probe must be a geometry that actually BREAKS, or a mutation of the
    // surf window multiplies zero by something and goes uncaught. It did, the first
    // time the shore threshold was retuned: (0.3, -0.05) fell below the new gate and
    // took the counter-example with it. Two points, well inside the criterion.
    mod.oBreakShore(0.9, -0.15, -120), mod.oBreakShore(1.4, 0.22, -60),
    mod.oBreakFoam(0.8),
  ];
  const bBase = bProbe(B);
  const breakMutants = [
    ['the local phase is transposed (atan2 arguments swapped)',
      (s) => s.replace('atan(hk, gs)', 'atan(gs, hk)')],
    ['the window\'s asymmetry is reversed — foam leading the WRONG way',
      (s) => s.replace(/e >= 0\.0 \? ([\d.]+) : ([\d.]+)/, 'e >= 0.0 ? $2 : $1')],
    ['the steepness envelope forgets the slope term',
      (s) => s.replace('sqrt(hk * hk + gs * gs)', 'sqrt(hk * hk)')],
    ['the steepness gate is inverted',
      (s) => s.replace('smoothstep(s0, s1, env)', 'smoothstep(s1, s0, env)')],
    ['the surf window is inverted — breakers everywhere BUT the surf band',
      (s) => s.replace(/\* \(1\.0 - smoothstep\(([^)]*)\)\)/, '* (smoothstep($1))')],
    ["the foam's shading gain loses its saturation",
      (s) => s.replace(/return min\(1\.0, b \* ([\d.]+)\);/, 'return b * $1;')],
  ];
  for (const [label, mutate] of breakMutants) {
    const text = mutate(breakBlock);
    ok(text !== breakBlock, `counter-example is applicable: ${label}`);
    let caught = false;
    try {
      const m = translate(text);
      const got = bProbe(m);
      caught = got.some((v, i) => rel(v, bBase[i]) > 1e-12);
    } catch { caught = true; }
    ok(caught, `the parity gate catches it when ${label}`);
  }
}

// ---- 2c. THE SECOND UNIFORM ARRAY CANNOT DRIFT FROM THE FIRST --------------
// uWaveQ is a precomputation of CREST_Q * |k| * amp^2 / 2, and |k| is recoverable
// from uWave itself — so the gate recomputes it from the data the GPU already has
// and holds the two together. A hand-edited harmonic table fails here.
{
  setWaveOrigin(12345, -6789);
  setWaveAxes(1.1, -0.4);
  const uq = new Float32Array(NWAVE);
  const u = packWaveUniforms(77.7, undefined, uq);
  let worst = 0;
  for (let i = 0; i < NWAVE; i++) {
    const kx = u[i * 4], kz = u[i * 4 + 1], a = u[i * 4 + 2];
    const want = CREST_Q * 0.5 * Math.sqrt(kx * kx + kz * kz) * a * a;
    worst = Math.max(worst, rel(uq[i], Math.fround(want)));
  }
  ok(worst < 1e-6,
    `uWaveQ IS CREST_Q |k| a^2 / 2 recomputed from uWave (worst ${worst.toExponential(2)})`);
  ok(CREST_COEF.length === NWAVE, 'one coefficient per component');
  // ---- THE SHADING GAIN IS SHADING ONLY --------------------------------------
  // breaking() is a CRITERION whose typical firing value is a quarter, and an
  // albedo mix fed a quarter draws a seventh of a whitecap — the live probe
  // measured exactly that (water where the field fired rendered 0.995x as bright
  // as unbroken water, i.e. no foam at all). BREAK.foamGain turns the criterion
  // into froth for the SHADER, and must never touch the field the hull reads.
  ok(BREAK.foamGain > 1 && BREAK.foamGain <= 5,
    `the foam's shading gain is a gain and not a licence (${BREAK.foamGain}, allowed 1-5)`);
  ok(breakFoam(0.25) > 0.5 && breakFoam(1) === 1 && breakFoam(0) === 0,
    `it turns a quarter of a criterion into ${breakFoam(0.25).toFixed(2)} of a whitecap `
    + 'and still saturates at 1');
  ok(/oBreakFoam\(oBrk\)/.test(oceanCode),
    'ocean.js gains the field for SHADING through the emitted function');
  ok(/breakerEffect\(this\.ship, brk,/.test(
    readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')),
    'and the HULL is handed the ungained field — the gain is a look, not a force');
  // and it is invariant to the band axes, which is WHY it can be a constant
  const before = [...CREST_COEF];
  setWaveAxes(2.9, 0.1);
  const uq2 = new Float32Array(NWAVE);
  packWaveUniforms(1234.5, undefined, uq2);
  ok(before.every((v, i) => Math.fround(v) === uq2[i]),
    'the harmonic table is invariant to the band axes and to the clock');
}

// ============ 3. THE MATHEMATICAL SAFETY LINE ============
// d/dphi [sin(phi) - q cos(2 phi)] = cos(phi) (1 + 4 q sin(phi)), whose only
// zeros are the crest and the trough while 4q < 1. At q = 1/4 a third and fourth
// zero appear, the trough grows a dimple and the wave has TWO crests per period.
{
  let worstQ = 0, worstLam = 0;
  for (let i = 0; i < NWAVE; i++) {
    const g = COMPONENTS[i].band === 0 ? SEA_SWELL_MAX : SEA_STATE_MAX;
    const q = crestQ(i, g);
    if (q > worstQ) { worstQ = q; worstLam = COMPONENTS[i].len; }
  }
  ok(worstQ < CREST_DIMPLE * CREST_MAX_FRAC,
    `the steepest component at the storm cap sits at q ${worstQ.toFixed(4)} — `
    + `${(100 * worstQ / CREST_DIMPLE).toFixed(0)}% of the 1/4 dimple line `
    + `(lambda ${worstLam.toFixed(1)} m; allowed ${(100 * CREST_MAX_FRAC).toFixed(0)}%)`);
  ok(CREST_DIMPLE === 0.25, 'the dimple line is 1/4, as the derivative demands');

  // AND THE COUNT, RUN THROUGH THE EMITTED ARITHMETIC. One component lit, every
  // other amplitude and coefficient zeroed, walked over a full wavelength: the
  // emitted sum must show exactly one maximum and one minimum.
  const extrema = (idx, qWant) => {
    const arr = [], uq = [];
    const c = COMPONENTS[idx];
    for (let i = 0; i < NWAVE; i++) {
      arr.push({ x: i === idx ? c.k : 0, y: 0, z: i === idx ? c.amp : 0, w: 0 });
      // q_i = CREST_Q k a g / 2 and the emitted coefficient is that times a, so
      // asking for a particular q means scaling the coefficient by q / q_natural
      uq.push(i === idx ? qWant * c.amp : 0);
    }
    G.__set(arr, uq, 1);
    const band = idx < NSWELL ? G.oWaveSwell : G.oWaveWind;
    const N = 4096, lam = TAU / c.k;
    let ups = 0, downs = 0, prev = null, prevSlope = null;
    for (let j = 0; j <= N; j++) {
      const h = G.oWaveMix(band({ x: (j / N) * lam, y: 0 }), 1);
      if (prev !== null) {
        const slope = h - prev;
        if (prevSlope !== null && slope !== 0 && prevSlope !== 0) {
          if (prevSlope > 0 && slope < 0) ups++;
          if (prevSlope < 0 && slope > 0) downs++;
        }
        if (slope !== 0) prevSlope = slope;
      }
      prev = h;
    }
    return { max: ups, min: downs };
  };
  // the worst real case: the steepest component at its band's cap
  let steepest = 0;
  for (let i = 1; i < NWAVE; i++) {
    const g = COMPONENTS[i].band === 0 ? SEA_SWELL_MAX : SEA_STATE_MAX;
    if (crestQ(i, g) > crestQ(steepest, COMPONENTS[steepest].band === 0
      ? SEA_SWELL_MAX : SEA_STATE_MAX)) steepest = i;
  }
  const at = extrema(steepest, worstQ);
  ok(at.max === 1 && at.min === 1,
    `ONE CREST PER PERIOD at the worst q the game can reach: ${at.max} maxima, `
    + `${at.min} minima over a full wavelength of the lambda `
    + `${COMPONENTS[steepest].len.toFixed(1)} m component at q ${worstQ.toFixed(4)}`);
  // and the counter-example, so the count is proved to be able to fail
  const over = extrema(steepest, 0.30);
  ok(over.max + over.min > 2,
    `and the count CATCHES a dimple: at q = 0.30 the same component shows `
    + `${over.max} maxima and ${over.min} minima (past the 1/4 line)`);
  const under = extrema(steepest, 0.24);
  ok(under.max === 1 && under.min === 1, 'just inside the line it is still one crest (q = 0.24)');
}

// ---- 3b. the shore set is deliberately LINEAR ------------------------------
// Two coherent trains at 0.40 m on 36 m and 0.16 m on 16 m: Stokes' own
// coefficient would put q at 0.21 and 0.19 BEFORE the chop band multiplied them,
// straight through the dimple line. So the shore set stays a sum of sines and the
// surf gets its shape from the break field instead. Held as the property that
// says it: a sum of sines is SYMMETRIC, so its skewness is zero.
{
  let s1 = 0, s2 = 0, s3 = 0;
  const N = 40000;
  for (let i = 0; i < N; i++) {
    const h = shoreHeight(-45, (i / N) * 4000);   // env constant at d = -45 m
    s1 += h; s2 += h * h; s3 += h * h * h;
  }
  const m = s1 / N, sd = Math.sqrt(s2 / N - m * m);
  const sk = (s3 / N - 3 * m * (s2 / N) + 2 * m ** 3) / sd ** 3;
  ok(Math.abs(sk) < 5e-3,
    `the shore set carries NO crest sharpening: its own elevation skewness is `
    + `${sk.toExponential(2)} (a sum of sines, symmetric by construction)`);
  ok(!/1\.0 - 2\.0/.test(glslShore()), 'and the emitted shore GLSL carries no second harmonic');
}

// ============ 4. THE SHAPE ANSWERS THE SEA ============
// Elevation skewness is the standard measure of crest sharpening and second-order
// theory gives it in closed form: for one component E[eta^3] = 3 q A^3 / 4 and
// Var = A^2 (1 + q^2) / 2, and the phases are independent so the third moments
// simply add. So the gate can hold BOTH — the exact prediction from the spectrum
// (fast, deterministic) and the realised field (slower, and the thing the eye
// sees) — and require them to agree.
const theorySkew = (sw, ch) => {
  let m3 = 0, m2 = 0;
  for (let i = 0; i < NWAVE; i++) {
    const c = COMPONENTS[i], g = c.band === 0 ? sw : ch;
    const A = g * c.amp, q = crestQ(i, g);
    m3 += 0.75 * q * A * A * A;
    m2 += (A * A * (1 + q * q)) / 2;
  }
  return m3 / m2 ** 1.5;
};
const STATES = [
  ['a river', RIVER_STATE, RIVER_STATE],
  ['the doldrums', ...(() => { const b = seaBandsFor(windProfile(1e5, 4.2), 1e5); return [b.swell, b.chop]; })()],
  ['the trades', ...(() => { const b = seaBandsFor(windProfile(1e5, 9.1), 1e5); return [b.swell, b.chop]; })()],
  ['a working breeze', ...(() => { const b = seaBandsFor(windProfile(1e5, 10), 1e5); return [b.swell, b.chop]; })()],
  ['the forties', ...(() => { const b = seaBandsFor(windProfile(1e5, 12), 1e5); return [b.swell, b.chop]; })()],
  ['the fifties', ...(() => { const b = seaBandsFor(windProfile(1e5, 15), 1e5); return [b.swell, b.chop]; })()],
  ['a storm', SEA_SWELL_MAX, SEA_STATE_MAX],
];
{
  setWaveOrigin(0, 0);
  const axis = waveAxisFor(2.3);
  setWaveAxes(axis, axis);
  // THE SAME LINES AND THE SAME POINTS FOR EVERY SEA STATE. Drawing fresh
  // samples per state makes every comparison between states a difference of two
  // noisy estimates; drawing them once makes it PAIRED, which is the whole
  // difference between reading a 1% trend and reading the LCG.
  const LINES = [];
  for (let i = 0; i < 240; i++) {
    LINES.push([(rnd() - 0.5) * 60000, (rnd() - 0.5) * 60000, 40 + i * 3.7]);
  }
  const PTS = [];
  for (let i = 0; i < 120000; i++) {
    PTS.push([(rnd() - 0.5) * 200000, (rnd() - 0.5) * 200000, rnd() * 20000]);
  }
  const rows = [];
  for (const [name, sw, ch] of STATES) {
    setSeaBands(sw, ch);
    // the realised field: the same points over the whole playable world
    let s1 = 0, s2 = 0, s3 = 0;
    const N = PTS.length;
    const pts = [];
    for (let i = 0; i < N; i++) {
      const [x, z, t] = PTS[i];
      const h = waveHeight(x, z, t);
      s1 += h; s2 += h * h; s3 += h * h * h;
      if (i < 12000) pts.push([x, z, t, h]);
    }
    const m = s1 / N, sd = Math.sqrt(s2 / N - m * m);
    const skew = (s3 / N - 3 * m * (s2 / N) + 2 * m ** 3) / sd ** 3;
    // SHARP CRESTS, FLAT TROUGHS, stated two more ways.
    //  (a) the exceedance ratio: the highest 1% of the water stands further above
    //      the mean than the lowest 1% lies below it.
    const sorted = pts.map((p) => p[3]).sort((a, b) => a - b);
    const k1 = Math.max(1, Math.floor(sorted.length * 0.01));
    const top = sorted.slice(-k1).reduce((a, b) => a + b, 0) / k1;
    const bot = sorted.slice(0, k1).reduce((a, b) => a + b, 0) / k1;
    //  (b) the CURVATURE at the surface's own local extrema, walked along the
    //      wind axis with the ANALYTIC gradient (a second difference of the height
    //      at a coarse step cannot resolve a 6 m component; a central difference
    //      of the exact slope can). Conditioning on elevation instead — "curvature
    //      where the water stands high" — is confounded and was tried first: the
    //      crest being TALLER widens the phase window above +sigma and narrows the
    //      one below -sigma, which biases the average the wrong way.
    const [wx, wz] = waveBandDir(1);
    const kc = [], kt = [];
    const step = 0.4, e2 = 0.25;
    for (const [ox, oz, t] of LINES) {
      let prevS = null;
      for (let j = 0; j < 620; j++) {
        const d = j * step;
        const [gx, gz] = waveGradient(ox + wx * d, oz + wz * d, t);
        const s = gx * wx + gz * wz;
        if (prevS !== null && ((prevS > 0 && s <= 0) || (prevS < 0 && s >= 0))) {
          // interpolate to the ACTUAL extremum. Evaluating the curvature at the
          // sample after the sign change instead biases every reading by up to
          // 0.4 m, which on a 6 m component is 0.42 rad of phase — and a phase
          // bias is exactly the thing this measurement must not have.
          const d0 = d - step * (1 - prevS / (prevS - s));
          const px = ox + wx * d0, pz = oz + wz * d0;
          const [ax, az] = waveGradient(px + wx * e2, pz + wz * e2, t);
          const [bx, bz] = waveGradient(px - wx * e2, pz - wz * e2, t);
          const cur = ((ax * wx + az * wz) - (bx * wx + bz * wz)) / (2 * e2);
          if (prevS > 0) kc.push(-cur); else kt.push(cur);
        }
        prevS = s;
      }
    }
    // MEDIANS, not means: extremum curvature is heavy-tailed (a crest where six
    // short components happen to align is an order of magnitude sharper than a
    // typical one), and a mean of a heavy tail is a noise generator — the first
    // cut of this clause reported a 3% asymmetry on a RIVER for that reason.
    const median = (a) => { const s2 = [...a].sort((p, q) => p - q); return s2[s2.length >> 1]; };
    rows.push({
      name, sw, ch, sd, skew, theory: theorySkew(sw, ch),
      exceed: top / Math.abs(bot),
      curv: median(kc) / median(kt), nExt: kc.length,
    });
  }
  for (const r of rows) {
    console.log(`  ${r.name.padEnd(18)} bands ${r.sw.toFixed(2)}/${r.ch.toFixed(2)}`
      + `  sd ${r.sd.toFixed(3)} m  skew ${r.skew.toFixed(4)}`
      + ` (2nd order says ${r.theory.toFixed(4)})  top1%/bottom1% ${r.exceed.toFixed(3)}`
      + `  |K|crest/|K|trough ${r.curv.toFixed(3)}`);
  }
  const river = rows[0], work = rows.find((r) => r.name === 'a working breeze');
  const storm = rows[rows.length - 1];
  ok(river.theory < 0.002,
    `CRESTING VANISHES IN A CALM: a river's predicted skewness is ${river.theory.toExponential(2)}`);
  ok(river.skew < 0.02,
    `and its realised skewness is ${river.skew.toFixed(4)} — a sum of sines, as it should be`);
  ok(work.theory > 0.03 && storm.theory > work.theory * 1.3,
    `and it RISES with the sea: ${work.theory.toFixed(4)} in a working breeze, `
    + `${storm.theory.toFixed(4)} in a storm`);
  // monotone in the exact prediction over the whole weather ladder
  for (let i = 2; i < rows.length; i++) {
    ok(rows[i].theory > rows[i - 1].theory - 1e-9,
      `crest asymmetry is monotone in sea state (${rows[i - 1].name} `
      + `${rows[i - 1].theory.toFixed(4)} -> ${rows[i].name} ${rows[i].theory.toFixed(4)})`);
  }
  // THE REALISED FIELD MUST AGREE WITH THE PREDICTION, or one of them is wrong —
  // and the clause is applied only where the prediction is bigger than the
  // estimator's own noise floor. That floor is measurable: the river row predicts
  // 0.0004 and reads 0.009, so a skewness estimate over this sample carries about
  // 0.01 of noise, which is larger than the ENTIRE predicted signal in the
  // doldrums. An additive slack big enough to cover the doldrums would make the
  // clause vacuous there, so the doldrums are excluded by name rather than
  // smuggled through on slack — a cold review was right that the first cut did the
  // latter.
  const SKEW_FLOOR = 0.03;
  let checked = 0;
  for (const r of rows) {
    if (r.theory < SKEW_FLOOR) continue;
    checked++;
    ok(r.skew > r.theory * 0.8 && r.skew < r.theory * 1.8,
      `${r.name}: the realised skewness ${r.skew.toFixed(4)} is the predicted `
      + `${r.theory.toFixed(4)} within 0.8-1.8x (the surface really is the `
      + 'second-order one)');
  }
  ok(checked >= 4,
    `and the agreement was tested wherever the prediction clears the estimator's `
    + `noise (${checked} of ${rows.length} states, floor ${SKEW_FLOOR})`);
  // THE CURVATURE ASYMMETRY, which is the acceptance criterion in its own words:
  // it must rise with sea state and vanish in a calm. Held on the two independent
  // views, because either alone could be a sampling artifact.
  // THE RIVER IS THE CONTROL, and it is what proved the estimator honest: an
  // earlier cut of this clause walked 60 lines instead of 240 and read a 4.5%
  // asymmetry on water with no cresting in it at all. The median of extremum
  // curvature is heavy-tailed enough to need the samples; with them the control
  // comes back to 1.002, and only then is a 4% reading at sea worth anything.
  ok(Math.abs(river.curv - 1) < 0.02 && Math.abs(river.exceed - 1) < 0.02,
    `A CALM SEA IS SINUSOIDAL: on a river the crest/trough curvature ratio is `
    + `${river.curv.toFixed(3)} and the top/bottom 1% ratio ${river.exceed.toFixed(3)} `
    + '(both 1.000 for a pure sum of sines — this is the estimator\'s control)');
  ok(work.curv > 1.03 && work.exceed > 1.02,
    `and a working breeze PEAKS: curvature ratio ${work.curv.toFixed(3)}, `
    + `top/bottom 1% ${work.exceed.toFixed(3)}`);
  ok(storm.exceed > work.exceed && storm.curv > work.curv,
    `and a gale peaks harder still: curvature ${storm.curv.toFixed(3)} and top/bottom `
    + `${storm.exceed.toFixed(3)}, against ${work.curv.toFixed(3)} and `
    + `${work.exceed.toFixed(3)} in a working breeze`);
  for (const r of rows.slice(2)) {
    ok(r.curv > 1.02,
      `${r.name}: crests are sharper than troughs (curvature ratio ${r.curv.toFixed(3)}, `
      + `${r.nExt} crests walked)`);
  }
  // THE EXACT FORM OF THE SAME CLAIM, so the field measurement above is
  // corroboration rather than the only evidence. One component's curvature ratio
  // at its crest and its trough is (1 + 4q) / (1 - 4q) — monotone in the sea
  // state by construction, 1 at a calm, and the reason the 1/4 line is where it is
  // (at q = 1/4 the trough's curvature reaches ZERO, which IS the dimple).
  {
    const idx = COMPONENTS.reduce((m, c, i) => (c.band === 1 && c.amp * c.k
      > COMPONENTS[m].amp * COMPONENTS[m].k ? i : m), NSWELL);
    const ratio = (g) => (1 + 4 * crestQ(idx, g)) / (1 - 4 * crestQ(idx, g));
    let prevR = 0;
    for (const g of [RIVER_STATE, 0.55, 0.75, 1.05, 1.32, SEA_STATE_MAX]) {
      const r = ratio(g);
      ok(r > prevR, `the steepest wind component's crest/trough curvature ratio rises with `
        + `the sea (chop ${g.toFixed(3)} -> ${r.toFixed(3)})`);
      prevR = r;
    }
    ok(Math.abs(ratio(RIVER_STATE) - 1) < 0.01,
      `and it is 1.000 on a river (${ratio(RIVER_STATE).toFixed(4)}) — a sum of sines`);
    ok(ratio(SEA_STATE_MAX) > 1.8 && ratio(SEA_STATE_MAX) < 4,
      `and ${ratio(SEA_STATE_MAX).toFixed(2)} at the chop cap — visibly peaked, and still `
      + 'the right side of the dimple');
  }
  // the harmonic's own contribution must stay a CORRECTION, not the surface: at
  // the storm cap it may not exceed a fifth of the linear amplitude sum
  const harm = MAX_HARM_SWELL * SEA_SWELL_MAX ** 2 + MAX_HARM_CHOP * SEA_STATE_MAX ** 2;
  const lin = COMPONENTS.reduce((s, c) => s
    + c.amp * (c.band === 0 ? SEA_SWELL_MAX : SEA_STATE_MAX), 0);
  ok(harm < 0.2 * lin,
    `the harmonic stays a correction: ${harm.toFixed(3)} m against ${lin.toFixed(3)} m of `
    + `linear amplitude at the storm cap (${(100 * harm / lin).toFixed(1)}%, ceiling 20%)`);
  setSeaBands(1, 1);
}

// ============ 5. THE COVERAGE, AND THE THREE WIND CUES ============
{
  setWaveOrigin(0, 0);
  const from = 2.3;
  const axis = waveAxisFor(from);
  setWaveAxes(axis, axis);
  const [dx, dz] = waveBandDir(1);
  // the window's own forward bias, which is cue 2 stated as arithmetic
  let fwdMass = 0, backMass = 0;
  for (let d = -Math.PI; d < Math.PI; d += 0.0005) {
    const w = breakWindow(d);
    if (d > 0) fwdMass += w * 0.0005; else backMass += w * 0.0005;
  }
  const duty = (fwdMass + backMass) / TAU;
  ok(fwdMass / backMass > 1.6,
    `THE FOAM LEADS THE CREST DOWN ITS DOWNWIND FACE: the phase window carries `
    + `${(fwdMass / backMass).toFixed(2)}x as much weight forward of the crest as behind it `
    + `(floor 1.6)`);
  ok(BREAK.trail > BREAK.front * 1.5,
    `and it LINGERS behind: the trailing decay runs ${BREAK.trail} rad against `
    + `${BREAK.front} rad of lead-in — the analytic persistence, no state and no `
    + 'feedback buffer');
  ok(duty > 0.12 && duty < 0.40,
    `the window covers ${(duty * 100).toFixed(1)}% of a period (a band of foam, not a `
    + 'dusting and not a sheet)');

  // TWO NUMBERS, AND A COLD REVIEW WAS RIGHT THAT THEY ARE NOT THE SAME NUMBER.
  //  `mean`  — the mean of the break FIELD, a criterion in [0, 1]. This is the
  //            energy-like quantity the Rayleigh-times-duty derivation predicts,
  //            and it is what Monahan's fit is compared against below.
  //  `area`  — the fraction of the water where the DRAWN foam
  //            (breakFoam = min(1, gain * b)) exceeds a half, i.e. the share of the
  //            sea that actually reads white. It is the painted area, and because
  //            the shading gain is 3 it is several times the mean by construction.
  // The first cut of this clause called the mean "coverage" and held it against
  // Monahan's photographed AREA fraction. Both are gated now, each against its own
  // ladder, and the prose says which is which.
  const cover = (sw, ch) => {
    setSeaBands(sw, ch);
    let sum = 0, n = 0, white = 0, fwd = 0, back = 0;
    const M = 130;
    for (let f = 0; f < 3; f++) {
      const t = 200 + f * 41.7;
      for (let j = 0; j < M; j++) {
        for (let i = 0; i < M; i++) {
          const x = (i - M / 2) * 1.6, z = (j - M / 2) * 1.6;
          const b = breaking(x, z, t);
          sum += b; n++;
          if (breakFoam(b) > 0.5) white++;
          if (b > 0.02) {
            const [gx, gz] = waveGradient(x, z, t);
            if (gx * dx + gz * dz < 0) fwd += b; else back += b;
          }
        }
      }
    }
    return { cover: sum / n, area: white / n, asym: fwd / Math.max(1e-9, back) };
  };
  const rows = STATES.map(([name, sw, ch]) => ({ name, sw, ch, ...cover(sw, ch) }));
  for (const r of rows) {
    console.log(`  ${r.name.padEnd(18)} break field mean ${(r.cover * 100).toFixed(3)}%`
      + `   drawn white area ${(r.area * 100).toFixed(2)}%`
      + `   downwind/upwind foam ${r.asym.toFixed(2)}`);
  }
  const by = Object.fromEntries(rows.map((r) => [r.name, r]));
  ok(by['a river'].cover < 1e-6 && by['a river'].area === 0,
    `a river does not break at all (field ${(by['a river'].cover * 100).toExponential(2)}%, `
    + 'no white water anywhere)');
  // THE FIELD against Monahan & O'Muircheartaigh's W = 3.84e-6 U^3.41
  ok(by['the doldrums'].cover < 0.004,
    `THE DOLDRUMS ARE ALL BUT UNBROKEN: field mean ${(by['the doldrums'].cover * 100).toFixed(3)}% `
    + '(ceiling 0.4%; Monahan photographed 0.09% of AREA at 5 m/s)');
  ok(by['a working breeze'].cover > 0.003 && by['a working breeze'].cover < 0.030,
    `a working breeze runs ${(by['a working breeze'].cover * 100).toFixed(3)}% (wanted 0.3-3%; `
    + 'Monahan 1.0% at 10 m/s)');
  ok(by['the fifties'].cover > 0.012 && by['the fifties'].cover < 0.10,
    `the screaming fifties ${(by['the fifties'].cover * 100).toFixed(2)}% (wanted 1.2-10%; `
    + 'Monahan 3.9% at 15 m/s)');
  ok(by['a storm'].cover > by['the fifties'].cover && by['a storm'].cover < 0.30,
    `and a storm ${(by['a storm'].cover * 100).toFixed(2)}% — a sea streaked white, `
    + 'not a white sheet (ceiling 30%)');
  // AND THE PAINTED AREA, on its own ladder. It is SEVERAL TIMES the field's mean
  // because the shading gain is 3, and that is a deliberate visual exaggeration
  // rather than a claim about nature: the drawn spectrum stops at 5.75 m, so the
  // fine structure that makes real whitecaps legible at a distance is not there to
  // draw, and the area has to carry what the texture cannot. The bound that matters
  // is the top one — a gale must read as a sea STREAKED white, never a white sheet.
  ok(by['the doldrums'].area < 0.02,
    `the doldrums paint ${(by['the doldrums'].area * 100).toFixed(2)}% of the water white `
    + '(ceiling 2%)');
  ok(by['a working breeze'].area > 0.005 && by['a working breeze'].area < 0.12,
    `a working breeze ${(by['a working breeze'].area * 100).toFixed(2)}% (wanted 0.5-12%)`);
  ok(by['a storm'].area < 0.40,
    `and a storm ${(by['a storm'].area * 100).toFixed(1)}% — still more water than foam `
    + '(ceiling 40%)');
  for (let i = 2; i < rows.length; i++) {
    ok(rows[i].cover > rows[i - 1].cover && rows[i].area >= rows[i - 1].area,
      `both are monotone in sea state (${rows[i - 1].name} field `
      + `${(rows[i - 1].cover * 100).toFixed(3)}% / area ${(rows[i - 1].area * 100).toFixed(2)}% `
      + `-> ${rows[i].name} ${(rows[i].cover * 100).toFixed(3)}% / `
      + `${(rows[i].area * 100).toFixed(2)}%)`);
  }
  for (const r of rows.slice(2)) {
    ok(r.asym > 1.25,
      `${r.name}: the realised foam favours the DOWNWIND face `
      + `${r.asym.toFixed(2)}x (floor 1.25)`);
  }

  // CUE 1 — CREST LINES LIE ACROSS THE WIND. Stated as a correlation length: the
  // break field must decorrelate fast along the wind and slowly across it, which
  // is what a line of breaking crest IS. Measured on the field, so it holds
  // whatever the shader later does with it.
  setSeaBands(2.17, 1.325);
  const corrAt = (ux, uz, L) => {
    let s = 0, sa = 0, sb = 0, sa2 = 0, sb2 = 0, n = 0;
    for (let k = 0; k < 4000; k++) {
      const x = (rnd() - 0.5) * 4000, z = (rnd() - 0.5) * 4000, t = 300 + (k % 11) * 7;
      const a = breaking(x, z, t), b = breaking(x + ux * L, z + uz * L, t);
      s += a * b; sa += a; sb += b; sa2 += a * a; sb2 += b * b; n++;
    }
    const ma = sa / n, mb = sb / n;
    return (s / n - ma * mb)
      / Math.sqrt(Math.max(1e-12, (sa2 / n - ma * ma) * (sb2 / n - mb * mb)));
  };
  const lags = [4, 8, 12];
  const along = lags.map((L) => corrAt(dx, dz, L));
  const across = lags.map((L) => corrAt(-dz, dx, L));
  console.log(`  break-field correlation  along the wind `
    + `${along.map((v) => v.toFixed(3)).join(' ')}   across it `
    + `${across.map((v) => v.toFixed(3)).join(' ')}  (lags ${lags.join('/')} m)`);
  for (let i = 0; i < lags.length; i++) {
    ok(across[i] > along[i] + 0.08,
      `CREST LINES LIE ACROSS THE WIND: at ${lags[i]} m the break field still `
      + `correlates ${across[i].toFixed(3)} across the wind against ${along[i].toFixed(3)} `
      + 'along it');
  }
  ok(across[2] > 0.15 && along[1] < 0.25,
    `so the foam draws LINES, not blobs: 12 m across the wind still `
    + `${across[2].toFixed(3)}, 8 m along it already ${along[1].toFixed(3)}`);
  setSeaBands(1, 1);
}

// ============ 6. THE SHORE ============
{
  setWaveOrigin(0, 0);
  setWaveAxes(0, 0);
  setSeaBands(1.0, 1.3);
  // an analytic island: land inside r = 500, so d = 500 - r
  const island = (x, z) => {
    const r = Math.hypot(x, z) || 1e-9;
    if (r > 3500) return null;
    return { d: 500 - r, gx: -x / r, gz: -z / r, gLen: 1 };
  };
  setShoreSampler(island);
  const meanBrk = (r) => {
    let s = 0, n = 0, white = 0;
    for (let i = 0; i < 400; i++) {
      const a = (i / 400) * TAU;
      const b = breaking(Math.cos(a) * r, Math.sin(a) * r, 100 + i * 0.31);
      s += b; n++;
      if (breakFoam(b) > 0.5) white++;
    }
    return { mean: s / n, area: white / n };
  };
  const surfR = meanBrk(560), midR = meanBrk(700), outR = meanBrk(1400);
  const surf = surfR.mean, mid = midR.mean, out = outR.mean;
  console.log(`  shore break by range   60 m off ${surf.toFixed(4)}`
    + `   200 m ${mid.toFixed(4)}   900 m ${out.toFixed(4)}`);
  ok(surf > 0.02, `the surf band BREAKS: mean field ${surf.toFixed(4)} sixty metres off the sand`);
  ok(surf > out * 3,
    `and breaking is CONFINED to it: ${surf.toFixed(4)} in the surf against `
    + `${out.toFixed(4)} nine hundred metres out (the shore term's own surf window `
    + `closes over ${BREAK.surfIn}-${BREAK.surfOut} m)`);
  // AND THE SURF MUST BE LINES OF WHITE, NOT SHEETS OF IT. The retired shore
  // breaker was deliberately thin ("sheets of white read as artifact, a line of
  // white reads as surf") and the shore term now goes through the same shading gain
  // as the open sea, so the painted area has to be held. This file's own history is
  // the reason: the Solent corduroy and the storm rings were both a shore term that
  // looked reasonable in the field and wrong in pixels.
  ok(surfR.area < 0.45,
    `the surf paints ${(surfR.area * 100).toFixed(1)}% of the water white sixty metres `
    + 'off the sand — lines of surf, not a white sheet (ceiling 45%)');
  console.log(`  surf drawn white area   60 m off ${(surfR.area * 100).toFixed(1)}%`
    + `   200 m ${(midR.area * 100).toFixed(1)}%   900 m ${(outR.area * 100).toFixed(1)}%`);
  // THE STRAIT GATE: where the coast field's gradient collapses (a channel's
  // medial line) the shore set stands down entirely, and so must its breakers.
  setShoreSampler(() => ({ d: -30, gx: 1, gz: 0, gLen: 0.2 }));
  let worstStrait = 0;
  for (let i = 0; i < 600; i++) {
    worstStrait = Math.max(worstStrait,
      breaking((rnd() - 0.5) * 2000, (rnd() - 0.5) * 2000, rnd() * 400));
  }
  ok(worstStrait === 0,
    `a strait's sheltered water does not break AT ALL (worst ${worstStrait}) — the `
    + 'gate zeroes the shore amplitude, so the steepness criterion has nothing to gate');
  // and offshore, with no sampler, breaking is the OPEN sea's business only
  setShoreSampler(null);
  ok(shoreEnv(-400) === 0 && Math.abs(shoreHeight(-400, 3)) < 1e-12,
    'the shore set is silent 400 m out, so its breakers cannot be there either');
  setSeaBands(1, 1);
}

// ============ 7. DETERMINISM ============
{
  setWaveOrigin(0, 0);
  setWaveAxes(0.5, 1.7);
  setSeaBands(1.54, 1.05);
  const pts = [];
  for (let i = 0; i < 500; i++) {
    pts.push([(rnd() - 0.5) * 120000, (rnd() - 0.5) * 120000, rnd() * 7200]);
  }
  const fwd = pts.map(([x, z, t]) => breaking(x, z, t));
  const rev = [...pts].reverse().map(([x, z, t]) => breaking(x, z, t)).reverse();
  ok(fwd.every((v, i) => v === rev[i]),
    'the break field is a function of (x, z, t), not of the order it is sampled in');
  ok(fwd.every((v) => v >= 0 && v <= 1 && Number.isFinite(v)),
    'and it is bounded in [0, 1] with no NaN');
  // an origin snap must be a non-event for the FOAM as well as for the water
  const before = pts.map(([x, z, t]) => breaking(x, z, t));
  setWaveOrigin(40000, -22000);
  let worstO = 0;
  pts.forEach(([x, z, t], i) => {
    worstO = Math.max(worstO, Math.abs(breaking(x, z, t) - before[i]));
  });
  ok(worstO < 1e-6,
    `an origin snap does not move the foam either (worst ${worstO.toExponential(2)})`);
  setWaveOrigin(0, 0);
  setSeaBands(1, 1);
  setWaveAxes(0, 0);
}

// ============ 8. PHASE D — THE BREAKER ON THE HULL ============
{
  const dtF = 1 / 30;
  // the wind sea runs along +x throughout this section
  const D = [1, 0];
  const run = (yaw, brk, spec = SLOOP, n = 1) => {
    const s = newShipState(0, 0);
    s.yaw = yaw; s.speed = spec.maxSpeed * 0.8;
    let roll = 0;
    for (let i = 0; i < n; i++) {
      const e = breakerEffect(s, brk, D[0], D[1], spec, dtF);
      roll = e.roll;
    }
    return { s, roll };
  };
  ok(breakerEffect(newShipState(), 0, 1, 0, SLOOP, dtF).surge === 0,
    'a sea that is not breaking does nothing at all');
  // FRAME-RATE INDEPENDENCE. The way loss is an exact exponential and the set is
  // first-order in dt, so a second of the same breaker must cost the same way at
  // 20 Hz as at 144 Hz. A per-frame linear decay would not, and this game runs at
  // both.
  {
    const at = (hz) => {
      const s = newShipState(0, 0);
      s.yaw = 0; s.speed = 8;
      for (let i = 0; i < hz; i++) breakerEffect(s, 1, 1, 0, SLOOP, 1 / hz);
      return s;
    };
    const a20 = at(20), a144 = at(144);
    // not EXACTLY equal, and the reason is honest: the way loss and the heading
    // slew are coupled (the slew reduces `beam`, which reduces the loss), so
    // frame-rate exactness would need an implicit solve. 0.1% over a full second
    // of the hardest breaker in the game is the integration error and nothing else.
    ok(Math.abs(a20.speed - a144.speed) < 0.005 * a144.speed,
      `a second of full beam breaker costs the same way at 20 Hz and 144 Hz `
      + `(${a20.speed.toFixed(4)} vs ${a144.speed.toFixed(4)} m/s, `
      + `${(100 * Math.abs(a20.speed / a144.speed - 1)).toFixed(3)}% apart, ceiling 0.5%)`);
    ok(Math.abs(a20.x - a144.x) < 0.05 && Math.abs(a20.z - a144.z) < 0.05,
      `and sets her the same distance (${a20.x.toFixed(3)} vs ${a144.x.toFixed(3)} m)`);
  }
  ok(breakerEffect(newShipState(), BREAKER.brkFloor, 1, 0, SLOOP, dtF).surge === 0,
    'and neither does a crest that is only spilling (the floor)');
  // ---- THREE SEAS, AND THE GATE HAD TO LEARN TO TELL THEM APART ----
  // The waves travel +x, so with forward = (sin yaw, cos yaw): yaw = +pi/2 runs
  // WITH them (a following sea), yaw = -pi/2 is HEAD to them, and yaw = 0 or pi is
  // the beam. The first cut of this clause called yaw = +pi/2 "the bow" and
  // asserted safety from it — a following sea mislabelled, which is the one case
  // real seamanship calls dangerous, and the model was symmetric so it read as
  // safe. A cold review caught it. All three are now named and separated.
  const beam = run(0, 1, SLOOP, 60);
  const head = run(-Math.PI / 2, 1, SLOOP, 60);
  const follow = run(Math.PI / 2 + 0.05, 1, SLOOP, 60);   // 3 deg off dead-astern
  ok(beam.s.speed < head.s.speed && head.s.speed < follow.s.speed,
    `THE THREE SEAS COST DIFFERENT THINGS: after two seconds of full breaker she has `
    + `${beam.s.speed.toFixed(2)} m/s left beam-on, ${head.s.speed.toFixed(2)} head to `
    + `it, and ${follow.s.speed.toFixed(2)} running with it — a beam sea is a wall, a `
    + 'bow sea is an impact, and a following sea does not check her at all');
  ok(Math.abs(head.s.yaw + Math.PI / 2) < 1e-12,
    `HEAD TO IT SHE HOLDS HER COURSE EXACTLY (${((head.s.yaw + Math.PI / 2) * 57.3)
      .toExponential(1)} deg of drift) — rel = pi is the stable fixed point`);
  ok(Math.abs(beam.s.yaw) > 0.05,
    `on the beam she is slewed ${(beam.s.yaw * 57.3).toFixed(1)} deg`);
  {
    const relOf = (sh) => Math.abs(Math.atan2(Math.sin(sh.s.yaw - Math.PI / 2),
      Math.cos(sh.s.yaw - Math.PI / 2)));
    const rel2 = relOf(follow), rel8 = relOf(run(Math.PI / 2 + 0.05, 1, SLOOP, 240));
    // the growth is exponential with an e-folding time of 1 / yawRate = 3.3 s, so
    // it is a broach she can FEEL developing and steer against rather than a
    // knockdown — which is the whole point of "no capsize, no death"
    ok(rel2 > 0.05 * 1.5 && rel8 > 0.4,
      `AND A FOLLOWING SEA BROACHES HER: 2.9 deg off dead-astern grows to `
      + `${(rel2 * 57.3).toFixed(1)} deg in two seconds and ${(rel8 * 57.3).toFixed(0)} `
      + 'deg in eight, on a 3.3 s e-folding time — rel = 0 is an UNSTABLE fixed '
      + 'point, which is why the seamanship says never run before a breaking sea');
  }
  ok(Math.abs(beam.roll) > 0.05 && Math.abs(head.roll) < 1e-15,
    `the stagger is a BEAM phenomenon: ${(beam.roll * 57.3).toFixed(1)} deg on the beam, `
    + 'nothing head to it');
  // NO CAPSIZE, EVER. The roll a breaker can add is bounded by construction.
  let worstRoll = 0, worstSurge = 0;
  for (const [, spec] of Object.entries(SPECS)) {
    for (let i = 0; i < 400; i++) {
      const s = newShipState();
      s.yaw = rnd() * TAU; s.speed = rnd() * spec.maxSpeed;
      const th = rnd() * TAU;
      const e = breakerEffect(s, rnd() * 1.4, Math.cos(th), Math.sin(th), spec, dtF, 1 + rnd() * 9);
      worstRoll = Math.max(worstRoll, Math.abs(e.roll));
      worstSurge = Math.max(worstSurge, e.surge);
      ok(Number.isFinite(s.x) && Number.isFinite(s.yaw) && s.speed >= 0,
        'the breaker leaves the hull state finite and her way non-negative');
    }
  }
  ok(worstRoll <= BREAKER.roll + 1e-12 && worstRoll < 0.30,
    `NOBODY CAPSIZES: the worst stagger any hull can take is `
    + `${(worstRoll * 57.3).toFixed(1)} deg (bound ${(BREAKER.roll * 57.3).toFixed(1)})`);
  // AND THE SHOVE, STATED IN THE UNITS IT IS APPLIED IN. e.surge is the PRE-GAIT
  // rate; the world set is surge * gait, and blue water is sailed at up to
  // GAIT_MAX = 10 (the set is gait-scaled exactly as stepShip scales the current's,
  // so a breaker feels the same inshore and out). Reporting the pre-gait number as
  // 'the bound' understated it tenfold, which a cold review duly said.
  ok(worstSurge <= BREAKER.surge + 1e-12,
    `the shove is bounded at ${worstSurge.toFixed(2)} m/s of RATE, i.e. up to `
    + `${(worstSurge * 10).toFixed(1)} m/s of world set at the gait ceiling`);
  // monotone in the field, and a heavy hull shrugs
  let prev = -1;
  for (const b of [0.2, 0.4, 0.6, 0.8, 1.0]) {
    const r = run(0, b, SLOOP, 1);
    ok(Math.abs(r.roll) > prev, `the stagger grows with the breaker (brk ${b})`);
    prev = Math.abs(r.roll);
  }
  const sloop = run(0, 1, SLOOP, 30), galleon = run(0, 1, GALLEON, 30);
  ok(Math.abs(galleon.roll) < Math.abs(sloop.roll) * 0.6,
    `a galleon shrugs what throws a sloop: ${(galleon.roll * 57.3).toFixed(1)} deg against `
    + `${(sloop.roll * 57.3).toFixed(1)} — the same steadiness shipAttitude uses`);
  // the roll must NOT be inside shipAttitude: verify-seamotion's thresholds
  // measure the water, and dressing put in there would be measured as water
  ok(!/breakerEffect|BREAKER\./.test(srcShip.slice(srcShip.indexOf('export function shipAttitude'))),
    'shipAttitude is untouched by the breaker — the motion gate still measures the sea');
  // ...WHICH MEANS THIS FILE OWES THE ROLL A BOUND, and a cold review was right to
  // say so: keeping the stagger out of shipAttitude keeps verify-seamotion honest,
  // and it also puts the roll the player actually SEES outside every rate limit in
  // the project. So bound it here, on the live break field, over a real transit.
  {
    const dt2 = 1 / 30;
    setWaveOrigin(0, 0);
    setWaveAxes(0.7, 0.7);
    setSeaBands(2.4, SEA_STATE_MAX);           // the worst sea the weather can make
    const [dx, dz] = waveBandDir(1);
    let worstMag = 0, worstRate = 0;
    for (const [, spec] of Object.entries(SPECS)) {
      const s = newShipState(40000, -22000);
      s.yaw = 0.9; s.speed = spec.maxSpeed * 0.7;
      let prev = 0;
      for (let i = 0; i < 30 * 90; i++) {
        const t = i * dt2;
        const e = breakerEffect(s, breaking(s.x, s.z, t), dx, dz, spec, dt2, 1);
        s.x += Math.sin(s.yaw) * s.speed * dt2;
        s.z += Math.cos(s.yaw) * s.speed * dt2;
        worstMag = Math.max(worstMag, Math.abs(e.roll));
        if (i > 0) worstRate = Math.max(worstRate, Math.abs(e.roll - prev) / dt2);
        prev = e.roll;
      }
    }
    ok(worstMag <= BREAKER.roll + 1e-12,
      `the stagger the player SEES is bounded at ${(worstMag * 57.3).toFixed(1)} deg over `
      + `seven hulls x 90 s of storm (cap ${(BREAKER.roll * 57.3).toFixed(1)})`);
    ok(worstRate < 1.2,
      `and it is not a flicker: worst rate ${worstRate.toFixed(3)} rad/s (limit 1.2, `
      + `which is verify-seamotion's own roll-rate order) — the break field is smooth, `
      + 'so the roll it drives is too');
    console.log(`  Phase D visual roll over 7 hulls x 90 s of storm: worst `
      + `${(worstMag * 57.3).toFixed(1)} deg at ${worstRate.toFixed(3)} rad/s`);
    setSeaBands(1, 1);
    setWaveAxes(0, 0);
  }
  ok(/brkRoll/.test(readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')),
    'and main.js applies the stagger beside the wind heel, where visual lean lives');
}

// leave the module as this file found it. NOT because the next script in the chain
// would inherit it — npm run verify runs each gate as its own node process, so there
// is no shared state to poison — but because sections 5-8 above DO share it, and a
// gate that leaves its own globals dirty is one edit away from lying to itself.
setWaveOrigin(0, 0);
setWaveAxes(0, 0);
setSeaBands(1, 1);
setShoreSampler(null);

if (failed) { console.error(`verify-crest: ${failed} FAILED`); process.exit(1); }
console.log('verify-crest: OK — the Stokes second harmonic sharpens the crests and flattens',
  `the troughs at ${(100 * (() => { let m = 0; for (let i = 0; i < NWAVE; i++) { const g = COMPONENTS[i].band === 0 ? SEA_SWELL_MAX : SEA_STATE_MAX; m = Math.max(m, crestQ(i, g)); } return m / CREST_DIMPLE; })()).toFixed(0)}% of the dimple line`,
  'with one crest per period proved through the emitted arithmetic; both emitted blocks',
  'transliterate and hold bit-for-bit against their twins (eleven mutations all caught);',
  'whitecap coverage runs from a river\'s zero to a storm\'s streaked white, monotone and',
  'on Monahan\'s ladder; the foam leads each crest down its DOWNWIND face, lies in LINES',
  'across the wind, and stands down entirely in a strait; and a breaker costs way and',
  'heading and nothing else.');
