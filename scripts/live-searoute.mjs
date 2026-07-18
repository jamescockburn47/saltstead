// Live smoke test for the sea road and the pole-off: boots the game as a
// guest in headless Chrome and asserts, in a real browser,
//   1. a course whose rhumb line crosses Florida is laid AROUND it and the
//      helmsman sails it without grounding,
//   2. a track that crosses a coastline hands the ship back HARD before the
//      sand ('breakers ahead'),
//   3. hard aground, O (the sweeps) poles her off the beach until she swims.
// Not part of the verify gate (needs a dev server + puppeteer):
//   npm run dev                        (terminal 1)
//   node scripts/live-searoute.mjs     (terminal 2)
import puppeteer from 'puppeteer';

const URL = process.argv[2] || 'http://localhost:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failed = 0;
const ok = (cond, msg) => {
  console.log((cond ? '  ok  ' : '  FAIL') + ' - ' + msg);
  if (!cond) failed++;
};

const browser = await puppeteer.launch({
  headless: true,
  args: ['--window-size=1600,900', '--enable-gpu'],
  defaultViewport: { width: 1600, height: 900 },
});
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && !t.includes('404')) pageErrors.push(t);
  });

  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.type('#invitename', 'SeaRoadTest');
  await page.click('#btnguest');
  await page.waitForSelector('#btnnew', { visible: true });
  await page.click('#btnnew');
  await page.waitForSelector('#btnpirate', { visible: true });
  await page.click('#btnpirate');
  await page.waitForFunction('!!window.saltstead', { timeout: 30000 });
  await sleep(4000);
  await page.evaluate(() => document.querySelector('#briefingclose')?.click());
  await sleep(400);

  // record every hail so the assertions can read what the crew said
  await page.evaluate(() => {
    const g = window.saltstead;
    g._says = [];
    const orig = g.say.bind(g);
    g.say = (m, s) => { g._says.push(String(m)); return orig(m, s); };
  });

  // ---- 1. the course around the land ----
  const laid = await page.evaluate(async () => {
    const { latLonToWorld } = await import('/src/earth.js');
    const g = window.saltstead;
    const w = latLonToWorld(27, -83.5); // the Gulf of Mexico
    g.ship.x = w.x; g.ship.z = w.z; g.ship.speed = 0; g.ship.yaw = Math.PI / 2;
    g.crew = 3;
    g.maps.onCourse(27, -79.5); // dead east: the rhumb line crosses Florida
    return {
      legs: g.route ? g.route.length : 0,
      marks: (g.maps.routeLL || []).map((p) => [p.lat, p.lon]),
    };
  });
  ok(laid.legs >= 2, `the blocked rhumb is laid as a route (${laid.legs} legs)`);
  const roundsSouth = laid.marks.some(([lat]) => lat < 26);
  ok(roundsSouth, `and it rounds Florida to the south (${laid.marks.map(([a, b]) => a.toFixed(1) + ',' + b.toFixed(1)).join(' | ')})`);

  await sleep(25000); // the helmsman sails the first leg
  const sailed = await page.evaluate(async () => {
    const { worldToLatLon } = await import('/src/earth.js');
    const g = window.saltstead;
    const ll = worldToLatLon(g.ship.x, g.ship.z);
    return { lat: ll.lat, lon: ll.lon, aground: g.aground, course: !!g.course, speed: g.ship.speed };
  });
  ok(!sailed.aground, `she sails the road without grounding (now ${sailed.lat.toFixed(2)},${sailed.lon.toFixed(2)})`);
  ok(sailed.course, 'the course is still set (no false handback in open water)');
  ok(sailed.lat < 26.9 && sailed.lon > -83.5, 'she made ground ALONG the road (south-east, not due east)');

  // ---- 2. breakers ahead: the watch hands back before the sand ----
  await page.evaluate(async () => {
    const { latLonToWorld } = await import('/src/earth.js');
    const g = window.saltstead;
    // stand her in OPEN water first and let the geography tick catch up —
    // onCourse reads the throttled coastDist for the pilotage grace
    const o = latLonToWorld(26.0, -85.0);
    g.ship.x = o.x; g.ship.z = o.z; g.ship.speed = 0;
  });
  await sleep(700);
  const breakers = await page.evaluate(async () => {
    const { latLonToWorld } = await import('/src/earth.js');
    const g = window.saltstead;
    // lay the course from open water (no pilotage grace), then stand her
    // ~1 degree off Florida's west coast with the bow pointed dead at it:
    // the watch must refuse the coast before the sand
    g.maps.onCourse(27, -79.5);
    const fromPilotage = g.courseFromPilotage;
    const w = latLonToWorld(26.7, -83.2);
    g.ship.x = w.x; g.ship.z = w.z; g.ship.yaw = Math.PI / 2; // due east, at the coast
    g._says.length = 0;
    return !fromPilotage;
  });
  await sleep(1500);
  const hb = await page.evaluate(() => {
    const g = window.saltstead;
    return { course: !!g.course, says: g._says.slice() };
  });
  ok(breakers && !hb.course, 'the helm watch belays the course before the coast');
  ok(hb.says.some((s) => s.includes('breakers ahead')), `and names the breakers (${hb.says[0] || 'no hail'})`);

  // ---- 3. hard aground, the sweeps pole her off ----
  const grounded = await page.evaluate(async () => {
    const { latLonToWorld, worldToLatLon, elevation } = await import('/src/earth.js');
    const g = window.saltstead;
    // walk east from open water onto Florida's west-coast sand until the
    // ground stands above the sloop's grounding line, and beach her there
    for (let lon = -82.8; lon < -81.0; lon += 0.01) {
      if (elevation(26.7, lon) > g.spec.groundLine + 0.1) {
        const w = latLonToWorld(26.7, lon - 0.015);
        g.ship.x = w.x; g.ship.z = w.z; g.ship.yaw = Math.PI / 2; g.ship.speed = 2;
        return lon;
      }
    }
    return null;
  });
  await sleep(1200);
  const stuck = await page.evaluate(() => window.saltstead.aground);
  ok(grounded !== null && stuck, `she takes the sand (beach at lon ${grounded && grounded.toFixed(2)})`);
  await page.evaluate(() => {
    const g = window.saltstead;
    g._says.length = 0;
    if (!g.oars) g.toggleOars(); // POLES OUT
  });
  await sleep(15000);
  const off = await page.evaluate(async () => {
    const { worldToLatLon, elevation } = await import('/src/earth.js');
    const g = window.saltstead;
    const ll = worldToLatLon(g.ship.x, g.ship.z);
    return { aground: g.aground, elev: elevation(ll.lat, ll.lon), says: g._says.slice() };
  });
  ok(!off.aground, `the poles walk her off the sand (aground=${off.aground})`);
  ok(off.elev < 0, `and she floats over honest water again (ground ${off.elev.toFixed(1)} m)`);
  ok(off.says.some((s) => s.includes('POLES OUT') || s.includes('KEDGE')), 'the crew called the manoeuvre');
  ok(off.says.some((s) => s.includes('SHE SWIMS')), 'and called her free');

  ok(pageErrors.length === 0, `no page errors (${pageErrors.slice(0, 3).join(' | ') || 'clean'})`);
} finally {
  await browser.close();
}

if (failed) { console.error(`live-searoute: ${failed} FAILED`); process.exit(1); }
console.log('live-searoute: OK — the road rounds the land, the watch refuses the breakers, the poles walk her off');
