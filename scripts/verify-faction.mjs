// verify-faction: the two flags hold their design shape — the pirate's edge
// is INDIVIDUAL (speed, plunder), the navy's is INSTITUTIONAL (the signal),
// the attitude matrix reads right from both decks, and the boarding law is
// the boarding law.
import {
  FACTIONS, factionOf, attitude, canBoardType, signalAnswer, escortBerth,
  homeAnchorage,
} from '../src/faction.js';
import { isLand, coastDistGame } from '../src/earth.js';
import { inZone } from '../src/legendfx.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// the sides differ in KIND, not degree
ok(FACTIONS.pirate.speedMult > 1, 'the black flag outsails her class');
ok(FACTIONS.pirate.plunderMult > 1, 'and strips a prize richer');
ok(FACTIONS.navy.speedMult === 1 && FACTIONS.navy.plunderMult === 1,
  'the navy sails her rated speed and answers to the prize court');
ok(FACTIONS.navy.signalRange > 0 && FACTIONS.navy.signalMax >= 1,
  'but the navy is never alone — the signal is real');
ok(FACTIONS.pirate.signalRange === undefined, 'nobody comes when the pirate whistles');
ok(FACTIONS.pirate.hostileType === 'navy' && FACTIONS.navy.hostileType === 'raider',
  'each side has its hunter');
ok(FACTIONS.pirate.flag !== FACTIONS.navy.flag, 'two flags, two cloths');
ok(factionOf('nonsense').id === 'pirate', 'an unknown flag defaults to the black');

// the attitude matrix, read from the pirate's deck
ok(attitude('navy', 'pirate') === 'hunt', 'the corvette hunts the black flag');
ok(attitude('trader', 'pirate') === 'flee', 'the trader runs from it');
ok(attitude('indiaman', 'pirate') === 'flee', 'so does the indiaman');
ok(attitude('raider', 'pirate') === 'neutral', 'a rival black flag keeps her own counsel');
ok(attitude('derelict', 'pirate') === 'neutral', 'the dead do not care');

// and from the quarterdeck of a King's ship
ok(attitude('raider', 'navy') === 'hunt', 'the raider fights the King');
ok(attitude('trader', 'navy') === 'neutral', 'the trade sails easy under your protection');
ok(attitude('indiaman', 'navy') === 'neutral', 'the indiaman too');
ok(attitude('navy', 'navy') === 'neutral', 'the squadron does not fire on itself');

// the boarding law
ok(canBoardType('trader', 'pirate') && canBoardType('navy', 'pirate') && canBoardType('indiaman', 'pirate'),
  'a pirate boards anything she can lay alongside');
ok(!canBoardType('trader', 'navy') && !canBoardType('indiaman', 'navy'),
  'the navy never plunders the trade it protects');
ok(canBoardType('raider', 'navy') && canBoardType('derelict', 'navy'),
  'but takes pirates as prizes and dead ships as salvage');

// the signal: nearest answer first, capped at max, the Admiralty fills gaps
{
  const sails = [
    { id: 'a', type: 'navy', x: 1000, z: 0 },
    { id: 'b', type: 'navy', x: 3000, z: 0 },
    { id: 'c', type: 'navy', x: 9000, z: 0 },  // out of range
    { id: 't', type: 'trader', x: 100, z: 0 }, // wrong cloth
  ];
  const full = signalAnswer(sails, 0, 0, 4500, 2);
  ok(full.converge.length === 2 && full.converge[0] === 'a' && full.converge[1] === 'b',
    `nearest two answer (${full.converge.join(',')})`);
  ok(!full.spawn, 'the squadron sufficed — nobody new is sent');
  const thin = signalAnswer(sails, 20000, 0, 4500, 2);
  ok(thin.converge.length === 0 && thin.spawn, 'an empty sea brings the Admiralty');
  const one = signalAnswer([sails[0]], 0, 0, 4500, 2);
  ok(one.converge.length === 1 && one.spawn, 'a lone answer still calls for one more');
}

// each side weighs anchor in its own home waters — the black flag in the
// Caribbean, the King's ships in England — and both anchorages are honest
// water with sea room, not a spawn inside a hill
{
  const p = homeAnchorage('pirate'), n = homeAnchorage('navy');
  ok(p.name === 'Port Royal' && p.lat > 15 && p.lat < 20 && p.lon < -70,
    'the black flag weighs off Port Royal, Caribbean');
  ok(n.name === 'Spithead' && n.lat > 50 && n.lat < 51.5 && n.lon > -2 && n.lon < 0,
    "the King's commission begins at Spithead, England");
  // coastDistGame is GAME metres (the gait-compressed ocean): Port Royal's
  // own anchorage reads ~13 — the assertion is honest water clear of the
  // hard, not blue-water sea room
  for (const [side, h] of [['pirate', p], ['navy', n]]) {
    ok(!isLand(h.lat, h.lon), `${side}: the anchorage is water`);
    const cd = coastDistGame(h.lat, h.lon);
    ok(cd > 5, `${side}: clear of the hard (${Math.round(cd)} game-m)`);
  }
  // the regression that moved the navy from Bristol: no fresh captain
  // spawns inside a legend zone — the first dragon should be SOUGHT
  for (const [side, h] of [['pirate', p], ['navy', n]]) {
    for (const z of ['dragons-wales', 'bermuda-triangle', 'kraken-deeps', 'corryvreckan']) {
      ok(!inZone(h.lat, h.lon, z), `${side}: home water is outside ${z}`);
    }
  }
  ok(homeAnchorage('anything-else').name === 'Port Royal',
    'an unknown flag launches with the black');
}

// the escort arrives from over the horizon, not out of thin air
{
  const b1 = escortBerth(500, 500, 1), b2 = escortBerth(500, 500, 2);
  const d1 = Math.hypot(b1.x - 500, b1.z - 500);
  ok(d1 > 1500, `she comes from a distance (${Math.round(d1)} m)`);
  ok(Math.hypot(b1.x - b2.x, b1.z - b2.z) > 100, 'repeat signals answer from new bearings');
}

if (failed) { console.error(`verify-faction: ${failed} FAILED`); process.exit(1); }
console.log('verify-faction: OK — pirate edge individual, navy edge institutional, attitudes and boarding law sound');
