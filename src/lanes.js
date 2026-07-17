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

import { latLonToWorld, worldToLatLon, coastDistGame, gaitFactor } from './earth.js';
import { madeGoodFactor } from './sailing.js';
import { windAt } from './wind.js';
import { currentAt } from './currents.js';
import { PORTS } from './ports.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export const DEFAULT_WIDTH = 8000; // generous by default (spec §1); narrow only where authored

export const LANES = [
  { id: 'treasure-fleet', name: 'The Treasure Fleet', marks: [
    { port: 'havana' },
    { lat: 28, lon: -72, width: 12000 },
    { lat: 34, lon: -40, width: 15000 },
    { lat: 37, lon: -12, width: 4000, choke: true },
    { port: 'cadiz' },
  ] },
  // NB: no lane may straddle +/-180 — the map does not wrap (earth.js: x=lon*444),
  // so a dateline-crossing edge inverts into a wrong-way sweep across the whole
  // world. A trans-Pacific galleon lane needs proper wrap handling (later); for
  // now the second lane is the North Atlantic packet run, all open ocean.
  { id: 'north-atlantic', name: 'The North Atlantic Packet', marks: [
    { port: 'boston' },
    { lat: 44, lon: -50, width: 14000 },
    { lat: 49, lon: -22, width: 12000, choke: true },
    { port: 'bristol' },
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
  const len = Math.hypot(bx - ax, bz - az);
  if (len === 0) return 0;
  const heading = Math.atan2(bx - ax, bz - az); // yaw of the course (sin,cos = x,z)
  const n = Math.max(1, Math.ceil(len / SAMPLE_M));
  let cost = 0;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
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

// nearest graph node to a world point (the on/off ramp)
export function nearestNode(x, z) {
  let best = -1, bestD = Infinity;
  for (const n of NODES) {
    const d = Math.hypot(n.x - x, n.z - z);
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

// The one entry point main.js calls at course-set. Returns an ordered list of
// world waypoints ending at the destination. Cheaper of: direct rhumb line, or
// on-ramp -> lane graph -> off-ramp -> destination. (Dogleg-seek: later plan.)
export function route(fromX, fromZ, toX, toZ) {
  const direct = segmentCost(fromX, fromZ, toX, toZ);
  const on = nearestNode(fromX, fromZ);
  const off = nearestNode(toX, toZ);
  if (on && off && on.id !== off.id) {
    const g = dijkstra(on.id, off.id);
    if (g) {
      const onCost = segmentCost(fromX, fromZ, NODES[on.id].x, NODES[on.id].z);
      const offCost = segmentCost(NODES[off.id].x, NODES[off.id].z, toX, toZ);
      if (onCost + g.cost + offCost < direct * LANE_MARGIN) {
        const pts = g.path.map((id) => ({ x: NODES[id].x, z: NODES[id].z }));
        return [...pts, { x: toX, z: toZ }];
      }
    }
  }
  return [{ x: toX, z: toZ }];
}
