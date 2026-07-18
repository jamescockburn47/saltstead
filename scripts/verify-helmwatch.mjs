// verify-helmwatch: hazards hand the helm back HARD (and outrank contacts),
// contacts are SOFT, open water is 'none', and the decision is a pure function
// of the state.
import { decide, SIGHT_R, HUNT_R, PILOT_R } from '../src/helmwatch.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// clear open sea: the helmsman just sails
ok(decide({}).mode === 'none', 'empty sea hands nothing back');
ok(decide({ coastDist: 40000, contactDist: 9000 }).mode === 'none', 'a far sail is not yet a hail');

// each hazard hands back HARD
for (const [flag, label] of [['kraken', 'the Kraken'], ['whale', 'a whale'],
  ['whirlpool', 'a whirlpool'], ['stormAhead', 'a storm'], ['inTriangle', 'the Triangle'],
  ['aground', 'the sand'], ['overLand', 'a river'], ['landAhead', 'breakers ahead']]) {
  ok(decide({ [flag]: true }).mode === 'hard', `${label} is a hard handback`);
}
ok(decide({ landAhead: true, contactDist: 100 }).mode === 'hard', 'breakers ahead outrank a contact');

// harbour approach + shoal pilotage are hard; near a coast that is neither is not
ok(decide({ coastDist: 300, nearPort: true }).mode === 'hard', 'a harbour approach is hard');
ok(decide({ coastDist: 300, shoal: true }).mode === 'hard', 'shoal water is hard');
ok(decide({ coastDist: 300 }).mode !== 'hard', 'merely near a coast, with sea-room, is not a handback');
ok(decide({ coastDist: 2000, nearPort: true }).mode !== 'hard', 'a port still well off is not yet pilotage');

// contacts hand back SOFT
ok(decide({ contactDist: SIGHT_R - 1 }).mode === 'soft', 'a sail in sight is a soft hail');
ok(decide({ contactDist: SIGHT_R + 1 }).mode === 'none', 'beyond sight, nothing');
ok(decide({ hunterDist: HUNT_R - 1 }).mode === 'soft', 'a closing hunter is a soft hail');

// a HARD hazard outranks a SOFT contact happening at the same time
ok(decide({ kraken: true, contactDist: 100, hunterDist: 100 }).mode === 'hard',
  'the Kraken outranks a sail in sight');
ok(decide({ overLand: true, contactDist: 100 }).mode === 'hard', 'the river outranks a contact');

// every non-none decision carries a reason; deterministic
{
  const d = decide({ contactDist: 100 });
  ok(d.reason.length > 0, 'a handback names its reason');
  const a = decide({ stormAhead: true }), b = decide({ stormAhead: true });
  ok(a.mode === b.mode && a.reason === b.reason, 'the watch is deterministic');
}

if (failed) { console.error(`verify-helmwatch: ${failed} FAILED`); process.exit(1); }
console.log('verify-helmwatch: OK — hazards hard, contacts soft, open water clear, hazards outrank contacts, pure');
