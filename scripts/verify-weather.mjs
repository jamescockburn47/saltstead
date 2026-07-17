// verify-weather: the wind builds offshore, WMO codes map to sane marine
// states, and the sea state tracks the wind inside its clamps. Pure half
// only — the live fetch is a layer, never a dependency (the Moorstead rule).
import { windProfile, mapMarine, seaStateFor, skyDressing, WIND_FLOOR } from '../src/weather.js';
import {
  SEA_STATE_MIN, SEA_STATE_MAX, RIVER_STATE, MAX_WAVE_HEIGHT,
  setSeaState, getSeaState, waveHeight,
} from '../src/waves.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// wind builds offshore — fast (full 1.9x by ~1.5 km), and NEVER below the floor
ok(WIND_FLOOR === 10, 'the game sea is never becalmed: floor at 10 m/s');
ok(windProfile(0, 7) === WIND_FLOOR && windProfile(0, 2) === WIND_FLOOR,
  'a sheltered harbour still gives the sail 10 m/s to work with');
ok(windProfile(9999, 1) === WIND_FLOOR, 'even a forecast dead-calm floors at 10 offshore');
ok(Math.abs(windProfile(50000, 7) - 7 * 1.9) < 1e-9, 'blue water: 1.9x the base');
ok(Math.abs(windProfile(1500, 7) - 7 * 1.9) < 1e-9, 'full build already by 1.5 km off (the playtest fix)');
ok(windProfile(800, 12) > 12 && windProfile(800, 12) < 12 * 1.9, 'building through the inshore band');
let prev = -1, mono = true;
for (let d = 0; d <= 6000; d += 100) { const w = windProfile(d, 7); if (w < prev - 1e-9) mono = false; prev = w; }
ok(mono, 'monotonic build all the way out');

// WMO mapping
ok(mapMarine({ weatherCode: 0, cloudCover: 10, windSpeed: 20 }).state === 'clear', 'code 0 = clear');
ok(mapMarine({ weatherCode: 45 }).state === 'fog', 'code 45 = fog');
ok(mapMarine({ weatherCode: 63 }).state === 'rain', 'code 63 = rain');
ok(mapMarine({ weatherCode: 95 }).state === 'storm', 'code 95 = storm');
ok(mapMarine({ weatherCode: 2, cloudCover: 95 }).state === 'overcast', 'near-total cloud = overcast');
ok(mapMarine({ weatherCode: 2, cloudCover: 70 }).state === 'clear', '70% cloud still reads clear (the Goathland lesson)');
{
  const m = mapMarine({ weatherCode: 0, windSpeed: 36, windDirection: 270 });
  ok(Math.abs(m.windMs - 10) < 1e-9, '36 km/h -> 10 m/s');
  ok(Math.abs(m.windFromRad - Math.PI * 1.5) < 1e-9, 'met degrees -> radians, FROM convention');
  ok(mapMarine({ windSpeed: 200 }).windMs === 24, 'hurricane clamped to the game ceiling');
  ok(mapMarine({ windSpeed: 0 }).windMs === 2, 'dead calm floored');
  ok(mapMarine({ weatherCode: 95 }).gloom > mapMarine({ weatherCode: 2, cloudCover: 95 }).gloom, 'storm gloomier than overcast');
  ok(mapMarine({ weatherCode: 0, cloudCover: 0 }).gloom === 0, 'clear sky, no gloom');
}

// the sky dressing table: every state dresses sanely, and worse weather
// never wears LESS cloud
{
  for (const st of ['clear', 'overcast', 'fog', 'rain', 'storm']) {
    const d = skyDressing(st);
    ok(d.cloud >= 0 && d.cloud <= 1 && d.rain >= 0 && d.rain <= 1, `${st} dresses in bounds`);
  }
  ok(skyDressing('clear').cloud < skyDressing('overcast').cloud, 'overcast wears more cloud than clear');
  ok(skyDressing('storm').cloud === 1, 'a storm fills the sky');
  ok(skyDressing('storm').rain > skyDressing('rain').rain, 'a storm rains harder than rain');
  ok(skyDressing('clear').rain === 0 && skyDressing('overcast').rain === 0
    && skyDressing('fog').rain === 0, 'only rain and storm are wet');
}

// sea state follows the wind, clamped, and scales the real wave field
ok(seaStateFor(7) > 0.9 && seaStateFor(7) < 1.05, `7 m/s is today's sea (${seaStateFor(7).toFixed(2)})`);
ok(seaStateFor(24) === SEA_STATE_MAX, 'gale pins the ceiling');
ok(seaStateFor(0) === SEA_STATE_MIN, 'calm pins the floor');
{
  const y0 = waveHeight(123.4, -56.7, 42);
  setSeaState(2);
  const y2 = waveHeight(123.4, -56.7, 42);
  ok(Math.abs(y2 - 2 * y0) < 1e-12, 'sea state is a clean linear factor on the wave sum');
  ok(getSeaState() === 2, 'getter reads back');
  setSeaState(99);
  ok(getSeaState() === SEA_STATE_MAX, 'setter clamps');
  // a river is calmer than any sea the wind can make: the setter admits the
  // near-flat inland state, and the waves really do lie down
  ok(RIVER_STATE < SEA_STATE_MIN, 'river calm undercuts the wind floor');
  setSeaState(RIVER_STATE);
  ok(getSeaState() === RIVER_STATE, 'inland water may lie near-flat');
  ok(Math.abs(waveHeight(123.4, -56.7, 42)) < MAX_WAVE_HEIGHT * RIVER_STATE + 1e-12,
    'river waves are ripples');
  setSeaState(1); // leave the world as we found it for later scripts
}

if (failed) { console.error(`verify-weather: ${failed} FAILED`); process.exit(1); }
console.log('verify-weather: OK — 10 m/s floor everywhere, full build by 1.5 km, WMO map + sky dressing sane, sea state linear + clamped');
