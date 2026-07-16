// verify-chart: the captain's charts tell the truth — the world map shows
// the continents where they are, the local chart matches the real coastline,
// and positions project to the right pixels.
import { globalChartPixels, localChartPixels, chartXY, SEA_RGB, LAND_RGB } from '../src/chart.js';
import { isLand } from '../src/earth.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

const at = (img, x, y) => img.data[(Math.floor(y) * img.w + Math.floor(x)) * 4]; // red channel
const isSea = (img, x, y) => at(img, x, y) === SEA_RGB[0];
const isDry = (img, x, y) => at(img, x, y) !== SEA_RGB[0]; // land wash or coast ink

// ---- world chart ----
const world = globalChartPixels(720, 360);
ok(world.data.length === 720 * 360 * 4, 'world chart RGBA sizing');

const wview = { w: 720, h: 360 };
const spots = [
  ['Kansas', 38.5, -98.4, true], ['Sahara', 23, 10, true],
  ['Siberia', 65, 100, true], ['Australia', -25, 134, true],
  ['mid-Atlantic', 30, -45, false], ['mid-Pacific', 0, -150, false],
  ['Indian Ocean', -20, 80, false],
];
for (const [name, lat, lon, dry] of spots) {
  const p = chartXY(lat, lon, wview);
  ok((dry ? isDry : isSea)(world, p.x, p.y), `world chart: ${name} is ${dry ? 'land' : 'sea'}`);
}

// determinism (invariant 6)
const world2 = globalChartPixels(720, 360);
ok(world.data.every((v, i) => v === world2.data[i]), 'world chart deterministic');

// ---- local chart ----
// around Port Royal: Jamaica dry to the north, Caribbean wet to the south
const view = { w: 96, h: 96, latC: 17.85, lonC: -76.9, spanDeg: 9 };
const local = localChartPixels(view.latC, view.lonC, view.spanDeg, 96);
ok(local.data.length === 96 * 96 * 4, 'local chart RGBA sizing');
{
  const jam = chartXY(18.11, -77.28, view);
  const sea = chartXY(16.5, -76.9, view);
  ok(isDry(local, jam.x, jam.y), 'local chart: Jamaica inland is dry');
  ok(isSea(local, sea.x, sea.y), 'local chart: south of Jamaica is sea');
}

// the local chart agrees with the real isLand at every 8th sample
{
  let agree = 0, total = 0;
  for (let y = 4; y < 96; y += 8) {
    for (let x = 4; x < 96; x += 8) {
      const lat = view.latC + view.spanDeg / 2 - ((y + 0.5) * view.spanDeg) / 96;
      const lon = view.lonC - view.spanDeg / 2 + ((x + 0.5) * view.spanDeg) / 96;
      const dry = isLand(lat, lon);
      if (dry === isDry(local, x, y)) agree++;
      total++;
    }
  }
  ok(agree === total, `local chart matches isLand everywhere (${agree}/${total})`);
}

// projection: centre maps to centre, north is up
{
  const c = chartXY(view.latC, view.lonC, view);
  ok(Math.abs(c.x - 48) < 1 && Math.abs(c.y - 48) < 1, 'ship sits at the chart centre');
  const n = chartXY(view.latC + 1, view.lonC, view);
  ok(n.y < c.y, 'north is up');
}

if (failed) { console.error(`verify-chart: ${failed} FAILED`); process.exit(1); }
console.log('verify-chart: OK — continents in place, local coast true, ship centred, north up');
