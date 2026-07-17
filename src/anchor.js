// The ground tackle — pure rules for letting go and riding to an anchor.
// No THREE, no DOM (verify-anchor.mjs guards it). main.js asks three
// questions every frame she's at anchor: does the cable find bottom here,
// how hard does it snub her way off, and where does the wind swing her bow.

import { wrapAngle } from './sailing.js';

// how much water the cable is good for — drop it in blue water and the
// lead finds nothing; work into soundings first. Metres of GAME water:
// earth.js's shelf runs 1.6 m at the beach to ~25–44 m in the open sea,
// so 20 keeps anchoring an inshore act (roughly the first few hundred
// metres off a coast) and refuses it everywhere the ocean turns deep.
export const CABLE_DEPTH = 20;

// too much way and the cable would part at the bitts — luff up first.
// m/s of ship speed (about 8 knots on the HUD).
export const DROP_SPEED = 4;

// may the anchor go down HERE, NOW? depth in metres (positive down)
export function canLetGo(depth, speed) {
  if (!(depth <= CABLE_DEPTH)) return { ok: false, why: 'deep' };
  if (!(speed <= DROP_SPEED)) return { ok: false, why: 'way' };
  return { ok: true };
}

// the cable snubs her way off hard — exponential, gone in a few seconds
export function snubSpeed(speed, dt) {
  return speed * Math.exp(-1.8 * dt);
}

// riding to her anchor she weathercocks: the bow eases round until she
// faces dead into the wind, taking the shortest way round the compass
export function swingToWind(yaw, windFrom, dt) {
  const err = wrapAngle(windFrom - yaw);
  const step = Math.sign(err) * Math.min(Math.abs(err), 0.22 * dt);
  return yaw + step;
}
