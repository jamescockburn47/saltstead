// verify-waves: the CPU/GPU parity promise (DESIGN.md risk 3).
// The GLSL wave sum is GENERATED from the same table the CPU evaluator uses;
// this script compiles the emitted GLSL expression as JS and asserts the two
// agree everywhere — the sea the eye sees is the sea the hull feels.
import { WAVES, waveHeight, glslWaveSum, MAX_WAVE_HEIGHT } from '../src/waves.js';

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

if (failed) { console.error(`verify-waves: ${failed} FAILED`); process.exit(1); }
console.log('verify-waves: OK — CPU/GPU wave parity holds,', WAVES.length, 'components, max height', MAX_WAVE_HEIGHT.toFixed(2));
