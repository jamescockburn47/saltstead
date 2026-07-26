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
      window.__spot = spot; // the measured point stays put; the ship may sail
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

  // THE DESIGN'S FIRST LAW, MEASURED PROPERLY (rewritten 2026-07-26).
  //
  // These two clauses used to sample the game's wave field at the inshore spot
  // and again 3 km away and demand the first be 0.85 of the second. That is a
  // SAME-SEA-STATE comparison: the sea state is one pair of band scalars for
  // wherever the SHIP is, so both samples were taken under the inshore ship's
  // own sea. What it therefore measured was not "inshore versus blue water" but
  // the shore field's local composition — the open set knocked down by
  // shoreOpenAtten against the shore-parallel surf set riding in.
  //
  // Those two do not scale together. The open set follows the SWELL band, which
  // the wind's inshore shelter, the fetch curve and shoreOpenAtten all reduce;
  // the surf set has a fixed amplitude and follows the CHOP band only. So the
  // ratio inverts whenever the inshore wind is light — which, once weather.js
  // stopped flooring the whole world at 10 m/s (2026-07-26), it honestly is off
  // a lee shore in the trades. The clause was propped up by the constant wind,
  // and it fails on a correct game.
  //
  // The law it was reaching for is real, so it is now asserted exactly, from the
  // game's own live position and coast distance through the game's own weather
  // functions: the sea a ship GETS inshore against the sea a ship GETS in blue
  // water — each with the sea state the game would actually give it there, which
  // is the only comparison a player can ever experience. That holds at 0.35 here
  // and 0.28 in the Solent. The WHOLE-WORLD form of it, swept over every latitude
  // and every coast distance (which is where the marginal case lives — a calm
  // belt, not a wind belt), is a headless clause in verify-weather. The live
  // sampled field keeps a clause of its own, stating what sampling can honestly
  // show: that the surf band which rides in does not run away.
  //
  // The open reference is SEARCHED FOR, not stepped to. The original clauses
  // stepped a fixed 3 km along z and chose the sign per site — but 3 km of world
  // metres is 6.8 DEGREES at this scale (M_PER_DEG 444), so the step overshoots
  // whole ocean basins: 3 km north of the Palisadoes is the Bahama bank, 3 km
  // south of the Solent is the French coast in Biscay, and both directions from
  // the Solent land on land. Measured against those, the "open" denominator was
  // itself sheltered water. So the helper sweeps for the most open water it can
  // find within reach and reports how open that is, and the clause below checks
  // it really is more open than the inshore point.
  const shoreLaw = async () => page.evaluate(async () => {
    const g = window.saltstead;
    const { windAt } = await import('/src/wind.js');
    const { windProfile, seaBandsFor } = await import('/src/weather.js');
    const { significantHeight, shoreOpenAtten, shoreEnv, SHORE_WAVES } = await import('/src/waves.js');
    const { worldToLatLon, coastDistGame, isLand, COAST_CAP } = await import('/src/earth.js');
    const hsSw = significantHeight(0), hsCh = significantHeight(1);
    // the shore-parallel set's own significant height at signed distance d
    const surfHs = (d, chop) => {
      const e = shoreEnv(d);
      let v = 0;
      for (const w of SHORE_WAVES) v += (w.amp * e * chop) ** 2 / 2;
      return 4 * Math.sqrt(v);
    };
    // the whole sea a ship at (x, z) is given: its own wind, its own fetch, its
    // own shore attenuation and its own surf. `cdOverride` asks the same
    // question of open ocean at that latitude (COAST_CAP — out of the land's
    // reach entirely), which is the law's honest comparator.
    const seaFor = (x, z, cdOverride = null) => {
      const ll = worldToLatLon(x, z);
      const cd = cdOverride ?? coastDistGame(ll.lat, ll.lon);
      const wind = windProfile(cd, windAt(x, z).speed);
      const b = seaBandsFor(wind, cd);
      const open = Math.hypot(hsSw * b.swell, hsCh * b.chop) * shoreOpenAtten(-cd);
      return { cd, wind, ...b, hs: Math.hypot(open, surfHs(-cd, b.chop)) };
    };
    const p = window.__spot;
    // the live field, both points under the ship's own sea state (a SHAPE
    // measurement — see the note above)
    const mean = (x, z) => {
      let s = 0;
      for (let i = 0; i < 120; i++) s += Math.abs(g.waveAt(x, z, g.t + i * 0.41));
      return s / 120;
    };
    // the most open water within reach of the ship — whichever bearing it lies on
    let open = { x: p.x, z: p.z, cd: -1 };
    for (let r = 600; r <= 4200; r += 300) {
      for (let a = 0; a < 24; a++) {
        const th = (a / 24) * Math.PI * 2;
        const x = p.x + Math.sin(th) * r, z = p.z + Math.cos(th) * r;
        const ll = worldToLatLon(x, z);
        if (isLand(ll.lat, ll.lon)) continue;
        const cd = coastDistGame(ll.lat, ll.lon);
        if (cd > open.cd) open = { x, z, cd };
      }
    }
    return {
      sampledInshore: mean(p.x, p.z),
      sampledOpen: mean(open.x, open.z),
      openCoastDist: open.cd,
      inshore: seaFor(p.x, p.z),
      blue: seaFor(p.x, p.z, COAST_CAP), // open ocean at this latitude
    };
  });
  const judgeShore = (tag, s, lawBound, runawayBound) => {
    ok(s.inshore.hs < s.blue.hs * lawBound,
      `${tag}: the coast lies quieter than blue water — significant height `
      + `${s.inshore.hs.toFixed(3)} m inshore (wind ${s.inshore.wind.toFixed(1)} m/s, `
      + `${s.inshore.cd.toFixed(0)} m off) against ${s.blue.hs.toFixed(3)} m in open ocean at `
      + `this latitude (wind ${s.blue.wind.toFixed(1)}): ratio ${(s.inshore.hs / s.blue.hs).toFixed(3)}, `
      + `bound ${lawBound}. THE DESIGN'S FIRST LAW`);
    // the open sample must BE open, or the runaway clause below is measured
    // against a second piece of sheltered water (the first version of this
    // helper sampled the Solent's 3 km reference inland toward the mainland)
    // 3 km of world metres is 6.8 degrees of latitude at this scale, so an
    // ocean basin can easily be narrower than the step: what matters is only
    // that the reference is far more open than the inshore point, not that it
    // clears some absolute fetch.
    ok(s.openCoastDist > Math.max(300, s.inshore.cd * 4),
      `${tag}: the open reference really is more open — ${s.openCoastDist.toFixed(0)} m from the `
      + `nearest coast against the inshore point's ${s.inshore.cd.toFixed(0)} m `
      + '(needs 4x and at least 300 m)');
    // A LOOSE TRIPWIRE ON PURPOSE, and the bound says why. This ratio is noisy
    // between runs — the open reference is searched for rather than fixed, the
    // ship drifts a little between the coast-map bake and the sample, and the
    // mean is over a finite window of wave phase. Measured across runs: 0.90 to
    // 1.54. Its job is to catch the surf becoming a WALL, nothing finer. The
    // precise, deterministic, whole-world form of the law is the sweep in
    // verify-weather, which is where a real regression will be convicted.
    ok(s.sampledInshore < s.sampledOpen * runawayBound,
      `${tag}: and in the live field, at one sea state, the surf that rides in is not a WALL `
      + `— ${s.sampledInshore.toFixed(3)} m mean surface inshore against `
      + `${s.sampledOpen.toFixed(3)} m open (ratio `
      + `${(s.sampledInshore / s.sampledOpen).toFixed(2)}, tripwire ${runawayBound}, run-to-run `
      + '0.90-1.54; the precise whole-world form of this is in verify-weather)');
  };

  // ---- 1. the Caribbean coast: palms, calm inshore water, breakers ----
  await goCoast(17.94, -76.88); // the Palisadoes, off Port Royal
  const carib = await page.evaluate(async () => {
    const g = window.saltstead;
    return {
      field: !!g.coastMap.field,
      centerSet: g.coastMap.uvCenter.x < 1e8,
      decorMeshes: [...g.shoreDecor.cells.values()].filter((c) => c.mesh).length,
      terrainChunks: g.terrain.chunks.size,
      mode: g.mode,
    };
  });
  ok(carib.field && carib.centerSet, 'coast map baked and handed to the shader');
  judgeShore('the Palisadoes', await shoreLaw(), 0.5, 1.8);
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

  // ---- 5. the English coast: oak country under the chalk ----
  await goCoast(50.72, 0.12); // off Beachy Head — the Seven Sisters gleam
  await sleep(3000);
  const england = await page.evaluate(() => {
    const g = window.saltstead;
    return {
      decorMeshes: [...g.shoreDecor.cells.values()].filter((c) => c.mesh).length,
      farWritRefused: g.goTo(0, 0) === false, // a guest holds no far writ
    };
  });
  ok(england.decorMeshes > 0, `the English coast is decorated (${england.decorMeshes} cells)`);
  ok(england.farWritRefused, 'the far writ refuses a guest');
  await page.screenshot({ path: join(OUT, 'shore-england.png') });
  console.log('  shot - media/shore-england.png');

  // ---- 6. the Solent: a strait must lie CALM, not striped with surf ----
  // Held tighter than the Caribbean on the law (a strait is sheltered twice
  // over — by the coast field and by the strait gate) and looser on the
  // runaway clause, because it is inside the surf envelope where the shore set
  // is meant to be most of the water there is.
  await goCoast(50.51, -1.11); // between the Island and the mainland
  await sleep(3000);
  judgeShore('the Solent', await shoreLaw(), 0.4, 1.8);
  await page.screenshot({ path: join(OUT, 'shore-solent.png') });
  console.log('  shot - media/shore-solent.png');

  ok(pageErrors.length === 0,
    `no page errors (${pageErrors.length ? pageErrors.slice(0, 3).join(' | ') : 'clean'})`);
} finally {
  await browser.close();
}

if (failed) { console.error(`live-shore: ${failed} FAILED`); process.exit(1); }
console.log('live-shore: OK — the sea calms on the coast, the fringe grows to its latitude, and nobody steps ashore');
