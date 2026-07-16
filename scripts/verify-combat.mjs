// verify-combat: broadsides bear off the beam only, gunnery falls off with
// range, damage states are bounded and legible (chain slows, round sinks),
// the autobattle is deterministic and respects weight of numbers, and the
// repair/founder ledger stays sane.
import {
  GUN_RANGE, BROADSIDE_ARC, RELOAD_BASE, SHOT_KINDS,
  reloadTime, beamBearing, inArc, hitChance, rollHit,
  newHullState, applyShot, speedFactor, isSinking, salvageValue,
  boardingOdds, autoBattle, founderCost, repairCost, wreckSpoils,
  CRIPPLED_HULL, WRECK_KEEP,
} from '../src/combat.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// reload: the crew shortens the dance, never to nothing
ok(reloadTime(0) === RELOAD_BASE, 'the captain alone reloads at base rate');
ok(reloadTime(12) < RELOAD_BASE * 0.55, 'a full crew better than halves the reload');
ok(reloadTime(12) > 2, 'but guns never fire like muskets');

// broadside geometry: beam targets bear, bow/stern targets never do
{
  // ship heading north (yaw 0, bow +z): starboard is +x
  const star = beamBearing(0, 100, 0);
  ok(star.side === 1 && star.off < 1e-9, 'dead abeam to starboard bears true');
  const port = beamBearing(0, -100, 0);
  ok(port.side === -1 && port.off < 1e-9, 'dead abeam to port bears true');
  const bow = beamBearing(0, 0, 100);
  ok(!inArc(bow.off), 'a target dead ahead cannot be raked — turn the ship');
  const stern = beamBearing(0, 0, -100);
  ok(!inArc(stern.off), 'nor dead astern');
  const quarter = beamBearing(0, 100, 40);
  ok(inArc(quarter.off), 'a point off the beam is still in the arc');
  // the geometry turns with the ship
  const turned = beamBearing(Math.PI / 2, 0, -100);
  ok(turned.side === 1 && turned.off < 1e-6, 'heading east, a southern target is the starboard beam');
  ok(BROADSIDE_ARC < Math.PI / 4, 'the arc stays a broadside, not a turret');
}

// gunnery: point-blank tells, the range limit is a prayer, beyond is the sea's
ok(hitChance(10) > 0.9, 'point-blank nearly always tells');
ok(hitChance(GUN_RANGE) < 0.3, 'at the limit it is a prayer');
ok(hitChance(GUN_RANGE + 1) === 0, 'beyond the range the sea takes the ball');
ok(hitChance(120) > hitChance(200), 'closer is better');
{
  let a = 0, b = 0;
  for (let s = 1; s <= 400; s++) {
    if (rollHit(s, 40) !== rollHit(s, 40)) failed++;
    if (rollHit(s, 40)) a++;
    if (rollHit(s, 250)) b++;
  }
  ok(a > b, `hits track the chance curve (${a} close vs ${b} far of 400)`);
  ok(a > 300, 'close shots mostly land');
}

// damage states: bounded, legible, and the two shot kinds do their jobs
{
  const st = newHullState();
  ok(st.rig === 1 && st.hull === 1, 'a whole ship is whole');
  ok(speedFactor(st) === 1, 'and sails at full speed');
  applyShot(st, 'chain');
  ok(st.rig < 1 && st.rig > 0.5, 'chain tears the rig');
  ok(st.hull > 0.9, 'but barely touches the hull');
  const slowed = speedFactor(st);
  ok(slowed < 1 && slowed > 0.5, `torn sails slow her (${slowed.toFixed(2)})`);
  for (let i = 0; i < 10; i++) applyShot(st, 'chain');
  ok(st.rig === 0, 'the rig bottoms at zero');
  ok(speedFactor(st) > 0.1 && speedFactor(st) < 0.2, 'dismasted she still drifts');
  ok(!isSinking(st), 'chain alone never sinks her');
  const st2 = newHullState();
  for (let i = 0; i < 4; i++) applyShot(st2, 'round');
  ok(isSinking(st2), 'four round shot hole her through');
  ok(SHOT_KINDS.length === 2, 'two shot kinds, one tactical choice');
}

// salvage: most of a sunk cargo goes to the bottom
ok(salvageValue(200) < 120 && salvageValue(200) > 50, 'a fraction floats');

// the autobattle: deterministic, weight of numbers, losses bounded
{
  ok(boardingOdds(10, 2) > 0.75, 'ten hands against two is near a sure thing');
  ok(boardingOdds(0, 8) < 0.25, 'a lone captain against a navy crew is folly');
  ok(boardingOdds(5, 5) > 0.3 && boardingOdds(5, 5) < 0.7, 'even crews is a coin worth weighing');
  let wonStrong = 0, wonWeak = 0;
  for (let s = 1; s <= 300; s++) {
    const a = autoBattle(s, 10, 2), b = autoBattle(s, 10, 2);
    ok(a.won === b.won && a.losses === b.losses, s < 5 ? `battle ${s} deterministic` : 'battle deterministic');
    if (a.won) wonStrong++;
    if (autoBattle(s, 1, 8).won) wonWeak++;
    ok(a.losses <= 10 && a.losses >= 0, 'losses stay bounded');
    ok(autoBattle(s, 0, 8).losses === 0, 'a crewless boarding risks only the captain\u2019s pride');
  }
  ok(wonStrong > 240, `the strong mostly win (${wonStrong}/300)`);
  ok(wonWeak < 90, `the weak mostly lose (${wonWeak}/300)`);
}

// the ledger: foundering hurts, repairs bill by what's missing
ok(founderCost(900) === 300, 'a third of the chest goes to the fishes');

// the wreck's ledger: the longboat carries a tithe, the sea takes the rest,
// and the two stages are ordered — foundering costs less than wrecking
{
  const w = wreckSpoils(1000);
  ok(w.kept === 100 && w.lost === 900, 'the longboat lands with a tithe of the chest');
  ok(w.kept + w.lost === 1000, 'the ledger balances — no gold minted in the surf');
  ok(wreckSpoils(0).kept === 0, 'a poor pirate wrecks for free');
  ok(1000 - founderCost(1000) > wreckSpoils(1000).kept,
    'foundering (the warning) always costs less than the wreck it warns of');
  ok(CRIPPLED_HULL > 0 && CRIPPLED_HULL < 0.5, 'the emergency patch holds, barely');
  ok(WRECK_KEEP > 0, 'the sea never takes quite everything');
}
{
  const st = newHullState();
  ok(repairCost(st) === 0, 'a whole ship owes the yard nothing');
  applyShot(st, 'round'); applyShot(st, 'chain');
  const c = repairCost(st);
  ok(c > 0 && c < 300, `a mauled ship pays her way (${c})`);
}

if (failed) { console.error(`verify-combat: ${failed} FAILED`); process.exit(1); }
console.log('verify-combat: OK — broadsides bear off the beam, damage states legible, autobattle deterministic');
