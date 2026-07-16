// Live smoke test for the ship classes and the fighting: boots the game as
// a guest in headless Chrome, swaps through every rung of the ladder
// (screenshot each to media/), then stages a long-range battle and a
// deliberate ramming against a live merchant and asserts the damage maths
// land. Not part of the verify gate (needs a dev server + puppeteer):
//   npm run dev                       (terminal 1)
//   node scripts/live-classes.mjs     (terminal 2)
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
    if (m.type() === 'error' && !t.includes('404')) pageErrors.push(t); // favicon 404 is noise
  });

  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.type('#invitename', 'ClassTest');
  await page.click('#btnguest');
  await page.waitForSelector('#btnnew', { visible: true });
  await page.click('#btnnew');
  await page.waitForFunction('!!window.saltstead', { timeout: 30000 });
  await sleep(6000);
  // the fresh-spawn captain's briefing sits over everything: to the sea
  await page.evaluate(() => document.querySelector('#briefingclose')?.click());
  await sleep(400);

  // late morning light, calm-ish sea, weather pinned so shots stay readable
  await page.evaluate(async () => {
    const { DAY_LENGTH } = await import('/src/skymath.js');
    const g = window.saltstead;
    g.dayStart = 0.38 * DAY_LENGTH - g.t;
    g.weatherLock = true;
  });

  // ---- 1. every rung of the ladder, framed and photographed ----
  const hulls = ['sloop', 'cutter', 'schooner', 'brig', 'corvette', 'frigate', 'galleon'];
  for (const id of hulls) {
    const info = await page.evaluate(async (hid) => {
      const { hullById } = await import('/src/shipyard.js');
      const g = window.saltstead;
      const def = hullById(hid);
      g.setHull(def);
      const L = def.spec.length;
      g.photoCam = {
        x: g.ship.x + L * 1.7, y: 4 + L * 0.55, z: g.ship.z - L * 1.5,
        lookAt: { x: g.ship.x, y: 2 + L * 0.2, z: g.ship.z },
      };
      return { id: g.hullId, guns: g.hullDef.guns, masts: g.hullDef.masts, scale: g.shipFrame.scale };
    }, id);
    await sleep(900);
    await page.screenshot({ path: join(OUT, `class-${id}.png`) });
    ok(info.id === id, `${id}: hull swapped in (${info.guns} guns, ${info.masts} masts, scale ${info.scale.toFixed(2)})`);
  }

  // ---- 2. the battle: a broadside fired and FELT at long range ----
  const battle = await page.evaluate(async () => {
    const g = window.saltstead;
    g.photoCam = null;
    // pick any live merchant and drag her onto our starboard beam at 380 m
    const it = g.merchants.live.entries().next();
    if (it.done) return { none: true };
    const [id, e] = it.value;
    e.m.x = g.ship.x + Math.cos(g.ship.yaw) * 380;
    e.m.z = g.ship.z - Math.sin(g.ship.yaw) * 380;
    e.m.speed = 0;
    const before = { ...e.dmg };
    g.gunCool = 0;
    g.shotKind = 'round';
    let hits = 0;
    for (let i = 0; i < 12; i++) { // roll until the rng lands one
      g.gunCool = 0;
      g.fireGuns();
      if (e.dmg.hull < before.hull || e.sinkT !== null) { hits++; break; }
    }
    const flashUp = g.combatFx.flashes.some((f) => f.active);
    const ballUp = g.combatFx.balls.some((b) => b.active);
    return {
      id, before: before.hull, after: e.dmg.hull, sinking: e.sinkT !== null,
      hits, flashUp, ballUp, cooling: g.gunCool > 0,
    };
  });
  ok(!battle.none, 'a live merchant was on the water to fight');
  if (!battle.none) {
    ok(battle.hits > 0 || battle.sinking, `round shot told at 380 m (hull ${battle.before} -> ${battle.after}${battle.sinking ? ', SINKING' : ''})`);
    ok(battle.flashUp, 'muzzle flash fired');
    ok(battle.ballUp, 'ball in the air');
    ok(battle.cooling, 'the reload dance started');
  }
  await sleep(600);
  await page.screenshot({ path: join(OUT, 'battle-longrange.png') });

  // ---- 3. the collision: drive the galleon's bow into a merchant ----
  const collision = await page.evaluate(async () => {
    const g = window.saltstead;
    // find a merchant that is still afloat
    let pick = null;
    for (const [id, e] of g.merchants.live) { if (e.sinkT === null) { pick = [id, e]; break; } }
    if (!pick) return { none: true };
    const [id, e] = pick;
    // park her dead ahead, 45 m off the bow, beam-on; ram at full tilt
    e.m.x = g.ship.x + Math.sin(g.ship.yaw) * 45;
    e.m.z = g.ship.z + Math.cos(g.ship.yaw) * 45;
    e.m.yaw = g.ship.yaw + Math.PI / 2;
    e.m.speed = 0;
    g.ship.speed = 9;
    g.hull.hull = 1; g.crippled = false;
    return { staged: true, id };
  });
  ok(collision.staged, 'collision staged: merchant beam-on, 45 m dead ahead, ramming speed');
  // let the frame loop carry the hulls together
  const result = await page.waitForFunction(() => {
    const g = window.saltstead;
    return (g.hull.hull < 1 || g.crippled) ? {
      hull: g.hull.hull, crippled: g.crippled,
    } : false;
  }, { timeout: 15000, polling: 250 }).then((h) => h.jsonValue()).catch(() => null);
  ok(!!result, `the ram connected (player hull -> ${result ? (result.hull * 100).toFixed(0) + '%' : 'no contact in 15 s'})`);
  const apart = await page.evaluate((cid) => {
    const g = window.saltstead;
    const e = g.merchants.live.get(cid);
    if (!e) return { gone: true };
    const d = Math.hypot(e.m.x - g.ship.x, e.m.z - g.ship.z);
    return { d, herHull: e.dmg.hull, herSinking: e.sinkT !== null };
  }, collision.id);
  if (!apart.gone) {
    ok(apart.d > 5, `the hulls shouldered apart (${apart.d.toFixed(1)} m between centres)`);
    ok(apart.herHull < 1 || apart.herSinking, `her side paid too (hull ${(apart.herHull * 100).toFixed(0)}%${apart.herSinking ? ', SINKING' : ''})`);
  }
  await page.screenshot({ path: join(OUT, 'collision.png') });

  // ---- 4. NPC hulls look the part: park next to one of each type ----
  const npc = await page.evaluate(() => {
    const g = window.saltstead;
    const seen = {};
    for (const [, e] of g.merchants.live) seen[e.m.type] = (seen[e.m.type] || 0) + 1;
    // count crew figures riding the nearest live merchant
    let hands = 0, type = null;
    for (const [, e] of g.merchants.live) {
      if (e.sinkT !== null) continue;
      let n = 0;
      e.group.traverse((o) => { if (o.isMesh && o.geometry?.parameters?.width === 0.22) n++; });
      hands = n; type = e.m.type;
      if (n > 0) break;
    }
    return { seen, hands, type };
  });
  ok(Object.keys(npc.seen).length > 0, `types on the water: ${JSON.stringify(npc.seen)}`);
  ok(npc.hands > 0 || npc.type === 'derelict', `visible crew aboard the ${npc.type} (${npc.hands} heads counted)`);

  ok(pageErrors.length === 0, pageErrors.length ? `page errors: ${pageErrors.slice(0, 3).join(' | ')}` : 'no page errors');
} finally {
  await browser.close();
}
console.log(failed ? `live-classes: ${failed} FAILED` : 'live-classes: ALL GREEN');
process.exit(failed ? 1 : 0);
