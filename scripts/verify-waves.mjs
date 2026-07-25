// verify-waves: the CPU/GPU parity promise (DESIGN.md risk 3).
// The GLSL wave sum is GENERATED from the same table the CPU evaluator uses;
// this script compiles the emitted GLSL expression as JS and asserts the two
// agree everywhere — the sea the eye sees is the sea the hull feels.
import {
  WAVES, waveHeight, waveGradient, glslWaveSum, glslWaveGrad, MAX_WAVE_HEIGHT,
  glslWaveGradBand, GRAD_BANDS, glslWaveSumBand, SWELL_LEN,
  setSeaBands, getSeaBands, SEA_SWELL_MAX, SEA_STATE_MAX,
  MAX_SWELL_HEIGHT, MAX_CHOP_HEIGHT,
  SHORE_WAVES, SHORE_RANGE, SHORE_CALM, MAX_SHORE_HEIGHT, SHORE_SHADE,
  shoreOpenAtten, shoreEnv, shoreHeight, shoreGradMag, setShoreSampler,
  glslShoreAttenExpr, glslShoreEnvExpr, glslShoreSumExpr, glslShoreGradExpr, glslShore,
  chopCS, setChopRot, getChopRot, chopRotFor, CHOP_WARP,
} from '../src/waves.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// deterministic sample points (LCG — no Math.random in the gate)
let seed = 12345;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

// the wind's turn on the chop fan is a UNIFORM now (uChopCS): the emitted
// GLSL reads it exactly as the shader does, so the parity check must supply
// it — and must hold at a NON-ZERO rotation, or it only ever proves the
// windless case (2026-07-25)
setChopRot(chopRotFor(2.1));
const CS = chopCS();
ok(Math.abs(getChopRot() - chopRotFor(2.1)) < 1e-12, 'chop rotation reads back');

const expr = glslWaveSum();
ok(!expr.includes('NaN') && expr.includes('uTime'), 'GLSL expression well-formed');
ok(expr.includes('uChopCS'), 'chop terms ride the wind uniform');
const gpu = new Function('wx', 'wz', 'uTime', 'uChopCS',
  `const sin = Math.sin; return ${expr};`);

let worst = 0;
for (let i = 0; i < 500; i++) {
  const x = (rnd() - 0.5) * 4000, z = (rnd() - 0.5) * 4000, t = rnd() * 3600;
  const d = Math.abs(gpu(x, z, t, CS) - waveHeight(x, z, t));
  if (d > worst) worst = d;
  ok(Math.abs(waveHeight(x, z, t)) <= MAX_WAVE_HEIGHT + 1e-9, `height within MAX at sample ${i}`);
}
ok(worst < 2e-3, `CPU/GPU parity (worst drift ${worst.toExponential(2)})`);

// the smooth-water contract: the analytic gradient (per-pixel normals) must
// match BOTH its own GLSL emission and a finite difference of the height —
// the normal always belongs to the surface being drawn.
const gexpr = glslWaveGrad();
ok(gexpr.includes('uTime') && gexpr.includes('vec2'), 'GLSL gradient well-formed');
// The emitted gradient is now ONE vec2 constructor per term with scalar
// components (the warp's chain rule lives inside them), so a vec2 shim that
// sums componentwise compiles the whole emission as JS — no regex on the
// maths, which is the honest check: the shader gets this exact string.
ok(gexpr.includes('uChopCS') && gexpr.includes('sin('),
  'gradient carries the wind turn and the phase warp');
const gpuGradEval = new Function('wx', 'wz', 'uTime', 'uChopCS', `
  const sin = Math.sin, cos = Math.cos;
  const vec2 = (a, b) => [a, b];
  const terms = [${gexpr.split('\n      + ').join(',\n')}];
  return terms.reduce((s, v) => [s[0] + v[0], s[1] + v[1]], [0, 0]);`);
let worstG = 0, worstFD = 0;
for (let i = 0; i < 500; i++) {
  const x = (rnd() - 0.5) * 4000, z = (rnd() - 0.5) * 4000, t = rnd() * 3600;
  const [gx, gz] = waveGradient(x, z, t);
  const [ex, ez] = gpuGradEval(x, z, t, CS);
  worstG = Math.max(worstG, Math.abs(gx - ex), Math.abs(gz - ez));
  const e = 0.01;
  const fx = (waveHeight(x + e, z, t) - waveHeight(x - e, z, t)) / (2 * e);
  const fz = (waveHeight(x, z + e, t) - waveHeight(x, z - e, t)) / (2 * e);
  worstFD = Math.max(worstFD, Math.abs(gx - fx), Math.abs(gz - fz));
}
ok(worstG < 2e-3, `gradient CPU/GPU parity (worst ${worstG.toExponential(2)})`);
ok(worstFD < 2e-3, `gradient matches finite-differenced height (worst ${worstFD.toExponential(2)})`);

// the shading LOD bands: three per-band gradient emissions must PARTITION
// the full gradient — nothing lost, nothing double-lit (structural check on
// the emitted terms; the fragment shader recombines them with its fades)
{
  const parse = (expr) => expr === 'vec2(0.0)' ? [] : expr.split('\n      + ');
  const l = parse(glslWaveGradBand(GRAD_BANDS.long, 1e9));
  const m = parse(glslWaveGradBand(GRAD_BANDS.mid, GRAD_BANDS.long));
  const s = parse(glslWaveGradBand(0, GRAD_BANDS.mid));
  const all = parse(glslWaveGrad());
  ok(l.length + m.length + s.length === all.length, 'the LOD bands partition the components');
  ok([...l, ...m, ...s].every((t) => all.includes(t)), 'each band term is the full emission\'s own');
  ok(l.length >= 1 && m.length >= 1 && s.length >= 1, 'every band carries real sea');
}

ok(WAVES.length >= 3, 'at least 3 wave components (a real sea, not a sine)');
for (let i = 1; i < WAVES.length; i++) {
  ok(WAVES[i].amp <= WAVES[i - 1].amp, `amps descend (${i})`);
  ok(WAVES[i].len < WAVES[i - 1].len, `wavelengths descend (${i})`);
}
ok(Math.abs(MAX_WAVE_HEIGHT - WAVES.reduce((s, w) => s + w.amp, 0)) < 1e-12, 'MAX is the amp sum');
for (const w of WAVES) {
  const n = Math.hypot(w.dirX, w.dirZ);
  ok(Math.abs(n - 1) < 0.02, `wave direction ~unit length (got ${n.toFixed(3)})`);
}

// ---- the shore field (calming + shore-parallel waves) ----
// The emitted GLSL expressions must equal their CPU twins: compile each as JS
// (smoothstep/clamp shimmed exactly as GLSL defines them) and sweep sd, t.
const glslEnv = 'const sin = Math.sin, cos = Math.cos;'
  + 'const clamp = (x, a, b) => Math.min(b, Math.max(a, x));'
  + 'const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };';
const gpuAtten = new Function('sd', `${glslEnv} return ${glslShoreAttenExpr()};`);
const gpuEnv = new Function('sd', `${glslEnv} return ${glslShoreEnvExpr()};`);
const gpuShoreSum = new Function('sd', 'uTime', `${glslEnv} return ${glslShoreSumExpr()};`);
const gpuShoreGrad = new Function('sd', 'uTime', `${glslEnv} return ${glslShoreGradExpr()};`);
let worstS = 0;
for (let i = 0; i < 500; i++) {
  const sd = (rnd() - 0.55) * 2000, t = rnd() * 3600;
  worstS = Math.max(worstS,
    Math.abs(gpuAtten(sd) - shoreOpenAtten(sd)),
    Math.abs(gpuEnv(sd) * gpuShoreSum(sd, t) - shoreHeight(sd, t)),
    Math.abs(gpuEnv(sd) * gpuShoreGrad(sd, t) - shoreGradMag(sd, t)));
}
ok(worstS < 2e-3, `shore field CPU/GPU parity (worst ${worstS.toExponential(2)})`);
ok(glslShore().includes('oShoreAtten') && glslShore().includes('oShoreSum'),
  'shore GLSL block well-formed');

// the shore field's shape: blue water untouched, the beach calm, the
// breaker band carrying the shore-parallel set
ok(Math.abs(shoreOpenAtten(-5000) - 1) < 1e-9, 'blue water: open waves at full strength');
ok(Math.abs(shoreOpenAtten(0) - SHORE_CALM) < 1e-9, 'waterline: open waves calmed to SHORE_CALM');
ok(shoreEnv(-5000) < 1e-9 && shoreEnv(0) < 1e-9 && shoreEnv(200) < 1e-9,
  'shore set silent in blue water, at the sand and inland');
ok(shoreEnv(-50) > 0.9, 'shore set at full song over the breaker band');
for (let sd = -900; sd < -40; sd += 7) {
  ok(shoreOpenAtten(sd) >= shoreOpenAtten(sd + 7) - 1e-9, `calming is monotone (sd=${sd})`);
}

// with a sampler installed (an analytic island: land inside r=500) the sea
// calms toward the beach and waves ride the landward gradient; without one,
// the open-sea sums above must be exactly what waveHeight returns (already
// held by the parity loops, which ran sampler-free)
const openBefore = waveHeight(700, 0, 123.4);       // CPU open sum, no sampler
const openGradBefore = waveGradient(700, 0, 123.4);
const plainBefore = waveHeight(100, 200, 33);
setShoreSampler((x, z) => {
  const r = Math.hypot(x, z) || 1e-9;
  if (r > 3500) return null;
  return { d: 500 - r, gx: -x / r, gz: -z / r, gLen: 1 };
});
const meanAmp = (r) => {
  let s = 0;
  for (let i = 0; i < 200; i++) s += Math.abs(waveHeight(r, 0, i * 0.37));
  return s / 200;
};
ok(meanAmp(560) < meanAmp(3000), 'the sea calms as it closes the beach');
{
  // waveHeight with the sampler = attenuated open sum + shore set, exactly
  const x = 700, z = 0, t = 123.4; // d = -200
  const want = openBefore * shoreOpenAtten(-200) + shoreHeight(-200, t);
  ok(Math.abs(waveHeight(x, z, t) - want) < 1e-9, 'shore-aware height composes exactly');
  const [gx2] = waveGradient(x, z, t);
  const wantG = openGradBefore[0] * shoreOpenAtten(-200)
    + shoreGradMag(-200, t) * SHORE_SHADE * -1;
  ok(Math.abs(gx2 - wantG) < 1e-9, 'shore-aware gradient composes exactly (shading softened)');
}
// THE STRAIT GATE: where the field's gradient collapses (a channel's
// medial line — two shores fighting over one distance field) the shore set
// stands down entirely; the calming stays. No more full-channel corduroy.
setShoreSampler((x, z) => ({ d: -30, gx: 1, gz: 0, gLen: 0.2 }));
{
  const x = 700, z = 0, t = 123.4;
  const want = openBefore * shoreOpenAtten(-30); // calm, but NO shore set
  ok(Math.abs(waveHeight(x, z, t) - want) < 1e-9,
    'a strait\'s sheltered water calms without breaking');
}
setShoreSampler(null);
ok(Math.abs(waveHeight(100, 200, 33) - plainBefore) < 1e-12,
  'sampler removed: the open sea is back untouched');

// ---- the TWO-BAND sea (swell rollers vs local wind-sea, 2026-07-25) ----
// CPU waveHeight under split band states must equal the per-band emitted
// sums scaled the same way — which is exactly what the shader computes.
{
  ok(GRAD_BANDS.long === SWELL_LEN, 'the LOD long band IS the swell population');
  ok(Math.abs(MAX_SWELL_HEIGHT + MAX_CHOP_HEIGHT - MAX_WAVE_HEIGHT) < 1e-12,
    'the two populations partition the sea\'s height');
  const sumL = new Function('wx', 'wz', 'uTime', 'uChopCS',
    `const sin = Math.sin; return ${glslWaveSumBand(SWELL_LEN, 1e9)};`);
  const sumS = new Function('wx', 'wz', 'uTime', 'uChopCS',
    `const sin = Math.sin; return ${glslWaveSumBand(0, SWELL_LEN)};`);
  setSeaBands(1.7, 0.6);
  let worstB = 0;
  for (let i = 0; i < 200; i++) {
    const x = (rnd() - 0.5) * 4000, z = (rnd() - 0.5) * 4000, t = rnd() * 3600;
    worstB = Math.max(worstB,
      Math.abs(1.7 * sumL(x, z, t, CS) + 0.6 * sumS(x, z, t, CS) - waveHeight(x, z, t)));
  }
  ok(worstB < 2e-3, `two-band CPU/GPU parity (worst ${worstB.toExponential(2)})`);
  const b = getSeaBands();
  ok(b.swell === 1.7 && b.chop === 0.6, 'the bands read back');
  setSeaBands(99, 99);
  ok(getSeaBands().swell === SEA_SWELL_MAX && getSeaBands().chop === SEA_STATE_MAX,
    'both band caps hold');
  setSeaBands(1, 1); // leave the world as we found it
}

for (let i = 1; i < SHORE_WAVES.length; i++) {
  ok(SHORE_WAVES[i].amp <= SHORE_WAVES[i - 1].amp, `shore amps descend (${i})`);
  ok(SHORE_WAVES[i].len < SHORE_WAVES[i - 1].len, `shore wavelengths descend (${i})`);
}
ok(Math.abs(MAX_SHORE_HEIGHT - SHORE_WAVES.reduce((s, w) => s + w.amp, 0)) < 1e-12,
  'MAX_SHORE is the shore amp sum');
ok(SHORE_RANGE > 100 && SHORE_CALM > 0 && SHORE_CALM < 1, 'shore constants sane');

// ---- THE ANTI-GRATING CONTRACT (2026-07-25) ----
// The narrow east-west stripes that stood in every ocean were a beat between
// two chop trains, world-locked because the table's headings were constants.
// Three assertions keep that door shut. They test the MODEL headlessly; the
// pixels are gated separately by live-spectrum.mjs's EW-stripe metric.
{
  // 1. the wind-sea actually turns, and turns the right way: the chop's own
  //    crest lines must lie across the wind (a downwind-running sea)
  const windFrom = 0.8;                      // wind blows FROM this yaw
  setChopRot(chopRotFor(windFrom));
  const cs = chopCS();
  const toward = { x: -Math.sin(windFrom), z: -Math.cos(windFrom) };
  let dot = 0, n = 0;
  for (const w of WAVES) {
    if (w.len >= SWELL_LEN) continue;
    const dx = w.dirX * cs.x - w.dirZ * cs.y, dz = w.dirX * cs.y + w.dirZ * cs.x;
    dot += dx * toward.x + dz * toward.z; n++;
  }
  ok(dot / n > 0.55, `the chop fan runs downwind (mean alignment ${(dot / n).toFixed(2)})`);
  // and the swell does NOT turn — after a shift the sea lies crossed
  const sw = WAVES.find((w) => w.len >= SWELL_LEN);
  const sumSw = glslWaveSumBand(SWELL_LEN, 1e9);
  ok(!sumSw.includes('uChopCS') && sw, 'the swell keeps its own heading (a crossed sea)');

  // 2. no two trains beat into a fixed narrow stripe family. The old defect:
  //    the 11 m and 17 m trains' difference wave-vector had period ~7.4 m and
  //    pointed near-north — a permanent grid. Any pair whose difference falls
  //    in the eye's danger band (2-12 m) must now be BROKEN by the warp: the
  //    warp shifts each train's phase independently, so the beat's own phase
  //    wanders by at least a radian across a stripe's own wavelength.
  const TAU2 = Math.PI * 2;
  const warpOfI = (i) => ({ a: i * 2.39996, k: TAU2 / (96 + 23 * i) });
  let checked = 0;
  for (let i = 0; i < WAVES.length; i++) {
    for (let j = i + 1; j < WAVES.length; j++) {
      const a = WAVES[i], b = WAVES[j];
      const ka = TAU2 / a.len, kb = TAU2 / b.len;
      const dx = ka * a.dirX - kb * b.dirX, dz = ka * a.dirZ - kb * b.dirZ;
      const beatLen = TAU2 / Math.hypot(dx, dz);
      if (beatLen < 2 || beatLen > 12) continue;   // outside the danger band
      checked++;
      // the beat's phase = φi - φj carries BOTH warps; over one beat
      // wavelength their difference must swing at least ~1 rad, or the
      // stripes would still stack coherently
      // each train's warp is CHOP_WARP × its own wavenumber in phase-gradient
      // terms, so the beat's phase swings by CHOP_WARP(ka + kb) per metre
      const swing = CHOP_WARP * (ka + kb) * beatLen;
      ok(swing > 1, `beat pair ${i}/${j} (λ ${beatLen.toFixed(1)} m) is decohered `
        + `(phase swing ${swing.toFixed(2)} rad)`);
    }
  }
  ok(checked > 0, 'the beat check actually found pairs to check (it is not vacuous)');

  // 3. the warp is real and bends crest lines: along a train's own crest the
  //    height must NOT stay constant (a straight infinite crest line is the
  //    grating). Walk the 11 m train's crest and demand it wander.
  setSeaBands(1, 1);
  const w11 = WAVES.find((w) => Math.abs(w.len - 11) < 0.01);
  let vary = 0;
  if (w11) {
    const cx = -w11.dirZ, cz = w11.dirX;      // along-crest unit vector
    let lo = Infinity, hi = -Infinity;
    for (let s = 0; s < 400; s += 4) {
      const h = waveHeight(cx * s, cz * s, 0);
      lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    vary = hi - lo;
  }
  ok(vary > 0.2, `crest lines wander along their own heading (spread ${vary.toFixed(2)} m)`);
  setChopRot(0); // leave the world as we found it
}

if (failed) { console.error(`verify-waves: ${failed} FAILED`); process.exit(1); }
console.log('verify-waves: OK — CPU/GPU wave parity holds (open + shore field),',
  WAVES.length, 'open +', SHORE_WAVES.length, 'shore components, max height', MAX_WAVE_HEIGHT.toFixed(2));
