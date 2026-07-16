// verify-showreel: the marketing lens's pure half (src/showreel.js).
// The camera pose orbits at a constant radius and a FIXED altitude (the sea
// is its own datum — no stepping), always looks at the anchor, clamps its
// sweep fraction; and every beat in the default reel anchors over open WATER
// at sane framing numbers, with a real sweep and a legal time of day.
import { cameraPose, DEFAULT_BEATS, clamp01 } from '../src/showreel.js';
import { elevation } from '../src/earth.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// ---- cameraPose geometry ----
{
  const beat = { dist: 24, height: 9, az0: 0.4, az1: 1.3 };
  const X = 1000, Z = -2000;
  for (const u of [0, 0.25, 0.5, 0.75, 1]) {
    const p = cameraPose(beat, u, X, Z);
    ok(Math.abs(Math.hypot(p.x - X, p.z - Z) - beat.dist) < 1e-9,
      `orbit radius holds at u=${u}`);
    ok(p.y === beat.height, `altitude is fixed at u=${u} (no stepping)`);
    ok(p.lookAt.x === X && p.lookAt.z === Z, `lens holds the anchor at u=${u}`);
  }
  // the sweep actually sweeps, and clamps beyond its ends
  const a = cameraPose(beat, 0, X, Z), b = cameraPose(beat, 1, X, Z);
  ok(Math.hypot(a.x - b.x, a.z - b.z) > 1, 'az0 -> az1 moves the camera');
  const under = cameraPose(beat, -5, X, Z), over = cameraPose(beat, 9, X, Z);
  ok(under.x === a.x && under.z === a.z, 'u < 0 clamps to the start pose');
  ok(over.x === b.x && over.z === b.z, 'u > 1 clamps to the end pose');
  // lookUp raises the gaze for an overhead subject (the dragon beat)
  const up = cameraPose({ ...beat, lookUp: 8 }, 0.5, X, Z);
  ok(up.lookAt.y === 8, 'lookUp overrides the default gaze height');
  ok(cameraPose(beat, 0.5, X, Z).lookAt.y > 0, 'default gaze sits above the waterline');
}

// ---- clamp01 ----
ok(clamp01(-1) === 0 && clamp01(2) === 0.999 && clamp01(0.5) === 0.5,
  'clamp01 pins to [0, 0.999]');

// ---- the default reel ----
ok(DEFAULT_BEATS.length >= 5, `the reel shows the range (${DEFAULT_BEATS.length} beats)`);
const names = new Set();
for (const b of DEFAULT_BEATS) {
  const tag = b.name || '(unnamed)';
  ok(typeof b.name === 'string' && b.name.length > 3, `${tag}: named`);
  ok(!names.has(b.name), `${tag}: no duplicate beats`);
  names.add(b.name);
  ok([b.lat, b.lon, b.dist, b.height, b.az0, b.az1].every(Number.isFinite),
    `${tag}: all framing numbers finite`);
  ok(elevation(b.lat, b.lon) < 0, `${tag}: the anchor is open water (the ship must float there)`);
  ok(b.dist > 5 && b.height > 1, `${tag}: the lens stands off the hull`);
  ok(Math.abs(b.az1 - b.az0) > 0.2, `${tag}: the sweep is a real move, not a still`);
  ok(b.frac == null || (b.frac >= 0 && b.frac < 1), `${tag}: time of day in [0,1)`);
  ok(b.day == null || (Number.isInteger(b.day) && b.day >= 0 && b.day < 12),
    `${tag}: moon-month day inside the accelerated month`);
  ok(!b.weather || ['clear', 'overcast', 'rain', 'fog', 'storm'].includes(b.weather.state),
    `${tag}: forced weather is a state the game knows`);
  ok(!b.weather || (b.weather.gloom >= 0 && b.weather.gloom <= 1), `${tag}: gloom in [0,1]`);
}

if (failed) { console.error(`verify-showreel: ${failed} FAILED`); process.exit(1); }
console.log(`verify-showreel: OK — fixed-altitude orbit holds its anchor, ${DEFAULT_BEATS.length} beats all over open water with legal skies`);
