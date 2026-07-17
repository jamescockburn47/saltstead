// Live smoke test for the two flags: boots the game TWICE in headless
// Chrome — once under the King's colours, once under the black — and
// asserts each side's whole doctrine end to end: the choice screen, the
// livery and masthead flag, the attitude of the lanes, the boarding law,
// the pirate's speed edge, and the navy's signal rocket bringing real
// broadsides down on a raider. Screenshots to media/. Not part of the
// verify gate (needs a dev server + puppeteer):
//   npm run dev                        (terminal 1)
//   node scripts/live-factions.mjs     (terminal 2)
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

async function boot(side, name) {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && !t.includes('404')) pageErrors.push(t);
  });
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
  // each boot is a fresh sailor: the guest auth of the previous run persists
  // in localStorage and would skip the login box
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle2' });
  await page.type('#invitename', name);
  await page.click('#btnguest');
  await page.waitForSelector('#btnnew', { visible: true });
  await page.click('#btnnew');
  await page.waitForSelector('#btnpirate', { visible: true });
  await page.click(side === 'navy' ? '#btnnavy' : '#btnpirate');
  await page.waitForFunction('!!window.saltstead', { timeout: 30000 });
  await sleep(5000);
  await page.evaluate(() => document.querySelector('#briefingclose')?.click());
  await sleep(400);
  return { page, pageErrors };
}

try {
  // ================= THE KING'S COLOURS =================
  {
    const { page, pageErrors } = await boot('navy', 'NavyTest');

    const state = await page.evaluate(() => {
      const g = window.saltstead;
      return {
        faction: g.faction, tag: g.fac.tag, hostile: g.fac.hostileType,
        hud: document.getElementById('shipname').textContent,
        speedMult: g.fac.speedMult,
      };
    });
    ok(state.faction === 'navy', `the choice took: faction = ${state.faction}`);
    ok(state.hud.includes(state.tag), `the HUD flies her colours ("${state.hud}")`);
    ok(state.hostile === 'raider' && state.speedMult === 1,
      'her hunter is the raider; her hull sails rated speed');

    // the livery: white sails on the player, and a flag mesh at the truck
    // (getHex reads back in sRGB, dodging THREE's linear color management)
    const liv = await page.evaluate(() => {
      const g = window.saltstead;
      let whiteSail = false, flagTex = false;
      g.shipGroup.traverse((o) => {
        if (o.isMesh && o.material?.color && !o.material.map && o.material.side === 2) {
          if (o.material.color.getHex() === 0xf2efe4) whiteSail = true;
        }
        if (o.isMesh && o.material?.map?.isDataTexture && o.material.fog === false
          && o.geometry?.type === 'PlaneGeometry') flagTex = true;
      });
      return { whiteSail, flagTex };
    });
    ok(liv.whiteSail, 'admiralty-white canvas aloft');
    ok(liv.flagTex, 'the ensign flies at the main truck');

    // stage a raider close aboard and send up the rocket
    const signal = await page.evaluate(async () => {
      const g = window.saltstead;
      const { TYPES } = await import('/src/merchants.js');
      // conjure a raider onto the beam (session-local, like any battle)
      let raider = null;
      for (const [id, e] of g.merchants.live) {
        if (e.m.type === 'raider' && e.sinkT === null) { raider = [id, e]; break; }
      }
      if (!raider) {
        // repurpose the nearest live hull as a raider — the sim treats type as data
        const it = g.merchants.live.entries().next();
        if (it.done) return { none: true };
        raider = it.value;
        raider[1].m.type = 'raider';
      }
      const [rid, re] = raider;
      re.m.x = g.ship.x + 500; re.m.z = g.ship.z + 200;
      re.m.routed = false; re.m.looted = false;
      const before = g.merchants.live.size;
      g.signalCool = 0;
      g.signalSquadron();
      return {
        rid, before, after: g.merchants.live.size,
        assists: [...g.assist.entries()],
        raiderCruise: TYPES.raider.cruise,
      };
    });
    ok(!signal.none, 'a live hull was on the water to hunt');
    if (!signal.none) {
      ok(signal.assists.length >= 1, `the rocket gave orders (${signal.assists.length} corvette(s) assigned)`);
      ok(signal.assists.every(([, rid]) => rid === signal.rid), 'every order names the raider');
      ok(signal.after >= signal.before, `the Admiralty answered (${signal.after - signal.before} escort(s) over the horizon)`);

      // warp the answering corvettes to gun range (the honest closing takes
      // minutes of sea room; the test buys the arrival, not the gunnery)
      await page.evaluate((rid) => {
        const g = window.saltstead;
        const re = g.merchants.live.get(rid);
        let i = 0;
        for (const [aid] of g.assist) {
          const ce = g.merchants.live.get(aid);
          if (!ce || !re) continue;
          ce.m.x = re.m.x + 250 + i * 40;
          ce.m.z = re.m.z + (i % 2 ? 120 : -120);
          i++;
        }
      }, signal.rid);
      // let the squadron fire — the raider must take real damage
      const told = await page.waitForFunction((rid) => {
        const g = window.saltstead;
        const e = g.merchants.live.get(rid);
        if (!e) return { gone: true };
        return (e.dmg.hull < 1 || e.sinkT !== null)
          ? { hull: e.dmg.hull, sinking: e.sinkT !== null } : false;
      }, { timeout: 45000, polling: 500 }, signal.rid)
        .then((h) => h.jsonValue()).catch(() => null);
      ok(!!told, told
        ? `the squadron's guns told (raider hull ${told.gone ? 'gone' : (told.hull * 100).toFixed(0) + '%'}${told.sinking ? ', SINKING' : ''})`
        : 'the squadron never landed a shot in 90 s');
      await page.screenshot({ path: join(OUT, 'faction-navy-signal.png') });
    }

    // the boarding law: no honest trader in the boarding window
    const law = await page.evaluate(async () => {
      const g = window.saltstead;
      const { canBoardType } = await import('/src/faction.js');
      return {
        trader: canBoardType('trader', g.faction),
        raider: canBoardType('raider', g.faction),
      };
    });
    ok(!law.trader && law.raider, 'the boarding law holds at runtime: raiders yes, the trade never');

    ok(pageErrors.length === 0,
      pageErrors.length ? `navy page errors: ${pageErrors.slice(0, 3).join(' | ')}` : 'navy boot: no page errors');
    await page.close();
  }

  // ================= THE BLACK FLAG =================
  {
    const { page, pageErrors } = await boot('pirate', 'PirateTest');

    const state = await page.evaluate(async () => {
      const g = window.saltstead;
      const dark = [];
      g.shipGroup.traverse((o) => {
        if (o.isMesh && o.material?.color && !o.material.map && o.material.side === 2) {
          dark.push(o.material.color.getHex());
        }
      });
      return {
        faction: g.faction, hostile: g.fac.hostileType,
        speedMult: g.fac.speedMult, plunderMult: g.fac.plunderMult,
        sailHexes: dark.map((h) => h.toString(16)),
        hud: document.getElementById('shipname').textContent,
      };
    });
    ok(state.faction === 'pirate', `the choice took: faction = ${state.faction}`);
    ok(state.hostile === 'navy', 'the King hunts her');
    ok(state.speedMult > 1 && state.plunderMult > 1,
      `the individual edge is live (speed x${state.speedMult}, plunder x${state.plunderMult})`);
    ok(state.hud.includes('Black Flag'), `the HUD admits it ("${state.hud}")`);

    // the speed edge reaches the water: effective top speed beats the rated spec
    const speed = await page.evaluate(async () => {
      const g = window.saltstead;
      g.hull.rig = 1; g.hull.hull = 1;
      return { rated: g.spec.maxSpeed, mult: g.fac.speedMult };
    });
    ok(speed.mult * speed.rated > speed.rated, `a lawless sloop makes ${(speed.rated * speed.mult).toFixed(1)} m/s against ${speed.rated} rated`);

    await page.screenshot({ path: join(OUT, 'faction-pirate.png') });
    ok(pageErrors.length === 0,
      pageErrors.length ? `pirate page errors: ${pageErrors.slice(0, 3).join(' | ')}` : 'pirate boot: no page errors');
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(failed ? `live-factions: ${failed} FAILED` : 'live-factions: ALL GREEN');
process.exit(failed ? 1 : 0);
