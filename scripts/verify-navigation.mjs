// verify-navigation: the navigator's craft must be TRUE — the pole star's
// altitude is the latitude (the thousand-year fact this feature exists to
// teach), the planisphere projects the same frame the 3D sky renders, and
// the weather honestly gates the sight.
import {
  canSight, takeSight, sightText, chartStars, chartBackground,
  CONSTELLATION_LINES, POINTER_LINES,
} from '../src/navigation.js';
import { DAY_LENGTH, STAR_CATALOGUE, starHorizon } from '../src/skymath.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };
const DEG = 180 / Math.PI;

// ---- the sight is gated by the sky, honestly ----
ok(!canSight(0, 0).ok && canSight(0, 0).reason === 'daylight', 'no sight at noon');
ok(!canSight(1, 0.8).ok && canSight(1, 0.8).reason === 'overcast', 'no sight under storm cloud');
ok(canSight(1, 0).ok, 'a clear midnight gives the navigator his sky');

// ---- Polaris altitude = latitude, all night, across the hemisphere ----
for (const lat of [10, 25.5, 50, 71]) {
  for (const h of [0, 5, 13, 21]) { // Polaris circles the pole a little; the
    const t = DAY_LENGTH * (h / 24);  // fact must hold at EVERY hour
    const s = takeSight(t, lat);
    ok(s.star === 'Polaris' && !s.south, `north of the line you shoot Polaris (lat ${lat})`);
    ok(Math.abs(s.latDeg - lat) < 0.8,
      `Polaris altitude IS the latitude at ${lat}N, hour ${h} (read ${s.latDeg.toFixed(2)})`);
  }
}
// south of the line: the Cross points a starless pole, altitude = |lat|
const sth = takeSight(0, -33.9);
ok(sth.south && sth.star === 'the Southern Cross', 'south of the line the Cross serves');
ok(Math.abs(sth.latDeg - 33.9) < 1e-9, 'the pole stands |lat| above the south horizon');
ok(sightText(sth, -33.9).includes('33.9\u00b0S'), 'the lesson names the latitude');
ok(sightText(takeSight(0, 50), 50).includes('Polaris'), 'and the star that taught it');

// ---- the planisphere: same frame as the heavens ----
const stars50 = chartStars(0, 50);
const names50 = new Set(stars50.map((s) => s.name));
ok(names50.has('Polaris'), 'Polaris on the chart at 50N');
ok(!names50.has('Acrux'), 'the Southern Cross is below the 50N horizon');
const stars35s = chartStars(0, -35);
const names35s = new Set(stars35s.map((s) => s.name));
ok(names35s.has('Acrux'), 'the Cross rises for the southern sailor');
ok(!names35s.has('Polaris'), 'and Polaris is gone below the northern rim');

// zenith at centre, horizon at rim: Polaris plots at r = 1 - lat/90, due north
const pol50 = stars50.find((s) => s.name === 'Polaris');
const r50 = Math.hypot(pol50.x, pol50.y);
ok(Math.abs(r50 - (1 - 50 / 90)) < 0.02, `Polaris rides at r=1-lat/90 (got ${r50.toFixed(3)})`);
ok(pol50.y > 0 && Math.abs(pol50.x) < 0.05, 'and due NORTH: top of the chart');

// every charted star stays on the disc, at every hour tested
for (const h of [0, 7, 16]) {
  for (const s of chartStars(DAY_LENGTH * (h / 24), 30)) {
    ok(Math.hypot(s.x, s.y) <= 1.0001, `${s.name} on the disc at hour ${h}`);
  }
}

// east on the LEFT (a sky chart is held overhead): find Mintaka (dec ~0,
// so it rises due east) low in the east and check which side it plots
{
  let seen = false;
  for (let h = 0; h < 24 && !seen; h += 0.05) {
    const t = DAY_LENGTH * (h / 24);
    const { alt, az } = starHorizon(5.5334, -0.299, t, 30);
    if (alt > 0.02 && alt < 0.12 && Math.abs(az * DEG - 90) < 12) {
      const star = chartStars(t, 30).find((s) => s.name === 'Mintaka');
      ok(star && star.x < -0.8, `rising due east, Mintaka plots LEFT (x=${star?.x.toFixed(2)})`);
      seen = true;
    }
  }
  ok(seen, 'Mintaka rises due east at 30N sometime tonight (dec ~0: it must)');
}

// the stars wheel WESTWARD like the sun: azimuth advances through a transit
{
  const az1 = starHorizon(5.9195, 7.407, DAY_LENGTH * 0.30, 30).az;
  const az2 = starHorizon(5.9195, 7.407, DAY_LENGTH * 0.34, 30).az;
  const adv = ((az2 - az1) * DEG + 360) % 360;
  ok(adv > 0 && adv < 180, `Betelgeuse marches east->west (advanced ${adv.toFixed(1)}\u00b0)`);
}

// the figures reference real catalogue stars only; the background stays on disc
const names = new Set(STAR_CATALOGUE.map(([n]) => n));
for (const [a, b] of CONSTELLATION_LINES) {
  ok(names.has(a) && names.has(b), `figure line ${a}-${b} uses catalogue stars`);
}
for (const [a, b, target] of POINTER_LINES) {
  ok(names.has(a) && names.has(b) && (target === null || names.has(target)),
    `pointer ${a}->${b} uses catalogue stars`);
}
const bg = chartBackground(0, 45);
ok(bg.length > 100, `the faint field fills the chart (${bg.length} stars up)`);
ok(bg.every((s) => Math.hypot(s.x, s.y) <= 1.0001), 'and stays on the disc');
ok(JSON.stringify(chartBackground(0, 45)) === JSON.stringify(bg),
  'same heavens every time (invariant 6)');

if (failed) { console.error(`verify-navigation: ${failed} FAILED`); process.exit(1); }
console.log('verify-navigation: OK — Polaris altitude = latitude, chart matches the heavens, weather gates the sight');
