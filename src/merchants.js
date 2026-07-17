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
//   raider   — a pirate brigantine working the same lanes: the NAVY
//              player's quarry (faction.js), a rival flag to everyone else
//   derelict — Bermuda Triangle only: dead ships adrift, full of cargo
//              nobody came back for — the best salvage in the Atlantic
//
// WHAT each ship does about the player depends on the player's FLAG: the
// attitude matrix lives in faction.js and arrives here as stepMerchant's
// `att` override — this module stays pure and faction-blind.
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
  raider:   { cruise: 4.0, panic: 5.8, scale: 1.24, goldMult: 1.6, crew: 4, armed: true  },
  derelict: { cruise: 0,   panic: 0,   scale: 1.12, goldMult: 2.5, crew: 0, armed: false },
};
export const CRUISE = TYPES.trader.cruise; // the old names still mean the old ship
export const PANIC = TYPES.trader.panic;

// deterministic spawn specs for one cell: [] or 1–4 ships, roughly 2.5 a
// cell (playtest twice now: the 1.5-a-cell table still left five-minute
// legs without a sail — the lanes should feel WORKED, an encounter should
// be the expectation, not the event).
// Inside the Bermuda Triangle the lanes go QUIET and the derelicts drift.
//
// A ship whose rolled berth lands on/near land RE-ROLLS at other
// deterministic points in the cell instead of vanishing — without this the
// archipelago seas (the Caribbean! the game's own home waters) lost more
// than half their trade to the land veto and read as dead ocean.
const BERTH_TRIES = 6;
export function cellMerchants(cx, cz) {
  const roll = unit2(cx * 3.7, cz * 9.1);
  const count = roll < 0.06 ? 0 : roll < 0.28 ? 1 : roll < 0.62 ? 2 : roll < 0.9 ? 3 : 4;
  const out = [];
  for (let i = 0; i < count; i++) {
    let x = 0, z = 0, afloat = false;
    for (let a = 0; a < BERTH_TRIES && !afloat; a++) {
      x = (cx + 0.08 + 0.84 * unit2(cx + i * 31 + a * 101, cz * 1.3 + a * 17)) * CELL;
      z = (cz + 0.08 + 0.84 * unit2(cx * 1.7 + a * 59, cz + i * 47 + a * 23)) * CELL;
      const ll = worldToLatLon(x, z);
      afloat = !isLand(ll.lat, ll.lon) && coastDistGame(ll.lat, ll.lon) >= 600;
    }
    if (!afloat) continue; // a genuinely landlocked cell trades nothing
    const ll = worldToLatLon(x, z);
    let type;
    if (inZone(ll.lat, ll.lon, 'bermuda-triangle')) {
      type = 'derelict'; // nobody TRADES through the triangle any more
    } else {
      const tr = unit2(cx * 7.7 + i * 13, cz * 5.3 + i * 7);
      type = tr < 0.56 ? 'trader' : tr < 0.72 ? 'indiaman' : tr < 0.86 ? 'navy' : 'raider';
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

// The lookout's range: from the tops you see sail LONG before the deck fog
// swallows hulls — this is how the player finds the trade the spawn table
// lays out. main.js hails each ship once as she comes into view.
export const LOOKOUT_R = 5000;

// the hail's compass point, ship -> target. World frame: +x east, -z north
// (chart north is up, yaw 0 faces +z = south).
const POINTS = ['north', 'nor\u2019east', 'east', 'sou\u2019east',
  'south', 'sou\u2019west', 'west', 'nor\u2019west'];
export function compassPoint(px, pz, tx, tz) {
  const ang = Math.atan2(tx - px, -(tz - pz)); // 0 = north, +ve = east about
  return POINTS[((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8];
}

// water shallower than this (terrain elevation above it) is corvette-proof:
// her deep keel dare not follow where a beaching sloop can run. The escape
// band the sloop's briefing promises (shipyard.js) lives on this number.
export const NAVY_SHOAL = -1.0;

// inside this range a hunting corvette stops closing and CIRCLES, guns
// bearing — the duel happens at cannon range, not at the fenders
export const NAVY_STANDOFF = 130;

// mutates and returns m. px/pz: the QUARRY (usually the player; an
// assisting corvette is handed her target instead — faction.js). speedMult:
// battle damage (combat.js speedFactor) — torn sails slow her whatever her
// orders are. shoal: the quarry sits in water too thin for a warship
// (caller samples the terrain against NAVY_SHOAL) — a hunting corvette
// stands off rather than ground herself. att overrides what she DOES about
// the quarry ('hunt' | 'flee' | 'neutral', faction.js attitude); absent,
// the legacy doctrine holds: armed hulls hunt, honest hulls flee.
// Deterministic given inputs.
export function stepMerchant(m, px, pz, dt, speedMult = 1, shoal = false, att = null) {
  const spec = TYPES[m.type] || TYPES.trader;
  const wants = att || (spec.armed ? 'hunt' : 'flee');
  if (m.looted || m.type === 'derelict') {
    m.speed += (0 - m.speed) * Math.min(1, dt * 0.8); // strike sail, heave to
  } else if (wants === 'neutral' && !m.routed) {
    // she keeps her own counsel: cruise on, whoever you are
    m.speed += (spec.cruise * speedMult - m.speed) * Math.min(1, dt * 0.3);
  } else {
    const d = Math.hypot(px - m.x, pz - m.z);
    const hunts = wants === 'hunt' && spec.armed && !m.routed && !shoal;
    if (wants === 'hunt' && spec.armed && !m.routed && shoal && d < HUNT_R) {
      // the chase ends at the shoal line: she bears away and stands off
      const away = Math.atan2(m.x - px, m.z - pz);
      const err = wrapPi(away - m.yaw);
      m.yaw += Math.max(-TURN * dt, Math.min(TURN * dt, err));
      m.speed += (spec.cruise * speedMult - m.speed) * Math.min(1, dt * 0.5);
    } else if (hunts && d < HUNT_R) {
      // the corvette crowds sail TOWARD the black flag — but she fights
      // like the navy taught her: inside NAVY_STANDOFF she bears away to
      // circle, holding the range where her broadside does the work. A
      // warship rakes; she does not ram (collide.js makes ramming REAL now,
      // and it would cost her as much as you).
      const at = Math.atan2(px - m.x, pz - m.z);
      const close = d < NAVY_STANDOFF;
      const err = wrapPi(at + (close ? Math.PI / 2 : 0) - m.yaw);
      m.yaw += Math.max(-TURN * dt, Math.min(TURN * dt, err));
      const want = close ? spec.cruise : spec.panic;
      m.speed += (want * speedMult - m.speed) * Math.min(1, dt * 0.5);
    } else if (wants === 'flee' && !m.routed && d < FLEE_R) {
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
