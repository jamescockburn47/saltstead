// verify-lanes: every mark afloat, deep water and reaches preferred by the cost,
// the eastward Caribbean passage rides a lane north-about through the westerlies
// (the acceptance scenario), short/off-lane hops sail direct (no regression),
// and route() is deterministic.
import { LANES, resolveMark, segmentCost, nearestNode, nearestLanePoint, route, laneNodes } from '../src/lanes.js';
import { seaLeg } from '../src/searoute.js';
import { isLand, coastDistGame, latLonToWorld, worldToLatLon, dxWrap, wrapX, WORLD_W } from '../src/earth.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// every mark is afloat; bare SEA-marks must be off the beach (ports are
// harbours — coastal by definition — so they're exempt). A NARROW mark
// (width <= 5000) is a pilotage/channel mark by construction — the Straits
// of Florida, the mouth of Manila Bay — and need only clear the literal
// beach (the grounding shelf dies within ~30 game m of the sand)
for (const lane of LANES) {
  for (const mark of lane.marks) {
    const m = resolveMark(mark);
    const ll = worldToLatLon(m.x, m.z);
    ok(!isLand(ll.lat, ll.lon), `${lane.id}: a mark is afloat`);
    if (!mark.port) {
      const floor = m.width <= 5000 ? 60 : 300;
      ok(coastDistGame(ll.lat, ll.lon) > floor, `${lane.id}: a sea-mark is off the beach`);
    }
  }
}

// every lane LEG is honest water end to end (ports get harbour grace): a
// highway that crosses a cay would march the whole trade over the sand
for (const lane of LANES) {
  for (let i = 0; i < lane.marks.length - 1; i++) {
    const a = resolveMark(lane.marks[i]), b = resolveMark(lane.marks[i + 1]);
    ok(seaLeg(a.x, a.z, b.x, b.z, lane.marks[i].port ? 250 : 0, lane.marks[i + 1].port ? 250 : 0),
      `${lane.id}: leg ${i} (${lane.marks[i].port ?? i} -> ${lane.marks[i + 1].port ?? i + 1}) is honest water`);
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

// A COURSE BLOCKED BY LAND ROUTES AROUND IT — the fix for the helmsman
// sailing through continents: Gulf of Mexico -> Atlantic must round Florida,
// and no leg of the answer may cross land
{
  const a = latLonToWorld(27, -83.5), b = latLonToWorld(27, -79.5);
  const r = route(a.x, a.z, b.x, b.z);
  ok(r.length > 1, `a land-blocked course routes around (${r.length} legs)`);
  let ax = a.x, az = a.z, clean = true;
  for (let i = 0; i < r.length; i++) {
    if (!seaLeg(ax, az, r[i].x, r[i].z, i === 0 ? 300 : 0, i === r.length - 1 ? 600 : 0)) clean = false;
    ax = r[i].x; az = r[i].z;
  }
  ok(clean, 'and every leg of it is honest water');
  const last = r[r.length - 1];
  ok(Math.abs(dxWrap(last.x, b.x)) < 1 && Math.abs(last.z - b.z) < 1, 'ending at the click');
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
