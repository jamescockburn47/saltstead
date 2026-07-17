// Capture the post shots — staged dramatic stills of everything the last
// two releases brought: the Kraken with its living arms and surfacing eye,
// sharks gathering at a sinking, the bioluminescent night wake, a moonlit
// sail, and the two flags trading iron. Doubles as a live smoke test:
// every scene runs in the real game and any page error fails the run.
//   npm run dev                      (terminal 1)
//   node scripts/capture-post.mjs    (terminal 2)
// Shots land in media/post/.
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const URL = process.argv[2] || 'http://localhost:5173';
const OUT = resolve('media/post');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failed = 0;
const ok = (cond, msg) => {
  console.log((cond ? '  ok  ' : '  FAIL') + ' - ' + msg);
  if (!cond) failed++;
};

const browser = await puppeteer.launch({
  headless: true,
  args: ['--window-size=1920,1080', '--enable-gpu'],
  defaultViewport: { width: 1920, height: 1080 },
});
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle2' });
  await page.type('#invitename', 'PostShots');
  await page.click('#btnguest');
  await page.waitForSelector('#btnnew', { visible: true });
  await page.click('#btnnew');
  await page.waitForSelector('#btnpirate', { visible: true });
  await page.click('#btnpirate');
  await page.waitForFunction('!!window.saltstead', { timeout: 30000 });
  await sleep(6000);
  await page.evaluate(() => document.querySelector('#briefingclose')?.click());
  await sleep(400);
  // hide the HUD chrome for clean frames
  await page.addStyleTag({ content: '.hud, #minimap, #helpbtn, #toast { display: none !important; }' });
  await page.evaluate(() => { window.saltstead.weatherLock = true; });

  // ---- 1. THE KRAKEN — full grip, golden hour, galleon, BLUE WATER ----
  // (the fight logic frees it in shallows — the shot needs the open sea)
  await page.evaluate(async () => {
    const { latLonToWorld } = await import('/src/earth.js');
    const { hullById } = await import('/src/shipyard.js');
    const g = window.saltstead;
    const deep = latLonToWorld(24.0, -45.0); // mid-Atlantic
    g.ship.x = deep.x; g.ship.z = deep.z; g.ship.speed = 0;
    g.setHull(hullById('galleon'));
  });
  await sleep(2500); // the geography sample settles, terrain streams out
  await page.evaluate(async () => {
    const { DAY_LENGTH, solarState } = await import('/src/skymath.js');
    const g = window.saltstead;
    g.dayStart = 0.68 * DAY_LENGTH - g.t; // afternoon light, still warm
    g.kraken = { state: 'gripping', t: 8, arms: 6, hackT: 0 };
    const L = g.spec.length;
    // stand the camera on the SUN side so the arms read lit, not silhouetted
    const sol = solarState(g.t + g.dayStart);
    const sx = Math.sign(sol.dir[0] || 1), sz = Math.sign(sol.dir[2] || 1);
    g.photoCam = {
      x: g.ship.x + sx * L * 1.35, y: 6, z: g.ship.z + sz * L * 1.05,
      lookAt: { x: g.ship.x, y: 5.5, z: g.ship.z },
    };
  });
  await sleep(1500);
  await page.screenshot({ path: join(OUT, '1-kraken-grip.png') });
  const armsUp = await page.evaluate(() =>
    window.saltstead.monsterFx.tentacles.filter((a) => a.group.visible).length);
  ok(armsUp >= 5, `the arms are up (${armsUp} of 6 in frame)`);

  // the eye surfaces when it tires — two arms left
  await page.evaluate(() => {
    const g = window.saltstead;
    g.kraken = { state: 'gripping', t: 40, arms: 2, hackT: 0 };
    g.photoCam = {
      x: g.ship.x - 20, y: 4.5, z: g.ship.z + 16,
      lookAt: { x: g.ship.x + 6, y: 1.5, z: g.ship.z - 4 },
    };
  });
  await sleep(1500);
  await page.screenshot({ path: join(OUT, '2-kraken-eye.png') });
  const eyeUp = await page.evaluate(() => window.saltstead.monsterFx.krakenHead.visible);
  ok(eyeUp, 'the eye surfaced for the photograph');
  await page.evaluate(() => { window.saltstead.kraken = null; });

  // ---- 2. SHARKS AT A SINKING ----
  const wreckOk = await page.evaluate(() => {
    const g = window.saltstead;
    const it = g.merchants.live.entries().next();
    if (it.done) return false;
    const [id, e] = it.value;
    // park her 55 m off the beam, going down by the stern, and let the sea know
    e.m.x = g.ship.x + 55; e.m.z = g.ship.z + 10;
    g.merchants.startSinking(id, e);
    e.sinkT = 10; // well down by the stern
    g.merchants.wrecks()[g.merchants.wrecks().length - 1].age = 34; // the pack has gathered
    // close frame ON the wreck: fins circle at 8-14 m, they must fill it
    g.photoCam = {
      x: e.m.x - 24, y: 5, z: e.m.z - 16,
      lookAt: { x: e.m.x, y: 0.5, z: e.m.z },
    };
    return true;
  });
  await sleep(1500);
  await page.screenshot({ path: join(OUT, '3-shark-frenzy.png') });
  const finsUp = await page.evaluate(() => window.saltstead.wildlife.frenzy.filter((f) => f.visible).length);
  ok(wreckOk && finsUp >= 2, `the frenzy gathered (${finsUp} fins on the wreck)`);

  // ---- 3. THE BIOLUMINESCENT WAKE — moonless tropical night, full sail ----
  await page.evaluate(async () => {
    const { DAY_LENGTH, moonPhase, lunarState } = await import('/src/skymath.js');
    const g = window.saltstead;
    // hunt a midnight where the moon is DOWN or new: darkest water wins
    let best = 0, bestScore = 1e9;
    for (let d = 0; d < 30; d++) {
      const T = (d + 0.5) * DAY_LENGTH * 29.5 / 29.5 + DAY_LENGTH * 0.0; // midnights across the month
      const skyT = d * DAY_LENGTH + DAY_LENGTH * 0.0;
      const lun = lunarState(skyT);
      const bright = 0.15 + 0.85 * (1 - Math.abs(moonPhase(skyT) - 0.5) * 2);
      const score = Math.max(0, lun.alt) * bright;
      if (score < bestScore) { bestScore = score; best = skyT; }
    }
    g.dayStart = best - g.t;
    g.ship.trim = 0.5; g.ship.speed = 8; // a full head of way: the wake burns
    g.photoCam = {
      x: g.ship.x - 14, y: 9, z: g.ship.z - 26,
      lookAt: { x: g.ship.x, y: 0.5, z: g.ship.z - 8 },
    };
  });
  await sleep(2500);
  await page.screenshot({ path: join(OUT, '4-biolum-wake.png') });
  const glow = await page.evaluate(() => window.saltstead.foam.glow || 0);
  ok(glow > 0.4, `the wake burns (glow ${glow.toFixed(2)})`);

  // ---- 4. THE MOONLIT NIGHT — full moon at midnight ----
  await page.evaluate(async () => {
    const { DAY_LENGTH, MOON_MONTH_DAYS } = await import('/src/skymath.js');
    const g = window.saltstead;
    g.dayStart = DAY_LENGTH * MOON_MONTH_DAYS * 0.5 - g.t; // the full moon rides at midnight
    const L = g.spec.length;
    g.photoCam = {
      x: g.ship.x + L * 1.6, y: 6, z: g.ship.z + L * 0.9,
      lookAt: { x: g.ship.x, y: 5, z: g.ship.z },
    };
  });
  await sleep(2500);
  await page.screenshot({ path: join(OUT, '5-moonlit-sail.png') });
  ok(true, 'moonlit sail framed');

  // ---- 5. THE TWO FLAGS — a King's corvette alongside, guns talking ----
  await page.evaluate(async () => {
    const { DAY_LENGTH } = await import('/src/skymath.js');
    const g = window.saltstead;
    g.dayStart = 0.42 * DAY_LENGTH - g.t; // clean daylight for the liveries
    const id = g.merchants.spawnEscort(g.ship.x + 46, g.ship.z + 6, g.ship.yaw);
    const e = g.merchants.live.get(id);
    e.m.speed = 0;
    g.gunCool = 0; g.shotKind = 'round';
    g.fireGuns();
    g.photoCam = {
      x: g.ship.x - 26, y: 8, z: g.ship.z - 30,
      lookAt: { x: g.ship.x + 22, y: 3, z: g.ship.z + 4 },
    };
  });
  await sleep(700);
  await page.screenshot({ path: join(OUT, '6-two-flags-broadside.png') });
  ok(true, 'the duel framed');

  // ---- 6. THE WHALE — surfaced, blowing, off the beam in blue water ----
  await page.evaluate(async () => {
    const { DAY_LENGTH } = await import('/src/skymath.js');
    const { WHALE_PERIOD } = await import('/src/wildlife.js');
    const g = window.saltstead;
    g.dayStart = 0.45 * DAY_LENGTH - g.t;
    // jump the sim clock to the blow: u ~ 0.66 of the whale's cycle
    g.t = Math.ceil(g.t / WHALE_PERIOD) * WHALE_PERIOD + WHALE_PERIOD * 0.66;
    g.ship.speed = 0;
    const wAng = Math.floor(g.t / WHALE_PERIOD) * 2.4;
    const wx = g.ship.x + Math.sin(g.ship.yaw + 1.9 + wAng) * 170;
    const wz = g.ship.z + Math.cos(g.ship.yaw + 1.9 + wAng) * 170;
    g.photoCam = {
      x: wx - 30, y: 4, z: wz - 22,
      lookAt: { x: wx, y: 0.5, z: wz },
    };
  });
  await sleep(1200);
  await page.screenshot({ path: join(OUT, '7-the-whale.png') });
  const whaleUp = await page.evaluate(() => window.saltstead.wildlife.whale.group.visible
    && window.saltstead.wildlife.whale.group.position.y > -3);
  ok(whaleUp, 'the whale surfaced for the photograph');

  ok(pageErrors.length === 0,
    pageErrors.length ? `page errors: ${pageErrors.slice(0, 3).join(' | ')}` : 'no page errors across every scene');
} finally {
  await browser.close();
}
console.log(failed ? `capture-post: ${failed} FAILED` : 'capture-post: ALL SHOTS TAKEN');
process.exit(failed ? 1 : 0);
