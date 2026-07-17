// Oar pose maths — pure, no THREE, no DOM. verify-oars.mjs guards it.
// The VISIBLE half of the sweeps (shipphysics.oarSpeed is the drive):
// where the oars pivot on the rail, how the stroke cycles, and where the
// towing longboat rides for the hulls too proud to row themselves.
//
// Convention matches shipframe: ship-local, bow +z, y up. Deterministic —
// the same hull and muster row the same stroke on every client.

import { frameFor } from './shipframe.js';
import { beaches } from './shipphysics.js';

export const STROKE_S = 2.4;   // seconds per full stroke

// how a hull moves when the wind won't serve: the beaching hulls ship
// sweeps at the rail; everything deeper is towed by her longboat
export function oarMode(spec) {
  return beaches(spec) ? 'sweeps' : 'tow';
}

// pivot points along the rails: staggered pairs down the waist, as many as
// the rowers can man and the hull has room for
export function oarPosts(spec, crew) {
  const F = frameFor(spec);
  const rowers = Math.min(crew + 1, 12);
  const pairs = Math.max(1, Math.min(Math.floor(spec.length / 4.5), Math.ceil(rowers / 2)));
  const posts = [];
  const z0 = F.deck.minZ * 0.35, z1 = F.deck.maxZ * 0.45;
  for (let i = 0; i < pairs; i++) {
    const z = pairs === 1 ? (z0 + z1) / 2 : z0 + (z1 - z0) * (i / (pairs - 1));
    for (const side of [-1, 1]) {
      posts.push({ x: side * F.deck.maxX * 0.98, y: F.deck.y + 0.5, z, side, k: i * 2 + (side + 1) / 2 });
    }
  }
  return posts;
}

// oar length: rail to water with reach to spare
export function oarLength(spec) {
  return spec.beam * 0.5 + 3.4;
}

// the stroke, phase-staggered so the banks read as a crew, not a machine:
// sweep — fore-and-aft about the pivot; dip — blade lift and bury.
// The PHYSICS of rowing pins the phase: the blade is BURIED while it sweeps
// AFT (the power stroke drives the hull forward) and lifts clear for the
// forward recovery — dip peaks where sweep is climbing, verify holds it.
export function oarStroke(t, k = 0) {
  const ph = (t / STROKE_S + k * 0.11) * Math.PI * 2;
  return {
    sweep: 0.36 * Math.sin(ph),
    dip: 0.09 + 0.13 * Math.cos(ph),
  };
}

// the longboat rides ahead of the bow on her tow line
export function towOffset(spec) {
  return spec.length * 0.62 + 9;
}
