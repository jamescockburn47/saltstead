// verify-waves: the CPU/GPU parity promise (DESIGN.md risk 3).
// The GLSL wave sum is GENERATED from the same table the CPU evaluator uses;
// this script compiles the emitted GLSL expression as JS and asserts the two
// agree everywhere — the sea the eye sees is the sea the hull feels.
import {
  WAVES, waveHeight, waveGradient, glslWaveSum, glslWaveGrad, MAX_WAVE_HEIGHT,
  SHORE_WAVES, SHORE_RANGE, SHORE_CALM, MAX_SHORE_HEIGHT,
  shoreOpenAtten, shoreEnv, shoreHeight, shoreGradMag, setShoreSampler,
  glslShoreAttenExpr, glslShoreEnvExpr, glslShoreSumExpr, glslShoreGradExpr, glslShore,
} from '../src/waves.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// deterministic sample points (LCG — no Math.random in the gate)
let seed = 12345;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

const expr = glslWaveSum();
ok(!expr.includes('NaN') && expr.includes('uTime'), 'GLSL expression well-formed');
const gpu = new Function('wx', 'wz', 'uTime', `const sin = Math.sin; return ${expr};`);

let worst = 0;
for (let i = 0; i < 500; i++) {
  const x = (rnd() - 0.5) * 4000, z = (rnd() - 0.5) * 4000, t = rnd() * 3600;
  const d = Math.abs(gpu(x, z, t) - waveHeight(x, z, t));
  if (d > worst) worst = d;
  ok(Math.abs(waveHeight(x, z, t)) <= MAX_WAVE_HEIGHT + 1e-9, `height within MAX at sample ${i}`);
}
ok(worst < 2e-3, `CPU/GPU parity (worst drift ${worst.toExponential(2)})`);

// the smooth-water contract: the analytic gradient (per-pixel normals) must
// match BOTH its own GLSL emission and a finite difference of the height —
// the normal always belongs to the surface being drawn.
const gexpr = glslWaveGrad();
ok(gexpr.includes('uTime') && gexpr.includes('vec2'), 'GLSL gradient well-formed');
// vec2 * cos(scalar) isn't plain JS — evaluate the emitted terms structurally
const gradTerms = gexpr.split('\n      + ').map((s) => {
  const m = s.match(/^vec2\((-?[\d.]+), (-?[\d.]+)\) \* cos\(([\d.]+) \* \((-?[\d.]+) \* wx \+ (-?[\d.]+) \* wz\) - ([\d.]+) \* uTime\)$/);
  return m && m.slice(1).map(Number);
});
ok(gradTerms.every(Boolean), 'GLSL gradient terms parse');
const gpuGradEval = (wx, wz, t) => gradTerms.reduce(([gx, gz], [ax, az, k, dx, dz, w]) => {
  const c = Math.cos(k * (dx * wx + dz * wz) - w * t);
  return [gx + ax * c, gz + az * c];
}, [0, 0]);
let worstG = 0, worstFD = 0;
for (let i = 0; i < 500; i++) {
  const x = (rnd() - 0.5) * 4000, z = (rnd() - 0.5) * 4000, t = rnd() * 3600;
  const [gx, gz] = waveGradient(x, z, t);
  const [ex, ez] = gpuGradEval(x, z, t);
  worstG = Math.max(worstG, Math.abs(gx - ex), Math.abs(gz - ez));
  const e = 0.01;
  const fx = (waveHeight(x + e, z, t) - waveHeight(x - e, z, t)) / (2 * e);
  const fz = (waveHeight(x, z + e, t) - waveHeight(x, z - e, t)) / (2 * e);
  worstFD = Math.max(worstFD, Math.abs(gx - fx), Math.abs(gz - fz));
}
ok(worstG < 2e-3, `gradient CPU/GPU parity (worst ${worstG.toExponential(2)})`);
ok(worstFD < 2e-3, `gradient matches finite-differenced height (worst ${worstFD.toExponential(2)})`);

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
  return { d: 500 - r, gx: -x / r, gz: -z / r };
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
  const wantG = openGradBefore[0] * shoreOpenAtten(-200) + shoreGradMag(-200, t) * -1;
  ok(Math.abs(gx2 - wantG) < 1e-9, 'shore-aware gradient composes exactly');
}
setShoreSampler(null);
ok(Math.abs(waveHeight(100, 200, 33) - plainBefore) < 1e-12,
  'sampler removed: the open sea is back untouched');

for (let i = 1; i < SHORE_WAVES.length; i++) {
  ok(SHORE_WAVES[i].amp <= SHORE_WAVES[i - 1].amp, `shore amps descend (${i})`);
  ok(SHORE_WAVES[i].len < SHORE_WAVES[i - 1].len, `shore wavelengths descend (${i})`);
}
ok(Math.abs(MAX_SHORE_HEIGHT - SHORE_WAVES.reduce((s, w) => s + w.amp, 0)) < 1e-12,
  'MAX_SHORE is the shore amp sum');
ok(SHORE_RANGE > 100 && SHORE_CALM > 0 && SHORE_CALM < 1, 'shore constants sane');

if (failed) { console.error(`verify-waves: ${failed} FAILED`); process.exit(1); }
console.log('verify-waves: OK — CPU/GPU wave parity holds (open + shore field),',
  WAVES.length, 'open +', SHORE_WAVES.length, 'shore components, max height', MAX_WAVE_HEIGHT.toFixed(2));
