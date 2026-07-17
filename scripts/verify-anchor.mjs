// verify-anchor: the ground tackle's pure rules (src/anchor.js).
// The cable knows its depth, refuses a running drop, snubs way off fast,
// and swings the bow to the wind the short way round.

import { CABLE_DEPTH, DROP_SPEED, canLetGo, snubSpeed, swingToWind } from '../src/anchor.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL - ' + msg); failed++; } };

// no THREE/DOM leakage: the import above already proves it runs in bare node

// the cable finds bottom in soundings, nothing over the trench
ok(canLetGo(5, 0).ok, 'shallow water at rest: let go');
ok(canLetGo(CABLE_DEPTH, 0).ok, 'the cable is good to its full scope');
ok(!canLetGo(CABLE_DEPTH + 1, 0).ok, 'a metre past the scope finds nothing');
ok(canLetGo(CABLE_DEPTH + 1, 0).why === 'deep', 'and says WHY: deep');

// a running drop parts the cable — refuse it
ok(canLetGo(5, DROP_SPEED).ok, 'slow enough to let go');
ok(!canLetGo(5, DROP_SPEED + 1).ok, 'too much way on her');
ok(canLetGo(5, DROP_SPEED + 1).why === 'way', 'and says WHY: way');

// the snub: exponential, monotonic, near-dead inside five seconds
{
  let v = 8;
  const v1 = snubSpeed(v, 1);
  ok(v1 < v && v1 > 0, 'the snub always slows, never reverses');
  for (let i = 0; i < 50; i++) v = snubSpeed(v, 0.1);
  ok(v < 0.05, `five seconds of cable kills 8 m/s of way (${v.toFixed(4)})`);
}

// the swing: converges on the wind, shortest way, no overshoot
{
  let yaw = 0;
  const windFrom = 2.5;
  for (let i = 0; i < 600; i++) yaw = swingToWind(yaw, windFrom, 0.1);
  ok(Math.abs(yaw - windFrom) < 0.01, `she rides head to wind (${yaw.toFixed(3)})`);
  // across the seam: from +3.0 to -3.0 is 0.28 rad the short way, not 6.0
  const y2 = swingToWind(3.0, -3.0, 0.5);
  ok(y2 > 3.0, 'the bow takes the SHORT way round the compass');
  // no overshoot even with a huge dt
  const y3 = swingToWind(1.0, 1.05, 60);
  ok(Math.abs(y3 - 1.05) < 1e-9, 'a big step lands ON the wind, never past it');
}

if (failed) { console.error(`verify-anchor: ${failed} FAILED`); process.exit(1); }
console.log('verify-anchor: OK — the cable knows its depth, snubs her way, swings her head to wind');
