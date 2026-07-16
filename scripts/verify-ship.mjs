// verify-ship: hull physics on the live wave field — speed converges on the
// sailing model's target, the rudder answers, and buoyancy attitude stays
// inside believable bounds (no capsizing the prototype from a maths slip).
import { newShipState, stepShip, shipAttitude, SLOOP } from '../src/shipphysics.js';
import { sailPower, speedTarget, optimalTrim, wrapAngle } from '../src/sailing.js';
import { MAX_WAVE_HEIGHT } from '../src/waves.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };
const DT = 1 / 30;

// beam reach, perfect trim: speed converges to the model's target
{
  const s = newShipState(0, 0);
  const wind = { from: s.yaw - Math.PI / 2, speed: 8 };
  s.trim = optimalTrim(wrapAngle(s.yaw - wind.from));
  for (let i = 0; i < 60 * 30; i++) stepShip(s, wind, DT);
  const target = speedTarget(sailPower(s.yaw, wind.from, s.trim), wind.speed, SLOOP.maxSpeed);
  ok(target > 4, `beam-reach target is brisk (${target.toFixed(2)} m/s)`);
  ok(Math.abs(s.speed - target) < target * 0.05,
    `speed converges (${s.speed.toFixed(2)} vs target ${target.toFixed(2)})`);
  ok(Math.hypot(s.x, s.z) > 100, 'the ship actually went somewhere');
}

// dead into the wind: you slow to a stop
{
  const s = newShipState(0, 0);
  s.speed = 6;
  const wind = { from: s.yaw, speed: 8 };
  s.trim = 0;
  for (let i = 0; i < 60 * 30; i++) stepShip(s, wind, DT);
  ok(s.speed < 0.8, `in irons you stall (${s.speed.toFixed(2)} m/s)`);
}

// the rudder answers, and bites harder with way on
{
  const a = newShipState(0, 0); a.rudder = 1; a.speed = SLOOP.maxSpeed;
  const b = newShipState(0, 0); b.rudder = 1; b.speed = 0;
  const wind = { from: 10, speed: 0 };
  for (let i = 0; i < 90; i++) { stepShip(a, wind, DT); stepShip(b, wind, DT); }
  ok(a.yaw > 0.5, `full speed, full rudder turns (${a.yaw.toFixed(2)} rad in 3 s)`);
  ok(b.yaw > 0.01 && b.yaw < a.yaw * 0.4, `becalmed rudder barely bites (${b.yaw.toFixed(3)})`);
  const c = newShipState(0, 0); c.rudder = -1; c.speed = SLOOP.maxSpeed;
  for (let i = 0; i < 90; i++) stepShip(c, wind, DT);
  ok(Math.abs(c.yaw + a.yaw) < 1e-6, 'port and starboard rudder are symmetric');
}

// buoyancy attitude: bounded, alive, never absurd
{
  const s = newShipState(0, 0);
  let maxP = 0, maxR = 0, sawMotion = false, prevY = null;
  for (let t = 0; t < 120; t += 0.37) {
    s.x = t * 13; s.z = -t * 7; s.yaw = t * 0.1;
    const a = shipAttitude(s, t);
    maxP = Math.max(maxP, Math.abs(a.pitch)); maxR = Math.max(maxR, Math.abs(a.roll));
    ok(a.y >= -SLOOP.draft - MAX_WAVE_HEIGHT - 1e-9 && a.y <= -SLOOP.draft + MAX_WAVE_HEIGHT + 1e-9,
      `hull height inside wave envelope at t=${t.toFixed(1)}`);
    if (prevY !== null && Math.abs(a.y - prevY) > 1e-4) sawMotion = true;
    prevY = a.y;
  }
  ok(maxP < 0.45 && maxR < 0.45, `attitude bounded (pitch ${maxP.toFixed(2)}, roll ${maxR.toFixed(2)})`);
  ok(maxP > 0.005 && maxR > 0.005, 'the sea is not glass — the hull answers the swell');
  ok(sawMotion, 'the hull rises and falls');
}

if (failed) { console.error(`verify-ship: ${failed} FAILED`); process.exit(1); }
console.log('verify-ship: OK — converges, stalls in irons, rudder answers, buoyancy bounded');
