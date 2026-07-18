// verify-chart: the captain's charts tell the truth — the world map shows
// the continents where they are, the local chart matches the real coastline,
// and positions project to the right pixels.
import {
  globalChartPixels, localChartPixels, chartXY, SEA_RGB, LAND_RGB, RIVER_RGB,
  beginFineWorld, stepFineWorld, finishFineWorld,
} from '../src/chart.js';
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

// ---- the zoomed world view (chartXY's ppd form) ----
{
  // at zoom 1, centred, the ppd view IS the classic sheet
  const zv = { w: 720, h: 360, ppd: 720 / 360, latC: 0, lonC: 0 };
  for (const [, lat, lon] of spots) {
    const a = chartXY(lat, lon, wview), b = chartXY(lat, lon, zv);
    ok(Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9,
      `ppd view at zoom 1 matches the sheet (${lat},${lon})`);
  }
  // zoomed 4x on the Irish Sea: the centre projects to the canvas centre,
  // a degree is ppd pixels, and lon wraps the short way about the centre
  const z4 = { w: 720, h: 360, ppd: 8, latC: 53.6, lonC: -4.9 };
  const c = chartXY(53.6, -4.9, z4);
  ok(Math.abs(c.x - 360) < 1e-9 && Math.abs(c.y - 180) < 1e-9, 'the zoom centre is the canvas centre');
  const e = chartXY(53.6, -3.9, z4);
  ok(Math.abs(e.x - 368) < 1e-9, 'a degree east is ppd pixels');
  const seam = { w: 720, h: 360, ppd: 8, latC: 0, lonC: 179 };
  ok(chartXY(0, -179, seam).x - 360 === 2 * 8, 'the seam wraps the short way');
}

// ---- the fine sheet bakes by instalments and is deterministic ----
{
  const whole = beginFineWorld(180, 90);
  while (!stepFineWorld(whole, 90)) ;
  const a = finishFineWorld(whole);
  const bits = beginFineWorld(180, 90);
  while (!stepFineWorld(bits, 7)) ; // ragged instalments
  const b = finishFineWorld(bits);
  ok(a.data.length === 180 * 90 * 4, 'fine sheet RGBA sizing');
  ok(a.data.every((v, i) => v === b.data[i]), 'instalment size never changes the sheet');
  const fv = { w: 180, h: 90 };
  const sah = chartXY(23, 10, fv), pac = chartXY(0, -150, fv);
  ok(isDry(a, sah.x, sah.y), 'fine sheet: the Sahara is land');
  ok(isSea(a, pac.x, pac.y), 'fine sheet: the mid-Pacific is sea');
}

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

// ---- rivers ink the river roads ----
const isRiver = (img, x, y) => at(img, x, y) === RIVER_RGB[0];
// somewhere within 2 px of the point, a river pixel (rasterized lines land
// on whole pixels, so allow a whisker of slack)
const riverNear = (img, p, r = 2) => {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (isRiver(img, p.x + dx, p.y + dy)) return true;
  }
  return false;
};
{
  // the Amazon on the world chart: El Dorado's river road is visible
  ok(riverNear(world, chartXY(-3.1, -60.0, wview)), 'world chart: Amazon inked at Manaus');
  ok(riverNear(world, chartXY(-2.2, -54.7, wview)), 'world chart: Amazon inked at Santarém');
  // and on the local chart centred where the hunt begins
  const amaView = { w: 96, h: 96, latC: -3.1, lonC: -60.0, spanDeg: 9 };
  const ama = localChartPixels(amaView.latC, amaView.lonC, amaView.spanDeg, 96);
  ok(riverNear(ama, chartXY(-3.155, -60.0, amaView)), 'local chart: Amazon inked at Manaus');
  // rivers never overdraw the open sea
  ok(isSea(world, chartXY(0, -150, wview).x, chartXY(0, -150, wview).y),
    'mid-Pacific stays sea after river ink');
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
