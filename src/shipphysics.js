// Ship physics — pure, no THREE, no DOM. verify-ship.mjs guards it.
// Convention matches shipframe.js: bow along local +z, forward = (sin yaw, cos yaw).

import { sailPower, speedTarget } from './sailing.js';
import { waveHeight } from './waves.js';

// groundLine: the terrain elevation at which the hull stops. Positive = she
// can run her bow right up onto the sand (beachable); negative = she draws
// too much and fetches up on the shoal OFFSHORE — the longboat takes you in.
//
// THE LADDER'S PHYSICS DOCTRINE (shipyard.js sells these in this order):
// climbing a rung buys straight-line speed, broadside weight and berths; it
// SPENDS handiness and shallow water. The sloop turns on a doubloon and
// beaches; the galleon is a fortress that comes about like a cathedral.
export const SLOOP = {
  maxSpeed: 8.5,   // m/s, ~16.5 knots — arcade-brisk on purpose
  accel: 0.55,     // exponential approach rate when gaining speed
  drag: 0.35,      // and when losing it (sails luff, sea slows you)
  turnRate: 0.6,   // rad/s at full speed, full rudder
  draft: 0.45,     // hull sits this far below the sampled surface
  keel: 0.65,      // hull bottom below the group origin (ship.js buildHull)
  length: 9,
  beam: 3.2,
  groundLine: 0.05, // shallow draft: the bow takes the sand itself
};

export const CUTTER = {
  maxSpeed: 9.3, accel: 0.55, drag: 0.34, turnRate: 0.55,
  draft: 0.5, keel: 0.7, length: 11, beam: 3.6,
  groundLine: 0.03, // still takes the sand, just less of it
};

export const SCHOONER = {
  maxSpeed: 10.0, accel: 0.5, drag: 0.32, turnRate: 0.48,
  draft: 0.6, keel: 0.8, length: 13, beam: 4.2,
  groundLine: 0.01, // the last rung that beaches at all
};

export const BRIG = {
  maxSpeed: 10.5, accel: 0.4, drag: 0.3, turnRate: 0.4,
  draft: 0.9, keel: 1.1, length: 16, beam: 5.2,
  groundLine: -1.4, // deep draft: she anchors off and sends a boat in
};

export const CORVETTE = {
  maxSpeed: 11.2, accel: 0.38, drag: 0.3, turnRate: 0.36,
  draft: 1.1, keel: 1.3, length: 19, beam: 5.8,
  groundLine: -1.8,
};

export const FRIGATE = {
  maxSpeed: 11.8, accel: 0.34, drag: 0.28, turnRate: 0.3,
  draft: 1.4, keel: 1.6, length: 24, beam: 7.2,
  groundLine: -2.4,
};

export const GALLEON = {
  maxSpeed: 10.8, accel: 0.28, drag: 0.26, turnRate: 0.22,
  draft: 1.8, keel: 2.0, length: 30, beam: 9.0,
  groundLine: -3.0, // she anchors in the roads like a visiting cathedral
};

// every hull the game knows, smallest to largest — verify walks this
export const SPECS = { SLOOP, CUTTER, SCHOONER, BRIG, CORVETTE, FRIGATE, GALLEON };

// does this hull run up onto the beach, or must the boats go in?
export function beaches(spec) {
  return spec.groundLine > 0;
}

export function newShipState(x = 0, z = 0) {
  return { x, y: 0, z, yaw: 0, speed: 0, rudder: 0, trim: 0.5 };
}

// wind: { from, speed }. gait: open-sea distance multiplier (earth.js
// gaitFactor) — it scales the world slipping past, not the hull's dynamics,
// so trim/turn feel is identical inshore and out. furl: the crew hands the
// sails (anchorage / under a beach) — no drive, she glides to rest on drag.
// Mutates and returns s.
export function stepShip(s, wind, dt, spec = SLOOP, gait = 1, furl = false) {
  const power = furl ? 0 : sailPower(s.yaw, wind.from, s.trim);
  const target = speedTarget(power, wind.speed, spec.maxSpeed);
  const rate = target > s.speed ? spec.accel : spec.drag;
  s.speed += (target - s.speed) * (1 - Math.exp(-rate * dt));

  // rudder bites with waterflow: barely steer when becalmed
  const bite = 0.15 + 0.85 * Math.min(1, s.speed / spec.maxSpeed);
  s.yaw += s.rudder * spec.turnRate * bite * dt;

  s.x += Math.sin(s.yaw) * s.speed * gait * dt;
  s.z += Math.cos(s.yaw) * s.speed * gait * dt;
  return s;
}

// Buoyancy attitude from four hull sample points on the live wave field.
// Returns { y, pitch, roll } — pitch/roll in radians, y is hull-centre height.
// ground (optional): (x, z) => terrain height. Wherever the sea floor rises
// past the keel, the hull RIDES it — beached on a slope the bow lifts and the
// deck takes the sand's tilt, instead of the hull merging into the land.
export function shipAttitude(s, t, spec = SLOOP, ground = null) {
  const lift = spec.draft + (spec.keel || 0);
  const surf = ground
    ? (x, z) => Math.max(waveHeight(x, z, t), ground(x, z) + lift)
    : (x, z) => waveHeight(x, z, t);
  const sy = Math.sin(s.yaw), cy = Math.cos(s.yaw);
  const hl = spec.length * 0.42, hb = spec.beam * 0.45;
  const bow = surf(s.x + sy * hl, s.z + cy * hl);
  const stern = surf(s.x - sy * hl, s.z - cy * hl);
  const star = surf(s.x + cy * hb, s.z - sy * hb);
  const port = surf(s.x - cy * hb, s.z + sy * hb);
  // a heavy hull stands STIFF in a seaway: her inertia refuses the chop a
  // dinghy answers. Scaled against the unit sloop — the galleon rides the
  // same sea at well under half the sloop's rock.
  const steadiness = Math.min(1, (9 / spec.length) ** 0.7);
  return {
    y: (bow + stern + star + port) / 4 - spec.draft,
    pitch: Math.atan2(stern - bow, hl * 2) * steadiness,
    roll: Math.atan2(port - star, hb * 2) * steadiness,
  };
}
