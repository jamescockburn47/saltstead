// verify-harbour: every port gets a real waterfront — the quay stands at
// the waterline nearest its anchorage, the jetty head is in the water, the
// warehouses are on dry ground, and the whole layout is deterministic.
import { harbourLayout, HARBOURED } from '../src/harbour.js';
import { elevation, worldToLatLon, latLonToWorld } from '../src/earth.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };
const elevAt = (x, z) => { const g = worldToLatLon(x, z); return elevation(g.lat, g.lon); };

ok(HARBOURED.length >= 20, `havens + dockyards all harboured (${HARBOURED.length})`);

for (const p of HARBOURED) {
  // the anchorage itself must be water a ship can reach — a port row whose
  // coordinates drift onto land strands the whole waterfront (zanzibar once)
  const aw = latLonToWorld(p.lat, p.lon);
  ok(elevAt(aw.x, aw.z) < 0, `${p.id}: anchorage is water`);
  const a = harbourLayout(p);
  ok(a.ok, `${p.id}: found a shore`);
  if (!a.ok) continue;
  ok(JSON.stringify(a) === JSON.stringify(harbourLayout(p)), `${p.id}: deterministic`);

  const anchor = latLonToWorld(p.lat, p.lon);
  ok(Math.hypot(a.quay.x - anchor.x, a.quay.z - anchor.z) < 1500,
    `${p.id}: quay within reach of the anchorage`);
  // the quay straddles the waterline: its centre sits on (near-)dry ground
  ok(elevAt(a.quay.x, a.quay.z) > -1.5, `${p.id}: quay grounded at the shore`);
  // the jetty head stands in the water
  const head = { x: a.jetty.x - a.dir.x * (a.jetty.len / 2), z: a.jetty.z - a.dir.z * (a.jetty.len / 2) };
  ok(elevAt(head.x, head.z) < 0, `${p.id}: jetty head in the water`);
  ok(a.buildings.length >= 3, `${p.id}: warehouses built (${a.buildings.length})`);
  for (const b of a.buildings) {
    // ground-sited warehouses stand on dry land; quay-sited ones stand on stone
    if (!b.onQuay) ok(elevAt(b.x, b.z) > 0.15, `${p.id}: warehouse on dry ground`);
  }
  ok(a.bollards.length >= 4, `${p.id}: bollards line the quay`);
}

if (failed) { console.error(`verify-harbour: ${failed} FAILED`); process.exit(1); }
console.log(`verify-harbour: OK — ${HARBOURED.length} waterfronts stand at the waterline, `
  + 'jetties wet, warehouses dry, all deterministic');
