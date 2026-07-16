// Hull-on-hull collision — pure, no THREE, no DOM. verify-collide.mjs
// guards it. Every hull is a CAPSULE: a segment down her centreline (bow to
// stern, shortened by half the beam at each end) swept by half her beam.
// Two capsules touch when their segments pass closer than the sum of their
// radii — cheap, orientation-true, and honest about a long hull's flanks.
//
// The response is arcade-honest, not naval architecture: overlapping hulls
// are pushed apart along the line between nearest points, and iron-hard
// CLOSING speed becomes damage (main.js applies it through the same
// combat.js damage states a broadside uses — a ram is just a very rude
// broadside). Glancing, slow contact is fenders-and-curses: shove, no harm.

// the capsule for a hull at (x, z) with heading yaw: segment half-length
// runs bow-to-stern inside the hull, radius wraps the beam with a small
// rub-rail allowance
export function shipCapsule(x, z, yaw, spec) {
  const r = spec.beam * 0.5 * 1.05;
  const half = Math.max(0.1, spec.length * 0.5 - r * 0.6);
  const dx = Math.sin(yaw) * half, dz = Math.cos(yaw) * half;
  return { ax: x - dx, az: z - dz, bx: x + dx, bz: z + dz, r };
}

// closest points between two 2D segments (a0-a1, b0-b1); returns
// { d, px, pz, qx, qz } — distance and the nearest point on each
export function segSegNearest(a0x, a0z, a1x, a1z, b0x, b0z, b1x, b1z) {
  const ux = a1x - a0x, uz = a1z - a0z;
  const vx = b1x - b0x, vz = b1z - b0z;
  const wx = a0x - b0x, wz = a0z - b0z;
  const a = ux * ux + uz * uz, b = ux * vx + uz * vz, c = vx * vx + vz * vz;
  const d = ux * wx + uz * wz, e = vx * wx + vz * wz;
  const denom = a * c - b * b;
  let s = denom > 1e-9 ? (b * e - c * d) / denom : 0;
  s = Math.max(0, Math.min(1, s));
  let t = c > 1e-9 ? (b * s + e) / c : 0;
  t = Math.max(0, Math.min(1, t));
  // one reprojection pass tightens the clamped answer
  s = a > 1e-9 ? Math.max(0, Math.min(1, (b * t - d) / a)) : 0;
  const px = a0x + ux * s, pz = a0z + uz * s;
  const qx = b0x + vx * t, qz = b0z + vz * t;
  return { d: Math.hypot(px - qx, pz - qz), px, pz, qx, qz };
}

// RAM_HURT: closing speed (m/s along the contact normal) below which a
// touch is a bump, not a holing. Above it, damage scales with the excess.
export const RAM_HURT = 2.2;

// a: { x, z, yaw, speed } + aSpec; b likewise. Returns null when clear, or
// { nx, nz, depth, closing } — the unit normal pointing from b toward a,
// how deep the hulls overlap, and the closing speed along that normal
// (positive = they were still coming together at contact).
export function collideShips(a, aSpec, b, bSpec) {
  const ca = shipCapsule(a.x, a.z, a.yaw, aSpec);
  const cb = shipCapsule(b.x, b.z, b.yaw, bSpec);
  const near = segSegNearest(ca.ax, ca.az, ca.bx, ca.bz, cb.ax, cb.az, cb.bx, cb.bz);
  const depth = ca.r + cb.r - near.d;
  if (depth <= 0) return null;
  // the normal from b's nearest point toward a's; if the segments actually
  // cross (d ~ 0) fall back to centre-to-centre so the push is still real
  let nx = near.px - near.qx, nz = near.pz - near.qz;
  let len = Math.hypot(nx, nz);
  if (len < 1e-6) { nx = a.x - b.x; nz = a.z - b.z; len = Math.hypot(nx, nz) || 1; }
  nx /= len; nz /= len;
  const avx = Math.sin(a.yaw) * a.speed, avz = Math.cos(a.yaw) * a.speed;
  const bvx = Math.sin(b.yaw) * b.speed, bvz = Math.cos(b.yaw) * b.speed;
  // relative velocity of a with respect to b, along the normal: negative
  // means a is moving INTO b — that's the closing speed
  const closing = -((avx - bvx) * nx + (avz - bvz) * nz);
  return { nx, nz, depth, closing: Math.max(0, closing) };
}

// how hard the carpenter swears: 0 for a fender bump, up to 1 for a full
// ram — main.js scales hull damage by this
export function ramSeverity(closing) {
  if (closing <= RAM_HURT) return 0;
  return Math.min(1, (closing - RAM_HURT) / 6);
}
