// Light-rig drives — pure, no THREE, no DOM. verify-light.mjs guards it.
// The per-frame numbers behind Moorstead's light dynamics, ported:
//   exposureTarget — deterministic eye adaptation (midday ~1.15 -> night ~1.32)
//   glitterSource  — the sword-of-the-sun corridor drive, EXTENDED: at night
//                    the blade hands over to the moon, scaled by its phase.

export const EXPOSURE_BASE = 1.25;

export function exposureTarget(dayness) {
  return 1.15 + 0.17 * (1 - dayness);
}

// sol: solarState(t); lun: lunarState(t); moonBright: 0 new -> 1 full.
// Returns { ax, az, low, amp }: corridor azimuth (unit xz), how low the light
// stands (0 high -> 1 grazing; narrows the blade), and glitter amplitude.
export function glitterSource(sol, lun, moonBright) {
  if (sol.dayness > 0.12) {
    const len = Math.hypot(sol.dir[0], sol.dir[2]) || 1e-6;
    return {
      ax: sol.dir[0] / len, az: sol.dir[2] / len,
      low: Math.max(0, Math.min(1, 1 - sol.sunAlt * 1.15)),
      amp: 0.9 * sol.dayness,
    };
  }
  if (lun.alt > 0.05 && moonBright > 0.05) {
    const len = Math.hypot(lun.dir[0], lun.dir[2]) || 1e-6;
    return {
      ax: lun.dir[0] / len, az: lun.dir[2] / len,
      low: Math.max(0, Math.min(1, 1 - lun.alt * 1.15)),
      amp: 0.4 * moonBright,
    };
  }
  return { ax: 0, az: 1, low: 0, amp: 0 };
}

export function moonBrightness(phase) {
  return 0.15 + 0.85 * (1 - Math.abs(phase - 0.5) * 2);
}
