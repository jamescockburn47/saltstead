// verify-carpenter: wear accrues only in weather, seams open on the clock
// and cap, they sit inside the hold at arm-findable spots deterministically,
// and the weeping floors — a neglected ship lists but never founders.
import {
  accrueWear, seamDue, seamSpots, seamDecay,
  SEAM_MAX, WEAR_PER_SEAM, SEAM_RATE, SEAM_FLOOR, FIX_REACH,
} from '../src/carpenter.js';
import { holdFor } from '../src/shipframe.js';
import { HULLS } from '../src/shipyard.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// wear: only the weather works her
ok(accrueWear(0, true, 5) === 5 && accrueWear(5, false, 5) === 5,
  'wear accrues in weather and rests in fair');

// the clock and the cap
ok(!seamDue(WEAR_PER_SEAM - 1, 0), 'a sound ship needs real weather first');
ok(seamDue(WEAR_PER_SEAM, 0) && seamDue(WEAR_PER_SEAM, SEAM_MAX - 1), 'enough weather lets a seam go');
ok(!seamDue(9999, SEAM_MAX), 'a weeping ship is not a sieve — the cap holds');

// the spots: inside every holding hull's hold, reachable, deterministic
{
  const holds = HULLS.filter((h) => h.below);
  ok(holds.length >= 3, `the carpenter works the bigger hulls (${holds.length})`);
  for (const h of holds) {
    const H = holdFor(h.spec);
    const spots = seamSpots(h.spec, 7, SEAM_MAX);
    ok(spots.length === SEAM_MAX, `${h.id}: the asked-for seams`);
    for (const s of spots) {
      ok(Math.abs(s.x) <= H.maxX && s.z >= H.minZ && s.z <= H.maxZ,
        `${h.id}: a seam sits inside her own hold`);
    }
    ok(JSON.stringify(seamSpots(h.spec, 7, 2)) === JSON.stringify(seamSpots(h.spec, 7, 2)),
      `${h.id}: same weather, same seams`);
    ok(JSON.stringify(seamSpots(h.spec, 7, 2)) !== JSON.stringify(seamSpots(h.spec, 8, 2)),
      `${h.id}: a new voyage springs new seams`);
  }
}

// the weeping: slow, proportional, floored
{
  let hull = 1;
  for (let i = 0; i < 60 * 10; i++) hull = seamDecay(hull, 1, 1 / 10);
  ok(hull < 1 && hull > 0.95, `one seam weeps slowly (${hull.toFixed(3)} after a minute)`);
  ok(seamDecay(0.8, 2, 1) < seamDecay(0.8, 1, 1), 'two seams weep faster than one');
  let neglected = 1;
  for (let i = 0; i < 3600 * 10; i++) neglected = seamDecay(neglected, SEAM_MAX, 1 / 10);
  ok(neglected === SEAM_FLOOR, `an hour of neglect lists her to the floor, no further (${neglected})`);
  ok(seamDecay(1, 0, 60) === 1, 'no open seams, no weeping');
  ok(SEAM_FLOOR > 0.3, 'the floor is a list, not a sinking');
  ok(FIX_REACH > 0.5, 'the oakum is driven at arm’s reach');
}

if (failed) { console.error(`verify-carpenter: ${failed} FAILED`); process.exit(1); }
console.log('verify-carpenter: OK — weather-gated wear, capped seams inside the hold, floored weeping, deterministic');
