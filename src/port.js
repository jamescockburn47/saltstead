// Ports — pure, no THREE, no DOM. verify-port.mjs guards it.
// The plunder economy's first SINK (docs/DESIGN.md "Ports that work"):
// sell your prizes, sign on hands, pay the yard. Gold -> crew -> prizes ->
// gold. Two tiers of harbour now: the pirate HAVENS (legends.js) fence at
// full price; the world's DOCKYARDS (ports.js) serve any captain anywhere —
// repair, hire, shipwright — but the harbourmaster asks questions, so a
// prize fetches only half.

import { LEGENDS } from './legends.js';
import { PORTS } from './ports.js';
import { PRIZE_CREW } from './fleet.js';
import { M_PER_DEG } from './earth.js';

export const PORT_RADIUS = 900;   // metres of anchorage around a haven
export const PORT_SPEED = 1.5;    // bare steerageway to put in
export const PRIZE_VALUE = 400;   // a hull is worth more than the richest purse
export const HAND_COST = 60;      // the tavern's signing bounty
export const CREW_MAX = 12;       // fallback berth cap; the real cap is per hull (shipyard.js)
export const DOCKYARD_FENCE = 0.5; // an honest port's rate for a dishonest prize

const HAVENS = LEGENDS.filter((l) => l.kind === 'haven');
const ALL_PORTS = HAVENS.concat(PORTS);

// a pirate haven fences at full price; everywhere else takes its cut
export function fenceRate(port) {
  return port.kind === 'haven' ? 1 : DOCKYARD_FENCE;
}

// nearest port (haven or dockyard) to a position: { haven, dist } in GAME
// metres — measured in the game's own equirectangular world frame, so
// anchorage reach on the HUD is the same distance the hull actually sails
export function nearestHaven(lat, lon, havens = ALL_PORTS) {
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
export function sellFleet(fleetSize, crew, berths = CREW_MAX, rate = 1) {
  const gold = Math.round(fleetSize * PRIZE_VALUE * rate);
  const crewBack = Math.min(berths, crew + fleetSize * PRIZE_CREW);
  return { gold, crewBack, sold: fleetSize };
}

export function canHire(gold, crew, berths = CREW_MAX) {
  return gold >= HAND_COST && crew < berths;
}
