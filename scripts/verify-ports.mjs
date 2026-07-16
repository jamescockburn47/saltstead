// verify-ports: every dockyard sits on a real coast with water a ship can
// anchor in, the ids are unique, every ocean basin is served (the POINT of
// the table: a voyage never has to beat back to the Caribbean for a yard),
// and the two-tier fence holds — havens pay full, honest ports take a cut.
import { PORTS } from '../src/ports.js';
import { isLand, coastDistGame, M_PER_DEG } from '../src/earth.js';
import {
  nearestHaven, fenceRate, sellFleet, canHire, PORT_RADIUS, PRIZE_VALUE,
  DOCKYARD_FENCE, CREW_MAX, HAND_COST,
} from '../src/port.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// well-formed, unique rows
ok(PORTS.length >= 14, `a real network of yards (${PORTS.length})`);
ok(new Set(PORTS.map((p) => p.id)).size === PORTS.length, 'ids are unique');
for (const p of PORTS) {
  ok(p.kind === 'dockyard', `${p.id} is a dockyard`);
  ok(typeof p.name === 'string' && p.name.length > 2, `${p.id} has a name`);
  ok(typeof p.pitch === 'string' && p.pitch.length > 20, `${p.id} has a pitch`);
  ok(Number.isFinite(p.lat) && Math.abs(p.lat) <= 60, `${p.id} lat sane (${p.lat})`);
  ok(Number.isFinite(p.lon) && Math.abs(p.lon) <= 180, `${p.id} lon sane (${p.lon})`);
}

// every yard is anchorable: water at (or within the anchorage circle of) the
// mark, and a real coast close enough that this is a PORT, not open ocean
for (const p of PORTS) {
  const stepDeg = (PORT_RADIUS * 0.7) / M_PER_DEG;
  let water = !isLand(p.lat, p.lon);
  for (let a = 0; a < 8 && !water; a++) {
    const ang = (a / 8) * Math.PI * 2;
    water = !isLand(p.lat + Math.cos(ang) * stepDeg, p.lon + Math.sin(ang) * stepDeg);
  }
  ok(water, `${p.id}: water inside the anchorage (${p.lat}, ${p.lon})`);
  ok(coastDistGame(p.lat, p.lon) < PORT_RADIUS * 3,
    `${p.id}: a coast within sight (${Math.round(coastDistGame(p.lat, p.lon))} m)`);
}

// the world is served: a yard in every basin a trade route crosses
const basins = [
  ['the Caribbean / Gulf', (p) => p.lat > 10 && p.lat < 32 && p.lon > -100 && p.lon < -60],
  ['the North Atlantic', (p) => p.lat > 35 && p.lon > -75 && p.lon < 10],
  ['the Mediterranean', (p) => p.lat > 30 && p.lat < 46 && p.lon > -6 && p.lon < 37],
  ['the South Atlantic', (p) => p.lat < -10 && p.lon > -60 && p.lon < 20],
  ['the Indian Ocean', (p) => p.lon > 30 && p.lon < 110],
  ['the western Pacific', (p) => p.lon > 100 && p.lon < 155],
  ['the eastern Pacific', (p) => p.lat < 20 && p.lon > -110 && p.lon < -65],
];
for (const [name, test] of basins) {
  ok(PORTS.some(test), `${name} has a yard`);
}

// the nearest-port search sees the new network alongside the old havens
{
  const rio = nearestHaven(-22.9, -43.1);
  ok(rio.haven.id === 'rio' && rio.dist < 1, 'off Guanabara Bay, Rio is the port');
  const pr = nearestHaven(17.93, -76.85);
  ok(pr.haven.id === 'port-royal', 'off Kingston harbour the HAVEN still wins');
  const nag = nearestHaven(32.7, 129.8);
  ok(nag.haven.id === 'nagasaki', 'the far side of the world has a door now');
}

// the two-tier fence
ok(fenceRate({ kind: 'haven' }) === 1, 'a haven fences at full price');
ok(fenceRate({ kind: 'dockyard' }) === DOCKYARD_FENCE, 'an honest port takes its cut');
{
  const haven = sellFleet(2, 0, CREW_MAX, 1);
  const dock = sellFleet(2, 0, CREW_MAX, DOCKYARD_FENCE);
  ok(haven.gold === 2 * PRIZE_VALUE, 'haven sale pays full');
  ok(dock.gold === PRIZE_VALUE, 'dockyard sale pays half');
  ok(haven.crewBack === dock.crewBack, 'the prize crews come back either way');
}

// berths follow the hull, not the constant
ok(canHire(HAND_COST, 12, 20), 'a brig hires past the sloop\'s berths');
ok(!canHire(HAND_COST, 20, 20), 'but never past her own');
ok(sellFleet(3, 18, 20).crewBack === 20, 'crew returning from prizes cap at the hull\'s berths');

if (failed) { console.error(`verify-ports: ${failed} FAILED`); process.exit(1); }
console.log('verify-ports: OK — every yard on a real coast, every basin served, the two-tier fence holds');
