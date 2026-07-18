// The sea road around the land — pure, no THREE, no DOM. verify-searoute.mjs
// guards it.
//
// The router's missing half: lanes.js costs gait, wind and current, but until
// this module NOTHING ever asked whether a leg crossed a coastline — and
// coastDistGame grows INLAND too, so the cost model priced the middle of a
// continent as cheap blue water. The helmsman would lay a course straight
// through Florida. This module answers two questions:
//
//   seaLeg(ax, az, bx, bz)  — is this straight world segment all honest water?
//   seaRoute(fx, fz, tx, tz) — waypoints around the land, or null
//
// seaRoute is a lazy A* over a 0.1-degree lat/lon grid (44 game metres a cell
// — fine enough to thread Gibraltar), 8-connected and wrap-aware across the
// antimeridian. Edge cost is DISTANCE with a coast-standoff surcharge, so the
// found path is the short sea road that stands decently off the beach — and
// bows offshore toward the gait bands when the detour is cheap. Distance cost
// keeps the heuristic exact in open water, so the search stays a tight
// ellipse instead of flooding a gulf (a time-based cost varies 20x with
// gait/wind and blinds the heuristic — measured: 300k cells to not round
// Florida). The TIME preference — wind, current, deep-water gait — lives
// where the design put it: the lane graph, and lanes.route()'s candidate
// ranking by segmentCost over whatever this module returns.
//
// The raw cell staircase is string-pulled afterwards: greedily skip ahead as
// far as the water stays open, so a route comes back as a few honest legs.
//
// Deterministic by construction: pure functions of position, stable
// tie-breaking, no Date.now, no Math.random.

import { isLand, coastDistGame, latLonToWorld, worldToLatLon, dxWrap, wrapX, M_PER_DEG } from './earth.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// ---- the grid ----
export const CELL_DEG = 0.1;                    // 44.4 game metres a cell
const GRID_W = Math.round(360 / CELL_DEG);      // columns wrap east-west
const GRID_H = Math.round(180 / CELL_DEG);
const CELL_M = CELL_DEG * M_PER_DEG;            // world metres per cell step

const colOf = (lon) => ((Math.floor((lon + 180) / CELL_DEG) % GRID_W) + GRID_W) % GRID_W;
const rowOf = (lat) => clamp(Math.floor((90 - lat) / CELL_DEG), 0, GRID_H - 1);
const lonOf = (col) => -180 + (col + 0.5) * CELL_DEG;
const latOf = (row) => 90 - (row + 0.5) * CELL_DEG;
const cellId = (col, row) => row * GRID_W + col;

// ---- lazy per-cell facts (persist across queries — the world never changes) ----
const seaMemo = new Map();   // cellId -> bool: is the cell centre honest water?
function cellSea(col, row) {
  const id = cellId(col, row);
  let v = seaMemo.get(id);
  if (v === undefined) {
    v = !isLand(latOf(row), lonOf(col));
    seaMemo.set(id, v);
  }
  return v;
}

// coastDist is the dear query (an expanding ring walk over the coastline
// index). Two tiers: a 1-degree block cache answers the open ocean in one
// walk per HUNDRED cells; only blocks that report the coast within reach
// re-query per cell, where the walk is short anyway.
const BLOCK = 10;            // cells per block side = 1 degree
const blockMemo = new Map(); // blockId -> coastDist at the block centre
const coastMemo = new Map(); // cellId -> coastDist (near-coast cells only)
const BLOCK_DIAG = BLOCK * CELL_M * 0.75;
function cellCoast(col, row) {
  const bc = Math.floor(col / BLOCK), br = Math.floor(row / BLOCK);
  const bid = br * (GRID_W / BLOCK) + bc;
  let bd = blockMemo.get(bid);
  if (bd === undefined) {
    bd = coastDistGame(latOf(br * BLOCK + BLOCK / 2), lonOf(bc * BLOCK + BLOCK / 2));
    blockMemo.set(bid, bd);
  }
  if (bd > 2500 + BLOCK_DIAG) return bd; // gait is saturated out here — exact is wasted work
  const id = cellId(col, row);
  let d = coastMemo.get(id);
  if (d === undefined) {
    d = coastDistGame(latOf(row), lonOf(col));
    coastMemo.set(id, d);
  }
  return d;
}

// the per-metre surcharge for hugging the shore: the laid course stands off
// the beach (grounding bites inside ~400 m) and bows gently seaward toward
// the faster gait bands when the detour is cheap. Memoized per cell.
const penMemo = new Map();   // cellId -> surcharge multiplier
function cellPenalty(col, row) {
  const id = cellId(col, row);
  let p = penMemo.get(id);
  if (p === undefined) {
    const coast = cellCoast(col, row);
    p = coast < 250 ? 4 : coast < 500 ? 2 : coast < 1200 ? 1.35 : coast < 2500 ? 1.12 : 1;
    penMemo.set(id, p);
  }
  return p;
}

// ---- seaLeg: is a straight world segment all water? ----
// Walks the segment at sub-cell steps against the SAME sea grid the A*
// sails, so a smoothed leg can never cross a cell the search itself would
// have refused (bare point-sampling of isLand stepped clean over the
// Gibraltar tongue when a leg crossed it obliquely). skipA / skipB exempt
// the first / last metres — a leg may legitimately END on a beach (the
// captain clicked one) or leave a harbour mouth.
const LEG_STEP = CELL_M * 0.4;
export function seaLeg(ax, az, bx, bz, skipA = 0, skipB = 0) {
  const dx = dxWrap(ax, bx);
  const len = Math.hypot(dx, bz - az);
  if (len === 0) return true;
  const n = Math.max(1, Math.ceil(len / LEG_STEP));
  for (let i = 0; i <= n; i++) {
    const t = i / n, s = t * len;
    if (s < skipA || len - s < skipB) continue;
    const ll = worldToLatLon(wrapX(ax + dx * t), az + (bz - az) * t);
    if (!cellSea(colOf(ll.lon), rowOf(ll.lat))) return false;
  }
  return true;
}

// ---- the A* itself ----
// 8-connected; edge cost = step metres x the standoff surcharge. With a
// distance cost the straight-line heuristic is EXACT over open water, so the
// search expands only the tight ellipse a blocked course genuinely forces.
// Determinism: the heap breaks ties on insertion order.
const MAX_EXPAND = 300000;   // give up past this many cells — caller falls back
const NEI = [
  [1, 0, CELL_M], [-1, 0, CELL_M], [0, 1, CELL_M], [0, -1, CELL_M],
  [1, 1, CELL_M * Math.SQRT2], [1, -1, CELL_M * Math.SQRT2],
  [-1, 1, CELL_M * Math.SQRT2], [-1, -1, CELL_M * Math.SQRT2],
];

// binary min-heap of [f, seq, col, row] — seq keeps ties deterministic
class Heap {
  constructor() { this.a = []; }
  push(v) {
    const a = this.a;
    let i = a.length;
    a.push(v);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] < v[0] || (a[p][0] === v[0] && a[p][1] < v[1])) break;
      a[i] = a[p]; i = p;
    }
    a[i] = v;
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        if (l >= a.length) break;
        let c = l;
        if (r < a.length && (a[r][0] < a[l][0] || (a[r][0] === a[l][0] && a[r][1] < a[l][1]))) c = r;
        if (last[0] < a[c][0] || (last[0] === a[c][0] && last[1] <= a[c][1])) break;
        a[i] = a[c]; i = c;
      }
      a[i] = last;
    }
    return top;
  }
  get size() { return this.a.length; }
}

// nearest sailable cell to a world point, spiralling out. null past maxR cells.
function snapToSea(x, z, maxR = 30) {
  const ll = worldToLatLon(x, z);
  const c0 = colOf(ll.lon), r0 = rowOf(ll.lat);
  for (let r = 0; r <= maxR; r++) {
    for (let row = r0 - r; row <= r0 + r; row++) {
      if (row < 0 || row >= GRID_H) continue;
      for (let dc = -r; dc <= r; dc++) {
        if (Math.max(Math.abs(dc), Math.abs(row - r0)) !== r) continue;
        const col = ((c0 + dc) % GRID_W + GRID_W) % GRID_W;
        if (cellSea(col, row)) return { col, row };
      }
    }
  }
  return null;
}

// search counters for the verify gate's eyes only — gameplay never reads them
export const _stats = { expanded: 0, found: false };

// wrap-aware world distance between cell centres / points
function cellDist(col, row, gx, gz) {
  const w = latLonToWorld(latOf(row), lonOf(col));
  return Math.hypot(dxWrap(w.x, gx), gz - w.z);
}

// The route around the land: ordered world waypoints from near (fx,fz) to
// EXACTLY (tx,tz), or null (unreachable / the search gave up). The last leg
// is appended verbatim even when the click is a beach or a river — helmwatch
// owns the hand-back at pilotage water, exactly as a harbour approach works.
export function seaRoute(fx, fz, tx, tz) {
  const from = snapToSea(fx, fz);
  const to = snapToSea(tx, tz);
  if (!from || !to) return null;
  const goal = latLonToWorld(latOf(to.row), lonOf(to.col));
  const goalId = cellId(to.col, to.row);

  const gScore = new Map(), cameFrom = new Map();
  const open = new Heap();
  let seq = 0;
  const startId = cellId(from.col, from.row);
  gScore.set(startId, 0);
  open.push([cellDist(from.col, from.row, goal.x, goal.z), seq++, from.col, from.row]);

  let expanded = 0, found = false;
  while (open.size) {
    const [, , col, row] = open.pop();
    const id = cellId(col, row);
    if (id === goalId) { found = true; break; }
    if (++expanded > MAX_EXPAND) break;
    _stats.expanded = expanded;
    const g = gScore.get(id);
    const pen = cellPenalty(col, row);
    for (const [dc, dr, step] of NEI) {
      const nrow = row + dr;
      if (nrow < 0 || nrow >= GRID_H) continue;
      const ncol = ((col + dc) % GRID_W + GRID_W) % GRID_W;
      if (!cellSea(ncol, nrow)) continue;
      const ng = g + step * pen;
      const nid = cellId(ncol, nrow);
      const old = gScore.get(nid);
      if (old !== undefined && old <= ng) continue;
      gScore.set(nid, ng);
      cameFrom.set(nid, id);
      open.push([ng + cellDist(ncol, nrow, goal.x, goal.z), seq++, ncol, nrow]);
    }
  }
  _stats.found = found;
  if (!found) return null;

  // walk the path back, as world points
  const cells = [];
  for (let id = goalId; id !== undefined; id = cameFrom.get(id)) {
    const row = Math.floor(id / GRID_W), col = id % GRID_W;
    const w = latLonToWorld(latOf(row), lonOf(col));
    cells.unshift({ x: w.x, z: w.z });
  }

  // string-pull: from each kept point greedily reach as FAR ahead as the
  // water stays open, so the staircase collapses to a few honest legs
  const out = [];
  let i = 0;
  while (i < cells.length - 1) {
    let j = cells.length - 1;
    for (; j > i + 1; j--) {
      if (seaLeg(cells[i].x, cells[i].z, cells[j].x, cells[j].z)) break;
    }
    out.push(cells[j]);
    i = j;
  }

  // end EXACTLY at the asked-for destination (the click), tolerating a beach
  // at the very end; drop the snapped goal cell if the true click supersedes it
  if (out.length && seaLeg(out[out.length - 1].x, out[out.length - 1].z, tx, tz, 0, 600)) {
    if (out.length >= 2 && seaLeg(out[out.length - 2].x, out[out.length - 2].z, tx, tz, 0, 600)) out.pop();
    out.push({ x: wrapX(tx), z: tz });
  } else {
    out.push({ x: wrapX(tx), z: tz });
  }
  return out;
}
