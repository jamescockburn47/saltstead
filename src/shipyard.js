// The shipwright's ladder — pure, no THREE, no DOM. verify-shipyard.mjs
// guards it. Each rung is a hull the yard will build you: the physics spec
// (shipphysics.js), the fighting numbers, the berths, and the CAPTAIN'S
// BRIEFING — the survival doctrine the game shows when you first take her
// out (docs/DESIGN.md era ladder: the sloop is a predator of TRADERS, not
// of warships; the ladder is how broadsides stop being something you run
// from and start being something you deal).

import {
  SLOOP, CUTTER, SCHOONER, BRIG, CORVETTE, FRIGATE, GALLEON,
} from './shipphysics.js';

// Visual hints ship.js reads alongside the physics: masts (fore-and-aft
// rigs), square (square courses on the masts — the big-ship silhouette),
// castle (a raised sterncastle — the galleon's crown). guns is BOTH the
// broadside weight (combat) and the row of visible cannon on each side.
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
      'Nobody dies in Saltstead, but the sea keeps accounts. Holed through '
        + 'once, the crew heaves a THIRD of your gold overboard and she limps '
        + 'on, CRIPPLED. Holed through again before a yard mends her, she '
        + 'SINKS: the longboat lands the crew, your map, and a tenth of the '
        + 'chest at the nearest port \u2014 the rest, and the ship, are the '
        + 'sea\u2019s. Repair early. Bank at the Locker what you can\u2019t bear '
        + 'to lose.',
    ],
  },
  {
    id: 'cutter',
    name: 'Cutter',
    spec: CUTTER,
    price: 900,
    guns: 1,
    masts: 1,
    berths: 14,
    pitch: 'A revenue-dodger\u2019s hull: one tall mast, a cloud of canvas, and '
      + 'legs the sloop can only dream of. Still beaches.',
    briefing: [
      'You command a CUTTER \u2014 the smuggler\u2019s darling. She is the sloop\u2019s '
        + 'doctrine with better legs: faster on every point of sail, near as '
        + 'quick in the turn, and she still runs up a BEACH when the chase '
        + 'gets warm. Nothing you could outrun before can touch you now.',
      'Your living is still the merchant lanes and the treasure trade \u2014 one '
        + 'gun a side slows a fleeing prize, it does not win artillery duels. '
        + 'The corvettes are still faster-armed than you are armoured: RUN, '
        + 'and laugh while you do it.',
      'Two extra berths matter more than they look: hands speed the reload, '
        + 'weigh the boarding fight, and crew the prizes you sail home in '
        + 'column. Fill them at any port.',
      'Repair the moment she\u2019s hurt \u2014 a crippled hull that takes one more '
        + 'holing SINKS, and the sea keeps most of what she takes. Bank at '
        + 'the Locker what you can\u2019t bear to lose.',
    ],
  },
  {
    id: 'schooner',
    name: 'Schooner',
    spec: SCHOONER,
    price: 1800,
    guns: 2,
    masts: 2,
    berths: 16,
    pitch: 'Two raked masts, fore-and-aft canvas, a privateer\u2019s hull. The '
      + 'last rung of the ladder that will still touch the sand.',
    briefing: [
      'You command a SCHOONER \u2014 the privateer\u2019s choice. Two masts of '
        + 'fore-and-aft canvas point higher than anything square-rigged, two '
        + 'guns a side finally make a BROADSIDE, and she is the last hull on '
        + 'the ladder that will still kiss a beach when you need it.',
      'You can now trade iron with a lone corvette if you must \u2014 chain her '
        + 'rig first, then rake her at your leisure \u2014 but it is still a '
        + 'choice, not a habit. Two guns bark; they do not yet roar.',
      'The Indiamen are your proper prey now: run them down, put one ball '
        + 'across the bow, board and be rich. Prize crews come out of your '
        + 'sixteen berths \u2014 keep them filled.',
      'Mind the draft creeping up on you: she beaches GRUDGINGLY, on the '
        + 'gentlest sand only. The wild shoal-running of the sloop years is '
        + 'nearly over \u2014 spend it while you have it.',
      'A wreck now costs real money. Repair early, bank often \u2014 the Locker '
        + 'keeps gold where the sea cannot count it.',
    ],
  },
  {
    id: 'brig',
    name: 'Brig',
    spec: BRIG,
    price: 3000,
    guns: 2,
    masts: 2,
    square: true,
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
      'And mind the stakes you now sail for. A crippled ship that takes one '
        + 'more holing SINKS \u2014 and a sunken brig drops you back down the '
        + 'ladder with a tenth of the chest. Three thousand doubloons is a '
        + 'lot of ship to leave on a reef. Repair the moment she\u2019s hurt; '
        + 'bank your fortune in the Locker before you pick the big fights.',
    ],
  },
  {
    id: 'corvette',
    name: 'Corvette',
    spec: CORVETTE,
    price: 5000,
    guns: 3,
    masts: 2,
    square: true,
    berths: 26,
    pitch: 'A warship\u2019s hull in a pirate\u2019s hands: three guns a side, '
      + 'navy speed, and the King\u2019s own hunters suddenly look catchable.',
    briefing: [
      'You command a CORVETTE \u2014 the same class the navy hunts you WITH, '
        + 'which means the hunt is now a fair fight you tend to win. Three '
        + 'guns a side, twenty-six berths, and the legs to run down anything '
        + 'that refuses one.',
      'Fight like the navy taught her: hold the weather gauge, chain the '
        + 'rig at range, close for round shot when she\u2019s slow. A lone '
        + 'corvette is your equal on paper \u2014 your crew and your trim are '
        + 'the difference in practice.',
      'The shallows are the OTHER side\u2019s bolt-hole now: a fleeing sloop '
        + 'over a shoal is gone, let her go. Your keel needs honest water '
        + 'and your shore work goes by longboat from the anchorage.',
      'Five thousand doubloons of warship deserves a full muster \u2014 hands '
        + 'quicken the reload, take boarded decks, and crew the prize column. '
        + 'An empty corvette is a rich man\u2019s coffin.',
      'Repair early, bank at the Locker, and remember the two-stage rule: '
        + 'crippled is the sea\u2019s first warning, and she only gives one.',
    ],
  },
  {
    id: 'frigate',
    name: 'Frigate',
    spec: FRIGATE,
    price: 8000,
    guns: 4,
    masts: 3,
    square: true,
    berths: 34,
    pitch: 'Three masts, four guns a side, thirty-four berths. The sea\u2019s '
      + 'answer to most questions, asked politely at four hundred yards.',
    briefing: [
      'You command a FRIGATE \u2014 the working nobility of the gun deck. Four '
        + 'guns a side end most conversations in one broadside; thirty-four '
        + 'berths crew the guns, the boarders and a whole column of prizes '
        + 'at once. Very little on the lanes argues with you now.',
      'Your dance floor is BLUE WATER. She wants sea room: the turn is '
        + 'stately, the draft is a fathom and a half, and every shoal on the '
        + 'chart is now an enemy. Plan your approaches like a navigator, not '
        + 'a smuggler.',
      'Squadrons are the new threat \u2014 what one corvette cannot do, three '
        + 'will attempt. Never let them cross your stern, and remember that '
        + 'chain shot aimed at YOUR rig is how they mean to hold you still.',
      'Eight thousand doubloons is a fortune under sail. The Locker exists '
        + 'for exactly this rung: bank the war chest, sail with working '
        + 'capital, and a wreck costs you a ship instead of a life\u2019s work.',
    ],
  },
  {
    id: 'galleon',
    name: 'Galleon',
    spec: GALLEON,
    price: 13000,
    guns: 6,
    masts: 3,
    square: true,
    castle: true,
    berths: 45,
    pitch: 'The crown of the ladder: a towering sterncastle, six guns a '
      + 'side, forty-five berths. Slower than the frigate \u2014 and it '
      + 'does not matter.',
    briefing: [
      'You command a GALLEON \u2014 the treasure fleet\u2019s own crown, flying '
        + 'black. Six guns a side is a rolling thunderstorm; forty-five '
        + 'berths make her a floating port. Nothing afloat outguns you. '
        + 'Nothing needs to know you traded the frigate\u2019s legs for it.',
      'She is SLOWER than the rung below \u2014 the only step down the ladder '
        + 'takes on purpose. You do not chase anymore: you make them come to '
        + 'you, and one broadside settles the argument. Chain what runs; '
        + 'round what stays.',
      'Handle her like the fortress she is: begin every turn early, give '
        + 'every headland a mile, and treat charted shoals as walls. Three '
        + 'fathoms of keel put the beach-running years two rungs behind you.',
      'The sterncastle is not vanity \u2014 it is the payroll: boarding FROM '
        + 'her height carries the odds, and forty-five hands take any deck '
        + 'on the sea. Keep the muster full at every port.',
      'Thirteen thousand doubloons ride under you now. Bank at the Locker '
        + 'like it is a religion \u2014 a wrecked galleon is the most expensive '
        + 'sound in Saltstead, and the sea only warns you once.',
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

// the rung below — what a wreck drops you to (combat.js wreck rule). From
// the bottom of the ladder it returns the bottom: a wrecked sloop captain
// gets a patched sloop staked by the harbour, never nothing.
export function prevHull(id) {
  const i = HULLS.findIndex((h) => h.id === id);
  return HULLS[Math.max(0, i - 1)];
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
