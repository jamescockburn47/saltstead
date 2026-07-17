// Harbours — pure, no THREE, no DOM. verify-harbour.mjs guards it.
// Every port (pirate haven or honest dockyard) gets a REAL waterfront, so
// putting in means coming alongside, not running up to an empty bank: a
// stone quay set on the shoreline nearest the anchorage, a timber jetty
// running out into the water, warehouses on the ground behind, bollards
// along the quay lip, and a harbour light at the jetty head.
// Deterministic per port (invariant 6): same layout, every client.

import { elevation, latLonToWorld, worldToLatLon } from './earth.js';
import { unit2 } from './noise.js';
import { LEGENDS } from './legends.js';
import { PORTS } from './ports.js';

// everywhere a captain can put in: the four havens and the honest dockyards
export const HARBOURED = LEGENDS.filter((l) => l.kind === 'haven').concat(PORTS);

const SCAN_R = 1400;      // hunt this far from the anchorage for a shore
const STEP = 24;          // coarse march step along each bearing
export const QUAY_W = 64, QUAY_D = 12, QUAY_TOP = 2.6;
export const JETTY_W = 5, JETTY_TOP = 1.7;

const elevAt = (x, z) => { const g = worldToLatLon(x, z); return elevation(g.lat, g.lon); };

// deterministic per-port dice: fold the id into a lane of unit2 rolls
function dice(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  const lane = (h >>> 0) % 46340;
  let n = 0;
  return () => unit2(lane, n++);
}

export function harbourLayout(port) {
  const a = latLonToWorld(port.lat, port.lon);
  // 32 bearings marched outward: the nearest shore wins (ties: lowest bearing)
  let best = null;
  for (let k = 0; k < 32; k++) {
    const th = (k / 32) * Math.PI * 2;
    const dx = Math.sin(th), dz = Math.cos(th);
    for (let r = STEP; r <= SCAN_R; r += STEP) {
      if (elevAt(a.x + dx * r, a.z + dz * r) > 0.5) {
        if (!best || r < best.r) best = { r, dx, dz };
        break;
      }
    }
  }
  if (!best) return { ok: false };
  // refine the waterline crossing along the winning ray
  let lo = best.r - STEP, hi = best.r;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (elevAt(a.x + best.dx * mid, a.z + best.dz * mid) > 0) hi = mid; else lo = mid;
  }
  const shoreR = hi;
  const D = { x: best.dx, z: best.dz };            // unit vector, water -> land
  const L = { x: D.z, z: -D.x };                   // along-shore lateral
  const S = { x: a.x + D.x * shoreR, z: a.z + D.z * shoreR };
  const yaw = Math.atan2(D.x, D.z);                // local +z faces landward

  const roll = dice(port.id);
  // stone quay just landward of the waterline, long axis along the shore
  const quay = { x: S.x + D.x * (QUAY_D * 0.35), z: S.z + D.z * (QUAY_D * 0.35),
    yaw, w: QUAY_W, d: QUAY_D, top: QUAY_TOP };
  // timber jetty running out into the water from the quay face
  const jl = Math.max(20, Math.min(52, shoreR * 0.8));
  const jetty = { x: S.x - D.x * (jl / 2), z: S.z - D.z * (jl / 2),
    yaw, len: jl, w: JETTY_W, top: JETTY_TOP };
  const beacon = { x: S.x - D.x * (jl + 4), z: S.z - D.z * (jl + 4), h: 9 };

  // warehouses on the ground behind the quay — a wet slot (narrow spit,
  // riverbank behind the shore) walks itself landward until it finds dry
  // footing, so even Sainte-Marie's sliver of an island builds its row
  const buildings = [];
  const want = 4 + Math.floor(roll() * 3);
  for (let i = 0; i < 14 && buildings.length < want; i++) {
    const u = (roll() - 0.5) * QUAY_W * 0.9;
    let back = QUAY_D * 0.9 + 8 + roll() * 26;
    const w = 7 + roll() * 7, d = 5 + roll() * 5, h = 4.5 + roll() * 3.5, tone = roll();
    let bx = 0, bz = 0, g = -1;
    for (let step = 0; step < 8 && g < 0.3; step++, back += 9) {
      bx = S.x + D.x * back + L.x * u; bz = S.z + D.z * back + L.z * u;
      g = elevAt(bx, bz);
    }
    if (g < 0.3) continue;
    buildings.push({ x: bx, z: bz, y: g, yaw: yaw + (tone - 0.5) * 0.5, w, d, h, tone });
  }
  // an island too thin for a hinterland (Sainte-Marie is ~22 m across at
  // game scale) builds its waterfront ON the quay instead — stilted sheds
  for (let u = -QUAY_W / 3; buildings.length < 3; u += QUAY_W / 3) {
    buildings.push({ x: quay.x + L.x * u + D.x * 2, z: quay.z + L.z * u + D.z * 2,
      y: QUAY_TOP, yaw, w: 6.5, d: 4.5, h: 3.5 + roll() * 1.5, tone: roll(), onQuay: true });
  }

  // bollards along the waterside lip of the quay
  const bollards = [];
  for (let u = -QUAY_W / 2 + 6; u <= QUAY_W / 2 - 6; u += 10) {
    bollards.push({ x: quay.x - D.x * (QUAY_D / 2 - 0.8) + L.x * u,
      z: quay.z - D.z * (QUAY_D / 2 - 0.8) + L.z * u });
  }
  return { ok: true, shoreDist: shoreR, dir: D, yaw, quay, jetty, beacon, buildings, bollards };
}
