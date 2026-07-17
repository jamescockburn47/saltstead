// verify-ship: hull physics on the live wave field — speed converges on the
// sailing model's target, the rudder answers, and buoyancy attitude stays
// inside believable bounds (no capsizing the prototype from a maths slip).
import {
  newShipState, stepShip, shipAttitude, beaches, SLOOP, BRIG, SPECS,
} from '../src/shipphysics.js';
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

// sails furled (anchorage): drive dies whatever the trim, she glides to rest
{
  const s = newShipState(0, 0);
  s.speed = 7;
  const wind = { from: s.yaw - Math.PI / 2, speed: 12 }; // a driving beam wind
  s.trim = optimalTrim(wrapAngle(s.yaw - wind.from));
  for (let i = 0; i < 60 * 30; i++) stepShip(s, wind, DT, SLOOP, 1, true);
  ok(s.speed < 0.3, `furled, she comes to rest even in a gale (${s.speed.toFixed(2)} m/s)`);
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

// a heavy hull stands stiffer than a dinghy: over the same sea the galleon
// rocks at well under half the sloop's angles (the playtest verdict was
// big ships rocking like rowboats)
{
  const GALLEON = SPECS.GALLEON || BRIG;
  const s = newShipState(0, 0);
  let sloopR = 0, bigR = 0, sloopP = 0, bigP = 0;
  for (let t = 0; t < 90; t += 0.31) {
    s.x = t * 11; s.z = -t * 5; s.yaw = t * 0.13;
    const a = shipAttitude(s, t, SLOOP), b = shipAttitude(s, t, GALLEON);
    sloopR = Math.max(sloopR, Math.abs(a.roll)); bigR = Math.max(bigR, Math.abs(b.roll));
    sloopP = Math.max(sloopP, Math.abs(a.pitch)); bigP = Math.max(bigP, Math.abs(b.pitch));
  }
  ok(bigR < sloopR * 0.6, `the big hull rolls stiffer (${bigR.toFixed(3)} vs sloop ${sloopR.toFixed(3)})`);
  ok(bigP < sloopP * 0.75, `and pitches easier (${bigP.toFixed(3)} vs sloop ${sloopP.toFixed(3)})`);
  ok(bigR > 0.001, 'but she is still a ship on a sea, not a building');
}

// grounding attitude: where the floor shoals past the keel the hull RIDES it
{
  const s = newShipState(0, 0);
  const t = 3.7;
  const afloat = shipAttitude(s, t, SLOOP, () => -30);         // abyss: pure buoyancy
  const pure = shipAttitude(s, t);
  ok(Math.abs(afloat.y - pure.y) < 1e-9 && Math.abs(afloat.pitch - pure.pitch) < 1e-9,
    'deep water: ground sampler changes nothing');

  const beached = shipAttitude(s, t, SLOOP, () => 2);          // high flat sand
  ok(Math.abs(beached.y - (2 + SLOOP.keel)) < 1e-9,
    `beached hull sits ON the sand (${beached.y.toFixed(2)} vs ${(2 + SLOOP.keel).toFixed(2)})`);
  ok(Math.abs(beached.pitch) < 1e-9 && Math.abs(beached.roll) < 1e-9,
    'flat sand: the deck sits level');

  s.yaw = 0; // bow along +z; slope rising with z lifts the bow
  const slope = shipAttitude(s, t, SLOOP, (x, z) => 2 + z * 0.3);
  ok(slope.pitch < -0.15, `beached on a slope the bow lifts (pitch ${slope.pitch.toFixed(2)})`);
}

// the draft ladder: the sloop beaches, the brig anchors off and sends a boat
{
  ok(beaches(SLOOP), 'the sloop runs her bow up onto the sand');
  ok(!beaches(BRIG), 'the brig draws too much to beach — the boats go in');
  ok(SLOOP.groundLine > 0, `sloop stops ON the land (groundLine ${SLOOP.groundLine})`);
  ok(BRIG.groundLine < 0, `brig stops OFFSHORE, in ${-BRIG.groundLine} m of water`);
  ok(BRIG.draft > SLOOP.draft && BRIG.length > SLOOP.length,
    'the brig is the bigger, deeper hull');
  // and the grounded brig still rides the shoal, not merges with it
  const s = newShipState(0, 0);
  const shoal = shipAttitude(s, 2.2, BRIG, () => BRIG.groundLine);
  ok(shoal.y >= BRIG.groundLine + BRIG.keel - 1e-9,
    'brought up on the shoal, the brig sits on it');
}

// the whole class table is physically sane, smallest to largest
{
  const names = Object.keys(SPECS);
  ok(names.length >= 7, `seven classes on the water (${names.length})`);
  let prevLen = 0;
  for (const [name, spec] of Object.entries(SPECS)) {
    ok(spec.maxSpeed > 5 && spec.maxSpeed < 15, `${name}: speed in the age of sail`);
    ok(spec.turnRate > 0.1 && spec.turnRate <= 0.7, `${name}: turns like a ship`);
    ok(spec.draft > 0 && spec.keel > 0 && spec.beam > 0, `${name}: floats right way up`);
    ok(spec.length > prevLen, `${name}: the table runs smallest to largest`);
    ok(spec.length / spec.beam > 2 && spec.length / spec.beam < 4.5,
      `${name}: hull proportions believable (${(spec.length / spec.beam).toFixed(1)}:1)`);
    // every hull converges on a beam reach and answers her helm
    const s = newShipState(0, 0);
    const wind = { from: -Math.PI / 2, speed: 9 };
    s.trim = optimalTrim(Math.PI / 2);
    for (let i = 0; i < 90 * 30; i++) stepShip(s, wind, DT, spec);
    ok(s.speed > 3, `${name}: makes way on a beam reach (${s.speed.toFixed(1)} m/s)`);
    const att = shipAttitude(s, 4.2, spec);
    ok(Math.abs(att.pitch) < 0.5 && Math.abs(att.roll) < 0.5, `${name}: rides the sea level-ish`);
    prevLen = spec.length;
  }
}

// open-sea gait covers ground without touching the dynamics
{
  const a = newShipState(0, 0), b = newShipState(0, 0);
  const wind = { from: -Math.PI / 2, speed: 8 };
  a.trim = b.trim = optimalTrim(Math.PI / 2);
  for (let i = 0; i < 300; i++) { stepShip(a, wind, DT); stepShip(b, wind, DT, SLOOP, 4); }
  ok(Math.abs(a.speed - b.speed) < 1e-9, 'gait leaves hull speed untouched');
  const da = Math.hypot(a.x, a.z), db = Math.hypot(b.x, b.z);
  ok(db > da * 3.5 && db < da * 4.5, `gait 4 covers ~4x the ground (${(db / da).toFixed(2)}x)`);
}

if (failed) { console.error(`verify-ship: ${failed} FAILED`); process.exit(1); }
console.log('verify-ship: OK — converges, stalls in irons, rudder answers, buoyancy bounded');
