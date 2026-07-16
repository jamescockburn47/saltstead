// verify-fleet: crew is the currency of capture (the caps hold), the line
// astern is a real line, and the follow steering converges onto station and
// keeps up at full blue-water pace without orbiting or overshooting.
import {
  START_CREW, PRIZE_CREW, MIN_CREW, FLEET_MAX,
  canTakePrize, stationOffset, stationPoint, followStep,
} from '../src/fleet.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// capture rules
ok(canTakePrize(START_CREW, 0), 'a fresh crew can man the first prize');
ok(!canTakePrize(MIN_CREW + PRIZE_CREW - 1, 0), 'never strip your own ship below minimum');
ok(canTakePrize(MIN_CREW + PRIZE_CREW, 0), 'exactly enough hands works');
ok(!canTakePrize(99, FLEET_MAX), 'the leadership cap holds however many hands');
{
  // the arc of a greedy career: 8 hands, no recruits — exactly one prize
  let crew = START_CREW, prizes = 0;
  while (canTakePrize(crew, prizes)) { crew -= PRIZE_CREW; prizes++; }
  ok(prizes === 1, `8 hands and no recruits mans exactly 1 prize (${prizes})`);
  // a well-recruited crew (13 hands, pressed from many boardings) mans the cap
  crew = 13; prizes = 0;
  while (canTakePrize(crew, prizes) && prizes < 9) { crew -= PRIZE_CREW; prizes++; }
  ok(prizes === FLEET_MAX, `13 hands mans the full fleet (${prizes})`);
  ok(crew === MIN_CREW, `and is left at exactly the minimum (${crew})`);
}

// the line astern is a line, astern
for (let i = 0; i < FLEET_MAX; i++) {
  const o = stationOffset(i);
  ok(o.back > 0, `station ${i} is astern`);
  if (i) ok(o.back > stationOffset(i - 1).back, `station ${i} is further astern than ${i - 1}`);
  ok(Math.abs(o.side) < 6, `station ${i} stays inside the wake corridor`);
}
{
  // flagship heading north at the origin: stations sit south of it
  const s0 = stationPoint(0, 0, 0, 0);
  ok(s0.z < 0 && Math.abs(s0.x) < 6, 'station 0 due astern of a north-bound flag');
  const sE = stationPoint(100, 50, Math.PI / 2, 0); // heading east
  ok(sE.x < 100 && Math.abs(sE.z - 50) < 6, 'stations rotate with the flagship');
}

// follow steering: converge onto station behind a moving flagship, no orbit
{
  const dt = 1 / 30;
  const flag = { x: 0, z: 0, yaw: 0 };
  const pace = 12; // a brisk offshore pace
  const f = { x: -40, z: -80, yaw: 2.5, speed: 0 }; // badly out of station
  let worstLate = 0;
  for (let i = 0; i < 60 * 120; i++) {
    flag.z += pace * dt;
    const s = stationPoint(flag.x, flag.z, flag.yaw, 0);
    followStep(f, s, flag.yaw, pace, dt);
    if (i > 60 * 90) worstLate = Math.max(worstLate, Math.hypot(s.x - f.x, s.z - f.z));
  }
  ok(worstLate < 8, `settles onto station behind a moving flag (worst late error ${worstLate.toFixed(1)} m)`);
  ok(Math.abs(f.yaw % (Math.PI * 2)) < 0.35, `heading settles onto the flagship's course (${f.yaw.toFixed(2)})`);

  // full blue-water pace: she must keep up, not fall out of the world
  const flag2 = { x: 0, z: 0, yaw: 0.7 };
  const f2 = { x: stationPoint(0, 0, 0.7, 1).x, z: stationPoint(0, 0, 0.7, 1).z, yaw: 0.7, speed: 0 };
  const pace2 = 12.5 * 20; // hull 12.5 m/s at 20x gait
  let worst2 = 0;
  for (let i = 0; i < 60 * 60; i++) {
    flag2.x += Math.sin(0.7) * pace2 * dt;
    flag2.z += Math.cos(0.7) * pace2 * dt;
    const s = stationPoint(flag2.x, flag2.z, 0.7, 1);
    followStep(f2, s, 0.7, pace2, dt);
    if (i > 60 * 30) worst2 = Math.max(worst2, Math.hypot(s.x - f2.x, s.z - f2.z));
  }
  ok(worst2 < 60, `keeps up at 20x blue-water pace (worst error ${worst2.toFixed(0)} m)`);
}

if (failed) { console.error(`verify-fleet: ${failed} FAILED`); process.exit(1); }
console.log('verify-fleet: OK — capture caps hold, line astern true, follow converges and keeps 20x pace');
