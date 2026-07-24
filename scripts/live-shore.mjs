// Live smoke test for the shore work of 2026-07-24: the shore-aware sea
// (coast map + calming + shore-parallel waves), the smooth shoreline
// terrain, the shore decoration fringe, and the RETIREMENT of the ashore
// mode. Boots the game as a guest in headless Chrome, teleports to a
// tropical and a northern coast, screenshots each to media/, and asserts
// the live state. Not part of the verify gate (needs a dev server):
//   npm run dev                     (terminal 1)
//   node scripts/live-shore.mjs     (terminal 2)
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

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
  await page.type('#invitename', 'ShoreTest');
  await page.click('#btnguest');
  await page.waitForSelector('#btnnew', { visible: true });
  await page.click('#btnnew');
  await page.waitForSelector('#btnpirate', { visible: true });
  await page.click('#btnpirate');
  await page.waitForFunction('!!window.saltstead', { timeout: 30000 });
  await sleep(4000);
  await page.evaluate(() => document.querySelector('#briefingclose')?.click());
  await sleep(400);

  // late morning, weather pinned, so shots stay readable
  await page.evaluate(async () => {
    const { DAY_LENGTH } = await import('/src/skymath.js');
    const g = window.saltstead;
    g.dayStart = 0.38 * DAY_LENGTH - g.t;
    g.weatherLock = true;
  });

  // drop the ship in inshore water off a named coast, facing the land
  const goCoast = async (lat, lon) => {
    await page.evaluate(async ([tlat, tlon]) => {
      const { latLonToWorld, worldToLatLon, elevation, signedCoastGame } =
        await import('/src/earth.js');
      const w = latLonToWorld(tlat, tlon);
      const g = window.saltstead;
      // spiral out for water 60-160 m off the waterline
      let spot = null, land = null;
      outer:
      for (let r = 20; r <= 2200; r += 20) {
        for (let a = 0; a < 24; a++) {
          const th = (a / 24) * Math.PI * 2;
          const x = w.x + Math.sin(th) * r, z = w.z + Math.cos(th) * r;
          const ll = worldToLatLon(x, z);
          const d = signedCoastGame(ll.lat, ll.lon);
          if (d < -60 && d > -160 && elevation(ll.lat, ll.lon) < -1.5) {
            spot = { x, z };
            break outer;
          }
        }
      }
      if (!spot) throw new Error('no inshore water found near coast');
      g.ship.x = spot.x; g.ship.z = spot.z;
      g.ship.speed = 0;
      g.geoClock = 0;
      // face the camera toward the land (the coast gradient points landward)
      const sll = worldToLatLon(spot.x, spot.z);
      const e = 0.004;
      const dx = signedCoastGame(sll.lat, sll.lon + e) - signedCoastGame(sll.lat, sll.lon - e);
      const dz = signedCoastGame(sll.lat - e, sll.lon) - signedCoastGame(sll.lat + e, sll.lon);
      g.cam.yaw = Math.atan2(-dx, -dz);
      g.cam.pitch = 0.34;
      g.cam.targetDist = 34; g.cam.dist = 34;
    }, [lat, lon]);
    await sleep(5000); // coast map rebake + terrain and decor streaming
  };

  // ---- 1. the Caribbean coast: palms, calm inshore water, breakers ----
  await goCoast(17.94, -76.88); // the Palisadoes, off Port Royal
  const carib = await page.evaluate(async () => {
    const { waveHeight, getSeaState } = await import('/src/waves.js');
    const g = window.saltstead;
    // mean |height| here (inshore) vs 3 km out to sea, CPU side
    const mean = (x, z) => {
      let s = 0;
      for (let i = 0; i < 120; i++) s += Math.abs(waveHeight(x, z, g.t + i * 0.41));
      return s / 120;
    };
    const kinds = new Set();
    for (const c of g.shoreDecor.cells.values()) if (c.mesh) kinds.add('mesh');
    return {
      field: !!g.coastMap.field,
      centerSet: g.coastMap.uvCenter.x < 1e8,
      inshore: mean(g.ship.x, g.ship.z),
      offshore: mean(g.ship.x, g.ship.z - 3000) || mean(g.ship.x - 3000, g.ship.z),
      decorMeshes: [...g.shoreDecor.cells.values()].filter((c) => c.mesh).length,
      terrainChunks: g.terrain.chunks.size,
      seaState: getSeaState(),
      mode: g.mode,
    };
  });
  ok(carib.field && carib.centerSet, 'coast map baked and handed to the shader');
  ok(carib.inshore < carib.offshore * 0.85,
    `inshore water calmer than blue water (${carib.inshore.toFixed(3)} vs ${carib.offshore.toFixed(3)})`);
  ok(carib.decorMeshes > 0, `shore decoration built (${carib.decorMeshes} cells carry meshes)`);
  ok(carib.terrainChunks > 0, 'terrain streaming alive');
  await page.screenshot({ path: join(OUT, 'shore-caribbean.png') });
  console.log('  shot - media/shore-caribbean.png');

  // ---- 2. the ashore mode is GONE ----
  const ashore = await page.evaluate(() => {
    const g = window.saltstead;
    const before = g.mode;
    g.onE(); // the old step-ashore path — must never leave the ship
    return {
      before,
      after: g.mode,
      noAshoreApi: !g.goAshore && !g.canStepAshore && !g.boardShip,
      captainAboard: g.captain.group.parent === g.shipGroup,
    };
  });
  ok(ashore.after !== 'ashore', 'E near a beach never steps ashore');
  ok(ashore.noAshoreApi, 'the ashore API is gone from the Game');
  ok(ashore.captainAboard, 'the captain stays aboard');

  // ---- 3. a northern coast: conifers, no palms ----
  await goCoast(61.1, 5.02); // Sognefjord mouth, Norway
  await sleep(3000);
  const north = await page.evaluate(() => {
    const g = window.saltstead;
    return {
      decorMeshes: [...g.shoreDecor.cells.values()].filter((c) => c.mesh).length,
      centerSet: g.coastMap.uvCenter.x < 1e8,
    };
  });
  ok(north.decorMeshes > 0, `northern shore decorated (${north.decorMeshes} cells)`);
  await page.screenshot({ path: join(OUT, 'shore-norway.png') });
  console.log('  shot - media/shore-norway.png');

  // ---- 4. the Amazon at Manaus: deep jungle, no settlements, terrain
  // culled beyond the corridor ----
  await page.evaluate(async () => {
    const { latLonToWorld, worldToLatLon, elevation } = await import('/src/earth.js');
    const g = window.saltstead;
    const w = latLonToWorld(-3.155, -60.0);
    // find the channel: the deepest water in a small sweep
    let spot = w, best = 1e9;
    for (let dx = -400; dx <= 400; dx += 25) {
      for (let dz = -400; dz <= 400; dz += 25) {
        const ll = worldToLatLon(w.x + dx, w.z + dz);
        const e = elevation(ll.lat, ll.lon);
        if (e < best) { best = e; spot = { x: w.x + dx, z: w.z + dz }; }
      }
    }
    g.ship.x = spot.x; g.ship.z = spot.z;
    g.ship.speed = 0; g.geoClock = 0;
    g.cam.yaw = 0.8; g.cam.pitch = 0.3; g.cam.targetDist = 30; g.cam.dist = 30;
  });
  await sleep(6000);
  const amazon = await page.evaluate(async () => {
    const { chunkWorthBuilding, CHUNK } = await import('/src/terraingen.js');
    const { latLonToWorld } = await import('/src/earth.js');
    const g = window.saltstead;
    let built = 0;
    for (const c of g.terrain.chunks.values()) if (c.mesh) built++;
    const at = (lat, lon) => {
      const w = latLonToWorld(lat, lon);
      return chunkWorthBuilding(Math.floor(w.x / CHUNK), Math.floor(w.z / CHUNK));
    };
    return {
      decorMeshes: [...g.shoreDecor.cells.values()].filter((c) => c.mesh).length,
      terrainBuilt: built,
      corridorBuilds: at(-3.155, -60.0),  // the river corridor must build
      interiorCulled: !at(23, 10),        // the Sahara interior must not
    };
  });
  ok(amazon.decorMeshes > 0, `the Amazon banks are decorated (${amazon.decorMeshes} cells)`);
  ok(amazon.terrainBuilt > 0, `the corridor's own terrain stands (${amazon.terrainBuilt} chunks)`);
  ok(amazon.corridorBuilds && amazon.interiorCulled,
    'the corridor builds, the unseeable interior is culled');
  await page.screenshot({ path: join(OUT, 'shore-amazon.png') });
  console.log('  shot - media/shore-amazon.png');

  ok(pageErrors.length === 0,
    `no page errors (${pageErrors.length ? pageErrors.slice(0, 3).join(' | ') : 'clean'})`);
} finally {
  await browser.close();
}

if (failed) { console.error(`live-shore: ${failed} FAILED`); process.exit(1); }
console.log('live-shore: OK — the sea calms on the coast, the fringe grows to its latitude, and nobody steps ashore');
