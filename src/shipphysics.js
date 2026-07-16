// Ship physics — pure, no THREE, no DOM. verify-ship.mjs guards it.
// Convention matches shipframe.js: bow along local +z, forward = (sin yaw, cos yaw).

import { sailPower, speedTarget } from './sailing.js';
import { waveHeight } from './waves.js';

export const SLOOP = {
  maxSpeed: 8.5,   // m/s, ~16.5 knots — arcade-brisk on purpose
  accel: 0.55,     // exponential approach rate when gaining speed
  drag: 0.35,      // and when losing it (sails luff, sea slows you)
  turnRate: 0.6,   // rad/s at full speed, full rudder
  draft: 0.45,     // hull sits this far below the sampled surface
  keel: 0.65,      // hull bottom below the group origin (ship.js buildHull)
  length: 9,
  beam: 3.2,
};

export function newShipState(x = 0, z = 0) {
  return { x, y: 0, z, yaw: 0, speed: 0, rudder: 0, trim: 0.5 };
}

// wind: { from, speed }. gait: open-sea distance multiplier (earth.js
// gaitFactor) — it scales the world slipping past, not the hull's dynamics,
// so trim/turn feel is identical inshore and out. Mutates and returns s.
export function stepShip(s, wind, dt, spec = SLOOP, gait = 1) {
  const power = sailPower(s.yaw, wind.from, s.trim);
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
  return {
    y: (bow + stern + star + port) / 4 - spec.draft,
    pitch: Math.atan2(stern - bow, hl * 2),
    roll: Math.atan2(port - star, hb * 2),
  };
}
