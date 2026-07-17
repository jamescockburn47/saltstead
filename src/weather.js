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
export function seaStateFor(windMs) {
  return clamp(0.55 + 0.062 * windMs, 0.6, 2);
}

