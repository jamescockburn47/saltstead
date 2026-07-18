// The stern chase — pure, no THREE, no DOM. verify-chase.mjs guards it.
//
// Notoriety (docs/PASSAGE.md): HEAT is how loudly the sea talks about you —
// 0..1, fed by every boarding and sinking, cooled by quiet days, riding the
// save. Above HEAT_MIN each passage bell may lift a hunter over the horizon
// ASTERN — a King's corvette for the black flag, a raider for the King's
// colours — and the next few minutes are the oldest race there is. Outsail
// her, run for the shoals, round on her — or X: JETTISON a quarter of the
// chest. The hunter breaks off for the floating gold (greed is doctrine, on
// either side of the law) and the lightened hull gets a sprint. Always an
// out, always a price.

import { unit2 } from './noise.js';

export const HEAT_MIN = 0.25;     // below this the sea has not heard of you
export const HEAT_MAX_ROLL = 0.35; // at heat 1, a bell's chance of a hunter
export const JETTISON_FRAC = 0.25; // the sprint costs a quarter of the chest
export const JETTISON_MIN = 40;    // no chest, no bargain — the sea wants real gold
export const SPRINT_S = 90;        // how long the lightened hull flies
export const SPRINT_MULT = 1.15;   // and how hard
export const CHASE_OVER_R = 3200;  // she gives it up beyond this
export const HUNTER_R = 1800;      // where the sail lifts over the horizon

// every prize taken warms the name; the takings scale it, gently saturating
export function heatFromPlunder(heat, gold) {
  const d = Math.min(0.12, gold / 2500);
  return Math.min(1, heat + d * (1.2 - heat));
}

// quiet days cool it — roughly half the heat fades over two voyage days,
// and the last embers go out entirely rather than smoulder in the save
export function coolHeat(heat, days) {
  const h = Math.max(0, heat * Math.pow(0.7, Math.max(0, days)));
  return h < 0.005 ? 0 : h;
}

// the bell's roll: deterministic in (seed, bell), ramping with heat.
// Cold names never roll; a red-hot one is hunted roughly every third bell.
export function hunterDue(seed, n, heat) {
  if (heat < HEAT_MIN) return false;
  const p = HEAT_MAX_ROLL * (heat - HEAT_MIN) / (1 - HEAT_MIN);
  return unit2(seed * 9.7 + n * 5.9, n * 3.1 + 13.7) < p;
}

// where she lifts: astern of the course, a point or two off the wake so the
// lookout has something to sing about
export function hunterBerth(px, pz, yaw, seed = 0) {
  const off = (unit2(seed * 1.7, 7.9) - 0.5) * 0.9; // ±half a point off dead astern
  const a = yaw + Math.PI + off;
  return {
    x: px + Math.sin(a) * HUNTER_R,
    z: pz + Math.cos(a) * HUNTER_R,
    yaw: yaw, // she lifts already laid on your course
  };
}

// the bargain: what a quarter of the chest buys. null when the chest is too
// bare to interest her — an empty hold has only sailing left.
export function jettisonPlan(gold) {
  if (gold < JETTISON_MIN) return null;
  const cost = Math.max(JETTISON_MIN, Math.round(gold * JETTISON_FRAC));
  return { cost, keep: gold - cost };
}
