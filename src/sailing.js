// The sailing model — pure functions, no THREE, no DOM.
// Wind + heading + sail trim -> power [0..1] -> target speed.
// The design promise (docs/DESIGN.md): a good sailor outruns a bad one in the
// same ship. That means trim has to MATTER. verify-sailing.mjs guards it.

const PI = Math.PI;

// smallest signed difference a-b wrapped to [-PI, PI]
export function wrapAngle(a) {
  a = a % (2 * PI);
  if (a > PI) a -= 2 * PI;
  if (a < -PI) a += 2 * PI;
  return a;
}

export const IRONS = 0.52; // ~30 deg either side of the wind: no sail power

// Point-of-sail curve: power available from the wind given the absolute angle
// between the bow and the direction the wind comes FROM (0 = bow dead into wind).
// Piecewise-linear through sailing-intuition anchor points:
// in irons -> close-hauled -> beam reach (best) -> broad reach -> dead run.
const POS_CURVE = [
  [0.0, 0.0],
  [IRONS, 0.08],
  [0.87, 0.55],  // ~50 deg, close-hauled
  [1.57, 1.0],   // ~90 deg, beam reach
  [2.36, 0.9],   // ~135 deg, broad reach
  [PI, 0.72],    // dead run
];

export function pointOfSailPower(rel) {
  const a = Math.min(Math.abs(rel), PI);
  for (let i = 1; i < POS_CURVE.length; i++) {
    const [x1, y1] = POS_CURVE[i - 1], [x2, y2] = POS_CURVE[i];
    if (a <= x2) return y1 + (y2 - y1) * ((a - x1) / (x2 - x1));
  }
  return POS_CURVE[POS_CURVE.length - 1][1];
}

// Optimal sheet trim for a given point of sail: sheeted hard in (0) when
// close-hauled, fully eased (1) on a dead run. Linear between.
export function optimalTrim(rel) {
  const a = Math.min(Math.abs(rel), PI);
  if (a <= IRONS) return 0;
  return (a - IRONS) / (PI - IRONS);
}

// How much of the available power the current trim captures. A perfectly
// trimmed sail gets 1.0; a badly trimmed one luffs or stalls down to 0.1.
export function trimEfficiency(rel, trim) {
  const err = trim - optimalTrim(rel);
  const eff = 1 - 2.2 * err * err;
  return Math.max(0.1, Math.min(1, eff));
}

// heading: bow direction (rad, world yaw). windFrom: direction the wind comes
// FROM (rad, world yaw). trim: [0..1]. Returns power [0..1].
export function sailPower(heading, windFrom, trim) {
  const rel = wrapAngle(heading - windFrom);
  return pointOfSailPower(rel) * trimEfficiency(rel, trim);
}

// Which side the boom swings to: +1 starboard tack, -1 port tack.
export function tackSign(heading, windFrom) {
  return wrapAngle(heading - windFrom) >= 0 ? 1 : -1;
}

// Target hull speed (m/s) for a given power and wind strength. The cap is
// 2x: a full offshore gale genuinely doubles the hull's pace — half of what
// makes blue water feel FAST (the other half is the open-sea gait).
export function speedTarget(power, windSpeed, maxSpeed) {
  const windFactor = Math.max(0, Math.min(2, windSpeed / 8));
  return maxSpeed * power * windFactor;
}
