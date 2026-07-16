// verify-foam: the motion-cue layer. Flecks must be deterministic and
// world-anchored (invariant 6 — every client sees the same sea), the wake
// ring buffer must cap, recycle, and fade to nothing.
import {
  flecksAround, hash2i, newWake, stepWake, wakeInterval, wakeAlpha, wakeSize,
  FLECK_RADIUS, WAKE_LIFE,
} from '../src/foam.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// determinism: same query twice, and overlapping queries agree on shared cells
const a = flecksAround(1000, -2000);
const b = flecksAround(1000, -2000);
ok(a.length > 100, `a healthy carpet of flecks (got ${a.length})`);
ok(a.length === b.length && a.every((f, i) => f.x === b[i].x && f.z === b[i].z && f.phase === b[i].phase),
  'flecksAround is deterministic');
const shifted = flecksAround(1006, -2000);
const keyset = new Set(shifted.map((f) => `${f.x},${f.z}`));
const shared = a.filter((f) => keyset.has(`${f.x},${f.z}`));
ok(shared.length > a.length * 0.5, 'world-anchored: shifted query keeps the shared cells');

for (const f of a) {
  const d = Math.hypot(f.x - 1000, f.z + 2000);
  ok(d <= FLECK_RADIUS + 1e-9, `fleck inside the ring (${d.toFixed(1)})`);
}
ok(Math.abs(hash2i(3, 7) - hash2i(3, 7)) === 0 && hash2i(3, 7) !== hash2i(7, 3), 'hash stable and asymmetric');

// cadence: faster ship, tighter trail, never zero
ok(wakeInterval(0) > wakeInterval(5) && wakeInterval(5) > wakeInterval(10), 'interval shrinks with speed');
ok(wakeInterval(1000) >= 0.06, 'interval floor holds');

// ring buffer: spawns, caps, recycles, dies
const w = newWake(8);
const em = [{ x: 1, z: 2, size: 1.5 }, { x: 3, z: 4, size: 0.8 }];
for (let i = 0; i < 100; i++) stepWake(w, 0.1, 6, em);
ok(w.slots.length === 8, 'capacity is fixed');
ok(w.slots.filter((s) => wakeAlpha(s) > 0).length <= 8, 'live patches never exceed cap');
const young = w.slots.find((s) => s.age < WAKE_LIFE);
ok(!!young, 'recycling keeps fresh patches coming');
ok(wakeSize(young) >= young.size0 && wakeSize(young) <= young.size1, 'patch grows within bounds');

const dead = { x: 0, z: 0, age: WAKE_LIFE + 1, size0: 1, size1: 3 };
ok(wakeAlpha(dead) === 0, 'old patches fade to nothing');
ok(wakeAlpha({ ...dead, age: 0 }) > 0.5, 'fresh patches are visible');

// becalmed: no spawns
const w2 = newWake(8);
for (let i = 0; i < 50; i++) stepWake(w2, 0.1, 0.2, em);
ok(w2.slots.every((s) => s.age > WAKE_LIFE), 'no wake when becalmed');

if (failed) { console.error(`verify-foam: ${failed} FAILED`); process.exit(1); }
console.log('verify-foam: OK — flecks deterministic/world-anchored, wake caps, recycles, fades');
