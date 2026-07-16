// verify-sailing: the "a good sailor outruns a bad one" promise (DESIGN.md
// pillar 1), plus the sailing-model invariants the feel depends on.
import {
  wrapAngle, IRONS, pointOfSailPower, optimalTrim, trimEfficiency,
  sailPower, tackSign, speedTarget, crewRudder, CREW_HOLD,
} from '../src/sailing.js';
import { newShipState, stepShip, SLOOP } from '../src/shipphysics.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };
const PI = Math.PI;

// wrapAngle
ok(Math.abs(wrapAngle(2 * PI)) < 1e-9, 'wrap(2PI) = 0');
ok(Math.abs(wrapAngle(PI + 0.1) - (-PI + 0.1)) < 1e-9, 'wrap(PI+0.1) = -PI+0.1');
ok(Math.abs(wrapAngle(-PI - 0.1) - (PI - 0.1)) < 1e-9, 'wrap(-PI-0.1) = PI-0.1');

// point of sail: dead into wind = nothing, beam reach = best
ok(pointOfSailPower(0) === 0, 'no power dead into the wind');
ok(pointOfSailPower(IRONS * 0.9) < 0.09, 'in irons: near-zero power');
let best = 0, bestA = 0;
for (let a = 0; a <= PI; a += 0.01) {
  const p = pointOfSailPower(a);
  ok(p >= 0 && p <= 1, `power in [0,1] at ${a.toFixed(2)}`);
  if (p > best) { best = p; bestA = a; }
}
ok(Math.abs(bestA - 1.57) < 0.1, `beam reach is the fastest point (peak at ${bestA.toFixed(2)})`);
ok(pointOfSailPower(PI) > 0.5, 'running still moves you');

// trim: optimal captures full power, sloppy trim costs you
ok(optimalTrim(IRONS) === 0, 'sheeted hard at the irons edge');
ok(Math.abs(optimalTrim(PI) - 1) < 1e-9, 'fully eased on a dead run');
for (const rel of [0.9, 1.57, 2.4, PI]) {
  ok(Math.abs(trimEfficiency(rel, optimalTrim(rel)) - 1) < 1e-9, `perfect trim = full power at ${rel}`);
  const opt = optimalTrim(rel);
  const good = sailPower(rel, 0, opt);
  const bad = sailPower(rel, 0, opt > 0.5 ? opt - 0.5 : opt + 0.5); // a real 0.5 trim error, never clamped away
  ok(good >= bad * 1.7, `good sailor outruns bad at rel ${rel} (${good.toFixed(2)} vs ${bad.toFixed(2)})`);
}
for (let e = -1; e <= 1; e += 0.1) {
  const eff = trimEfficiency(1.57, optimalTrim(1.57) + e);
  ok(eff >= 0.1 && eff <= 1, `efficiency clamped at error ${e.toFixed(1)}`);
}

// tack + speed
ok(tackSign(1, 0) === 1 && tackSign(-1, 0) === -1, 'tack sign follows wind side');
ok(speedTarget(1, 8, 10) === 10, 'full power at reference wind = max speed');
ok(speedTarget(1, 16, 10) === 20 && speedTarget(1, 30, 10) === 20, 'gale capped at 2x');
ok(speedTarget(0.5, 8, 10) < speedTarget(1, 8, 10), 'more power = faster');
ok(speedTarget(1, 4, 10) < speedTarget(1, 8, 10), 'more wind = faster');
ok(speedTarget(0, 8, 10) === 0, 'no power, no way');

// crew auto-helm: with the captain off the tiller, the crew must never let
// her sit head-to-wind — but must not touch a course that's drawing
ok(crewRudder(1.2) === 0 && crewRudder(-1.2) === 0, 'crew holds a drawing course');
ok(crewRudder(0.1) > 0.5, 'near-irons starboard tack: crew bears away hard to starboard');
ok(crewRudder(-0.1) < -0.5, 'near-irons port tack: crew bears away hard to port');
ok(Math.abs(crewRudder(CREW_HOLD - 0.01)) < Math.abs(crewRudder(0.05)),
  'crew rudder eases off as she comes onto a drawing course');

// end to end: dead in irons at zero way, crew alone gets her sailing again
{
  const wind = { from: 0, speed: 8 };
  const s = newShipState(0, 0);
  s.yaw = 0.02; s.speed = 0; s.trim = 0.5; // head-to-wind, stopped
  const dt = 0.1;
  let recovered = -1;
  for (let t = 0; t < 90; t += dt) {
    const rel = wrapAngle(s.yaw - wind.from);
    s.rudder += (crewRudder(rel) - s.rudder) * Math.min(1, dt * 2);
    stepShip(s, wind, dt, SLOOP);
    if (recovered < 0 && s.speed > 2) recovered = t;
  }
  ok(recovered >= 0 && recovered < 60,
    `crew sails her out of irons unaided (speed>2 in ${recovered.toFixed(0)}s)`);
  ok(Math.abs(wrapAngle(s.yaw - wind.from)) > IRONS,
    'and she ends up clear of the irons cone');
}

if (failed) { console.error(`verify-sailing: ${failed} FAILED`); process.exit(1); }
console.log('verify-sailing: OK — irons/beam/run curve sane, trim skill pays >=1.7x');
