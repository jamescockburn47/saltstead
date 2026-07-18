// verify-fishing: the grounds are the real grounds, the bite clock and the
// catch are deterministic and bounded, and the strike window is honest.
import { biteAfter, catchFor, FISH_SPEED, STRIKE_S } from '../src/fishing.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// the real grounds teach themselves
ok(catchFor(1, 47, -52).name.includes('cod'), 'the Grand Banks give cod');
ok(catchFor(1, 56, 3).name.includes('herring'), 'the North Sea gives herring');
ok(catchFor(1, 38, 15).name.includes('bluefin'), 'the Med gives bluefin');
ok(catchFor(1, -55, 100).name.includes('toothfish'), 'the Southern Ocean gives toothfish');
ok(catchFor(1, 10, -40).name.includes('dorado'), 'the tropics give dorado');
ok(catchFor(1, 35, -40).name.includes('mackerel'), 'plain blue water gives mackerel');

// named grounds outrank the bands they overlap
ok(catchFor(1, 44, -50).name.includes('cod'), 'the Banks outrank the mid-latitudes');

// bounded, deterministic
{
  for (let s = 1; s <= 40; s++) {
    const c = catchFor(s, 47, -52);
    ok(c.value >= 14 && c.value <= 24, `a cod is a cod's worth (${c.value})`);
    const b = biteAfter(s);
    ok(b >= 12 && b <= 40, `the bite comes in its own time (${b.toFixed(0)}s)`);
  }
  ok(catchFor(9, 10, 100).value === catchFor(9, 10, 100).value
    && biteAfter(9) === biteAfter(9), 'clock and catch deterministic');
  let varied = false;
  for (let s = 2; s <= 10; s++) if (catchFor(s, 47, -52).value !== catchFor(1, 47, -52).value) varied = true;
  ok(varied, 'different casts, different fish');
}

ok(FISH_SPEED > 1 && FISH_SPEED < 4, 'handlines want slow way, not a dead stop');
ok(STRIKE_S >= 3 && STRIKE_S <= 8, 'the strike window is human');

if (failed) { console.error(`verify-fishing: ${failed} FAILED`); process.exit(1); }
console.log('verify-fishing: OK — real grounds, bounded purses, deterministic clocks, honest windows');
