// Live proof for the wind-field rebuild of 2026-07-26: the world's wind, and
// therefore the world's sea, now reads its LATITUDE instead of a single global
// number. Boots the game as a guest in headless Chrome, drops the ship at a
// spread of real places — doldrums, trades, horse latitudes, the Channel, the
// roaring forties, the screaming fifties, and the owner's own Indian Ocean
// reading — and measures what the running game actually says at each.
//
// THE BUG THIS EXISTS TO DISPROVE. weather.js floored the wind at 10 m/s while
// wind.js's whole latitude field topped out at 9.19, so the floor beat the
// weather everywhere: the owner sailed the Channel and the Indian Ocean and both
// read exactly 10.00 m/s, and because seaBandsFor takes the wind, both carried
// the identical swell. The headless gates (verify-wind, verify-weather) hold the
// arithmetic; this script holds the LIVE GAME, which is where the reading that
// started it came from.
//
// Two measurement notes, both deliberate:
//  - The live wind GUSTS (main.js: +-45% on a ~90 s cycle). Ordering is
//    therefore asserted on the de-gusted field — recomputed in-page from the
//    ship's own live position through the game's own wind.js and weather.js —
//    while the live gusting value is asserted to sit inside that field's gust
//    envelope, and printed for the record. Waiting out a 90 s gust cycle at
//    every site would make the script useless.
//  - The swell band eases at 0.015/s (tau ~67 s: the ocean's MEMORY, by
//    design), so a freshly teleported ship is not yet feeling the sea of the
//    place it is in. Each site therefore pre-loads seaBands to the steady state
//    the game itself is easing toward — the sea a ship that had been there
//    twenty minutes would ride — and then measures the real wave field through
//    the game's own evaluator.
//
// Not part of the verify gate (needs a dev server):
//   npm run dev                    (terminal 1)
//   node scripts/live-wind.mjs     (terminal 2)
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';
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

// the places, and what each is FOR. lat, lon, whether it is open ocean (the
// Channel is not — its lee is part of the story), and a shot to keep.
const SITES = [
  { key: 'doldrums', name: 'the doldrums (mid-Atlantic ITCZ)', lat: 1.0, lon: -25.0, shot: true },
  { key: 'indian', name: "the Indian Ocean (the owner's reading)", lat: -4.6, lon: 75.0 },
  { key: 'trades', name: 'the NE trades (mid-Atlantic)', lat: 16.0, lon: -40.0, shot: true },
  { key: 'horse', name: 'the horse latitudes (the Sargasso)', lat: 31.0, lon: -45.0, shot: true },
  { key: 'channel', name: "the Channel (the owner's reading)", lat: 50.15, lon: -2.4, shot: true },
  { key: 'forties', name: 'the roaring forties (South Atlantic)', lat: -45.0, lon: 0.0, shot: true },
  // -54, -40 looks like open Southern Ocean on a globe and is not: South
  // Georgia sits there, and the first run of this script measured a coast
  // distance of 502 m and a sheltered sea to prove it. 90 E is the empty
  // Indian sector.
  { key: 'fifties', name: 'the screaming fifties (Southern Ocean)', lat: -54.0, lon: 90.0, shot: true },
];

const browser = await puppeteer.launch({
  headless: true,
  args: ['--window-size=1600,900', '--enable-gpu'],
  defaultViewport: { width: 1600, height: 900 },
});
const rows = [];
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && !t.includes('404')) pageErrors.push(t);
  });

  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.type('#invitename', 'WindTest');
  await page.click('#btnguest');
  await page.waitForSelector('#btnnew', { visible: true });
  await page.click('#btnnew');
  await page.waitForSelector('#btnpirate', { visible: true });
  await page.click('#btnpirate');
  await page.waitForFunction('!!window.saltstead', { timeout: 30000 });
  await sleep(4000);
  await page.evaluate(() => document.querySelector('#briefingclose')?.click());
  await sleep(400);

  // late morning and a fair sky so the shots read. weatherLock pins the SKY for
  // the photography only — whether a cyclone actually sits on a site is asserted
  // from the live stormField below, which is the thing that would override the
  // wind field (stormWindAt) and invalidate a reading.
  await page.evaluate(async () => {
    const { DAY_LENGTH } = await import('/src/skymath.js');
    const g = window.saltstead;
    g.dayStart = 0.38 * DAY_LENGTH - g.t;
    g.weatherState = 'clear';
    g.gloom = 0;
    g.weatherLock = true;
  });

  for (const site of SITES) {
    // drop her at the place — open water, hove to, so the reading is the
    // PLACE's and not a wake's
    await page.evaluate(async ([lat, lon]) => {
      const { latLonToWorld, worldToLatLon, isLand, signedCoastGame } = await import('/src/earth.js');
      const w = latLonToWorld(lat, lon);
      const g = window.saltstead;
      let spot = null;
      // the named point if it is afloat; otherwise the nearest water to it
      if (!isLand(lat, lon)) spot = { x: w.x, z: w.z };
      else {
        outer:
        for (let r = 40; r <= 4000; r += 40) {
          for (let a = 0; a < 32; a++) {
            const th = (a / 32) * Math.PI * 2;
            const x = w.x + Math.sin(th) * r, z = w.z + Math.cos(th) * r;
            const ll = worldToLatLon(x, z);
            if (!isLand(ll.lat, ll.lon) && signedCoastGame(ll.lat, ll.lon) < -40) {
              spot = { x, z }; break outer;
            }
          }
        }
      }
      if (!spot) throw new Error('no water found near the site');
      g.ship.x = spot.x; g.ship.z = spot.z;
      g.ship.speed = 0; g.ship.trim = 0.5;
      g.geoClock = 0;
      g.cam.pitch = 0.12; g.cam.targetDist = 44; g.cam.dist = 44;
      window.__spot = spot;
    }, [site.lat, site.lon]);
    await sleep(3200); // coast distance, coast map and the wind all recompute

    // read the live game, then pre-load the ocean's memory to this place's
    // steady state and measure the real wave field it produces
    const m = await page.evaluate(async () => {
      const g = window.saltstead;
      const { windAt } = await import('/src/wind.js');
      const { windProfile, seaBandsFor } = await import('/src/weather.js');
      const { significantHeight } = await import('/src/waves.js');
      const { worldToLatLon } = await import('/src/earth.js');
      const p = window.__spot;
      const ll = worldToLatLon(p.x, p.z);
      // the de-gusted field at the ship's own live position, through the
      // game's own modules and the game's own live coast distance
      const raw = windAt(p.x, p.z);
      const field = windProfile(g.overLand ? 0 : g.coastDist, raw.speed);
      const want = seaBandsFor(field, g.coastDist);
      // Pre-load the eased bands (see the header note) and let a few frames
      // carry them into the shader and the hull alike. main.js goes on easing
      // toward a target built from the GUSTING wind, so over this window the
      // chop (0.08/s) drifts a few percent off the de-gusted value while the
      // swell (0.015/s) barely moves — which is why the swell band is the one
      // the assertions below are built on.
      g.seaBands.swell = want.swell; g.seaBands.chop = want.chop;
      await new Promise((r) => setTimeout(r, 900));
      const mean = (x, z) => {
        let s = 0;
        for (let i = 0; i < 240; i++) s += Math.abs(g.waveAt(x, z, g.t + i * 0.37));
        return s / 240;
      };
      const hsSw = significantHeight(0), hsCh = significantHeight(1);
      return {
        lat: ll.lat, lon: ll.lon,
        live: g.wind.speed,           // what the HUD is showing right now
        field,                        // the same wind with the gust taken out
        rawField: raw.speed,          // the latitude field before shelter
        coastDist: g.coastDist,
        overLand: g.overLand,
        // a cyclone here would override windAt entirely (stormWindAt) and lift
        // the sea on top of it, so a reading taken inside one says nothing
        // about the latitude
        stormy: g.stormField.seaScale > 1 || g.stormField.danger > 0,
        swell: want.swell, chop: want.chop,
        hs: Math.hypot(hsSw * want.swell, hsCh * want.chop),
        meanAbsHeight: mean(p.x, p.z),
        hudWind: document.getElementById('windspeed')?.textContent ?? '',
      };
    });
    rows.push({ ...site, ...m });
    console.log(`  ${site.name}`);
    console.log(`      lat ${m.lat.toFixed(2)} lon ${m.lon.toFixed(2)}  coastDist ${m.coastDist.toFixed(0)} m`
      + `  field ${m.rawField.toFixed(2)} -> ${m.field.toFixed(2)} m/s  live(gusting) ${m.live.toFixed(2)}`
      + `  HUD "${m.hudWind}"`);
    console.log(`      swell band ${m.swell.toFixed(2)}  chop ${m.chop.toFixed(2)}`
      + `  significant height ${m.hs.toFixed(2)} m  mean |surface| ${m.meanAbsHeight.toFixed(3)} m`);
    ok(!m.stormy, `${site.key}: no storm sitting on the reading (the vortex would override the field)`);
    // The live gusting wind must be this field value modulated. main.js applies
    // the gust BEFORE windProfile, so where the floor wins the gust is clipped
    // and `live` can only ever equal `field` — the envelope is one-sided there,
    // and the clause says which case it is rather than passing vacuously.
    const floored = m.field <= 4.5 + 1e-9 && m.rawField * 1.45 <= m.field + 1e-9;
    if (floored) {
      ok(m.live === m.field,
        `${site.key}: a calm belt reads the FLOOR exactly, gust and all — ${m.live.toFixed(2)} m/s `
        + `(latitude field ${m.rawField.toFixed(2)}, floored)`);
    } else {
      ok(m.live >= m.field * 0.54 && m.live <= m.field * 1.46,
        `${site.key}: the live wind ${m.live.toFixed(2)} m/s sits inside the field's gust envelope `
        + `(${(m.field * 0.55).toFixed(2)}-${(m.field * 1.45).toFixed(2)} about ${m.field.toFixed(2)})`);
      ok(Math.abs(m.live - m.field) > 1e-9,
        `${site.key}: and it BREATHES — the gust is live, not clipped by the floor `
        + `(${(100 * (m.live / m.field - 1)).toFixed(0)}% off the mean)`);
    }
    if (site.shot) {
      await page.screenshot({ path: join(OUT, `wind-${site.key}.png`) });
      console.log(`      shot - media/wind-${site.key}.png`);
    }
  }

  // ---- THE CLAIM: the wind and the sea differ by place ----
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  const winds = rows.map((r) => r.field);
  const spread = Math.max(...winds) / Math.min(...winds);
  ok(spread > 2.5,
    `the wind differs by PLACE: ${Math.min(...winds).toFixed(2)} to ${Math.max(...winds).toFixed(2)} m/s `
    + `across seven real places, a ${spread.toFixed(1)}x spread (before the fix every one of these `
    + 'read 10.00 m/s. The low end is the floor, which is what a calm belt IS)');
  // a RATIO, not a strict float inequality: 9.99 against 10.00 would satisfy
  // "differ" and would not satisfy the owner
  ok(by.channel.field > by.indian.field * 1.4,
    `the owner's two readings now differ in earnest: the Channel ${by.channel.field.toFixed(2)} m/s `
    + `against the Indian Ocean ${by.indian.field.toFixed(2)} — `
    + `${(by.channel.field / by.indian.field).toFixed(2)}x (both read exactly 10.00 before)`);
  ok(by.trades.field > by.doldrums.field * 1.5 && by.trades.field > by.horse.field * 1.5,
    `the trades blow harder than either calm belt (${by.trades.field.toFixed(2)} vs doldrums `
    + `${by.doldrums.field.toFixed(2)}, horse latitudes ${by.horse.field.toFixed(2)})`);
  ok(by.fifties.field > by.forties.field && by.forties.field > by.trades.field,
    `and the westerlies hardest — forties ${by.forties.field.toFixed(2)}, fifties `
    + `${by.fifties.field.toFixed(2)} m/s`);
  const hss = rows.map((r) => r.hs);
  ok(Math.max(...hss) / Math.min(...hss) > 3,
    `and the SEA follows: significant height ${Math.min(...hss).toFixed(2)} m in the calm belts to `
    + `${Math.max(...hss).toFixed(2)} m in the Southern Ocean, a `
    + `${(Math.max(...hss) / Math.min(...hss)).toFixed(1)}x spread (it was 2.88 m everywhere)`);
  ok(by.fifties.meanAbsHeight > by.horse.meanAbsHeight * 2,
    `measured in the live wave field, not just the band: mean |surface| `
    + `${by.fifties.meanAbsHeight.toFixed(3)} m in the fifties against `
    + `${by.horse.meanAbsHeight.toFixed(3)} m in the horse latitudes`);
  // the SUSTAINED sea, off the ceiling. A full gust in the fifties does reach
  // 2.4 (see verify-weather) — the swell's 67 s easing against a 90 s gust cycle
  // is what keeps the realised band below it, so this is a target-band clause
  // taken from the de-gusted wind and says so.
  ok(by.fifties.swell < 2.4 * 0.95,
    `the windiest SUSTAINED fair-weather sea still leaves the storm ceiling room `
    + `(${by.fifties.swell.toFixed(2)} of 2.4, from the de-gusted field)`);

  ok(pageErrors.length === 0,
    `no page errors (${pageErrors.length ? pageErrors.slice(0, 3).join(' | ') : 'clean'})`);
} finally {
  await browser.close();
}

// the evidence, machine-readable, beside the shots
writeFileSync(join(OUT, 'wind-by-latitude.json'), JSON.stringify({
  measured: new Date().toISOString(),
  note: 'live-wind.mjs — wind and sea by place in the running game, after the '
    + '2026-07-26 wind-field rebuild. field = de-gusted windProfile at the ship; '
    + 'live = the gusting value the HUD showed.',
  sites: rows.map((r) => ({
    key: r.key, name: r.name, lat: +r.lat.toFixed(3), lon: +r.lon.toFixed(3),
    coastDistM: Math.round(r.coastDist),
    latitudeFieldMs: +r.rawField.toFixed(2), windMs: +r.field.toFixed(2),
    liveGustingMs: +r.live.toFixed(2),
    swellBand: +r.swell.toFixed(3), chopBand: +r.chop.toFixed(3),
    significantHeightM: +r.hs.toFixed(2), meanAbsSurfaceM: +r.meanAbsHeight.toFixed(3),
  })),
}, null, 2) + '\n');
console.log('  wrote - media/wind-by-latitude.json');

if (failed) { console.error(`live-wind: ${failed} FAILED`); process.exit(1); }
console.log('live-wind: OK — the wind and the sea now say where on earth you are');
