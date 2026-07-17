// Ocean currents — pure, no THREE, no DOM. verify-currents.mjs guards it.
//
// Real surface currents as RIBBONS: a polyline the water runs ALONG, with a
// flow speed and a half-width it tapers across. Authored as complete GYRES
// (both limbs) so each ocean carries a westbound tropical current AND an
// eastbound mid-latitude one — the round trip the trade lanes ride. The router
// (lanes.js) makes a favourable current cheap; the physics (shipphysics.js)
// drifts the player along it, gait-scaled. Append-only, like legends.js.

import { latLonToWorld } from './earth.js';

export const CURRENTS = [
  // North Atlantic gyre — clockwise
  { id: 'gulf-stream', name: 'Gulf Stream', speed: 2.2, width: 6000,
    path: [{ lat: 25, lon: -80 }, { lat: 35, lon: -73 }, { lat: 41, lon: -50 }, { lat: 50, lon: -25 }] },
  { id: 'canary', name: 'Canary Current', speed: 1.0, width: 6000,
    path: [{ lat: 43, lon: -13 }, { lat: 30, lon: -18 }, { lat: 20, lon: -20 }] },
  { id: 'n-equatorial-atl', name: 'North Equatorial Current', speed: 1.4, width: 8000,
    path: [{ lat: 15, lon: -25 }, { lat: 14, lon: -55 }, { lat: 14, lon: -72 }] },
  // North Pacific gyre — clockwise
  { id: 'kuroshio', name: 'Kuroshio', speed: 2.0, width: 6000,
    path: [{ lat: 25, lon: 130 }, { lat: 35, lon: 145 }, { lat: 40, lon: 170 }] },
  { id: 'n-equatorial-pac', name: 'North Equatorial (Pacific)', speed: 1.3, width: 8000,
    path: [{ lat: 12, lon: -120 }, { lat: 10, lon: -170 }, { lat: 10, lon: 160 }] },
  // Southern Ocean — the Antarctic Circumpolar, eastbound right round
  { id: 'acc', name: 'Antarctic Circumpolar', speed: 1.5, width: 9000,
    path: [{ lat: -55, lon: -60 }, { lat: -56, lon: 0 }, { lat: -55, lon: 80 }, { lat: -56, lon: 160 }] },
];

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// precompute each ribbon's world polyline once
const RIBBONS = CURRENTS.map((c) => ({
  id: c.id, speed: c.speed, width: c.width,
  pts: c.path.map((p) => { const w = latLonToWorld(p.lat, p.lon); return { x: w.x, z: w.z }; }),
}));

// nearest point on segment a->b to p; returns the point, the segment vector, and
// the parametric t (clamped to the segment)
function nearestOnSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? clamp(((px - ax) * dx + (pz - az) * dz) / len2, 0, 1) : 0;
  return { x: ax + dx * t, z: az + dz * t, dx, dz };
}

// current drift at a world point: summed over every ribbon within its width,
// flowing ALONG the local segment tangent, tapered smoothly to 0 at the edge.
// Returns { vx, vz } in m/s, world frame (+x east, +z south).
export function currentAt(x, z) {
  let vx = 0, vz = 0;
  for (const r of RIBBONS) {
    let near = null, nearD = Infinity;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const a = r.pts[i], b = r.pts[i + 1];
      const n = nearestOnSeg(x, z, a.x, a.z, b.x, b.z);
      const d = Math.hypot(x - n.x, z - n.z);
      if (d < nearD) { nearD = d; near = n; }
    }
    if (near && nearD < r.width) {
      const s = clamp(1 - nearD / r.width, 0, 1);
      const taper = s * s * (3 - 2 * s); // smoothstep to 0 at the edge
      const tl = Math.hypot(near.dx, near.dz) || 1;
      vx += (near.dx / tl) * r.speed * taper;
      vz += (near.dz / tl) * r.speed * taper;
    }
  }
  return { vx, vz };
}
