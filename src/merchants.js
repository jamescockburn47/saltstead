// Merchantmen — the pure simulation half, no THREE, no DOM. verify-merchants
// guards it. merchantlayer.js gives them hulls.
//
// Spawns are a deterministic function of the world cell (invariant 6): the
// same waters carry the same trade, every session, every client. Behaviour:
// they cruise a fixed course, flee when a pirate presses close, and heave to
// once stripped. They sail HULL speed only — no fair current — so at 12x you
// run them down like a hawk on a pigeon, and the encounter gait (earth.js)
// guarantees the last 400 m happens at human speed.

import { unit2 } from './noise.js';
import { isLand, coastDistGame, worldToLatLon } from './earth.js';

export const CELL = 6000;        // spawn-table cell, game metres
export const ACTIVE_R = 9000;    // simulate merchants within this of the player
export const FLEE_R = 800;       // they spot your black flag at this range
export const CRUISE = 3.6;       // m/s about their business
export const PANIC = 5.4;        // m/s with a pirate astern
export const TURN = 0.4;         // rad/s of frightened helm

// deterministic spawn specs for one cell: [] or 1–2 merchants. Cells whose
// spawn point is on/near land trade nothing (they're coastal folk, not us).
export function cellMerchants(cx, cz) {
  const roll = unit2(cx * 3.7, cz * 9.1);
  const count = roll < 0.5 ? 0 : roll < 0.87 ? 1 : 2;
  const out = [];
  for (let i = 0; i < count; i++) {
    const x = (cx + 0.15 + 0.7 * unit2(cx + i * 31, cz * 1.3)) * CELL;
    const z = (cz + 0.15 + 0.7 * unit2(cx * 1.7, cz + i * 47)) * CELL;
    const ll = worldToLatLon(x, z);
    if (isLand(ll.lat, ll.lon) || coastDistGame(ll.lat, ll.lon) < 600) continue;
    out.push({
      id: `m-${cx}-${cz}-${i}`,
      x, z,
      yaw: unit2(cx + i * 13, cz + i * 29) * Math.PI * 2,
      speed: CRUISE,
      looted: false,
    });
  }
  return out;
}

const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// mutates and returns m. px/pz: the pirate. Deterministic given inputs.
export function stepMerchant(m, px, pz, dt) {
  if (m.looted) {
    m.speed += (0 - m.speed) * Math.min(1, dt * 0.8); // strike sail, heave to
  } else {
    const d = Math.hypot(px - m.x, pz - m.z);
    if (d < FLEE_R) {
      const away = Math.atan2(m.x - px, m.z - pz);
      const err = wrapPi(away - m.yaw);
      m.yaw += Math.max(-TURN * dt, Math.min(TURN * dt, err));
      m.speed += (PANIC - m.speed) * Math.min(1, dt * 0.5);
    } else {
      m.speed += (CRUISE - m.speed) * Math.min(1, dt * 0.3);
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
