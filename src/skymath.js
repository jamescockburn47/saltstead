// Sky maths — pure, no THREE, no DOM. verify-sky.mjs guards it.
// Ported from Moorstead's solar machinery (sky.js): the same dayness /
// golden-hour curves, the same accelerated moon; NEW here is the latitude-
// aware celestial frame — Saltstead spans the planet, so the star field is a
// working navigation instrument (Polaris altitude = your latitude).

export const DAY_LENGTH = 1800; // seconds per full game day (Moorstead parity)

// sun position on its arc. t in seconds; frac 0 = midnight, 0.5 = noon.
// Sun rises east (+x) and sets west (-x); at noon it stands toward the
// equator (south in the northern hemisphere: +z).
export function solarState(t) {
  const frac = ((t / DAY_LENGTH) % 1 + 1) % 1;
  const a = (frac - 0.25) * 2 * Math.PI;       // -PI/2 at midnight ... peak at noon
  const sunAlt = Math.sin(a) * 0.9 + 0.05;     // slight lift: long twilight
  const dir = [
    Math.cos(a),                                // east at dawn, west at dusk
    sunAlt,
    0.35 * (1 - Math.abs(Math.sin(a))),         // bows toward the equator midday
  ];
  const len = Math.hypot(...dir) || 1;
  const dayness = Math.max(0, Math.min(1, (sunAlt + 0.12) * 3)); // Moorstead's curve
  const golden = Math.max(0, 1 - Math.abs(sunAlt - 0.08) * 9);   // sunrise/sunset band
  return {
    frac, sunAlt,
    dir: dir.map((v) => v / len),
    dayness, nightness: 1 - dayness, golden,
  };
}

// accelerated moon (Moorstead [SOLAR]): a short synodic month so phases are
// something you watch, not something you wait for
export const MOON_MONTH_DAYS = 12;
export function moonPhase(t) {
  const day = t / DAY_LENGTH;
  return ((day / MOON_MONTH_DAYS) % 1 + 1) % 1; // 0 = new, 0.5 = full
}

// the moon trails the sun by its phase angle around the same arc
export function lunarState(t) {
  const phase = moonPhase(t);
  const s = solarState(t - phase * DAY_LENGTH);
  return { phase, dir: s.dir, alt: s.sunAlt };
}

// star wheel: one full turn per game day around the celestial pole
export function starWheelAngle(t) {
  return ((t / DAY_LENGTH) % 1) * 2 * Math.PI;
}

// The two rotations that hang the equatorial frame over the deck, shared by
// the 3D sky (sky.js quaternions) and the star chart (navigation.js) so the
// planisphere can never disagree with the heavens it charts.
// World horizon frame: +x east, +y up, -z NORTH (earth.js: north = -z).
//   wheel: about +Y, negative so stars march east -> west like the sun
//   tilt:  about +X, negative so the pole leans to the NORTH horizon
export function celestialAngles(t, latDeg) {
  return {
    wheel: -starWheelAngle(t),
    tilt: -(90 - latDeg) * (Math.PI / 180),
  };
}

// equatorial unit vector -> world horizon frame (wheel about Y, then tilt
// about X — exactly what sky.js does with quaternions)
export function eqToWorld(v, t, latDeg) {
  const { wheel, tilt } = celestialAngles(t, latDeg);
  const cw = Math.cos(wheel), sw = Math.sin(wheel);
  const x1 = v[0] * cw + v[2] * sw;
  const z1 = -v[0] * sw + v[2] * cw;
  const ca = Math.cos(tilt), sa = Math.sin(tilt);
  return [x1, v[1] * ca - z1 * sa, v[1] * sa + z1 * ca];
}

// where a star stands from the deck: altitude above the horizon and azimuth
// (0 = north, PI/2 = east, PI = south — the compass rose convention)
export function starHorizon(raH, decDeg, t, latDeg) {
  const [x, y, z] = eqToWorld(raDecToEq(raH, decDeg), t, latDeg);
  return { alt: Math.asin(Math.max(-1, Math.min(1, y))), az: Math.atan2(x, -z) };
}

// ---- the pocket catalogue: enough real sky to navigate by ----
// [name, RA hours, Dec degrees, magnitude, warmth 0=blue 1=amber]
// Northern kit: Polaris + the Plough + Cassiopeia + Orion + Sirius.
// Southern kit: the Southern Cross + the Pointers (Alpha/Beta Centauri).
export const STAR_CATALOGUE = [
  ['Polaris', 2.5303, 89.264, 1.98, 0.40],
  // the Plough
  ['Dubhe', 11.0622, 61.751, 1.79, 0.75], ['Merak', 11.0307, 56.383, 2.37, 0.10],
  ['Phecda', 11.8972, 53.695, 2.44, 0.10], ['Megrez', 12.2571, 57.033, 3.31, 0.10],
  ['Alioth', 12.9005, 55.960, 1.77, 0.10], ['Mizar', 13.3988, 54.925, 2.27, 0.10],
  ['Alkaid', 13.7924, 49.313, 1.86, 0.05],
  // Cassiopeia's W
  ['Caph', 0.1530, 59.150, 2.28, 0.30], ['Schedar', 0.6751, 56.537, 2.24, 0.75],
  ['Tsih', 0.9451, 60.717, 2.47, 0.05], ['Ruchbah', 1.4303, 60.235, 2.68, 0.25],
  ['Segin', 1.9066, 63.670, 3.38, 0.10],
  // Orion — the equator's signpost, visible from both hemispheres
  ['Betelgeuse', 5.9195, 7.407, 0.50, 1.00], ['Bellatrix', 5.4189, 6.350, 1.64, 0.05],
  ['Mintaka', 5.5334, -0.299, 2.23, 0.05], ['Alnilam', 5.6036, -1.202, 1.69, 0.05],
  ['Alnitak', 5.6793, -1.943, 1.77, 0.05], ['Saiph', 5.7959, -9.670, 2.09, 0.05],
  ['Rigel', 5.2423, -8.202, 0.13, 0.05],
  ['Sirius', 6.7525, -16.716, -1.46, 0.10],
  // the Southern Cross + Pointers
  ['Acrux', 12.4433, -63.099, 0.76, 0.05], ['Mimosa', 12.7953, -59.689, 1.25, 0.05],
  ['Gacrux', 12.5194, -57.113, 1.64, 0.95], ['Imai', 12.2524, -58.749, 2.79, 0.05],
  ['Alpha Cen', 14.6599, -60.834, -0.27, 0.60], ['Hadar', 14.0637, -60.373, 0.61, 0.05],
];

// RA/Dec -> unit vector in the EQUATORIAL frame: celestial pole = +Y,
// RA 0 meridian = +Z, east = +X. The scene tilts this whole frame so the
// pole stands at the observer's latitude (verify: Polaris rides the pole).
export function raDecToEq(raH, decDeg) {
  const ra = (raH * Math.PI) / 12, dec = (decDeg * Math.PI) / 180;
  return [
    Math.cos(dec) * Math.sin(ra),
    Math.sin(dec),
    Math.cos(dec) * Math.cos(ra),
  ];
}

// deterministic background star field (invariant 6: fixed seed, same heavens
// for every client — the Moorstead lesson, learned there the hard way)
export function starField(count = 650, seed = 1900) {
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
  const out = [];
  for (let i = 0; i < count; i++) {
    const z = rnd() * 2 - 1, a = rnd() * 2 * Math.PI;
    const r = Math.sqrt(1 - z * z);
    out.push({
      dir: [r * Math.cos(a), z, r * Math.sin(a)],
      mag: 2.5 + rnd() * 3.5,
      warmth: rnd(),
    });
  }
  return out;
}
