// verify-earth: the planet must be the REAL planet. Known places land where
// they should, the projection round-trips, coast distance behaves, elevation
// is deterministic, and the open-sea gait ramps correctly.
import {
  latLonToWorld, worldToLatLon, isLand, coastDistGame, signedCoastGame,
  elevation, gaitFactor, riverDistGame, mountainness,
  encounterGait, ENCOUNTER_NEAR, ENCOUNTER_FAR, GAIT_MAX,
  RING_COUNT, POINT_COUNT, RIVER_COUNT, MTN_COUNT, M_PER_DEG, COAST_CAP, RIVER_CAP,
} from '../src/earth.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

ok(RING_COUNT > 1000, `a world of islands (${RING_COUNT} rings)`);
ok(POINT_COUNT > 40000, `coastline detail survived the bake (${POINT_COUNT} points)`);

// projection round-trip
for (const [lat, lon] of [[0, 0], [53.07, -4.08], [-34.35, 18.47], [64, -179.5]]) {
  const w = latLonToWorld(lat, lon);
  const b = worldToLatLon(w.x, w.z);
  ok(Math.abs(b.lat - lat) < 1e-9 && Math.abs(b.lon - lon) < 1e-9, `round-trip (${lat},${lon})`);
}
ok(latLonToWorld(10, 0).z < 0, 'north is -z');
ok(latLonToWorld(0, 10).x > 0, 'east is +x');

// the ground truth tour: places every sailor knows
const LAND = [
  ['London', 51.5, -0.12], ['Snowdonia (the dragons)', 53.07, -4.08],
  ['Jamaica inland', 18.11, -77.28], ['Cuba', 21.9, -78.9],
  ['Florida', 27.9, -81.4], ['Sahara', 23, 10], ['Kansas', 38.5, -98.4],
  ['Iceland', 64.9, -18.5], ['Madagascar', -19.5, 46.8], ['Tasmania', -42.0, 146.6],
];
const SEA = [
  ['mid-Atlantic', 30, -45], ['mid-Pacific', 0, -150],
  ['North Sea', 56.5, 3.0], ['Caribbean off Port Royal', 17.5, -76.8],
  ['English Channel', 50.2, -1.0], ['Bermuda Triangle heart', 25.5, -70],
  ['Bay of Biscay', 45.5, -5.0], ['Tasman Sea', -40, 160],
];
for (const [name, lat, lon] of LAND) ok(isLand(lat, lon), `${name} is land`);
for (const [name, lat, lon] of SEA) ok(!isLand(lat, lon), `${name} is sea`);

// coast distance: tiny at the shore, capped in the deep, signs agree with isLand
ok(coastDistGame(51.5, 0.7) < 0.6 * M_PER_DEG, 'Thames estuary is near a coast');
ok(coastDistGame(30, -45) === COAST_CAP, 'mid-Atlantic hits the cap');
ok(signedCoastGame(38.5, -98.4) > 0, 'Kansas is inside');
ok(signedCoastGame(30, -45) < 0, 'mid-Atlantic is outside');

// elevation: dry land is above the sea, the sea floor is below it, and the
// same query gives the same answer every time (invariant 6)
ok(elevation(38.5, -98.4) > 0, 'Kansas is above sea level');
ok(elevation(30, -45) < -20, 'the abyss is deep');
ok(elevation(17.5, -76.8) < 0 && elevation(17.5, -76.8) > -60, 'Caribbean shelf is sea floor');
ok(elevation(18.11, -77.28) === elevation(18.11, -77.28), 'deterministic');
const e1 = elevation(53.2, -1.5), e2 = elevation(53.2, -1.5);
ok(e1 === e2 && e1 > 0, 'inland England repeatable and dry');

// rivers: the great ones are where they should be, the deep sea has none
ok(RIVER_COUNT > 500, `river table populated (${RIVER_COUNT} lines)`);
ok(riverDistGame(-3.1, -60.0) < 0.2 * M_PER_DEG, 'the Amazon runs past Manaus');
ok(riverDistGame(51.45, 0.3) < 0.3 * M_PER_DEG, 'the Thames estuary has its river');
ok(riverDistGame(30, -45) === RIVER_CAP, 'no rivers in the mid-Atlantic');

// mountains: real ranges rise, lowlands do not
ok(MTN_COUNT > 150, `mountain-range table populated (${MTN_COUNT} rings)`);
ok(mountainness(46.5, 10.0) === 1, 'the Alps are a range');
ok(mountainness(53.07, -4.08) > 0.5, 'Snowdonia is a range (the dragons approve)');
ok(mountainness(38.5, -98.4) === 0, 'Kansas is flat');
const alpsMax = Math.max(elevation(46.5, 10.0), elevation(46.4, 10.2), elevation(46.6, 9.8));
ok(alpsMax > 80, `the Alps stand tall (${alpsMax.toFixed(0)} m game)`);
ok(alpsMax > elevation(38.5, -98.4) * 2, 'the Alps tower over Kansas');

// river valleys carve: the channel sits below its own banks
{
  // walk a small neighbourhood of the upper Amazon and compare channel vs shoulder
  const onRiver = elevation(-3.32, -60.6);
  const offRiver = elevation(-3.32 + 0.5, -60.6 + 0.5);
  ok(onRiver < offRiver, `the valley is lower than the plain (${onRiver.toFixed(1)} vs ${offRiver.toFixed(1)})`);
}

// gait: 1x inshore, 5x offshore, GAIT_MAX in blue water, smooth and monotonic
ok(GAIT_MAX === 20, 'blue-water gait is 20x');
ok(gaitFactor(0) === 1 && gaitFactor(800) === 1, 'no gait inshore');
ok(gaitFactor(2100) >= 4.9 && gaitFactor(2100) < 5.6, `offshore plateau ~5x (${gaitFactor(2100).toFixed(2)})`);
ok(gaitFactor(4200) === GAIT_MAX && gaitFactor(50000) === GAIT_MAX, 'full blue-water gait');
const mid = gaitFactor(1400);
ok(mid > 1.5 && mid < 4.5, `gait ramps smoothly (${mid.toFixed(2)} at 1400m)`);
let prev = -1, mono = true;
for (let d = 0; d <= 6000; d += 50) { const g = gaitFactor(d); if (g < prev - 1e-9) mono = false; prev = g; }
ok(mono, 'monotonic ramp all the way out');
ok(gaitFactor(coastDistGame(30, -45)) === GAIT_MAX, 'mid-Atlantic sails at full blue-water gait');

// encounter gait: alone the current runs full; in company it dies to 1x
ok(encounterGait(GAIT_MAX, Infinity) === GAIT_MAX, 'empty sea, full current');
ok(encounterGait(GAIT_MAX, ENCOUNTER_FAR) === GAIT_MAX, 'a sail at the edge changes nothing yet');
ok(encounterGait(GAIT_MAX, ENCOUNTER_NEAR) === 1, 'within hailing range, human speed');
ok(encounterGait(GAIT_MAX, 0) === 1, 'alongside, human speed');
ok(encounterGait(1, 100) === 1, 'inshore (gait already 1) the encounter is a no-op');
{
  const a = encounterGait(GAIT_MAX, 700), b = encounterGait(GAIT_MAX, 1100);
  ok(a > 1 && b < GAIT_MAX && a < b, `encounter ramp is smooth and monotonic (${a.toFixed(2)} < ${b.toFixed(2)})`);
  // symmetry: the rule is a pure function of mutual distance, so two ships
  // reading the same range read the same current
  ok(encounterGait(GAIT_MAX, 900) === encounterGait(GAIT_MAX, 900), 'both crews read the same slack');
}

if (failed) { console.error(`verify-earth: ${failed} FAILED`); process.exit(1); }
console.log(`verify-earth: OK — ${RING_COUNT} rings/${POINT_COUNT} pts, ground-truth tour green, gait ramps 1x->${GAIT_MAX}x`);
