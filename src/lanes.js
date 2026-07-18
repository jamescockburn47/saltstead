// The sea roads — pure, no THREE, no DOM. verify-lanes.mjs guards it.
//
// An authored trade-route network. The helmsman routes over it by TRANSIT TIME
// (length / open-sea gait), so the fast blue water is cheap and the router
// prefers it — the deep-sea speed boost the naive rhumb line threw away.
//
// Append-only, like legends.js / ports.js: add a lane, never bend control flow.
// A `mark` is {port:id} (reuses a ports.js node) or {lat,lon}. `width` is the
// corridor HALF-width in game metres (traffic disperses across it, later plan);
// `choke:true` flags a funnel (pirate water, later plan).

import { latLonToWorld, worldToLatLon, coastDistGame, gaitFactor, dxWrap, wrapX } from './earth.js';
import { madeGoodFactor } from './sailing.js';
import { windAt } from './wind.js';
import { currentAt } from './currents.js';
import { seaRoute, seaLeg } from './searoute.js';
import { PORTS } from './ports.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export const DEFAULT_WIDTH = 8000; // generous by default (spec §1); narrow only where authored

export const LANES = [
  // Havana runs the Straits of Florida and up the channel INSIDE the Bahamas
  // before standing east — the rhumb line to (28,-72) crosses the Bahama banks
  { id: 'treasure-fleet', name: 'The Treasure Fleet', marks: [
    { port: 'havana' },
    { lat: 24.5, lon: -80.4, width: 4000, choke: true }, // the Straits of Florida
    { lat: 27.5, lon: -79.2, width: 5000 },              // the channel off the banks
    { lat: 28, lon: -72, width: 12000 },
    { lat: 34, lon: -40, width: 15000 },
    { lat: 37, lon: -12, width: 4000, choke: true },
    { port: 'cadiz' },
  ] },
  // The world wraps east-west (earth.js dxWrap/wrapX), so a lane MAY cross +/-180:
  // routing and the helmsman take the short way across the seam.
  { id: 'north-atlantic', name: 'The North Atlantic Packet', marks: [
    { port: 'boston' },
    { lat: 44, lon: -50, width: 14000 },
    { lat: 49, lon: -22, width: 12000, choke: true },
    { port: 'bristol' },
  ] },
  // Manila clears her own bay, works north up Luzon's west coast, and exits
  // the Balintang Channel — the rhumb line east crosses Luzon itself; the
  // eastbound then dips SOUTH of Hawaii (the rhumb at 18-20N crosses it)
  { id: 'manila-galleon', name: 'The Manila Galleon', marks: [
    { port: 'manila' },
    { lat: 14.25, lon: 120.3, width: 3000 },              // the mouth of Manila Bay
    { lat: 15.8, lon: 119.4, width: 5000 },               // off the Zambales coast
    { lat: 19.3, lon: 120.5, width: 5000 },               // rounding Cape Bojeador
    { lat: 20.3, lon: 122.3, width: 4000, choke: true },  // the Balintang Channel
    { lat: 18, lon: 150, width: 14000 },
    { lat: 20, lon: -170, width: 15000 }, // crosses the dateline — wrap handles it
    { lat: 17.4, lon: -155.2, width: 10000 },             // south about Hawaii
    { lat: 18, lon: -120, width: 8000 },
    { port: 'acapulco' },
  ] },
];

const PORT_BY_ID = new Map(PORTS.map((p) => [p.id, p]));

// mark -> { x, z, width, choke, port } in world metres
export function resolveMark(mark) {
  let lat, lon;
  if (mark.port) {
    const p = PORT_BY_ID.get(mark.port);
    if (!p) throw new Error(`lanes: unknown port '${mark.port}'`);
    lat = p.lat; lon = p.lon;
  } else {
    lat = mark.lat; lon = mark.lon;
  }
  const { x, z } = latLonToWorld(lat, lon);
  return { x, z, width: mark.width ?? DEFAULT_WIDTH, choke: !!mark.choke, port: mark.port ?? null };
}

// --- transit-cost model: TIME to sail a straight world segment ---
// = Σ subLen / (gait · madeGood · windFactor). Hull speed is a constant across
// every edge, so it cancels in all comparisons and is omitted. Deep water (high
// gait) is cheap; a leg you must BEAT (low madeGood) or a calm belt (low
// windFactor) is dear. Currents will multiply in on a later plan.
const SAMPLE_M = 2000; // sample the sea every ~2 km

export function segmentCost(ax, az, bx, bz) {
  const dx = dxWrap(ax, bx); // shortest east-west span across the world seam
  const len = Math.hypot(dx, bz - az);
  if (len === 0) return 0;
  const heading = Math.atan2(dx, bz - az); // yaw of the course (sin,cos = x,z)
  const n = Math.max(1, Math.ceil(len / SAMPLE_M));
  let cost = 0;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = wrapX(ax + dx * t), z = az + (bz - az) * t;
    const ll = worldToLatLon(x, z);
    const gait = gaitFactor(coastDistGame(ll.lat, ll.lon));
    const w = windAt(x, z);
    const made = Math.max(0.12, madeGoodFactor(heading, w.from)); // VMG fraction along the course
    const windFactor = clamp(w.speed / 8, 0.3, 2);
    const cur = currentAt(x, z);
    const along = cur.vx * Math.sin(heading) + cur.vz * Math.cos(heading); // + = current with us
    const currentFactor = clamp(1 + along / 6, 0.4, 1.8); // a fair current is cheap, a foul one dear
    cost += (len / n) / (gait * made * windFactor * currentFactor);
  }
  return cost;
}

// --- the graph: nodes = deduped marks, edges = consecutive marks in a lane ---
const NODES = [];               // { x, z, width, choke, port, laneId, id }
const NODE_KEY = new Map();     // "x,z" -> id
const ADJ = new Map();          // id -> [{ to, cost }]

const keyOf = (x, z) => `${Math.round(x)},${Math.round(z)}`;

function addNode(m, laneId) {
  const k = keyOf(m.x, m.z);
  if (NODE_KEY.has(k)) return NODE_KEY.get(k);
  const id = NODES.length;
  NODES.push({ ...m, laneId, id });
  NODE_KEY.set(k, id);
  ADJ.set(id, []);
  return id;
}

for (const lane of LANES) {
  let prev = null;
  for (const mark of lane.marks) {
    const id = addNode(resolveMark(mark), lane.id);
    if (prev !== null && prev !== id) {
      const a = NODES[prev], b = NODES[id];
      const c = segmentCost(a.x, a.z, b.x, b.z);
      ADJ.get(prev).push({ to: id, cost: c });
      ADJ.get(id).push({ to: prev, cost: c });
    }
    prev = id;
  }
}

// read-only views for tests/consumers
export function laneNodes() { return NODES.map((n) => ({ ...n })); }
export function laneEdges(id) { return (ADJ.get(id) || []).map((e) => ({ ...e })); }

// the original lane polylines (world), for on-corridor queries by the traffic
const LANE_POLYS = LANES.map((lane) => ({ id: lane.id, pts: lane.marks.map(resolveMark) }));

// nearest point on ANY lane corridor to a world point, with the local tangent
// (a yaw), corridor half-width, and chokepoint flag. Wrap-aware. For traffic:
// an idle merchant steers along `tangent`; pirates lurk at chokepoints.
export function nearestLanePoint(x, z) {
  let best = null;
  for (const lane of LANE_POLYS) {
    for (let i = 0; i < lane.pts.length - 1; i++) {
      const a = lane.pts[i], b = lane.pts[i + 1];
      const dx = a.x + dxWrap(a.x, b.x) - a.x; // b unwrapped into a's frame
      const dz = b.z - a.z;
      const pxu = a.x + dxWrap(a.x, x);
      const len2 = dx * dx + dz * dz;
      const t = len2 > 0 ? clamp(((pxu - a.x) * dx + (z - a.z) * dz) / len2, 0, 1) : 0;
      const nx = wrapX(a.x + dx * t), nz = a.z + dz * t;
      const d = Math.hypot(dxWrap(x, nx), z - nz);
      if (!best || d < best.dist) {
        best = {
          x: nx, z: nz, tangent: Math.atan2(dx, dz),
          width: a.width + (b.width - a.width) * t,
          choke: !!(a.choke || b.choke), laneId: lane.id, dist: d,
        };
      }
    }
  }
  return best;
}

export function chokepoints() {
  const out = [];
  for (const lane of LANE_POLYS) for (const p of lane.pts) if (p.choke) out.push({ x: p.x, z: p.z, laneId: lane.id });
  return out;
}

// nearest graph node to a world point (the on/off ramp)
export function nearestNode(x, z) {
  let best = -1, bestD = Infinity;
  for (const n of NODES) {
    const d = Math.hypot(dxWrap(x, n.x), n.z - z);
    if (d < bestD) { bestD = d; best = n.id; }
  }
  return best >= 0 ? { id: best, dist: bestD } : null;
}

// least-cost path over the node graph (small graph — plain O(V^2) Dijkstra)
function dijkstra(srcId, dstId) {
  const N = NODES.length;
  const dist = new Array(N).fill(Infinity);
  const prev = new Array(N).fill(-1);
  const seen = new Array(N).fill(false);
  dist[srcId] = 0;
  for (;;) {
    let u = -1, ud = Infinity;
    for (let i = 0; i < N; i++) if (!seen[i] && dist[i] < ud) { ud = dist[i]; u = i; }
    if (u < 0 || u === dstId) break;
    seen[u] = true;
    for (const e of ADJ.get(u)) {
      if (dist[u] + e.cost < dist[e.to]) { dist[e.to] = dist[u] + e.cost; prev[e.to] = u; }
    }
  }
  if (dist[dstId] === Infinity) return null;
  const path = [];
  for (let v = dstId; v >= 0; v = prev[v]) path.unshift(v);
  return { cost: dist[dstId], path };
}

// A lane must beat the direct line by this factor to be worth the detour, so
// short hops aren't dragged onto a highway (spec §1, §9).
export const LANE_MARGIN = 0.9;

// grace metres at a route's ends: the ship may lie in a harbour mouth, and
// the captain may click a beach — the leg's ENDS may touch land, its body not
const SHIP_GRACE = 300, CLICK_GRACE = 600;

// transit time of an ordered waypoint list sailed from a start point
function pathCost(fromX, fromZ, pts) {
  let c = 0, ax = fromX, az = fromZ;
  for (const p of pts) { c += segmentCost(ax, az, p.x, p.z); ax = p.x; az = p.z; }
  return c;
}

// The one entry point main.js calls at course-set. Returns an ordered list of
// world waypoints ending at the destination. Candidates, cheapest wins:
// direct rhumb line (only if it is honest water), on-ramp -> lane graph ->
// off-ramp (only if the ramps are honest water), and — whenever the rhumb
// line crosses LAND — the searoute.js sea road around it. The old router
// never asked the land question at all (and coastDistGame grows inland, so
// its cost model priced a continent as blue water): the helmsman would lay
// a course straight through Florida. (Dogleg-seek: later plan.)
export function route(fromX, fromZ, toX, toZ) {
  const directClear = seaLeg(fromX, fromZ, toX, toZ, SHIP_GRACE, CLICK_GRACE);
  const direct = directClear ? segmentCost(fromX, fromZ, toX, toZ) : Infinity;

  let lanePts = null, laneCost = Infinity;
  const on = nearestNode(fromX, fromZ);
  const off = nearestNode(toX, toZ);
  if (on && off && on.id !== off.id) {
    const g = dijkstra(on.id, off.id);
    if (g
      && seaLeg(fromX, fromZ, NODES[on.id].x, NODES[on.id].z, SHIP_GRACE, 0)
      && seaLeg(NODES[off.id].x, NODES[off.id].z, toX, toZ, 0, CLICK_GRACE)) {
      const onCost = segmentCost(fromX, fromZ, NODES[on.id].x, NODES[on.id].z);
      const offCost = segmentCost(NODES[off.id].x, NODES[off.id].z, toX, toZ);
      lanePts = [...g.path.map((id) => ({ x: NODES[id].x, z: NODES[id].z })), { x: toX, z: toZ }];
      laneCost = onCost + g.cost + offCost;
    }
  }

  if (directClear) {
    // today's behaviour exactly: the lane must beat the rhumb by the margin
    if (lanePts && laneCost < direct * LANE_MARGIN) return lanePts;
    return [{ x: toX, z: toZ }];
  }

  // the rhumb line crosses land: lay the sea road around it, and let the
  // lane compete on honest transit time
  const sea = seaRoute(fromX, fromZ, toX, toZ);
  const seaCost = sea ? pathCost(fromX, fromZ, sea) : Infinity;
  if (lanePts && laneCost < seaCost) return lanePts;
  if (sea) return sea;
  if (lanePts) return lanePts;
  // no road found (a landlocked click, or the search gave up): the old rhumb
  // line — the helm watch owns the sand, exactly as before
  return [{ x: toX, z: toZ }];
}
