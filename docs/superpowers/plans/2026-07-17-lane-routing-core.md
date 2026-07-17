# Lane Routing Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the helmsman route through the fast blue water (not a naive rhumb line) and beat at the VMG-optimal angle, by adding an authored lane network with time-costed routing and wiring it into the course-set flow.

**Architecture:** A new pure module `src/lanes.js` holds an append-only lane table, builds a connectivity graph at load, and exposes `route(fromX,fromZ,toX,toZ)` that returns the cheaper of a direct rhumb line or a lane path (Dijkstra), where edge cost is **transit time** = Σ length ÷ `gaitFactor(coastDist)` — so deep water is cheap and the router prefers it. `src/helmsman.js` gains `helmRoute()` (follow a waypoint list) and the VMG-optimal beat. `src/main.js` computes a route at course-set and the helmsman follows it. This is the first of several plans for the spec `docs/superpowers/specs/2026-07-17-helmsman-lanes-design.md`; wind/current cost terms, dogleg fallback, currents, storms, traffic, and the hand-off come in later plans.

**Tech Stack:** Vanilla ES modules, Node for headless verify scripts (the repo's `scripts/verify-*.mjs` pattern), no test framework — verify scripts use a hand-rolled `ok(cond, msg)` + `process.exit(1)`. Pure modules take no THREE/DOM import.

**Scope note vs spec §5:** downwind-gybe VMG is deferred — in the current `sailing.js` point-of-sail curve the gain over a dead run is only ~4% (the run's 0.72 power is close to the broad-reach 0.9, so `cos` dominates at dead-downwind). This plan implements the upwind VMG fix (~2× win) only.

---

## REVISION (2026-07-17): wind folded in

**Why:** a probe confirmed that under *gait-only* cost, lanes never beat the direct
rhumb line across open ocean (a detour is just longer, and blue water is uniform gait).
Deep-water preference only bites where the straight line hugs a coast. "Rides the trade
lanes" and "escape the Caribbean eastward" are **wind** problems, so the wind field +
wind cost term are pulled into this increment. For router and helm to agree, the sailing
wind must be the same field, so `LiveWeather` is retired here too (spec §3). Currents and
storms remain later plans.

**Added / changed tasks (supersede where they overlap):**
- **Task 0 (bug from probe):** `verify-lanes` must exempt **port** marks from the
  `coastDist > 300` check — harbours are coastal (Havana `coastDist` = 2 m). Only bare
  sea-marks must be in open water.
- **Task A:** create `src/wind.js` — `windAt(x,z) → {from, speed}`, deterministic
  latitude-banded field (doldrums / NE-SE trades / horse latitudes / westerlies / polar
  easterlies), by interpolating a *blows-toward* vector so the direction rotates smoothly
  and calms fall out at ~30°. `+ verify-wind.mjs`.
- **Task B:** add the wind term to `lanes.js` `segmentCost` via `madeGoodFactor(course,
  windFrom)` (a beat costs its VMG; a reach/run its full power). `+ verify-lanes` gains a
  "a beating leg costs more than a reaching leg" assertion and a Caribbean→Europe route
  that prefers the north-about (westerlies) path. May require authoring a north-about lane.
- **Tasks 5–6** (VMG beat, `helmRoute`) unchanged.
- **Task 7 (expanded):** wire routing into `main.js` **and** set the sailing wind from
  `windAt` (keep `windProfile` for speed build), **remove `LiveWeather`** and the
  Open-Meteo poll, default `weatherState` to `'clear'` (storms are a later plan; no
  regression — it is already `'clear'` offline), retire `mapMarine`, update
  `verify-weather.mjs`.

The `lanes.js` module below is already built gait-only; Task B augments its `segmentCost`.

---

## File Structure

- **Create `src/lanes.js`** — lane data table, mark resolution, graph build, `segmentCost`, `nearestNode`, `route`. One responsibility: *where the sea roads are and how to route them*. No THREE/DOM.
- **Create `scripts/verify-lanes.mjs`** — headless gate for `lanes.js`.
- **Modify `src/helmsman.js`** — add the `BEAT` constant (VMG-optimal beat) replacing the pinch `CLOSE_HAULED`, and add `helmRoute()` to follow a waypoint list.
- **Modify `scripts/verify-helmsman.mjs`** — add VMG and route-following assertions.
- **Modify `src/main.js`** — `onCourse` computes and stores a route; the helmsman tick follows it.
- **Modify `package.json`** — register `verify-lanes` in the `verify` chain and a `verify:lanes` shortcut.

---

## Task 1: `lanes.js` — data + mark resolution

**Files:**
- Create: `src/lanes.js`
- Test: `scripts/verify-lanes.mjs` (created in Task 4; assertions staged here are added then)

- [ ] **Step 1: Create `src/lanes.js` with the data table and `resolveMark`**

```js
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
import { PORTS } from './ports.js';

export const DEFAULT_WIDTH = 8000; // generous by default (spec §1); narrow only where authored

export const LANES = [
  { id: 'treasure-fleet', name: 'The Treasure Fleet', marks: [
    { port: 'havana' },
    { lat: 28, lon: -72, width: 12000 },
    { lat: 34, lon: -40, width: 15000 },
    { lat: 37, lon: -12, width: 4000, choke: true },
    { port: 'cadiz' },
  ] },
  { id: 'manila-galleon', name: 'The Manila Galleon', marks: [
    { port: 'manila' },
    { lat: 18, lon: 150, width: 14000 },
    { lat: 20, lon: -150, width: 15000 },
    { lat: 18, lon: -110, width: 8000 },
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
```

- [ ] **Step 2: Commit**

```bash
git add src/lanes.js
git commit -m "feat(lanes): lane data table and mark resolution"
```

---

## Task 2: `lanes.js` — graph build + segment cost

**Files:**
- Modify: `src/lanes.js`

- [ ] **Step 1: Append `segmentCost` and the graph build to `src/lanes.js`**

```js
// --- transit-cost model (gait-only for now; wind/current terms land later) ---
// Time to sail a straight world segment = Σ subLen / gaitFactor(coastDist). The
// hull speed is a constant across all edges, so it cancels in every comparison
// and is omitted. Deep water (high gait) is cheap; coast-hugging is dear.
const SAMPLE_M = 2000; // sample the seabed every ~2 km

export function segmentCost(ax, az, bx, bz) {
  const len = Math.hypot(bx - ax, bz - az);
  if (len === 0) return 0;
  const n = Math.max(1, Math.ceil(len / SAMPLE_M));
  let cost = 0;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    const ll = worldToLatLon(x, z);
    cost += (len / n) / gaitFactor(coastDistGame(ll.lat, ll.lon));
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
```

- [ ] **Step 2: Commit**

```bash
git add src/lanes.js
git commit -m "feat(lanes): connectivity graph and gait-weighted segment cost"
```

---

## Task 3: `lanes.js` — nearest node, Dijkstra, and `route`

**Files:**
- Modify: `src/lanes.js`

- [ ] **Step 1: Append `nearestNode`, `dijkstra`, and `route` to `src/lanes.js`**

```js
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
```

- [ ] **Step 2: Commit**

```bash
git add src/lanes.js
git commit -m "feat(lanes): nearest-node, Dijkstra, and route() with direct fallback"
```

---

## Task 4: `verify-lanes.mjs` + gate wiring

**Files:**
- Create: `scripts/verify-lanes.mjs`
- Modify: `package.json`

- [ ] **Step 1: Create `scripts/verify-lanes.mjs`**

```js
// verify-lanes: every mark afloat, the graph connects, segment cost prefers
// deep water, route() rides a lane when it helps and falls back to the direct
// rhumb line when it doesn't, and it is deterministic.
import { LANES, resolveMark, segmentCost, nearestNode, route, laneNodes } from '../src/lanes.js';
import { isLand, coastDistGame, latLonToWorld } from '../src/earth.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// every authored mark sits on open water, clear of the coast
for (const lane of LANES) {
  for (const mark of lane.marks) {
    const m = resolveMark(mark);
    const ll = { lat: -m.z / 444, lon: m.x / 444 }; // worldToLatLon inline (M_PER_DEG=444)
    ok(!isLand(ll.lat, ll.lon), `${lane.id}: a mark is afloat`);
    ok(coastDistGame(ll.lat, ll.lon) > 300, `${lane.id}: a mark is off the beach`);
  }
}

// deep water is cheaper per metre than coast-hugging: a mid-Atlantic leg costs
// less than a same-length leg dragged along a coast
{
  const midA = latLonToWorld(30, -45), midB = latLonToWorld(31, -45);   // deep
  const deep = segmentCost(midA.x, midA.z, midB.x, midB.z);
  const cstA = latLonToWorld(23.2, -82.4), cstB = latLonToWorld(24.1, -82.4); // off Havana
  const near = segmentCost(cstA.x, cstA.z, cstB.x, cstB.z);
  ok(deep < near, `deep water is cheaper per leg (${deep.toFixed(1)} < ${near.toFixed(1)})`);
}

// route() rides the treasure-fleet lane from off Havana to off Cádiz
{
  const a = latLonToWorld(23.5, -82.0), b = latLonToWorld(37.0, -9.0);
  const r = route(a.x, a.z, b.x, b.z);
  ok(r.length > 1, `a transatlantic course rides a lane (${r.length} legs)`);
  const last = r[r.length - 1];
  ok(Math.abs(last.x - b.x) < 1 && Math.abs(last.z - b.z) < 1, 'the last leg is the destination');
}

// a short coastal hop takes the direct line — no lane detour, no regression
{
  const a = latLonToWorld(23.2, -82.4), b = latLonToWorld(23.0, -82.0);
  const r = route(a.x, a.z, b.x, b.z);
  ok(r.length === 1, 'a short hop sails direct');
}

// deterministic: same inputs -> identical route
{
  const a = latLonToWorld(23.5, -82.0), b = latLonToWorld(37.0, -9.0);
  const r1 = JSON.stringify(route(a.x, a.z, b.x, b.z));
  const r2 = JSON.stringify(route(a.x, a.z, b.x, b.z));
  ok(r1 === r2, 'route is deterministic');
}

// the graph has nodes and nearestNode resolves
ok(laneNodes().length >= 4, 'the graph has nodes');
ok(nearestNode(latLonToWorld(23.5, -82).x, latLonToWorld(23.5, -82).z) !== null, 'nearestNode resolves');

if (failed) { console.error(`verify-lanes: ${failed} FAILED`); process.exit(1); }
console.log('verify-lanes: OK — marks afloat, graph connects, deep water preferred, route rides lanes and falls back');
```

- [ ] **Step 2: Run it and confirm green**

Run: `npm run verify:lanes` (added next step) — or directly:
Run: `node scripts/verify-lanes.mjs`
Expected: `verify-lanes: OK — ...` and exit 0. If a mark FAILs "afloat", nudge that mark's lat/lon into open water and re-run.

- [ ] **Step 3: Register the check in `package.json`**

In `package.json`, add the shortcut after the `verify:helmsman` line (line 51):

```json
    "verify:helmsman": "node scripts/verify-helmsman.mjs",
    "verify:lanes": "node scripts/verify-lanes.mjs",
    "verify:survivors": "node scripts/verify-survivors.mjs"
```

And append `&& node scripts/verify-lanes.mjs` to the end of the `"verify"` chain (line 12), just before the closing quote.

- [ ] **Step 4: Run the whole gate**

Run: `npm run verify`
Expected: every check prints OK, including `verify-lanes`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-lanes.mjs package.json
git commit -m "test(lanes): verify-lanes gate and wiring"
```

---

## Task 5: helmsman — the VMG-optimal beat (upwind)

**Files:**
- Modify: `src/helmsman.js:15` (the `CLOSE_HAULED` constant and its uses)
- Modify: `scripts/verify-helmsman.mjs`

- [ ] **Step 1: Write the failing test — a beat makes more VMG than the old pinch**

Append to `scripts/verify-helmsman.mjs` (before the final `if (failed)` block):

```js
// the VMG fix: the beat angle the helmsman holds makes MORE progress to
// windward than the old pinch (IRONS + 0.12). Reconstruct the intended
// heading from the rudder error at yaw 0, dead upwind.
{
  const { pointOfSailPower } = await import('../src/sailing.js');
  const oldPinch = 0.52 + 0.12; // the retired CLOSE_HAULED
  const o = helmOrder(0, 0, 0, 0, 4000, 0, 5);   // mark dead upwind, wind from 0
  const want = Math.abs(o.rudder / 1.6);          // reconstructed close-hauled angle
  const vmg = (a) => pointOfSailPower(a) * Math.cos(a);
  ok(vmg(want) > vmg(oldPinch) * 1.4, `the beat beats the pinch on VMG (${vmg(want).toFixed(2)} vs ${vmg(oldPinch).toFixed(2)})`);
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `node scripts/verify-helmsman.mjs`
Expected: FAIL — `the beat beats the pinch on VMG` (the current code still holds the pinch, so `want ≈ oldPinch` and the ratio is 1.0, not > 1.4).

- [ ] **Step 3: Replace the pinch with the VMG-optimal beat in `src/helmsman.js`**

Change the import line 11 to add `pointOfSailPower`:

```js
import { IRONS, optimalTrim, pointOfSailPower, wrapAngle } from './sailing.js';
```

Replace line 15 (`const CLOSE_HAULED = IRONS + 0.12; ...`) with:

```js
// The VMG-optimal beat: the heading off the eye that maximises progress made
// good to windward, argmax_rel pointOfSailPower(rel)*cos(rel) ≈ 0.87 rad (~50°).
// Static — the point-of-sail curve is fixed, and wind/gait scale every heading
// alike. Replaces the old CLOSE_HAULED pinch (~37°, ~half the achievable VMG).
export const BEAT = (() => {
  let best = IRONS, bv = -1;
  for (let a = IRONS; a <= 1.4; a += 0.005) {
    const v = pointOfSailPower(a) * Math.cos(a);
    if (v > bv) { bv = v; best = a; }
  }
  return best;
})();
```

Then replace the two remaining uses of `CLOSE_HAULED` in `helmOrder` (the `if (Math.abs(offEye) < CLOSE_HAULED)` test on ~line 32 and `want = eye + board * CLOSE_HAULED` on ~line 38) with `BEAT`:

```js
  if (Math.abs(offEye) < BEAT) {
    // the mark is inside the beat: hold the best board, swap on the clock
    tacking = true;
    const board = Math.abs(offEye) < 0.08
      ? (Math.floor(t / TACK_S) % 2 ? 1 : -1)
      : Math.sign(offEye);
    want = eye + board * BEAT;
  }
```

- [ ] **Step 4: Run to verify it passes (and nothing else broke)**

Run: `node scripts/verify-helmsman.mjs`
Expected: PASS including `the beat beats the pinch on VMG`, and the existing voyage/no-go/arrival checks still OK.

- [ ] **Step 5: Commit**

```bash
git add src/helmsman.js scripts/verify-helmsman.mjs
git commit -m "fix(helmsman): beat at the VMG-optimal angle, not the pinch"
```

---

## Task 6: helmsman — follow a route (`helmRoute`)

**Files:**
- Modify: `src/helmsman.js`
- Modify: `scripts/verify-helmsman.mjs`

- [ ] **Step 1: Write the failing test — a multi-waypoint route advances and arrives**

Append to `scripts/verify-helmsman.mjs` (before the final `if (failed)` block):

```js
// helmRoute follows a waypoint list: it advances past a reached leg, and only
// reports arrived at the final mark.
{
  const legs = [{ x: 0, z: 500 }, { x: 0, z: 4000 }];
  const early = helmRoute({ yaw: 0, x: 0, z: 0 }, legs, 0, 2.4, 0);
  ok(early.next === 0 && !early.arrived, 'far from all marks, steer for the first, not arrived');
  const atFirst = helmRoute({ yaw: 0, x: 0, z: 500 }, legs, 0, 2.4, 0);
  ok(atFirst.next === 1 && !atFirst.arrived, 'reaching the first leg advances to the second');
  const atLast = helmRoute({ yaw: 0, x: 0, z: 4000 }, legs, 1, 2.4, 0);
  ok(atLast.arrived, 'reaching the final leg is arrival');
}
```

Also add `helmRoute` to the import at the top of `scripts/verify-helmsman.mjs`:

```js
import { helmOrder, helmRoute, ARRIVE_R, TACK_S } from '../src/helmsman.js';
```

- [ ] **Step 2: Run to verify it fails**

Run: `node scripts/verify-helmsman.mjs`
Expected: FAIL — `helmRoute` is not exported / not a function.

- [ ] **Step 3: Add `helmRoute` to `src/helmsman.js`**

Append after `helmOrder`:

```js
// Follow an ordered list of waypoints. ship: { yaw, x, z }. route: [{x,z},…].
// i: the current target index (the caller stores it). Advances past any legs
// already reached (except the last), then issues a helmOrder for the active
// leg. `arrived` is true ONLY at the final waypoint; `next` is the (possibly
// advanced) index for the caller to keep.
export function helmRoute(ship, route, i, windFrom, t = 0) {
  let idx = Math.max(0, Math.min(i, route.length - 1));
  while (idx < route.length - 1) {
    const m = route[idx];
    if (Math.hypot(m.x - ship.x, m.z - ship.z) <= ARRIVE_R) idx++;
    else break;
  }
  const m = route[idx];
  const o = helmOrder(ship.yaw, ship.x, ship.z, m.x, m.z, windFrom, t);
  return { ...o, next: idx, arrived: o.arrived && idx === route.length - 1 };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node scripts/verify-helmsman.mjs`
Expected: PASS including the three `helmRoute` assertions.

- [ ] **Step 5: Commit**

```bash
git add src/helmsman.js scripts/verify-helmsman.mjs
git commit -m "feat(helmsman): helmRoute follows a waypoint list"
```

---

## Task 7: wire routing into `main.js`

**Files:**
- Modify: `src/main.js:18` (import), `src/main.js:317-329` (`onCourse`), `src/main.js:1660-1677` (the helmsman tick)

- [ ] **Step 1: Import `route` and `helmRoute`**

At `src/main.js:18`, change:

```js
import { helmOrder } from './helmsman.js';
```
to:
```js
import { helmOrder, helmRoute } from './helmsman.js';
import { route as laneRoute } from './lanes.js';
```

- [ ] **Step 2: Compute and store a route when the course is set**

In `onCourse` (around `src/main.js:322-324`), after `const w = latLonToWorld(lat, lon);` and setting `this.course`, add the route + index:

```js
      const w = latLonToWorld(lat, lon);
      this.course = { x: w.x, z: w.z };
      this.route = laneRoute(this.ship.x, this.ship.z, w.x, w.z);
      this.routeLeg = 0;
      this.maps.course = { lat, lon };
```

- [ ] **Step 3: Follow the route in the helmsman tick**

Replace the `helmOrder` call block at `src/main.js:1666-1677` (inside `else if (this.course && this.crew >= 1 && ...)`):

```js
      const o = helmRoute({ yaw: this.ship.yaw, x: this.ship.x, z: this.ship.z },
        this.route, this.routeLeg, this.wind.from, t);
      this.routeLeg = o.next;
      if (o.arrived) {
        this.say('THE MARK IS MADE — the helmsman heaves to and hands you the ship', 7);
        this.logEvent('The helmsman made the set course');
        this.course = null;
        this.route = null;
        this.maps.course = null;
        this.ship.trim = 0;
      } else {
        this.ship.rudder += (o.rudder - this.ship.rudder) * Math.min(1, dt * 4);
        this.ship.trim += (o.trim - this.ship.trim) * Math.min(1, dt * 0.8);
      }
```

- [ ] **Step 4: Initialise `this.route` where `this.course` is initialised**

At `src/main.js:316` (`this.course = null;`), add below it:

```js
    this.course = null;
    this.route = null;
    this.routeLeg = 0;
```

- [ ] **Step 5: Verify the app boots and a course rides a lane**

Run: `npm run dev` (starts Vite on 5173). In the browser console once loaded:
```js
saltstead.ship.x = -36000; saltstead.ship.z = -10300; // off Havana
// set a course near Cádiz via the chart, or:
saltstead && console.log('handle live');
```
Expected: no console errors on boot; setting a transatlantic course logs "COURSE SET" and the ship begins sailing the lane. (A dedicated `live-lanes.mjs` puppeteer check is a later plan; this step is a manual smoke test.)

- [ ] **Step 6: Run the full gate**

Run: `npm run verify`
Expected: all checks green, including `verify-lanes` and `verify-helmsman`.

- [ ] **Step 7: Commit**

```bash
git add src/main.js
git commit -m "feat(main): the helmsman follows a lane route set on the chart"
```

---

## Self-Review

**Spec coverage (this plan's slice):**
- Lane data + graph + `route()` with direct fallback — Tasks 1–3 ✓ (spec §1, "Direct fallback only" per build-order phase 1).
- Edge cost prefers deep water (the audit's Gap 2) — Task 2 `segmentCost`, asserted in Task 4 ✓ (spec §10 scenario B).
- No regression on short/off-lane hops — Task 4 direct-hop test ✓ (spec §10 scenario D).
- VMG-optimal beat (Gap 1) — Task 5 ✓ (spec §5). Downwind gybe deferred (documented above).
- Helmsman follows a route + wiring — Tasks 6–7 ✓ (spec §5, §7).
- Deferred to later plans (correctly out of this slice): wind/current cost terms, dogleg seek, currents, wind field, storms, traffic, hand-off/helmwatch, `helmSkill`, `live-lanes`.

**Placeholder scan:** none — every step carries the actual code/command.

**Type consistency:** `route()` returns `[{x,z}]`; `main.js` stores it as `this.route` and passes `this.routeLeg` to `helmRoute(ship, route, i, windFrom, t)`, which returns `{rudder,trim,arrived,tacking,next}`; `main.js` reads `o.next`/`o.arrived`/`o.rudder`/`o.trim`. `BEAT` exported from `helmsman.js`, used internally. `segmentCost`/`nearestNode`/`laneNodes` names match between `lanes.js` and `verify-lanes.mjs`. Consistent.

**Note for the executor:** `verify-lanes.mjs` depends on the real `earthdata.js` coastline tables (via `coastDistGame`). If a seeded lane mark asserts as on-land, move it to open water (a degree or two seaward) — the marks above are placed by eye and may need a nudge. This is authoring, not a code bug.
