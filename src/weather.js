// Weather — the sea's wind-speed profile and sky dressing. verify-weather.mjs
// guards it. Pure, no fetch, no Date. Wind DIRECTION and strength-by-latitude
// now come from the procedural wind field (wind.js); the live Open-Meteo layer
// was retired for determinism (spec 2026-07-17). Storms (a later plan) will
// drive weatherState/sea state procedurally; until then the sky stays fair.

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smooth01 = (t) => { const c = clamp(t, 0, 1); return c * c * (3 - 2 * c); };

// ---- pure ----

// Inshore the land steals a LITTLE of the wind; past the headlands it fills
// in fast (full by ~1.5 km — playtest: the old 3.4 km build left harbours
// sluggish). Up to 1.9x the base in true blue water — stacked on the
// open-sea gait, this is what makes a crossing FEEL like flying. And the
// game's sea is NEVER becalmed: whatever the forecast or the gusts say, the
// sail always has WIND_FLOOR to work with (pillar: the sea must not be
// boring — a real calm is true to the Atlantic but false to the game).
export const WIND_FLOOR = 10; // m/s, everywhere, always
export function windProfile(coastDist, base) {
  return Math.max(WIND_FLOOR, base * (1 + 0.9 * smooth01((coastDist - 200) / 1300)));
}

// How the sky DRESSES each weather state — skyfx.js (the clouds and the
// rain) reads this table so the visuals and the forecast can never drift
// apart. cloud: fraction of the puff fleet flying (0..1). rain: streak
// intensity (0..1, 0 = dry).
export function skyDressing(state) {
  switch (state) {
    case 'storm':    return { cloud: 1.0,  rain: 1.0 };
    case 'rain':     return { cloud: 0.85, rain: 0.55 };
    case 'fog':      return { cloud: 0.9,  rain: 0 };
    case 'overcast': return { cloud: 0.75, rain: 0 };
    default:         return { cloud: 0.25, rain: 0 }; // fair-weather cumulus
  }
}

// Wind makes the sea: a linear multiplier on the whole wave table
// (waves.js setSeaState). 7 m/s reads as today's sea; a gale doubles it.
// Kept for the one-scalar callers (the title's staged battle); the live
// game drives the two bands below.
export function seaStateFor(windMs) {
  return clamp(0.55 + 0.062 * windMs, 0.6, 2);
}

// ---- the two-band sea (waves.js setSeaBands, 2026-07-25) ----
// CHOP is the local wind-sea: it answers the breeze almost linearly and
// lives everywhere there is wind. SWELL is deep-water rollers: it takes a
// HARD wind to raise and OPEN WATER to carry — coastDist is the game's
// honest depth-and-shelter proxy (no bathymetry in the build): under the
// land's lee the long sea never arrives, in blue water it rolls. main.js
// eases the two at different rates — chop in minutes, swell as the ocean's
// memory — so a died gale leaves rollers under a quiet wind.
export function seaBandsFor(windMs, coastDist) {
  const chop = clamp(0.5 + 0.055 * windMs, 0.55, 1.9);
  // THE SWELL-LESS SEA (measured 2026-07-25). The old fetch curve only came
  // good ~4 km offshore, and players sail COASTS — ports, islands, the
  // Caribbean, the Channel. Measured in the live game off the Wight at 10
  // m/s: swell band 0.11. The title scene, whose water is the benchmark
  // ("the landing page video looks amazing"), sails at 1.9 — the SAME
  // renderer, the same shader, ten to twenty times the roll. The game was
  // showing nearly every player a sea with no rollers in it at all: only
  // chop, which is short and low and reads as flat water.
  //
  // Three corrections, one idea — let the swell BE a swell, and let the
  // shore field do the sheltering it was built to do:
  //  1. fetch comes good over 200 -> 1800 m instead of 400 -> 4000. A ship a
  //     mile offshore is in open water and should feel it.
  //  2. the lee floor rises 0.15 -> 0.45: swell is far-travelled, so even
  //     under the land it arrives, diminished — that is what a lee IS.
  //  3. the wind curve starts at a lighter breeze and climbs harder, so the
  //     ordinary 10 m/s day carries a real heave rather than a ripple.
  // The inshore calm the design's first law demands is NOT lost: waves.js
  // shoreOpenAtten still crushes the open set to SHORE_CALM at the waterline
  // and the strait gate still stands surf down in sheltered channels. That
  // sheltering was being applied TWICE, and the second helping killed the
  // sea. verify-weather holds the shape; live-spectrum holds the pixels.
  const fetch = smooth01((coastDist - 200) / 1600); // shelter -> blue water
  const swell = clamp(0.22 * (windMs - 3), 0, 2.4) * (0.45 + 0.55 * fetch);
  return { swell, chop };
}

