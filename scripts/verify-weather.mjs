// verify-weather: the wind builds offshore, WMO codes map to sane marine
// states, and the sea state tracks the wind inside its clamps. Pure half
// only — the live fetch is a layer, never a dependency (the Moorstead rule).
import {
  windProfile, seaStateFor, seaBandsFor, skyDressing, WIND_FLOOR,
} from '../src/weather.js';
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

// the two-band sea: chop is the LOCAL wind-sea, swell needs wind AND water
{
  const calmIn = seaBandsFor(10, 100);    // light air in the land's lee
  const calmOut = seaBandsFor(10, 5000);  // light air, blue water
  const galeIn = seaBandsFor(22, 100);    // hard wind, sheltered
  const galeOut = seaBandsFor(22, 5000);  // hard wind, blue water — the rollers
  ok(calmIn.swell < 0.25, `the lee shore carries no rollers in light air (${calmIn.swell.toFixed(2)})`);
  ok(galeOut.swell > 2, `a gale over blue water rolls DEEP (${galeOut.swell.toFixed(2)})`);
  ok(galeIn.swell < galeOut.swell * 0.35, 'the land\'s lee kills the long sea even in wind');
  ok(calmOut.swell < galeOut.swell * 0.45, 'and light air raises only a modest heave offshore');
  ok(galeOut.chop > calmOut.chop, 'chop follows the wind');
  ok(Math.abs(seaBandsFor(15, 100).chop - seaBandsFor(15, 9000).chop) < 1e-9,
    'chop is local — it does not care about fetch');
  ok(seaBandsFor(99, 99999).swell <= 2.4 && seaBandsFor(99, 99999).chop <= 1.9,
    'both bands respect their ceilings');
  // the contrast the deck feels: gale/blue-water total vs light-air/lee total
  const heavy = galeOut.swell + galeOut.chop, quiet = calmIn.swell + calmIn.chop;
  ok(heavy > quiet * 2.5, `the sea VARIES: ${heavy.toFixed(2)} rolling vs ${quiet.toFixed(2)} quiet`);
}
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
