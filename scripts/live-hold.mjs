// Live smoke test: the below-decks environment + the warden's writ. Boots
// headless Chrome as a guest, proves the sloop has no hold, walks the writ
// around the whole ladder, goes below on the galleon and the brig
// (screenshots to media/), and asserts the lens never leaves the hold.
// Not part of the verify gate (needs a dev server + puppeteer):
//   npm run dev                    (terminal 1)
//   node scripts/live-hold.mjs     (terminal 2)
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const URL = process.argv[2] || 'http://localhost:5173';
const OUT = resolve('media');
mkdirSync(OUT, { recursive: true });
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
  await page.type('#invitename', 'HoldTest');
  await page.click('#btnguest');
  await page.waitForSelector('#btnnew', { visible: true });
  await page.click('#btnnew');
  // the choice of colours: these tests sail the historical default
  await page.waitForSelector('#btnpirate', { visible: true });
  await page.click('#btnpirate');
  await page.waitForFunction('!!window.saltstead', { timeout: 30000 });
  await sleep(5000);
  await page.evaluate(() => document.querySelector('#briefingclose')?.click());

  // daylight so the deck shots read; the hold must glow on its own light
  await page.evaluate(async () => {
    const { DAY_LENGTH } = await import('/src/skymath.js');
    const g = window.saltstead;
    g.dayStart = 0.4 * DAY_LENGTH - g.t;
    g.weatherLock = true;
  });

  // ---- the sloop has NO hold ----
  const sloopBelow = await page.evaluate(async () => {
    const { holdFor } = await import('/src/shipframe.js');
    const g = window.saltstead;
    const H = holdFor(g.spec);
    g.cap.x = H.hatch.x; g.cap.z = H.hatch.z;
    return { can: g.canGoBelow(), hull: g.hullId };
  });
  ok(sloopBelow.hull === 'sloop' && !sloopBelow.can, 'the sloop is an open boat: no way below');

  // ---- the warden's writ cycles the ladder ----
  const writ = await page.evaluate(async () => {
    const g = window.saltstead;
    g.wardenMaterialise();
    const asGuest = g.hullId; // guests hold no writ — nothing may happen
    g.warden = true;
    const walked = [];
    for (let i = 0; i < 8; i++) { g.wardenMaterialise(); walked.push(g.hullId); }
    return { asGuest, walked };
  });
  ok(writ.asGuest === 'sloop', 'no writ, no ship: the key is dead for a guest');
  ok(writ.walked.join(',') === 'cutter,schooner,brig,corvette,frigate,galleon,sloop,cutter',
    `the writ walks the whole ladder and wraps (${writ.walked.join(' -> ')})`);

  // ---- below decks on the galleon ----
  const below = await page.evaluate(async () => {
    const { hullById } = await import('/src/shipyard.js');
    const { holdFor } = await import('/src/shipframe.js');
    const g = window.saltstead;
    g.setHull(hullById('galleon'));
    const H = holdFor(g.spec);
    // walk onto the grating and go below
    g.cap.x = H.hatch.x; g.cap.z = H.hatch.z;
    const can = g.canGoBelow();
    g.onE();
    return {
      can, mode: g.mode, capY: g.holdFrame ? g.holdFrame.y : null,
      light: g.holdLight ? g.holdLight.children[0].intensity : -1,
      deckY: g.shipFrame.deck.y,
    };
  });
  ok(below.can, 'standing the grating, the way below opens');
  ok(below.mode === 'below', `E takes the companionway (mode ${below.mode})`);
  ok(below.capY < below.deckY, `the sole lies under the deck (${below.capY?.toFixed(1)} < ${below.deckY.toFixed(1)})`);
  ok(below.light > 0, `the hold lantern is lit (${below.light})`);
  await sleep(1600); // the lens eases down and clamps inside the walls
  await page.screenshot({ path: join(OUT, 'hold-galleon.png') });

  // walk to the great cabin corner (aft) and photograph the strongboxes
  await page.evaluate(() => {
    const g = window.saltstead;
    g.cap.x = 0; g.cap.z = g.holdFrame.minZ + 2.2;
  });
  await sleep(1200);
  await page.screenshot({ path: join(OUT, 'hold-galleon-cabin.png') });

  // the camera never leaves the room: sample its ship-local position
  const lens = await page.evaluate(() => {
    const g = window.saltstead;
    const lp = g.shipGroup.worldToLocal(g.camera.position.clone());
    const H = g.holdFrame;
    return {
      inX: lp.x >= H.minX && lp.x <= H.maxX,
      inZ: lp.z >= H.minZ && lp.z <= H.maxZ,
      underDeck: lp.y <= g.shipFrame.deck.y,
    };
  });
  ok(lens.inX && lens.inZ && lens.underDeck, 'the lens stays inside the hold walls');

  // E goes back up; T from below runs straight to the tiller
  const up = await page.evaluate(() => {
    const g = window.saltstead;
    g.onE();
    const modeUp = g.mode;
    g.onE(); // back below for the tiller test
    const modeDown = g.mode;
    g.toggleTiller();
    return { modeUp, modeDown, modeHelm: g.mode, light: g.holdLight.children[0].intensity };
  });
  ok(up.modeUp === 'walk', 'E climbs back to the weather deck');
  ok(up.modeDown === 'below', 'and E again returns below');
  ok(up.modeHelm === 'helm', 'T from the hold runs straight to the tiller');
  ok(up.light === 0, 'the lantern is doused on the way up');

  // ---- the brig's hold, for scale contrast ----
  await page.evaluate(async () => {
    const { hullById } = await import('/src/shipyard.js');
    const { holdFor } = await import('/src/shipframe.js');
    const g = window.saltstead;
    g.toggleTiller(); // leave the helm
    g.setHull(hullById('brig'));
    const H = holdFor(g.spec);
    g.cap.x = H.hatch.x; g.cap.z = H.hatch.z;
    g.onE();
  });
  const brigMode = await page.evaluate(() => window.saltstead.mode);
  ok(brigMode === 'below', 'the brig carries a hold too');
  await sleep(1400);
  await page.screenshot({ path: join(OUT, 'hold-brig.png') });

  // ---- the ground tackle ----
  const anchor = await page.evaluate(async () => {
    const { latLonToWorld, elevation } = await import('/src/earth.js');
    const { CABLE_DEPTH } = await import('/src/anchor.js');
    const g = window.saltstead;
    g.onE(); // up from the brig's hold first

    // over the abyss the cable must find nothing
    const deep = latLonToWorld(25, -45);
    g.ship.x = deep.x; g.ship.z = deep.z; g.ship.speed = 0;
    g.toggleAnchor();
    const refusedDeep = !g.anchorDown;

    // scan the Port Royal approaches for honest soundings (2..CABLE_DEPTH m)
    let spot = null;
    for (let lat = 17.6; lat <= 18.1 && !spot; lat += 0.02) {
      for (let lon = -77.4; lon <= -76.5 && !spot; lon += 0.02) {
        const d = -elevation(lat, lon);
        if (d > 2 && d < CABLE_DEPTH - 2) spot = { lat, lon, d };
      }
    }
    if (!spot) return { refusedDeep, noSoundings: true };
    const w = latLonToWorld(spot.lat, spot.lon);
    g.ship.x = w.x; g.ship.z = w.z;

    g.ship.speed = 6; // too much way on her
    g.toggleAnchor();
    const refusedWay = !g.anchorDown;
    g.ship.speed = 1;
    g.toggleAnchor();
    return {
      refusedDeep, refusedWay, dropped: g.anchorDown,
      depth: spot.d, x: g.ship.x, z: g.ship.z,
    };
  });
  ok(!anchor.noSoundings, 'the scan found an anchorage in the Port Royal approaches');
  ok(anchor.refusedDeep, 'over the abyss: NO BOTTOM — the anchor stays catted');
  ok(anchor.refusedWay, 'at 6 m/s: too much way — refused');
  ok(anchor.dropped, `slowed down, in ${anchor.depth?.toFixed(0)} m: LET GO`);

  await sleep(2500); // the cable takes her weight
  const riding = await page.evaluate(() => {
    const g = window.saltstead;
    return { speed: g.ship.speed, x: g.ship.x, z: g.ship.z, mode: g.mode };
  });
  ok(riding.speed < 0.3, `the snub kills her way (${riding.speed.toFixed(2)} m/s)`);
  ok(Math.hypot(riding.x - anchor.x, riding.z - anchor.z) < 1,
    'the cable holds her over the ground');
  await page.screenshot({ path: join(OUT, 'at-anchor.png') });

  const weighed = await page.evaluate(() => {
    const g = window.saltstead;
    g.toggleAnchor();
    return !g.anchorDown;
  });
  ok(weighed, 'Q again and the anchor\u2019s aweigh');

  ok(pageErrors.length === 0, pageErrors.length ? `page errors: ${pageErrors.slice(0, 3).join(' | ')}` : 'no page errors');
} finally {
  await browser.close();
}
console.log(failed ? `live-hold: ${failed} FAILED` : 'live-hold: ALL GREEN');
process.exit(failed ? 1 : 0);
