// The shipwright's ladder — pure, no THREE, no DOM. verify-shipyard.mjs
// guards it. Each rung is a hull the yard will build you: the physics spec
// (shipphysics.js), the fighting numbers, the berths, and the CAPTAIN'S
// BRIEFING — the survival doctrine the game shows when you first take her
// out (docs/DESIGN.md era ladder: the sloop is a predator of TRADERS, not
// of warships; the ladder is how broadsides stop being something you run
// from and start being something you deal).

import { SLOOP, BRIG } from './shipphysics.js';

export const HULLS = [
  {
    id: 'sloop',
    name: 'Sloop',
    spec: SLOOP,
    price: 0,          // the hull you start with
    guns: 1,           // balls per broadside
    masts: 1,
    berths: 12,
    pitch: 'Single-masted, weatherly, draws nowt. The smallest thing afloat '
      + 'and the hardest to catch.',
    briefing: [
      'You command a SLOOP \u2014 the smallest fighting hull on the sea. Nothing '
        + 'armed can catch her when she\u2019s well sailed: keep the trim bar GREEN, '
        + 'put the wind on your beam, and you will walk away from any corvette '
        + 'afloat. Speed is your armour. Use it.',
      'Make your money where the guns aren\u2019t: run down unarmed MERCHANTMEN '
        + '(pull alongside, E to board \u2014 they strike without a fight), dig up '
        + 'TREASURE MAPS, salvage the dead ships of the Bermuda Triangle. The '
        + 'fat Indiamen pay treble. That is a sloop\u2019s living.',
      'The blue-hulled NAVY CORVETTES hunt pirates, and one broadside of theirs '
        + 'outweighs three of yours \u2014 do not trade iron with them. If one turns '
        + 'toward you: RUN. Your single gun is for slowing a fleeing prize '
        + '(chain shot at her rig), not for duelling warships.',
      'Your bolt-hole is the SHALLOWS. The sloop draws almost nothing \u2014 run '
        + 'her over the shoals, right up the beach if you must; deep hulls '
        + 'cannot follow and will break off the chase.',
      'There is no death in Saltstead, only expense: holed through, the crew '
        + 'heaves a third of your gold overboard to keep her afloat. Any port '
        + 'on the chart repairs, hires hands, and \u2014 when your chest is heavy '
        + 'enough \u2014 builds you a BIGGER SHIP.',
    ],
  },
  {
    id: 'brig',
    name: 'Brig',
    spec: BRIG,
    price: 3000,
    guns: 2,
    masts: 2,
    berths: 20,
    pitch: 'Two masts, two guns a side, twenty berths. Fast on a reach, slow '
      + 'in the turn, and she draws too much to beach.',
    briefing: [
      'You command a BRIG now \u2014 twice the broadside, twenty berths, and more '
        + 'speed in a straight line than anything on the lanes. The hunted '
        + 'days are over: with a full crew at the guns, a navy corvette is '
        + 'PREY, not predator.',
      'Mind what you traded away. She turns like a barn door \u2014 line your '
        + 'broadsides up early \u2014 and she DRAWS TOO MUCH TO BEACH: the shallows '
        + 'that once hid you will put her on the shoal, and the longboat does '
        + 'your shore work at anchor.',
      'Fill the berths. Every hand quickens the reload and weighs in the '
        + 'boarding fight \u2014 twenty hands take an armed deck that six would '
        + 'die on. Prize crews come out of the same pool, so a full brig runs '
        + 'a full fleet.',
      'The same doctrine still holds: fight what you can beat, fence prizes '
        + 'at the pirate havens for full price, repair at any dockyard on the '
        + 'chart, and keep one eye on the weather gauge.',
    ],
  },
];

export function hullById(id) {
  return HULLS.find((h) => h.id === id) || HULLS[0];
}

// the next rung up, or null from the top of the ladder
export function nextHull(id) {
  const i = HULLS.findIndex((h) => h.id === id);
  return i >= 0 && i + 1 < HULLS.length ? HULLS[i + 1] : null;
}

export function canBuyHull(gold, currentId) {
  const next = nextHull(currentId);
  return !!next && gold >= next.price;
}

// the yard's ledger: pure numbers, the Game mutates state
export function buyHull(gold, currentId) {
  const next = nextHull(currentId);
  if (!next || gold < next.price) return null;
  return { hull: next.id, gold: gold - next.price, paid: next.price };
}
