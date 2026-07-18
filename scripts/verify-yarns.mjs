// verify-yarns: morale stays bounded and drifts home, its teeth are mild and
// monotonic, yarns name real legends with their true bearings (colour when
// the sea is out of secrets), and both dispute calls are valid captaincy.
import {
  newMorale, moveMorale, driftMorale, moraleReload, moraleBoard,
  yarnFor, disputeFor, resolveDispute, festerDispute,
  MORALE_HOME, RATION_COST, FESTER_S,
} from '../src/yarns.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// morale: bounded, drifts home from both sides
ok(newMorale() > 0.5 && newMorale() <= 1, 'a fresh crew is in fair temper');
ok(moveMorale(0.95, 0.2) === 1 && moveMorale(0.05, -0.2) === 0, 'the temper is bounded');
{
  let hi = 1, lo = 0;
  for (let i = 0; i < 60 * 30; i++) { hi = driftMorale(hi, 1 / 30); lo = driftMorale(lo, 1 / 30); }
  ok(hi > MORALE_HOME + 0.03 && lo < MORALE_HOME - 0.03,
    `an event's mark outlasts a single minute (${hi.toFixed(2)}, ${lo.toFixed(2)})`);
  for (let i = 0; i < 9 * 60 * 30; i++) { hi = driftMorale(hi, 1 / 30); lo = driftMorale(lo, 1 / 30); }
  ok(Math.abs(hi - MORALE_HOME) < 0.06 && Math.abs(lo - MORALE_HOME) < 0.06,
    `but ten minutes' sailing eases any temper home (${hi.toFixed(2)}, ${lo.toFixed(2)})`);
}

// the teeth: mild, monotonic, right way round
ok(moraleReload(1) < moraleReload(0), 'a happy crew loads quicker');
ok(moraleReload(1) > 0.8 && moraleReload(0) < 1.2, 'but never decisively');
ok(moraleBoard(1) > moraleBoard(0), 'a happy crew boards heavier');
ok(Math.abs(moraleReload(MORALE_HOME) - 1) < 0.05, 'the settled temper is the rated ship');

// yarns: deterministic, name a legend and its bearing, colour as fallback
{
  const legends = [{ name: 'the Kraken’s deep', dir: 'nor’east' },
    { name: 'the Corryvreckan', dir: 'north' }];
  const a = yarnFor(7, legends), b = yarnFor(7, legends);
  ok(a.text === b.text, 'the same bell spins the same yarn');
  ok(a.legend && a.text.includes(a.legend.name) && a.text.includes(a.legend.dir),
    'a yarn names the legend and its true bearing');
  const c = yarnFor(8, []);
  ok(c.legend === null && c.text.length > 30, 'out of secrets, the fo’c’sle still talks');
  let varied = false;
  for (let s = 1; s < 12; s++) if (yarnFor(s, legends).text !== a.text) varied = true;
  ok(varied, 'different bells, different yarns');
}

// disputes: named hands, a topic, and both calls valid
{
  const d = disputeFor(3, 'Silas', 'Ezra');
  ok(d.text.includes('Silas') && d.text.includes('Ezra') && d.text.includes(d.topic),
    'the quarrel names its hands and its cause');
  ok(d.text.includes('1') && d.text.includes('2'), 'and offers the captain both calls');
  const rope = resolveDispute(1, 100);
  const ration = resolveDispute(2, 100);
  ok(rope.dMorale < 0 && rope.dGold === 0, 'the rope’s end costs temper, not coin');
  ok(ration.dMorale > 0 && ration.dGold === -RATION_COST, 'the ration costs coin, buys temper');
  const broke = resolveDispute(2, RATION_COST - 1);
  ok(broke.dGold === 0 && broke.dMorale < 0, 'an empty chest cannot buy the generous call');
  const f = festerDispute();
  ok(f.dMorale < rope.dMorale, 'ignoring the quarrel is the only wrong answer');
  ok(FESTER_S > 20, 'the captain gets a fair moment to call it');
}

if (failed) { console.error(`verify-yarns: ${failed} FAILED`); process.exit(1); }
console.log('verify-yarns: OK — morale bounded and homing, teeth mild, yarns true, both calls valid, festering worst');
