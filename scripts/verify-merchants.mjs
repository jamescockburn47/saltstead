// verify-merchants: the trade lanes are deterministic (invariant 6), spawn
// only in honest water, flee a pirate, heave to when stripped, and the active
// cell walk covers the simulation radius.
import { cellMerchants, stepMerchant, activeCells, CELL, ACTIVE_R, FLEE_R, CRUISE, PANIC } from '../src/merchants.js';
import { isLand, worldToLatLon } from '../src/earth.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// determinism + placement over a spread of open Atlantic cells
{
  let total = 0;
  for (let cx = -8; cx < 0; cx++) {
    for (let cz = -6; cz < 2; cz++) {
      const a = cellMerchants(cx, cz), b = cellMerchants(cx, cz);
      ok(JSON.stringify(a) === JSON.stringify(b), `cell ${cx},${cz} deterministic`);
      for (const m of a) {
        total++;
        const ll = worldToLatLon(m.x, m.z);
        ok(!isLand(ll.lat, ll.lon), `${m.id} spawns at sea`);
        ok(m.x >= cx * CELL && m.x <= (cx + 1) * CELL, `${m.id} stays in its cell`);
      }
    }
  }
  ok(total > 5, `the lanes are populated (${total} merchants in 64 cells)`);
}

// behaviour: cruise alone, flee a pirate, heave to when stripped
{
  const m = { id: 't', x: 0, z: 0, yaw: 0, speed: CRUISE, looted: false };
  // far pirate: cruise on, course held
  for (let i = 0; i < 100; i++) stepMerchant(m, 99999, 99999, 1 / 30);
  ok(Math.abs(m.speed - CRUISE) < 0.2 && Math.abs(m.yaw) < 1e-9, 'alone she cruises her course');
  ok(m.z > 10, 'and actually makes way');

  // pirate close astern: she runs, away from him, faster — and two minutes
  // of flight from 400 m carries her beyond sighting range (once clear she
  // calms back toward cruise, so panic is asserted at its peak)
  const px = m.x, pz = m.z - FLEE_R * 0.5;
  let peak = 0;
  for (let i = 0; i < 120 * 30; i++) { stepMerchant(m, px, pz, 1 / 30); peak = Math.max(peak, m.speed); }
  ok(peak > CRUISE + 0.5, `she panics (peak ${peak.toFixed(1)} m/s)`);
  const dAway = Math.hypot(m.x - px, m.z - pz);
  ok(dAway > FLEE_R, `she opens the range (${dAway.toFixed(0)} m)`);
  ok(m.speed < peak + 1e-9 && Math.abs(m.speed - CRUISE) < 1.0,
    `clear of danger she calms toward cruise (${m.speed.toFixed(1)} m/s)`);

  // stripped: she heaves to
  m.looted = true;
  for (let i = 0; i < 60 * 30; i++) stepMerchant(m, px, pz, 1 / 30);
  ok(m.speed < 0.1, 'stripped, she heaves to');
}

// active cells cover the radius
{
  const cells = activeCells(100, 100);
  ok(cells.length >= 9, `cell walk covers the ring (${cells.length} cells)`);
  const span = ACTIVE_R / CELL;
  ok(cells.some(([cx]) => cx === Math.floor((100 - ACTIVE_R) / CELL)), 'west edge reached');
  ok(span >= 1, 'radius spans at least a cell');
}

if (failed) { console.error(`verify-merchants: ${failed} FAILED`); process.exit(1); }
console.log('verify-merchants: OK — lanes deterministic, sea-only spawns, flee/heave-to behaviour sound');
