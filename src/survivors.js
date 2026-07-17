// Survivors — pure logic, no THREE, no DOM. verify-survivors.mjs guards it;
// merchantlayer gives the swimmers bodies and main.js hauls them aboard.
//
// When a crewed ship goes down her people take to the water: heads and
// waving arms among the flotsam. Lay alongside slow and E hauls them out —
// each has already made up their own mind about your flag (join), and the
// joiners sign articles on the spot; the rest pay a grateful purse and ask
// for the next port. IGNORE them and the sea does what the sea does — in
// the warm latitudes the sharks that gathered for the sinking find the
// swimmers first, and faster.

import { unit2 } from './noise.js';

export const RESCUE_R = 18;        // haul-aboard reach, laid alongside slow
export const NOTICE_R = 300;       // they see your sail and strike out for it
export const SWIM_SPEED = 0.55;    // m/s — a man in the water, not a dolphin
export const TAKEN_S_TROPIC = 75;  // the frenzy finds them fast in warm water
export const TAKEN_S_COLD = 150;   // cold water is slower, and no kinder
export const GRATITUDE = 15;       // doubloons a declining survivor presses on you

// 2–4 souls off a sinking, scattered around the wreck. Deterministic per
// wreck seed: the same ship spills the same swimmers with the same minds.
export function spawnSurvivors(seed, x, z) {
  const n = 2 + Math.floor(unit2(seed * 1.7, 3.7) * 3); // 2..4
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = unit2(seed + i * 11, 7.1) * Math.PI * 2;
    const r = 5 + unit2(seed * 1.3 + i, i + 0.5) * 9;
    out.push({
      id: `swim-${seed}-${i}`,
      x: x + Math.sin(a) * r,
      z: z + Math.cos(a) * r,
      age: 0,
      join: unit2(seed + i * 13, 11.3) < 0.65, // most would rather sail than swim
      phase: unit2(i * 3.1, seed) * Math.PI * 2, // bobbing decorrelation
    });
  }
  return out;
}

// mutates and returns s: ages, and strikes out for a close sail (they stop
// short of the hull — the crew hauls them the last fathom)
export function stepSurvivor(s, px, pz, dt) {
  s.age += dt;
  const d = Math.hypot(px - s.x, pz - s.z);
  if (d < NOTICE_R && d > 6) {
    s.x += ((px - s.x) / d) * SWIM_SPEED * dt;
    s.z += ((pz - s.z) / d) * SWIM_SPEED * dt;
  }
  return s;
}

// 'swimming' | 'taken' — how long the water gives them, by latitude
export function survivorFate(age, latAbs) {
  return age > (latAbs < 42 ? TAKEN_S_TROPIC : TAKEN_S_COLD) ? 'taken' : 'swimming';
}
