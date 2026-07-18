// verify-chase: heat is bounded, warms with plunder and cools with days, the
// hunter's roll ramps with heat and never fires cold, the berth is astern,
// and the jettison bargain always costs real gold or isn't offered.
import {
  heatFromPlunder, coolHeat, hunterDue, hunterBerth, jettisonPlan,
  HEAT_MIN, JETTISON_FRAC, JETTISON_MIN, SPRINT_S, SPRINT_MULT, HUNTER_R, CHASE_OVER_R,
} from '../src/chase.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// heat: bounded, monotonic with plunder, saturating
{
  let h = 0;
  const h1 = heatFromPlunder(0, 200);
  ok(h1 > 0 && h1 < 0.2, `a first purse warms the name a little (${h1.toFixed(3)})`);
  for (let i = 0; i < 200; i++) h = heatFromPlunder(h, 400);
  ok(h <= 1 && h > 0.9, `a career of plunder saturates near the top (${h.toFixed(2)})`);
  const dLow = heatFromPlunder(0.1, 400) - 0.1;
  const dHigh = heatFromPlunder(0.9, 400) - 0.9;
  ok(dLow > dHigh, 'a new name warms faster than a notorious one');
}

// cooling: quiet days fade the name, never below cold
{
  const c = coolHeat(0.8, 2);
  ok(c < 0.8 * 0.6 && c > 0.2, `two quiet days cool a hot name (${c.toFixed(2)})`);
  ok(coolHeat(0.5, 0) === 0.5, 'no days, no cooling');
  ok(coolHeat(0.4, 1000) === 0, 'the sea forgets, eventually, entirely');
}

// the roll: never cold, ramping hot, deterministic
{
  for (let n = 0; n < 200; n++) ok(!hunterDue(7, n, HEAT_MIN - 0.01), 'a cold name is never hunted');
  const count = (heat) => {
    let c = 0;
    for (let seed = 1; seed <= 30; seed++) for (let n = 0; n < 20; n++) if (hunterDue(seed, n, heat)) c++;
    return c;
  };
  const warm = count(0.4), hot = count(1);
  ok(hot > warm * 2, `a hot name is hunted far oftener (${hot} vs ${warm} in 600 bells)`);
  ok(hot > 100 && hot < 300, `roughly every third bell at full heat (${hot}/600)`);
  ok(hunterDue(3, 5, 0.8) === hunterDue(3, 5, 0.8), 'the roll is deterministic');
}

// the berth: astern, over the horizon, laid on your course
{
  const b = hunterBerth(1000, 2000, 0.7, 3); // sailing yaw 0.7
  const d = Math.hypot(b.x - 1000, b.z - 2000);
  ok(Math.abs(d - HUNTER_R) < 1, `she lifts at the horizon (${d.toFixed(0)} m)`);
  // astern: the bearing from the ship to her is opposite-ish the course
  const bearing = Math.atan2(b.x - 1000, b.z - 2000);
  const offAstern = Math.atan2(Math.sin(bearing - (0.7 + Math.PI)), Math.cos(bearing - (0.7 + Math.PI)));
  ok(Math.abs(offAstern) < 0.6, `and astern of the wake (${offAstern.toFixed(2)} off)`);
  ok(b.yaw === 0.7, 'laid on the same course');
  ok(CHASE_OVER_R > HUNTER_R, 'the chase has sea-room to be lost in');
}

// the bargain: a quarter, floored, or not offered at all
{
  ok(jettisonPlan(JETTISON_MIN - 1) === null, 'a bare chest interests nobody');
  const p = jettisonPlan(1000);
  ok(p.cost === Math.round(1000 * JETTISON_FRAC) && p.keep === 1000 - p.cost,
    `a quarter of the chest goes over (${p.cost})`);
  const small = jettisonPlan(JETTISON_MIN + 10);
  ok(small.cost >= JETTISON_MIN, 'the sea takes a real purse or none');
  ok(SPRINT_S > 30 && SPRINT_MULT > 1, 'and the lightened hull genuinely flies');
}

if (failed) { console.error(`verify-chase: ${failed} FAILED`); process.exit(1); }
console.log('verify-chase: OK — heat warms and cools true, the roll ramps and never fires cold, berth astern, bargain honest');
