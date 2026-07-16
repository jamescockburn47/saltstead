// Plunder rules — pure, no THREE, no DOM. verify-plunder.mjs guards it.
// The design (docs/DESIGN.md, "The plunder economy"): boarding is the payday,
// and every roll is a deterministic function of its seed (invariant 6 — the
// same prize pays the same purse on every client).

import { unit2 as u01 } from './noise.js';

// boarding: alongside and matched speed — the sailing WAS the fight (v1:
// merchants strike their colours; the crew autobattle arrives with cannons)
export const BOARD_DIST = 25;     // metres, hull to hull
export const BOARD_SPEED = 3;     // m/s of closing speed you can grapple across

export function canBoard(dist, relSpeed) {
  return dist <= BOARD_DIST && Math.abs(relSpeed) <= BOARD_SPEED;
}

// a merchant's purse: 40–220 doubloons, and roughly a third carry a treasure
// map in the master's cabin — the map is the hook that points you at the world
export const MAP_CHANCE = 0.35;
export function lootRoll(seed) {
  return {
    gold: Math.round(40 + u01(seed, 17.3) * 180),
    map: u01(seed, 91.7) < MAP_CHANCE,
  };
}

// the buried chest: worth several prizes, because the voyage cost more
export function chestRoll(seed) {
  return Math.round(300 + u01(seed, 53.1) * 600);
}
