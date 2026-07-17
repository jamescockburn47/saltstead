// verify-survivors: a crewed sinking spills 2–4 deterministic swimmers with
// their own minds made up, they strike out for a close sail and stop short
// of the hull, and the sea's clock runs faster in shark water.
import {
  spawnSurvivors, stepSurvivor, survivorFate,
  RESCUE_R, NOTICE_R, TAKEN_S_TROPIC, TAKEN_S_COLD, GRATITUDE,
} from '../src/survivors.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// spawn: deterministic, 2..4 souls, scattered around the wreck, mixed minds
{
  let joiners = 0, total = 0;
  for (let seed = 1; seed < 60; seed++) {
    const a = spawnSurvivors(seed, 100, -50);
    const b = spawnSurvivors(seed, 100, -50);
    ok(JSON.stringify(a) === JSON.stringify(b), `seed ${seed} deterministic`);
    ok(a.length >= 2 && a.length <= 4, `2..4 souls (${a.length})`);
    for (const s of a) {
      const r = Math.hypot(s.x - 100, s.z + 50);
      ok(r >= 4 && r <= 15, `scattered around the wreck (${r.toFixed(1)} m)`);
      total++;
      if (s.join) joiners++;
    }
  }
  const frac = joiners / total;
  ok(frac > 0.4 && frac < 0.85, `minds are mixed but most would sail (${(frac * 100).toFixed(0)}% join)`);
}

// the swim: they age, strike out for a sail in sight, and stop short
{
  const s = { id: 't', x: 0, z: 0, age: 0, join: true, phase: 0 };
  for (let i = 0; i < 60 * 30; i++) stepSurvivor(s, 100, 0, 1 / 30);
  ok(s.age > 59, 'the clock runs on a swimmer');
  ok(s.x > 20, `they strike out for the sail (${s.x.toFixed(0)} m made good)`);
  for (let i = 0; i < 120 * 30; i++) stepSurvivor(s, 100, 0, 1 / 30);
  ok(Math.hypot(100 - s.x, s.z) >= 5.5, 'and stop short of the hull for the haul');
  const far = { id: 'f', x: 0, z: 0, age: 0, join: false, phase: 0 };
  stepSurvivor(far, NOTICE_R + 500, 0, 1);
  ok(far.x === 0, 'a sail below the horizon draws nobody');
}

// the sea's clock: warm water is shark water
ok(survivorFate(TAKEN_S_TROPIC - 1, 15) === 'swimming', 'still swimming inside the window');
ok(survivorFate(TAKEN_S_TROPIC + 1, 15) === 'taken', 'the tropics take them at the tropic clock');
ok(survivorFate(TAKEN_S_TROPIC + 1, 55) === 'swimming', 'cold water gives longer');
ok(survivorFate(TAKEN_S_COLD + 1, 55) === 'taken', 'but not forever');
ok(TAKEN_S_TROPIC < TAKEN_S_COLD, 'sharks beat hypothermia');
ok(RESCUE_R > 6 && NOTICE_R > RESCUE_R && GRATITUDE > 0, 'the constants hold their shape');

if (failed) { console.error(`verify-survivors: ${failed} FAILED`); process.exit(1); }
console.log('verify-survivors: OK — deterministic souls, they swim for a sail, the tropics take them faster');
