// Merchantmen — the pure simulation half, no THREE, no DOM. verify-merchants
// guards it. merchantlayer.js gives them hulls.
//
// Spawns are a deterministic function of the world cell (invariant 6): the
// same waters carry the same trade, every session, every client. Four kinds
// of sail share the lanes now:
//
//   trader   — the bread and butter: cruises, flees, strikes her colours
//   indiaman — rich, slow, stubborn; the payday worth chasing
//   navy     — a corvette that HUNTS pirates and fires back (combat.js);
//              boarding her is an autobattle, not a surrender
//   derelict — Bermuda Triangle only: dead ships adrift, full of cargo
//              nobody came back for — the best salvage in the Atlantic
//
// They sail HULL speed only — no fair current — so at 12x you run them down
// like a hawk on a pigeon, and the encounter gait (earth.js) guarantees the
// last 400 m happens at human speed.

import { unit2 } from './noise.js';
import { isLand, coastDistGame, worldToLatLon } from './earth.js';
import { inZone, zoneOf } from './legendfx.js';

export const CELL = 6000;        // spawn-table cell, game metres
export const ACTIVE_R = 9000;    // simulate merchants within this of the player
export const FLEE_R = 800;       // they spot your black flag at this range
export const HUNT_R = 1500;      // a corvette spots YOU at this range
export const TURN = 0.4;         // rad/s of frightened helm

// per-type sailing + ledger numbers. goldMult scales the boarding purse
// (plunder.js lootRoll); crew is who meets your boarding party.
export const TYPES = {
  trader:   { cruise: 3.6, panic: 5.4, scale: 1.12, goldMult: 1,   crew: 0, armed: false },
  indiaman: { cruise: 2.9, panic: 4.4, scale: 1.45, goldMult: 3,   crew: 0, armed: false },
  navy:     { cruise: 4.2, panic: 6.0, scale: 1.28, goldMult: 0.6, crew: 6, armed: true  },
  derelict: { cruise: 0,   panic: 0,   scale: 1.12, goldMult: 2.5, crew: 0, armed: false },
};
export const CRUISE = TYPES.trader.cruise; // the old names still mean the old ship
export const PANIC = TYPES.trader.panic;

// deterministic spawn specs for one cell: [] or 1–2 ships. Cells whose
// spawn point is on/near land trade nothing (they're coastal folk, not us).
// Inside the Bermuda Triangle the lanes go QUIET and the derelicts drift.
export function cellMerchants(cx, cz) {
  const roll = unit2(cx * 3.7, cz * 9.1);
  const count = roll < 0.5 ? 0 : roll < 0.87 ? 1 : 2;
  const out = [];
  for (let i = 0; i < count; i++) {
    const x = (cx + 0.15 + 0.7 * unit2(cx + i * 31, cz * 1.3)) * CELL;
    const z = (cz + 0.15 + 0.7 * unit2(cx * 1.7, cz + i * 47)) * CELL;
    const ll = worldToLatLon(x, z);
    if (isLand(ll.lat, ll.lon) || coastDistGame(ll.lat, ll.lon) < 600) continue;
    let type;
    if (inZone(ll.lat, ll.lon, 'bermuda-triangle')) {
      type = 'derelict'; // nobody TRADES through the triangle any more
    } else {
      const tr = unit2(cx * 7.7 + i * 13, cz * 5.3 + i * 7);
      type = tr < 0.72 ? 'trader' : tr < 0.88 ? 'indiaman' : 'navy';
    }
    out.push({
      id: `m-${cx}-${cz}-${i}`,
      type,
      x, z,
      yaw: unit2(cx + i * 13, cz + i * 29) * Math.PI * 2,
      speed: TYPES[type].cruise,
      looted: false,
      routed: false, // a beaten corvette breaks off and runs like a trader
      // her hold, if she goes DOWN instead of being boarded: most of it
      // sinks with her, combat.js salvageValue floats the rest
      purse: Math.round((40 + unit2(cx * 9.1 + i * 3, cz * 4.3 + i * 5) * 180) * TYPES[type].goldMult),
    });
  }
  return out;
}

// The Triangle's own fleet: a deterministic scatter of dead ships inside the
// zone (the spawn cells are far coarser than the zone, so the derelicts get
// their own table). Same waters, same wrecks, every client.
export const DERELICT_N = 7;
export function zoneDerelicts() {
  const zone = zoneOf('bermuda-triangle');
  if (!zone) return [];
  const out = [];
  for (let i = 0; i < DERELICT_N; i++) {
    const ang = unit2(i * 11.3, 41.7) * Math.PI * 2;
    const r = zone.r * (0.15 + 0.8 * unit2(i * 5.9, 23.1));
    const x = zone.x + Math.sin(ang) * r;
    const z = zone.z + Math.cos(ang) * r;
    const ll = worldToLatLon(x, z);
    if (isLand(ll.lat, ll.lon)) continue;
    out.push({
      id: `drl-${i}`,
      type: 'derelict',
      x, z,
      yaw: unit2(i * 17.1, 7.7) * Math.PI * 2,
      speed: 0,
      looted: false,
      routed: false,
      purse: Math.round((40 + unit2(i * 6.7, 91.3) * 180) * TYPES.derelict.goldMult),
    });
  }
  return out;
}

const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// mutates and returns m. px/pz: the pirate. speedMult: battle damage
// (combat.js speedFactor) — torn sails slow her whatever her orders are.
// Deterministic given inputs.
export function stepMerchant(m, px, pz, dt, speedMult = 1) {
  const spec = TYPES[m.type] || TYPES.trader;
  if (m.looted || m.type === 'derelict') {
    m.speed += (0 - m.speed) * Math.min(1, dt * 0.8); // strike sail, heave to
  } else {
    const d = Math.hypot(px - m.x, pz - m.z);
    const hunts = spec.armed && !m.routed;
    if (hunts && d < HUNT_R) {
      // the corvette turns TOWARD the black flag and crowds sail
      const at = Math.atan2(px - m.x, pz - m.z);
      const err = wrapPi(at - m.yaw);
      m.yaw += Math.max(-TURN * dt, Math.min(TURN * dt, err));
      m.speed += (spec.panic * speedMult - m.speed) * Math.min(1, dt * 0.5);
    } else if (!spec.armed && d < FLEE_R) {
      const away = Math.atan2(m.x - px, m.z - pz);
      const err = wrapPi(away - m.yaw);
      m.yaw += Math.max(-TURN * dt, Math.min(TURN * dt, err));
      m.speed += (spec.panic * speedMult - m.speed) * Math.min(1, dt * 0.5);
    } else if (m.routed && d < HUNT_R) {
      // beaten, she runs from the fight she started
      const away = Math.atan2(m.x - px, m.z - pz);
      const err = wrapPi(away - m.yaw);
      m.yaw += Math.max(-TURN * dt, Math.min(TURN * dt, err));
      m.speed += (spec.panic * speedMult - m.speed) * Math.min(1, dt * 0.5);
    } else {
      m.speed += (spec.cruise * speedMult - m.speed) * Math.min(1, dt * 0.3);
    }
  }
  m.x += Math.sin(m.yaw) * m.speed * dt;
  m.z += Math.cos(m.yaw) * m.speed * dt;
  return m;
}

// which cells to consult for a player at (x, z)
export function activeCells(x, z) {
  const c0x = Math.floor((x - ACTIVE_R) / CELL), c1x = Math.floor((x + ACTIVE_R) / CELL);
  const c0z = Math.floor((z - ACTIVE_R) / CELL), c1z = Math.floor((z + ACTIVE_R) / CELL);
  const out = [];
  for (let cz = c0z; cz <= c1z; cz++)
    for (let cx = c0x; cx <= c1x; cx++) out.push([cx, cz]);
  return out;
}
