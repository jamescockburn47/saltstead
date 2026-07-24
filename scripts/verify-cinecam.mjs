// verify-cinecam: the meeting lens keeps its promises (src/cinecam.js).
//  1. FRAMING — both ships stay inside the safe cone for the whole shot.
//  2. STANDOFF — the lens never crowds either hull and never dips low.
//  3. ELIGIBILITY — cooldown honoured, only real meetings under way.
//  4. DETERMINISM — same meeting, same shot, every client.
import {
  cineEligible, cineShot, cinePose, cineSubtend,
  CINE_RANGE, CINE_MIN_SEP, CINE_COOLDOWN, CINE_DUR, CINE_FOV_SAFE,
} from '../src/cinecam.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// deterministic samples (LCG — no Math.random in the gate)
let seed = 777;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

for (let i = 0; i < 300; i++) {
  const ax = (rnd() - 0.5) * 4000, az = (rnd() - 0.5) * 4000;
  const ang = rnd() * Math.PI * 2;
  const sep = CINE_MIN_SEP + rnd() * (CINE_RANGE - CINE_MIN_SEP);
  const bx = ax + Math.sin(ang) * sep, bz = az + Math.cos(ang) * sep;
  const shot = cineShot(ax, az, bx, bz, i);
  ok(shot.dur === CINE_DUR, `duration fixed (${i})`);
  ok(shot.y >= 9 && shot.y <= 60, `height in bounds (${i}: ${shot.y.toFixed(1)})`);
  for (const u of [0, shot.dur / 2, shot.dur]) {
    const p = cinePose(shot, u);
    ok(cineSubtend(p, ax, az, bx, bz) < CINE_FOV_SAFE,
      `both ships inside the safe cone (${i} u=${u})`);
    ok(Math.hypot(p.x - ax, p.z - az) > 30 && Math.hypot(p.x - bx, p.z - bz) > 30,
      `lens stands off both hulls (${i} u=${u})`);
    ok(p.lookAt.y > 0, `frame holds the sky (${i})`);
  }
  // the dolly really moves, but gently
  const d = Math.hypot(cinePose(shot, shot.dur).x - cinePose(shot, 0).x,
    cinePose(shot, shot.dur).z - cinePose(shot, 0).z);
  ok(d > 5 && d < 100, `dolly drifts a readable distance (${i}: ${d.toFixed(1)})`);
}

// eligibility
ok(!cineEligible(0, CINE_COOLDOWN - 1, 80, 5, 5), 'cooldown holds');
ok(cineEligible(0, CINE_COOLDOWN + 1, 80, 5, 5), 'cooldown releases');
ok(!cineEligible(-1e9, 0, CINE_RANGE + 10, 5, 5), 'too far is no meeting');
ok(!cineEligible(-1e9, 0, CINE_MIN_SEP - 5, 5, 5), 'alongside is a boarding, not a shot');
ok(!cineEligible(-1e9, 0, 80, 0.5, 5), 'a drifting player earns no lens');
ok(!cineEligible(-1e9, 0, 80, 5, 0.5), 'a drifting stranger earns no lens');

// determinism
ok(JSON.stringify(cineShot(10, 20, 90, 60, 3)) === JSON.stringify(cineShot(10, 20, 90, 60, 3)),
  'same meeting, same shot');
ok(JSON.stringify(cineShot(10, 20, 90, 60, 3)) !== JSON.stringify(cineShot(10, 20, 90, 60, 4)),
  'the seed varies the side');

if (failed) { console.error(`verify-cinecam: ${failed} FAILED`); process.exit(1); }
console.log('verify-cinecam: OK — framing safe, standoff held, cooldown honest, deterministic');
