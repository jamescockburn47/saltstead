// verify-wake: the Kelvin wake's promises (src/wake.js).
//  1. PARITY — the shared template (wakeBody) compiled as JS agrees with the
//     hand-written CPU twin (wakeEval) everywhere: the wake the shader draws
//     is the wake the foam rides.
//  2. PHYSICS — no wake ahead of the hull, none at a standstill, it fades in
//     clear of the sternpost, dies with distance, stays inside a sane
//     amplitude, and the churn mask lives in [0, 1].
import { wakeBody, glslWake, wakeEval, wakeSum, WAKE_MAX, WAKE_MIN_SPEED } from '../src/wake.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// deterministic samples (LCG — no Math.random in the gate)
let seed = 424242;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

// compile the shared template as JS with GLSL shims — exactly what the GPU
// runs, minus the vec plumbing
const shims = `
  const abs = Math.abs, min = Math.min, max = Math.max, exp = Math.exp,
    cos = Math.cos, sqrt = Math.sqrt, pow = Math.pow;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const smoothstep = (e0, e1, x) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };`;
const gpu = new Function('px', 'pz', 'sx', 'sz', 'fx', 'fz', 'spd',
  `${shims}\n${wakeBody('let')}\nreturn [wY, wF];`);

ok(glslWake().includes(`uWakeSrc[i]`) && glslWake().includes('vec2 wakeHF'), 'GLSL wake well-formed');
ok(WAKE_MAX >= 2, 'at least two wake slots (player + company)');

let worst = 0;
for (let i = 0; i < 800; i++) {
  const yaw = rnd() * Math.PI * 2;
  const s = {
    x: (rnd() - 0.5) * 2000, z: (rnd() - 0.5) * 2000,
    fx: Math.sin(yaw), fz: Math.cos(yaw),
    speed: WAKE_MIN_SPEED + rnd() * 8,
  };
  const px = s.x + (rnd() - 0.5) * 260, pz = s.z + (rnd() - 0.5) * 260;
  const cpu = wakeEval(px, pz, s);
  const [h, f] = gpu(px, pz, s.x, s.z, s.fx, s.fz, s.speed);
  worst = Math.max(worst, Math.abs(cpu.h - h), Math.abs(cpu.f - f));
  ok(Math.abs(cpu.h) < 0.7, `wake amplitude sane at sample ${i} (${cpu.h.toFixed(3)})`);
  ok(cpu.f >= 0 && cpu.f <= 1, `churn mask in [0,1] at sample ${i}`);
}
ok(worst < 1e-9, `template/CPU parity (worst drift ${worst.toExponential(2)})`);

// physics: a hull steaming north at 6 m/s from the origin
const north = { x: 0, z: 0, fx: 0, fz: 1, speed: 6 };
ok(wakeEval(0, 40, north).h === 0, 'no wake ahead of the hull');
ok(wakeEval(30, 30, north).h === 0, 'no wake far outside the Kelvin V');
ok(wakeEval(0, -0.5, north).h < 0.02, 'fades in clear of the sternpost');
const near = Math.abs(wakeEval(0, -25, north).h);
let far = 0;
for (let b = 180; b < 220; b += 2) far = Math.max(far, Math.abs(wakeEval(0, -b, north).h));
ok(far < near, `dies with distance (near ${near.toFixed(3)} vs far ${far.toFixed(3)})`);
ok(wakeEval(0, -25, { ...north, speed: 0.5 }).h === 0, 'a drifting hull throws no wake');
ok(wakeEval(0, -25, { ...north, speed: 0.5 }).f === 0, 'a drifting hull churns no water');
// the churn road is real astern and absent abeam
ok(wakeEval(0, -8, north).f > 0.25, 'churn road astern');
ok(wakeEval(40, 0, north).f < 0.02, 'no churn abeam');
// wakeSum: sums sources, ignores empties, handles null
ok(wakeSum(0, -25, [north, { ...north, speed: 0 }]) === wakeEval(0, -25, north).h, 'wakeSum sums live sources only');
ok(wakeSum(0, -25, null) === 0, 'wakeSum survives no sources');
// determinism: same inputs, same wake, every client
ok(wakeEval(3.7, -19.2, north).h === wakeEval(3.7, -19.2, north).h
  && JSON.stringify(wakeEval(3.7, -19.2, north)) === JSON.stringify(wakeEval(3.7, -19.2, north)),
'deterministic');

if (failed) { console.error(`verify-wake: ${failed} FAILED`); process.exit(1); }
console.log('verify-wake: OK — template/CPU parity holds,', WAKE_MAX, 'slots, Kelvin V + churn road behave');
