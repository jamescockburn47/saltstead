// Yarns, quarrels and the temper of the crew — pure, no THREE, no DOM.
// verify-yarns.mjs guards it.
//
// The social half of the passage layer (docs/PASSAGE.md). MORALE is the
// ship's temper: 0..1, moved by events, drifting home to an unremarkable
// 0.65 — a happy ship loads her guns a shade quicker and boards a shade
// heavier, a sour one drags. Never decisive, always felt. YARNS are intel
// as loot: a hand names a real unwon legend and its true bearing, in the
// fo'c'sle's own voice. DISPUTES are the captain's mast in miniature: two
// named hands quarrel, the captain calls it — the rope's end (order, at a
// cost in temper) or an extra ration (temper, at a cost in coin). Both are
// valid captaincy; ignoring it is the only wrong answer.

import { unit2 } from './noise.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ---- morale ----
export const MORALE_HOME = 0.65;  // where the temper settles, left alone
export const RATION_COST = 10;    // the price of the generous call
export const FESTER_S = 45;       // seconds before an ignored quarrel sours

export function newMorale() { return 0.7; }
export function moveMorale(m, d) { return clamp01(m + d); }
// eases home slowly — an event's mark lasts minutes, not seconds
export function driftMorale(m, dt) {
  return m + (MORALE_HOME - m) * Math.min(1, dt * 0.004);
}

// the temper's teeth — mild by design, felt over a fight, never a coin flip
export function moraleReload(m) { return 1.12 - 0.24 * clamp01(m); }   // ×reload time
export function moraleBoard(m) { return 0.85 + 0.3 * clamp01(m); }    // ×boarding weight

// ---- yarns ----
// legends: [{ name, dir }] — real unwon legends with true compass bearings,
// assembled by the caller from the legends table. Empty list: fo'c'sle colour.
const YARN_LEGEND = [
  (l) => `swears there's truth in ${l.name} — away to the ${l.dir}, if the charts are honest`,
  (l) => `had it off a whaler: ${l.name}, somewhere to the ${l.dir}. The kind of water a log page remembers`,
  (l) => `spins the old yarn of ${l.name} again — ${l.dir} of here, and half of it may even be true`,
];
const YARN_COLOUR = [
  'talks of home till the watch changes — every hand aboard is owed a landfall',
  'reads tomorrow’s weather in tonight’s sky, and is wrong exactly half the time',
  'hums the same eight bars of a shanty nobody else remembers',
  'swears the cook’s duff was better before the last port, and gets no argument',
];

// -> { text, legend } — text follows the teller's name ("Silas <text>");
// legend is the named legend's entry, or null for colour
export function yarnFor(seed, legends = []) {
  if (legends.length) {
    const l = legends[Math.floor(unit2(seed * 3.1, 17.3) * legends.length)];
    const t = YARN_LEGEND[Math.floor(unit2(seed * 7.7, 5.1) * YARN_LEGEND.length)];
    return { text: t(l), legend: l };
  }
  return {
    text: YARN_COLOUR[Math.floor(unit2(seed * 3.1, 29.9) * YARN_COLOUR.length)],
    legend: null,
  };
}

// ---- disputes ----
const QUARRELS = [
  'the last of the plum duff',
  'whose trick at the wheel it was',
  'a wager on the day’s run',
  'the driest hammock berth',
  'whose knife that is',
];

export function disputeFor(seed, nameA, nameB) {
  const topic = QUARRELS[Math.floor(unit2(seed * 5.3, 11.7) * QUARRELS.length)];
  return {
    topic,
    text: `${nameA} and ${nameB} are at each other’s throats over ${topic} `
      + `— the deck waits on the captain’s word (1 — the rope’s end · `
      + `2 — an extra ration, ${RATION_COST} doubloons)`,
  };
}

// choice: 1 (discipline) | 2 (generosity). gold: what the chest can bear.
// -> { dMorale, dGold, text }
export function resolveDispute(choice, gold = 0) {
  if (choice === 2 && gold >= RATION_COST) {
    return {
      dMorale: 0.06, dGold: -RATION_COST,
      text: 'An extra ration all round — the quarrel drowns in it, and the watch sings',
    };
  }
  if (choice === 2) {
    return {
      dMorale: -0.04, dGold: 0,
      text: 'The chest is bare of generosity — the rope’s end settles it instead',
    };
  }
  return {
    dMorale: -0.04, dGold: 0,
    text: 'The rope’s end settles it — order holds, and tempers smart',
  };
}

export function festerDispute() {
  return { dMorale: -0.06, text: 'Left to fester, the quarrel sours the whole watch' };
}
