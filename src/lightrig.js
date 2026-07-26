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
// Returns { dir, ax, az, low, amp, moon }:
//   dir  — THE SOURCE'S TRUE UNIT WORLD DIRECTION. It exists because ocean.js
//          used to REBUILD the direction from `low` (y = (1 - low)/1.15, floored
//          at 0.04) and that reconstruction is lossy in two ways: `low` saturates
//          at 0 once the altitude passes 1/1.15, so the rebuilt elevation had a
//          hard ceiling of 60.41 degrees and disagreed with the real sun by
//          29.6 degrees at noon; and the 0.04 floor held the source 2.3 degrees
//          ABOVE the horizon while the real one was up to 4.3 below it. The
//          sparkle pass and the scene's own DirectionalLight were therefore lit
//          from two different suns whenever the sun was high. Hand over the
//          vector and there is nothing to get wrong. (verify-glitter measures
//          the agreement across a full cycle; it must stay at zero.)
//   ax/az — the same bearing as a unit xz pair. NOTHING AT RUNTIME READS THEM
//           any more: ocean.js took them until 2026-07-26 and now takes `dir`.
//           They are kept because verify-light asserts them (unit length, and
//           that the blade points at the sun), which is a cheap standing check
//           that the source's azimuth is right — and because a bearing is what a
//           future HUD or chart drive would want. Do not build geometry on them:
//           they carry no elevation, which is how the 29.6-degree bug happened.
//   low  — how low the source stands (0 high -> 1 grazing). NOT a direction:
//          it drives colour temperature, nothing geometric.
//   moon — which body owns the water, so the corridor can be cooled.
export function glitterSource(sol, lun, moonBright) {
  if (sol.dayness > 0.12) {
    const len = Math.hypot(sol.dir[0], sol.dir[2]) || 1e-6;
    return {
      dir: sol.dir,
      ax: sol.dir[0] / len, az: sol.dir[2] / len,
      low: Math.max(0, Math.min(1, 1 - sol.sunAlt * 1.15)),
      amp: 0.9 * sol.dayness,
      moon: false,
    };
  }
  if (lun.alt > 0.05 && moonBright > 0.05) {
    const len = Math.hypot(lun.dir[0], lun.dir[2]) || 1e-6;
    return {
      dir: lun.dir,
      ax: lun.dir[0] / len, az: lun.dir[2] / len,
      low: Math.max(0, Math.min(1, 1 - lun.alt * 1.15)),
      amp: 0.4 * moonBright,
      moon: true,
    };
  }
  return { dir: [0, 1, 0], ax: 0, az: 1, low: 0, amp: 0, moon: false };
}

export function moonBrightness(phase) {
  return 0.15 + 0.85 * (1 - Math.abs(phase - 0.5) * 2);
}

// The moonlit night — how much the moon lifts the dark. The playtest verdict
// was that night ran PITCH; under a decent moon the sea should read: hull,
// sails, horizon. Returns the scene-light levels sky.js applies:
//   moonInt  — the moon's directional intensity (was a token 0.22 peak)
//   hemiLift — ambient bounce added to the hemisphere light
//   domeLift — 0..1: how far the night dome lifts toward moonlit slate
// All zero with the moon down or the sun up; a new-moon night stays black —
// the moon is a navigation instrument, and its absence must still mean
// something.
// Bioluminescence — how hard the night wake burns. Warm water only (fades
// out by |lat| 32°), needs real dark (a bright moon washes it out), and
// storm-gloom mutes it like everything else. 0 by day, 1 on a moonless
// tropical night: the wake becomes green fire, the most beautiful thing
// on a dark sea.
export function bioGlow(nightness, latAbs, moonBright, moonAlt, gloom = 0) {
  const dark = Math.max(0, nightness - 0.15) / 0.85;
  const warm = Math.max(0, 1 - (latAbs / 32) ** 2); // the tropics plateau, then it dies fast
  const moonWash = 1 - 0.7 * moonBright * Math.max(0, moonAlt);
  return Math.max(0, Math.min(1, dark * warm * moonWash * (1 - 0.6 * gloom)));
}

export function moonlitNight(nightness, moonAlt, moonBright) {
  const up = Math.max(0, Math.min(1, moonAlt * 2.2)); // full effect once well risen
  const k = Math.max(0, Math.min(1, nightness)) * up * moonBright;
  return {
    moonInt: 0.85 * k,
    hemiLift: 0.32 * k,
    domeLift: Math.min(1, 1.3 * k),
  };
}
