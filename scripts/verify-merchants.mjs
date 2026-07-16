// verify-merchants: the trade lanes are deterministic (invariant 6), spawn
// only in honest water, carry all three honest types plus the triangle's
// derelicts, flee a pirate (or HUNT one, if she flies the King's colours),
// heave to when stripped, and the active cell walk covers the radius.
import {
  cellMerchants, stepMerchant, activeCells, zoneDerelicts, CELL, ACTIVE_R,
  FLEE_R, HUNT_R, CRUISE, PANIC, TYPES, NAVY_SHOAL, NAVY_STANDOFF, LOOKOUT_R, compassPoint,
} from '../src/merchants.js';
import { isLand, worldToLatLon, latLonToWorld, ENCOUNTER_FAR } from '../src/earth.js';
import { inZone } from '../src/legendfx.js';
import { SLOOP } from '../src/shipphysics.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// determinism + placement over a spread of open Atlantic cells
{
  let total = 0;
  const seen = { trader: 0, indiaman: 0, navy: 0 };
  for (let cx = -8; cx < 0; cx++) {
    for (let cz = -6; cz < 2; cz++) {
      const a = cellMerchants(cx, cz), b = cellMerchants(cx, cz);
      ok(JSON.stringify(a) === JSON.stringify(b), `cell ${cx},${cz} deterministic`);
      for (const m of a) {
        total++;
        seen[m.type] = (seen[m.type] || 0) + 1;
        const ll = worldToLatLon(m.x, m.z);
        ok(!isLand(ll.lat, ll.lon), `${m.id} spawns at sea`);
        ok(m.x >= cx * CELL && m.x <= (cx + 1) * CELL, `${m.id} stays in its cell`);
        ok(TYPES[m.type], `${m.id} is a known type (${m.type})`);
      }
    }
  }
  // playtest density: a five-minute blue-water leg must MEET somebody. The
  // sample swath crosses continents (the land veto eats those cells), so
  // ~0.7/cell here means the honest OCEAN cells carry better than one sail
  // each — double the pre-playtest table.
  ok(total >= 40, `the lanes are busy (${total} ships in 64 mixed cells)`);
  ok(seen.trader > 0, 'traders work the lanes');
}

// the HOME waters carry sail: the berth re-roll means the archipelago seas
// (where the land veto used to eat half the table) still trade. A guest
// spawning off Port Royal must have someone in lookout range of her first
// hour's sailing — this is the "I saw no other ships" regression test.
{
  for (const [name, lat, lon] of [
    ['Port Royal', 17.85, -76.9], ['Windward Passage', 19.5, -74.0],
    ['mid-Atlantic', 24.0, -45.0], ['Biscay', 48.0, -8.0],
  ]) {
    const p = latLonToWorld(lat, lon);
    let n = 0, nearest = Infinity;
    for (const [cx, cz] of activeCells(p.x, p.z)) {
      for (const m of cellMerchants(cx, cz)) {
        const d = Math.hypot(m.x - p.x, m.z - p.z);
        if (d <= ACTIVE_R) { n++; nearest = Math.min(nearest, d); }
      }
    }
    ok(n >= 3, `${name}: the waters are worked (${n} sails within ${ACTIVE_R} m)`);
    ok(nearest <= LOOKOUT_R * 1.5,
      `${name}: someone near the lookout's reach (nearest ${Math.round(nearest)} m)`);
  }
}

// the lookout outranges the encounter gait: you HEAR about a sail before
// the current dies, never the other way round
ok(LOOKOUT_R > ENCOUNTER_FAR, 'the tops see beyond hailing range');

// the hail's compass points match the world frame (+x east, -z north)
ok(compassPoint(0, 0, 0, -100) === 'north', 'north is -z');
ok(compassPoint(0, 0, 100, 0) === 'east', 'east is +x');
ok(compassPoint(0, 0, 0, 100) === 'south', 'south is +z');
ok(compassPoint(0, 0, -100, -100) === 'nor\u2019west', 'quarters split true');

// the wider ocean carries every honest type at roughly the design mix
{
  const seen = { trader: 0, indiaman: 0, navy: 0, derelict: 0 };
  let total = 0;
  for (let cx = -20; cx < 10; cx++) {
    for (let cz = -12; cz < 6; cz++) {
      for (const m of cellMerchants(cx, cz)) { seen[m.type]++; total++; }
    }
  }
  ok(seen.trader > seen.indiaman && seen.indiaman > 0, `indiamen are the rarer prize (${seen.indiaman}/${total})`);
  ok(seen.navy > 0 && seen.navy < total * 0.25, `the navy patrols but does not own the sea (${seen.navy}/${total})`);
}

// inside the Bermuda Triangle the lanes go quiet and the derelicts drift
{
  const drl = zoneDerelicts();
  ok(drl.length >= 4, `derelicts drift in the triangle (${drl.length})`);
  ok(JSON.stringify(drl) === JSON.stringify(zoneDerelicts()), 'the same wrecks every session');
  for (const m of drl) {
    const ll = worldToLatLon(m.x, m.z);
    ok(inZone(ll.lat, ll.lon, 'bermuda-triangle'), `${m.id} drifts inside the zone`);
    ok(!isLand(ll.lat, ll.lon), `${m.id} floats, not beached`);
    ok(m.type === 'derelict' && m.speed === 0, `${m.id} is a dead ship`);
  }
  // and the ordinary spawn table trades no honest flag through the zone
  const w = latLonToWorld(25.5, -70);
  const cx0 = Math.floor(w.x / CELL), cz0 = Math.floor(w.z / CELL);
  let honest = 0;
  for (let cx = cx0 - 2; cx <= cx0 + 2; cx++) {
    for (let cz = cz0 - 2; cz <= cz0 + 2; cz++) {
      for (const m of cellMerchants(cx, cz)) {
        const ll = worldToLatLon(m.x, m.z);
        if (inZone(ll.lat, ll.lon, 'bermuda-triangle') && m.type !== 'derelict') honest++;
      }
    }
  }
  ok(honest === 0, `nobody trades through it (${honest} honest sails inside)`);
  const d = { id: 'd', type: 'derelict', x: 0, z: 0, yaw: 0, speed: 0, looted: false, routed: false };
  for (let i = 0; i < 60; i++) stepMerchant(d, 50, 50, 1 / 30);
  ok(Math.hypot(d.x, d.z) < 1, 'a derelict never runs — she has no one left to run');
}

// behaviour: cruise alone, flee a pirate, heave to when stripped
{
  const m = { id: 't', type: 'trader', x: 0, z: 0, yaw: 0, speed: CRUISE, looted: false, routed: false };
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

// the corvette HUNTS: she turns toward the pirate and closes
{
  const n = { id: 'n', type: 'navy', x: 0, z: 0, yaw: Math.PI, speed: TYPES.navy.cruise, looted: false, routed: false };
  const px = 0, pz = HUNT_R * 0.6; // pirate ahead of her stern
  const d0 = Math.hypot(n.x - px, n.z - pz);
  for (let i = 0; i < 60 * 30; i++) stepMerchant(n, px, pz, 1 / 30);
  const d1 = Math.hypot(n.x - px, n.z - pz);
  ok(d1 < d0, `she CLOSES on the black flag (${d0.toFixed(0)} -> ${d1.toFixed(0)} m)`);
  ok(n.speed > TYPES.navy.cruise, 'and crowds sail to do it');

  // routed (a lost autobattle), she runs like anyone else
  const r = { id: 'r', type: 'navy', x: 0, z: 0, yaw: 0, speed: TYPES.navy.cruise, looted: false, routed: true };
  for (let i = 0; i < 30 * 30; i++) stepMerchant(r, 0, -200, 1 / 30);
  ok(Math.hypot(r.x - 0, r.z - -200) > 200, 'routed, she opens the range instead');

  // torn sails slow the hunt: battle damage caps her orders
  const c = { id: 'c', type: 'navy', x: 0, z: 0, yaw: 0, speed: 0, looted: false, routed: false };
  for (let i = 0; i < 60 * 30; i++) stepMerchant(c, 0, 300, 1 / 30, 0.4);
  ok(c.speed < TYPES.navy.panic * 0.5, `chain shot slows her (${c.speed.toFixed(1)} m/s)`);

  // the shoal line ends the chase: a pirate in thin water is a pirate she
  // cannot reach — she bears away instead of grounding her keel after him
  const s = { id: 's', type: 'navy', x: 0, z: 0, yaw: 0, speed: TYPES.navy.cruise, looted: false, routed: false };
  const sd0 = Math.hypot(s.x - 0, s.z - 400);
  for (let i = 0; i < 60 * 30; i++) stepMerchant(s, 0, 400, 1 / 30, 1, true);
  const sd1 = Math.hypot(s.x - 0, s.z - 400);
  ok(sd1 > sd0, `over the shoal she breaks off (${sd0.toFixed(0)} -> ${sd1.toFixed(0)} m)`);
  ok(NAVY_SHOAL < 0, 'the shoal line is below the waterline');

  // she RAKES, she does not RAM: inside the standoff she circles at gun
  // range instead of driving her bow into the pirate (collide.js makes a
  // ram cost real hull now)
  const k = { id: 'k', type: 'navy', x: 0, z: 300, yaw: Math.PI, speed: TYPES.navy.cruise, looted: false, routed: false };
  let minD = 1e9;
  for (let i = 0; i < 120 * 30; i++) {
    stepMerchant(k, 0, 0, 1 / 30);
    minD = Math.min(minD, Math.hypot(k.x, k.z));
  }
  ok(minD > 30, `the corvette holds off the fenders (closest ${minD.toFixed(0)} m)`);
  ok(minD < NAVY_STANDOFF + 60, `but keeps her guns in range (closest ${minD.toFixed(0)} m)`);
}

// the early-game doctrine holds in the numbers: a well-sailed sloop OUTRUNS
// the hunt (speed is her armour — the sloop briefing in shipyard.js is a
// promise, and this is the promise kept)
ok(SLOOP.maxSpeed > TYPES.navy.panic + 1.5,
  `the sloop outruns a crowding corvette (${SLOOP.maxSpeed} vs ${TYPES.navy.panic} m/s)`);
ok(SLOOP.maxSpeed > TYPES.trader.panic,
  'and catches every honest sail on the lanes');

// active cells cover the radius
{
  const cells = activeCells(100, 100);
  ok(cells.length >= 9, `cell walk covers the ring (${cells.length} cells)`);
  const span = ACTIVE_R / CELL;
  ok(cells.some(([cx]) => cx === Math.floor((100 - ACTIVE_R) / CELL)), 'west edge reached');
  ok(span >= 1, 'radius spans at least a cell');
}

// the ledger constants hold their design shape
ok(TYPES.indiaman.goldMult > TYPES.trader.goldMult, 'the indiaman is the payday');
ok(TYPES.indiaman.cruise < TYPES.trader.cruise, 'and slower for it');
ok(TYPES.navy.armed && !TYPES.trader.armed, 'only the navy shoots back');
ok(TYPES.navy.crew > 0, 'boarding a corvette meets a crew');
ok(PANIC > CRUISE, 'panic beats cruise');

if (failed) { console.error(`verify-merchants: ${failed} FAILED`); process.exit(1); }
console.log('verify-merchants: OK — lanes deterministic, four types sound, navy hunts, derelicts drift the triangle');
