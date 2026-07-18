// The chip log and the reckoning — pure, no THREE, no DOM.
// verify-reckoning.mjs guards it.
//
// U heaves the chip log (docs/PASSAGE.md): a triangular board on a knotted
// line, run out against the 28-second glass — the knots the hand counts ARE
// the ship's knots, which is literally where the word comes from. The first
// cast takes DEPARTURE: it starts a dead reckoning, advanced every frame by
// heading and the LAST CAST's speed. The fair current is exactly what a log
// line cannot see — through-water speed, not over-ground — so the reckoning
// drifts from truth the way every real reckoning drifted: set and drift ARE
// the error. A star sight (N) or a landfall is a FIX: the game says how far
// out the reckoning ran, and corrects it. The navigator's rule from
// DESIGN.md holds: the instrument reads the live simulation, never a lookup
// table of answers.

import { unit2 } from './noise.js';
import { dxWrap, wrapX } from './earth.js';

export const LOG_ERR = 0.06; // a good cast is within ±6% — sand, spray, thumbs

// one cast of the log: the measured through-water speed, with the cast's own
// honest error. -> { estMs, kn, text }
export function chipLog(seed, speedMs) {
  const err = (unit2(seed * 5.1, 7.3) - 0.5) * 2 * LOG_ERR;
  const estMs = Math.max(0, speedMs * (1 + err));
  const kn = estMs * 1.944;
  return {
    estMs,
    kn,
    text: `${kn.toFixed(1)} knots by the 28-second glass`,
  };
}

// departure taken: the reckoning starts from a known position
export function newReckoning(x, z) {
  return { x, z, estMs: 0, since: 0 };
}

// a fresh cast feeds the reckoning its speed until the next one
export function castReckoning(rk, estMs) {
  rk.estMs = estMs;
  return rk;
}

// the navigator's arithmetic, every frame: heading and logged speed, nothing
// else. gait rides both truth and reckoning alike (it compresses the ocean,
// not the navigation) — what it can NEVER see is the current's set.
export function stepReckoning(rk, yaw, dt, gait = 1) {
  rk.x = wrapX(rk.x + Math.sin(yaw) * rk.estMs * gait * dt);
  rk.z += Math.cos(yaw) * rk.estMs * gait * dt;
  rk.since += dt;
  return rk;
}

// how far out the reckoning runs, in game kilometres
export function reckonErrorKm(rk, x, z) {
  return Math.hypot(dxWrap(rk.x, x), z - rk.z) / 1000;
}

// a fix — star sight or landfall — corrects the book and reports the miss
export function fixReckoning(rk, x, z) {
  const errKm = reckonErrorKm(rk, x, z);
  rk.x = x; rk.z = z; rk.since = 0;
  return errKm;
}
