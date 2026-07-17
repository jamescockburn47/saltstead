// verify-lanes: every mark afloat, deep water and reaches preferred by the cost,
// the eastward Caribbean passage rides a lane north-about through the westerlies
// (the acceptance scenario), short/off-lane hops sail direct (no regression),
// and route() is deterministic.
import { LANES, resolveMark, segmentCost, nearestNode, nearestLanePoint, route, laneNodes } from '../src/lanes.js';
import { isLand, coastDistGame, latLonToWorld, worldToLatLon, dxWrap, WORLD_W } from '../src/earth.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// every mark is afloat; bare SEA-marks must be off the beach (ports are
// harbours — coastal by definition — so they're exempt from the coast check)
for (const lane of LANES) {
  for (const mark of lane.marks) {
    const m = resolveMark(mark);
    const ll = worldToLatLon(m.x, m.z);
    ok(!isLand(ll.lat, ll.lon), `${lane.id}: a mark is afloat`);
    if (!mark.port) ok(coastDistGame(ll.lat, ll.lon) > 300, `${lane.id}: a sea-mark is off the beach`);
  }
}

// deep water is cheaper per metre than coast-hugging
{
  const dA = latLonToWorld(30, -45), dB = latLonToWorld(31, -45);   // mid-Atlantic
  const cA = latLonToWorld(23.2, -82.4), cB = latLonToWorld(24.1, -82.4); // off Havana
  ok(segmentCost(dA.x, dA.z, dB.x, dB.z) < segmentCost(cA.x, cA.z, cB.x, cB.z),
    'deep water is cheaper per leg than coast-hugging');
}

// a leg you must BEAT costs more than one that REACHES: in the NE trades (~15N,
// wind from NE) a NE-bound leg beats, a SE-bound leg reaches — same length, water
{
  const c = latLonToWorld(15, -40), ne = latLonToWorld(17, -38), se = latLonToWorld(13, -38);
  ok(segmentCost(c.x, c.z, ne.x, ne.z) > segmentCost(c.x, c.z, se.x, se.z),
    'a beat costs more than a reach');
}

// ACCEPTANCE — the eastward Caribbean passage: a course to Europe rides a lane
// north-about into the westerlies, not a dead beat east into the trades
{
  const a = latLonToWorld(18, -64), b = latLonToWorld(36.5, -6.4); // E. Caribbean -> Cadiz
  const r = route(a.x, a.z, b.x, b.z);
  ok(r.length > 1, `the eastward passage rides a lane (${r.length} legs)`);
  const maxLat = Math.max(...r.map((p) => worldToLatLon(p.x, p.z).lat));
  ok(maxLat >= 34, `it goes north-about into the westerlies (to ${maxLat.toFixed(0)}N)`);
  const last = r[r.length - 1];
  ok(Math.abs(last.x - b.x) < 1 && Math.abs(last.z - b.z) < 1, 'the last leg is the destination');
}

// a short coastal hop sails direct — no regression
{
  const a = latLonToWorld(23.2, -82.4), b = latLonToWorld(23.0, -82.0);
  ok(route(a.x, a.z, b.x, b.z).length === 1, 'a short hop sails direct');
}

// deterministic: same inputs -> identical route
{
  const a = latLonToWorld(18, -64), b = latLonToWorld(36.5, -6.4);
  ok(JSON.stringify(route(a.x, a.z, b.x, b.z)) === JSON.stringify(route(a.x, a.z, b.x, b.z)),
    'route is deterministic');
}

// the world wraps east-west: a trans-Pacific course (Manila -> Acapulco) routes
// the SHORT way EAST across the dateline, not the long way round the globe
{
  const m = latLonToWorld(14.55, 120.85), ac = latLonToWorld(16.8, -99.9);
  ok(dxWrap(m.x, ac.x) > 0 && ac.x - m.x < 0,
    'Manila->Acapulco: wrap routes EAST across the dateline (the short way), not west the long way');
  const r = route(m.x, m.z, ac.x, ac.z);
  ok(r.length >= 1 && Math.abs(r[r.length - 1].x - ac.x) < 1, 'the trans-Pacific route ends at Acapulco');
  ok(Math.abs(dxWrap(m.x, ac.x)) < WORLD_W / 2, 'and the crossing is the short arc');
}

ok(laneNodes().length >= 4, 'the graph has nodes');

// nearestLanePoint finds the corridor + its heading (for lane-anchored traffic)
{
  const p = latLonToWorld(31, -60); // near the treasure-fleet mid-Atlantic leg
  const lp = nearestLanePoint(p.x, p.z);
  ok(lp && Number.isFinite(lp.tangent) && lp.width > 0, 'nearestLanePoint returns a corridor with a heading');
}
ok(nearestNode(latLonToWorld(23.5, -82).x, latLonToWorld(23.5, -82).z) !== null, 'nearestNode resolves');

if (failed) { console.error(`verify-lanes: ${failed} FAILED`); process.exit(1); }
console.log('verify-lanes: OK — marks afloat, deep water + reaches preferred, the eastward passage rides north-about, short hops sail direct');
