// The carpenter's rounds — pure, no THREE, no DOM. verify-carpenter.mjs
// guards it.
//
// Heavy weather works the seams open on any hull big enough to carry a hold
// (the brig up — docs/PASSAGE.md). An open seam WEEPS: slow hull decay,
// floored at SEAM_FLOOR so an absent captain is never sunk by his own
// planking — the founder rule stays combat's alone. Below decks the seam
// sits at a deterministic frame spot; stand by it and E drives the oakum
// home. Bigger ship, more sea, more seams: scale turns management, exactly
// as DESIGN promises for the larger hulls.

import { unit2 } from './noise.js';
import { holdFor } from './shipframe.js';

export const SEAM_MAX = 2;        // open at once — a weeping ship, not a sieve
export const WEAR_PER_SEAM = 45;  // seconds of heavy weather per opened seam
export const SEAM_RATE = 0.0004;  // hull fraction per second, per open seam
export const SEAM_FLOOR = 0.55;   // a neglected hull lists; she never founders
export const FIX_REACH = 1.4;     // × frame scale — arm's reach of the seam

// wear accrues only while the sea is genuinely working her
export function accrueWear(wear, heavy, dt) {
  return heavy ? wear + dt : wear;
}

// enough wear and room on the count: a seam lets go
export function seamDue(wear, open) {
  return open < SEAM_MAX && wear >= WEAR_PER_SEAM;
}

// the k-th voyage's seams: against the frames, spread along the hold — the
// same hull springs the same seams for the same weather (invariant 6)
export function seamSpots(spec, seed, k) {
  const H = holdFor(spec);
  const out = [];
  for (let i = 0; i < k; i++) {
    const side = unit2(seed + i * 7.7, 3.1) < 0.5 ? -1 : 1;
    const z = H.minZ + (0.15 + 0.7 * unit2(seed * 1.3 + i * 11.9, 17.3)) * (H.maxZ - H.minZ);
    out.push({ x: side * Math.max(0.25, H.maxX - 0.6), z });
  }
  return out;
}

// what the weeping costs: open seams drain the hull toward the floor, never past
export function seamDecay(hull, open, dt) {
  if (open <= 0 || hull <= SEAM_FLOOR) return hull;
  return Math.max(SEAM_FLOOR, hull - SEAM_RATE * open * dt);
}
