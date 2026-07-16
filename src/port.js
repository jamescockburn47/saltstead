// Ports — pure, no THREE, no DOM. verify-port.mjs guards it.
// The plunder economy's first SINK (docs/DESIGN.md "Ports that work"):
// sell your prizes, sign on hands. Gold -> crew -> prizes -> gold.

import { LEGENDS } from './legends.js';
import { PRIZE_CREW } from './fleet.js';
import { M_PER_DEG } from './earth.js';

export const PORT_RADIUS = 900;   // metres of anchorage around a haven
export const PORT_SPEED = 1.5;    // bare steerageway to put in
export const PRIZE_VALUE = 400;   // a hull is worth more than the richest purse
export const HAND_COST = 60;      // the tavern's signing bounty
export const CREW_MAX = 12;       // the sloop berths this many

const HAVENS = LEGENDS.filter((l) => l.kind === 'haven');

// nearest haven to a position: { haven, dist } in GAME metres — measured in
// the game's own equirectangular world frame, so anchorage reach on the HUD
// is the same distance the hull actually sails
export function nearestHaven(lat, lon, havens = HAVENS) {
  let best = null, bestD = Infinity;
  for (const h of havens) {
    const d = Math.hypot((lat - h.lat) * M_PER_DEG, (lon - h.lon) * M_PER_DEG);
    if (d < bestD) { bestD = d; best = h; }
  }
  return best ? { haven: best, dist: bestD } : null;
}

export function inAnchorage(dist, speed) {
  return dist <= PORT_RADIUS && Math.abs(speed) <= PORT_SPEED;
}

// selling the fleet: every hull goes at once, the prize crews come back
// aboard as far as the berths allow. Returns the ledger, mutates nothing.
export function sellFleet(fleetSize, crew) {
  const gold = fleetSize * PRIZE_VALUE;
  const crewBack = Math.min(CREW_MAX, crew + fleetSize * PRIZE_CREW);
  return { gold, crewBack, sold: fleetSize };
}

export function canHire(gold, crew) {
  return gold >= HAND_COST && crew < CREW_MAX;
}
