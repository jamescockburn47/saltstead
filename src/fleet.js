// The fleet — pure, no THREE, no DOM. verify-fleet.mjs guards it.
// Capture rules (crew is the currency) and the line-astern station keeping
// that makes a column of prizes sail like a column, not a mob.

export const START_CREW = 8;    // hands you sign on at the start
export const PRIZE_CREW = 3;    // hands a prize needs to sail her
export const MIN_CREW = 4;      // never strip your own ship below this
export const FLEET_MAX = 3;     // sloop-era leadership cap
export const JOIN_CHANCE = 0.34; // some captured sailors sign articles

// can this many hands man another prize?
export function canTakePrize(crew, fleetSize) {
  return fleetSize < FLEET_MAX && crew - PRIZE_CREW >= MIN_CREW;
}

// line astern: station i (0-based) sits this far behind the flagship,
// offset alternately a half-beam to port/starboard so a turning column
// doesn't mow through its own wake
export function stationOffset(i) {
  return { back: 18 * (i + 1), side: (i % 2 ? 1 : -1) * 2.5 };
}

// world-space station point for follower i given the flagship pose
export function stationPoint(flagX, flagZ, flagYaw, i) {
  const o = stationOffset(i);
  const sy = Math.sin(flagYaw), cy = Math.cos(flagYaw);
  return {
    x: flagX - sy * o.back + cy * o.side,
    z: flagZ - cy * o.back - sy * o.side,
  };
}

const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// One follow step. f: { x, z, yaw, speed } mutated in place. Feedforward +
// correction: she carries the flagship's pace (gait included) as her base,
// then a signed along-track term crowds sail when the station pulls ahead
// and luffs when she overruns — so ON station she simply matches speed, with
// no built-in lag. Deterministic given inputs.
export const FOLLOW_TURN = 0.9; // rad/s — prize crews steer hard
export function followStep(f, station, flagYaw, flagPace, dt) {
  const dx = station.x - f.x, dz = station.z - f.z;
  const dist = Math.hypot(dx, dz);
  // aim at the station until close, then take the flagship's heading
  const want = dist > 6 ? Math.atan2(dx, dz) : flagYaw;
  const err = wrapPi(want - f.yaw);
  f.yaw += Math.max(-FOLLOW_TURN * dt, Math.min(FOLLOW_TURN * dt, err));
  // signed along-track error: + when the station lies ahead of her bow
  const along = dx * Math.sin(f.yaw) + dz * Math.cos(f.yaw);
  const correct = Math.max(-flagPace * 0.6, Math.min(flagPace * 0.35 + 4, along * 0.6));
  const target = Math.max(0, flagPace + correct);
  f.speed += (target - f.speed) * Math.min(1, dt * 1.2);
  f.x += Math.sin(f.yaw) * f.speed * dt;
  f.z += Math.cos(f.yaw) * f.speed * dt;
  return f;
}
