// Weather — the sea's real weather. verify-weather.mjs guards the pure part.
//
// Two layers, exactly the Moorstead weather-live.js pattern:
//
// 1. PURE: windProfile (the wind BUILDS offshore — inshore is sheltered,
//    blue water blows), and mapMarine (WMO code + fields -> the game's
//    weather state). Both headless-testable, no fetch, no Date.
// 2. LIVE: Open-Meteo (keyless, CORS-friendly) polled at the ship's REAL
//    lat/lon — the map is real Earth, so the Azores get Azores weather.
//    Any failure leaves the procedural wind machine in charge: live weather
//    is a layer, never a dependency (the Moorstead rule).

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

// WMO weather code + fields -> the game's marine weather. Pure.
export function mapMarine(s) {
  const code = s.weatherCode ?? 0;
  const cloud = s.cloudCover ?? 0;
  const windKmh = s.windSpeed ?? 25;
  let state;
  if (code >= 95) state = 'storm';
  else if (code === 45 || code === 48) state = 'fog';
  else if (code >= 51 && code <= 82) state = 'rain';
  else if (cloud > 85) state = 'overcast';
  else state = 'clear';
  return {
    state,
    windMs: clamp(windKmh / 3.6, 2, 24),          // km/h -> m/s, bounded sane
    windFromRad: ((s.windDirection ?? 132) * Math.PI) / 180, // met convention: FROM
    gloom: state === 'storm' ? 0.75 : state === 'rain' ? 0.55
      : state === 'fog' ? 0.5 : state === 'overcast' ? 0.35 : 0,
  };
}

// ---- live ----
const TTL = 5 * 60 * 1000;   // refresh every 5 min...
const MOVE_DEG = 4;          // ...or after sailing 4 real degrees

export class LiveWeather {
  constructor() {
    this.cached = null;
    this.at = { lat: null, lon: null, t: 0 };
    this.inflight = false;
  }

  // call every frame with the ship's real position; fetches when stale
  poll(lat, lon) {
    const now = Date.now();
    const moved = this.at.lat === null
      || Math.hypot(lat - this.at.lat, lon - this.at.lon) > MOVE_DEG;
    if (!this.inflight && (moved || now - this.at.t > TTL)) this.fetch(lat, lon);
    return this.cached;
  }

  async fetch(lat, lon) {
    this.inflight = true;
    this.at = { lat, lon, t: Date.now() };
    try {
      const url = 'https://api.open-meteo.com/v1/forecast'
        + `?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}`
        + '&current=weather_code,cloud_cover,wind_speed_10m,wind_direction_10m';
      const r = await fetch(url);
      if (!r.ok) throw new Error('http ' + r.status);
      const j = await r.json();
      const c = j.current;
      if (!c || typeof c.wind_speed_10m !== 'number') throw new Error('no current data');
      this.cached = mapMarine({
        weatherCode: c.weather_code,
        cloudCover: c.cloud_cover,
        windSpeed: c.wind_speed_10m,
        windDirection: c.wind_direction_10m,
      });
    } catch {
      // keep the last sample (or null): the procedural wind machine holds
    }
    this.inflight = false;
  }
}
