// verify-gundrill: gunnery climbs with diminishing returns to a cap, the
// reload cut is proportional and bounded, and the constants hold shape.
import { drillGain, drillReload, GUNNERY_MAX, DRILL_S, DRILL_COOL, RELOAD_CUT } from '../src/gundrill.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// diminishing returns to the cap
{
  const first = drillGain(0);
  ok(first > 0.08 && first < 0.15, `the first drill teaches most (${first.toFixed(3)})`);
  let g = 0;
  const gains = [];
  for (let i = 0; i < 12; i++) { const n = drillGain(g); gains.push(n - g); g = n; }
  ok(gains[0] > gains[3] && gains[3] > gains[8], 'each drill teaches less than the last');
  ok(g <= GUNNERY_MAX && g > GUNNERY_MAX * 0.9, `a dozen drills near the cap (${g.toFixed(2)})`);
  ok(drillGain(GUNNERY_MAX) === GUNNERY_MAX, 'the cap is the cap');
}

// the reload cut
{
  ok(drillReload(10, 0) === 10, 'a green crew loads at the rated pace');
  ok(Math.abs(drillReload(10, GUNNERY_MAX) - 10 * (1 - RELOAD_CUT)) < 1e-9,
    'a drilled crew takes the full cut');
  ok(drillReload(10, GUNNERY_MAX / 2) < 10 && drillReload(10, GUNNERY_MAX / 2) > 10 * (1 - RELOAD_CUT),
    'half drilled, half the cut');
  ok(drillReload(10, 99) === drillReload(10, GUNNERY_MAX), 'no gunnery beyond the cap');
  ok(drillReload(10, -1) === 10, 'no negative gunnery');
}

ok(DRILL_S > 5 && DRILL_S < 60, 'a drill is a scene, not a click');
ok(DRILL_COOL > DRILL_S, 'the hands get their breath between drills');

if (failed) { console.error(`verify-gundrill: ${failed} FAILED`); process.exit(1); }
console.log('verify-gundrill: OK — diminishing to the cap, proportional cut, bounded, human-paced');
