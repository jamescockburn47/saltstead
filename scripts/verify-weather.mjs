// verify-weather: the wind builds offshore, WMO codes map to sane marine
// states, and the sea state tracks the wind inside its clamps. Pure half
// only — the live fetch is a layer, never a dependency (the Moorstead rule).
import { windProfile, mapMarine, seaStateFor } from '../src/weather.js';
import { SEA_STATE_MIN, SEA_STATE_MAX, setSeaState, getSeaState, waveHeight } from '../src/waves.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// wind builds offshore
ok(windProfile(0, 7) === 7 && windProfile(600, 7) === 7, 'sheltered inshore: base wind');
ok(Math.abs(windProfile(50000, 7) - 7 * 1.9) < 1e-9, 'blue water: 1.9x the base');
ok(windProfile(2000, 7) > 7 && windProfile(2000, 7) < 13.3, 'building through the offshore band');
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
  setSeaState(1); // leave the world as we found it for later scripts
}

if (failed) { console.error(`verify-weather: ${failed} FAILED`); process.exit(1); }
console.log('verify-weather: OK — wind builds 1x->1.9x offshore, WMO map sane, sea state linear + clamped');
