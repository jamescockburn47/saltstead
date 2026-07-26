// Weather — the sea's wind-speed profile and sky dressing. verify-weather.mjs
// guards it. Pure, no fetch, no Date. Wind DIRECTION and strength-by-latitude
// now come from the procedural wind field (wind.js); the live Open-Meteo layer
// was retired for determinism (spec 2026-07-17). Storms (a later plan) will
// drive weatherState/sea state procedurally; until then the sky stays fair.

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smooth01 = (t) => { const c = clamp(t, 0, 1); return c * c * (3 - 2 * c); };

// ---- pure ----

// ---- THE WIND'S SHELTER PROFILE, AND ITS FLOOR (rebuilt 2026-07-26) ----
// `base` is the OPEN-WATER wind at this latitude (wind.js windAt). Inshore the
// land steals a share of it; past the headlands it fills in fast (full by
// ~1.5 km — playtest: the old 3.4 km build left harbours sluggish). Blue water
// therefore carries 1.9x a sheltered harbour's wind, which stacked on the
// open-sea gait is what makes a crossing FEEL like flying — wherever the
// sheltered value clears the floor, which needs an open wind over
// WIND_FLOOR / WIND_LEE = 8.55 m/s. It does through the trades and the whole
// westerly belt (about 45% of latitudes; verify-weather holds the threshold
// below the trade belt); in the two calm belts the floor closes the gap, and
// correctly so — there is no lee to feel when the whole system is at the floor.
//
// WHAT CHANGED, AND WHY IT HAD TO. This was `base * (1 -> 1.9)` against a
// WIND_FLOOR of 10 m/s. But the latitude field's global maximum was 9.19 m/s,
// so the floor sat above the field's ceiling and won nearly everywhere:
// measured, harbour wind was exactly 10.00 m/s at EVERY latitude on earth and
// blue water was 10.00 at fourteen of nineteen sample latitudes. Sailing the
// Channel (field 5.30) and the Indian Ocean (field 3.00) both read 10.00. The
// trade-wind system was masked, and with it the sea: seaBandsFor takes the
// wind, so a constant wind meant a constant swell (1.54, significant height
// 2.88 m) from the doldrums to the Southern Ocean.
//
// The fix is not to delete the floor — a sailing game you cannot sail is
// broken, and that pillar stands. It is that the floor was doing the WEATHER's
// job. So: wind.js now carries real magnitudes (trades 9, forties 12, the
// fifties 15), the multiplier becomes an inshore SHELTER rather than an
// offshore doubling (same 1.9x contrast, honest absolute values), and the floor
// drops to a genuine light breeze. 4.5 m/s is Beaufort 3: she ghosts along
// under full sail, and it happens to be about the real mean of the doldrums and
// the horse latitudes, so the calm belts now read AS the floor instead of the
// floor reading as the world. A true calm has an answer besides the floor
// anyway — the sweeps (oars.js, the wind-proof crawl).
export const WIND_FLOOR = 4.5;        // m/s — the quiet day, not the only weather
export const WIND_LEE = 1 / 1.9;      // share of blue water's wind left inshore
export function windProfile(coastDist, base) {
  const shelter = WIND_LEE + (1 - WIND_LEE) * smooth01((coastDist - 200) / 1300);
  return Math.max(WIND_FLOOR, base * shelter);
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
  const swell = clamp(swellRise(windMs), 0, 2.4) * (0.45 + 0.55 * fetch);
  return { swell, chop };
}

// THE SWELL SATURATES (2026-07-26). The rise used to be linear —
// 0.22 * (wind - 3) — which reached the 2.4 ceiling at 13.91 m/s. That was
// harmless while the wind was pinned at 10 everywhere; with a real wind field
// it is not: the westerlies run 12-15 m/s in open water, so the ordinary
// roaring-forties day would have sat ON the ceiling, the whole 14-30 m/s range
// would have collapsed into one sea, and a storm on top of it would have added
// nothing at all. Exactly the top-end flattening a linear ramp into a hard clamp
// always produces.
//
// So the rise is exponential toward an asymptote ABOVE the ceiling. The
// reference is unmoved by construction: SWELL_ASYM is derived so that a 10 m/s
// day well offshore still raises SWELL_REF = 1.54, the number waves.js's
// SPECTRUM.level was measured against and that verify-waves, verify-seamotion
// and glitter.js's energy reference all quote. What changes is the shape above
// it — the ceiling is now reached at 17.6 m/s, a fresh gale (Beaufort 8, a real
// 4.4 m significant height), so the westerlies get a genuinely big sea with
// room left over for the storm that arrives on top of it.
export const SWELL_REF_WIND = 10;  // the reference working breeze, m/s
export const SWELL_REF = 1.54;     // ...and the roller band it raises (unchanged)
const SWELL_CALM = 3;              // m/s below which no long sea builds at all
const SWELL_E = 11;                // m/s of wind per e-fold toward the asymptote
const SWELL_ASYM = SWELL_REF
  / (1 - Math.exp(-(SWELL_REF_WIND - SWELL_CALM) / SWELL_E));
export function swellRise(windMs) {
  return SWELL_ASYM * (1 - Math.exp(-Math.max(0, windMs - SWELL_CALM) / SWELL_E));
}

