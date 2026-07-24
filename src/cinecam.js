// The meeting lens — pure, no THREE, no DOM. verify-cinecam.mjs guards it.
//
// When another sail closes on open water, the camera steps back for the
// wide establishing shot: both hulls, both wakes, the weather over them —
// the game at its most cinematic, exactly when there is something worth
// framing. The shot stands abeam of the line joining the two ships, high
// enough to read the water, far enough that both sit comfortably inside
// the lens, and dollies slowly along the meeting while it holds. Any touch
// of the helm hands the lens straight back (main.js cancels on input) —
// the cinema must never cost the player a manoeuvre.

export const CINE_RANGE = 150;    // metres: a meeting is this close
export const CINE_MIN_SEP = 25;   // closer than this is a boarding, not a shot
export const CINE_COOLDOWN = 150; // seconds between shots — it stays special
export const CINE_DUR = 7;        // seconds a shot holds
const FOV_SAFE = 52;              // degrees both ships must fit inside (lens is 62)

// should a shot begin? Both hulls under way, a real meeting, and the last
// shot long enough ago that the lens still feels like an event.
export function cineEligible(lastEnd, t, sep, spdA, spdB) {
  return t - lastEnd >= CINE_COOLDOWN
    && sep < CINE_RANGE && sep > CINE_MIN_SEP
    && spdA > 1.5 && spdB > 1.5;
}

// the shot, framed from the pair: camera abeam of the meeting line (seed
// picks the side deterministically), pulled back proportional to their
// separation, raised with it, aimed at mast height over the midpoint so
// the frame holds sea AND sky.
export function cineShot(ax, az, bx, bz, seed = 0) {
  const mx = (ax + bx) / 2, mz = (az + bz) / 2;
  const dx = bx - ax, dz = bz - az;
  const sep = Math.max(1, Math.hypot(dx, dz));
  const ux = dx / sep, uz = dz / sep;                    // along the meeting
  const side = (Math.floor(seed) % 2) * 2 - 1;           // which beam we stand on
  const px = -uz * side, pz = ux * side;
  const dist = Math.min(230, Math.max(55, sep * 1.35));
  const y = Math.min(60, 9 + sep * 0.22);
  return {
    mx, mz, dur: CINE_DUR, y,
    x0: mx + px * dist - ux * dist * 0.18,
    z0: mz + pz * dist - uz * dist * 0.18,
    dollyX: (ux * dist * 0.36) / CINE_DUR,               // the slow drift, m/s
    dollyZ: (uz * dist * 0.36) / CINE_DUR,
    lookY: 6,
  };
}

// camera pose u seconds into the shot (main.js feeds it to the photo lens,
// whose own floor keeps it above the swell)
export function cinePose(shot, u) {
  return {
    x: shot.x0 + shot.dollyX * u,
    y: shot.y,
    z: shot.z0 + shot.dollyZ * u,
    lookAt: { x: shot.mx, y: shot.lookY, z: shot.mz },
  };
}

// the angle (degrees) both ships subtend from a pose — verify uses this to
// prove the framing promise; exported so the check and the shot share maths
export function cineSubtend(pose, ax, az, bx, bz) {
  const v1x = ax - pose.x, v1z = az - pose.z;
  const v2x = bx - pose.x, v2z = bz - pose.z;
  const dot = v1x * v2x + v1z * v2z;
  const m = Math.hypot(v1x, v1z) * Math.hypot(v2x, v2z);
  return (Math.acos(Math.min(1, Math.max(-1, dot / m))) * 180) / Math.PI;
}

export const CINE_FOV_SAFE = FOV_SAFE;
