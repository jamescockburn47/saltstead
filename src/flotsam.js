// Flotsam, bottles and rafts — pure, no THREE, no DOM. verify-flotsam.mjs
// guards it; flotsamlayer.js gives everything bodies.
//
// The ocean as a rumour medium (docs/PASSAGE.md): deterministic drifting
// objects seeded per cell + epoch, storms-style — the same waters carry the
// same wreckage for every client. CRATES come aboard by boathook alongside,
// small honest gold. BOTTLES take an E: a treasure map if none is held,
// else a rumour naming an unwon legend and its bearing, else a small purse
// — maps point players AT the world. RAFTS carry castaways with the same
// made-up minds as any swimmer (survivors.js law): joiners sign articles,
// the rest press a purse and ask for the next port.

import { unit2 } from './noise.js';
import { isLand, worldToLatLon } from './earth.js';

export const F_CELL = 3000;   // seeding cell, game metres
export const F_EPOCH = 300;   // a generation of wreckage
export const F_LIFE = 380;    // how long a piece rides before the sea takes it
export const HOOK_R = 16;     // a crate is boathooked alongside
export const BOTTLE_R = 14;   // a bottle wants the E and slow way
export const RAFT_R = 20;     // a raft is laid alongside like a rescue

// at most one object per cell-epoch: raft 1.5%, bottle 5%, crate 12%
function cellObject(cx, cz, e) {
  const roll = unit2(cx * 7.1 + e * 3.3, cz * 9.7 + e * 5.1);
  let kind = null;
  if (roll < 0.015) kind = 'raft';
  else if (roll < 0.065) kind = 'bottle';
  else if (roll < 0.185) kind = 'crate';
  if (!kind) return null;
  const px = (cx + 0.12 + 0.76 * unit2(cx * 3.9 + e * 7.7, cz * 1.7 + e)) * F_CELL;
  const pz = (cz + 0.12 + 0.76 * unit2(cx * 1.3 + e, cz * 5.9 + e * 11.1)) * F_CELL;
  const drift = unit2(cx + e * 13.7, cz + e * 3.1) * Math.PI * 2;
  return { id: `fl-${cx}-${cz}-${e}`, kind, px, pz, drift, born: e * F_EPOCH };
}

// everything afloat near (px, pz) at sim-time t: 3×3 cells, this generation
// and the last one's tail, drifted with age, never on land
export function flotsamNear(t, px, pz, r = 2400) {
  const out = [];
  const c0x = Math.floor((px - r) / F_CELL), c1x = Math.floor((px + r) / F_CELL);
  const c0z = Math.floor((pz - r) / F_CELL), c1z = Math.floor((pz + r) / F_CELL);
  const e0 = Math.floor(t / F_EPOCH);
  for (let cz = c0z; cz <= c1z; cz++) {
    for (let cx = c0x; cx <= c1x; cx++) {
      for (let e = e0 - 1; e <= e0; e++) {
        const o = cellObject(cx, cz, e);
        if (!o) continue;
        const age = t - o.born;
        if (age < 0 || age > F_LIFE) continue;
        const x = o.px + Math.sin(o.drift) * age * 0.15; // a slow honest set
        const z = o.pz + Math.cos(o.drift) * age * 0.15;
        if (Math.hypot(x - px, z - pz) > r) continue;
        const ll = worldToLatLon(x, z);
        if (isLand(ll.lat, ll.lon)) continue; // wreckage strands off-stage
        out.push({ id: o.id, kind: o.kind, x, z });
      }
    }
  }
  return out;
}

// a crate's worth, once hooked
export function crateValue(seed) {
  return 8 + Math.round(unit2(seed * 3.7, 11.3) * 22); // 8..30
}

// what the bottle holds. hasMap: a map already rides the chart table.
// legends: [{ name, dir }] unwon legends with true bearings (yarns.js shape).
// -> { kind: 'map' } | { kind: 'rumour', legend } | { kind: 'purse', gold }
export function bottleLead(seed, hasMap, legends = []) {
  if (!hasMap && unit2(seed * 5.3, 7.1) < 0.6) return { kind: 'map' };
  if (legends.length) {
    const l = legends[Math.floor(unit2(seed * 9.1, 3.3) * legends.length)];
    return { kind: 'rumour', legend: l };
  }
  return { kind: 'purse', gold: 15 + Math.round(unit2(seed * 1.9, 13.7) * 20) };
}

// who clings to the raft: 1–2 souls, minds already made up about your flag
// (the survivors.js law — piracy recruits from the sea's own casualties)
export function raftSouls(seed) {
  const n = 1 + (unit2(seed * 7.3, 5.9) < 0.45 ? 1 : 0);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ join: unit2(seed * 3.1 + i * 11.7, 17.1) < 0.4 });
  }
  return out;
}
