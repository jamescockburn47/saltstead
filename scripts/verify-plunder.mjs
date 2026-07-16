// verify-plunder: boarding is earned (alongside + matched speed), loot rolls
// are deterministic and inside their design bounds, maps drop at the design
// rate, and the chest outpays the prize that led to it.
import { canBoard, lootRoll, chestRoll, BOARD_DIST, BOARD_SPEED, MAP_CHANCE } from '../src/plunder.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// boarding window
ok(canBoard(10, 1), 'alongside + matched speed boards');
ok(canBoard(BOARD_DIST, BOARD_SPEED), 'the window edges are inclusive');
ok(!canBoard(BOARD_DIST + 1, 0), 'too far off, no grapple');
ok(!canBoard(5, BOARD_SPEED + 1), 'whizzing past, no grapple');
ok(canBoard(5, -2), 'closing speed counts by magnitude');

// loot rolls: deterministic, bounded, alive
{
  let mn = Infinity, mx = -Infinity, maps = 0;
  const N = 2000;
  for (let s = 1; s <= N; s++) {
    const a = lootRoll(s), b = lootRoll(s);
    if (s < 50) ok(a.gold === b.gold && a.map === b.map, `roll ${s} deterministic`);
    mn = Math.min(mn, a.gold); mx = Math.max(mx, a.gold);
    if (a.map) maps++;
  }
  ok(mn >= 40 && mx <= 220, `purses inside 40..220 (saw ${mn}..${mx})`);
  ok(mx - mn > 100, 'purses actually vary');
  const rate = maps / N;
  ok(Math.abs(rate - MAP_CHANCE) < 0.05, `map drop ~${MAP_CHANCE} (saw ${rate.toFixed(2)})`);
}

// the chest always beats the richest single prize
{
  let cmn = Infinity;
  for (let s = 1; s <= 500; s++) cmn = Math.min(cmn, chestRoll(s));
  ok(cmn >= 300, `poorest chest (${cmn}) still beats the richest purse (220)`);
  ok(chestRoll(7) === chestRoll(7), 'chests deterministic');
}

if (failed) { console.error(`verify-plunder: ${failed} FAILED`); process.exit(1); }
console.log('verify-plunder: OK — boarding window sane, rolls deterministic/bounded, chest > prize');
