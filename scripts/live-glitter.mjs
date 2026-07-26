// THE GLITTER PROBE — is the sun's road on the water actually THERE, from the
// camera the player is given?
//
// The owner's report was "I have to move the camera angle to see them", so the
// only measurement that answers it is one taken from the DEFAULT VIEW. This
// probe therefore never places the camera: it leaves main.js's own third-person
// rig exactly as it comes up (pitch 0.32, dist 8, fov 62) and only ever turns
// the YAW, which is the one thing a player does without thinking — you turn to
// look at the sunset.
//
// THE CONTROLLED COMPARISON. A 62 degree lens spans about +-47 degrees of
// bearing, so a frame aimed at the sun cannot also contain water 60 degrees off
// the sun: the two sectors will not fit in one picture. So the probe renders the
// SAME sea from the SAME rig at three bearings — at the source, 90 degrees off
// it, and dead away from it — and compares the CENTRAL sector (+-SECTOR
// degrees) of each, bin by bin in range. Everything but the bearing is held:
// same clock, same weather, same sea state, same eye height, same pitch, same
// distance. What is left is the only thing that should matter.
//
// WHAT IS MEASURED:
//   RATIO  — mean luminance of the central sector looking AT the source, over
//            the mean of the same sector looking 90 and 180 degrees off it.
//            1.00 means the sea does not know where the sun is. The headline.
//   P99    — the 99th percentile in the sunward sector: the glints.
//   REACH  — the furthest range bin still carrying 1.25x its off-source twin,
//            i.e. how far down the water the road runs. The ocean mesh is
//            720 m across and the fog closes at 620, so 340 m is measured and
//            no further; that IS the visible sea.
//   ROAD   — the share of sunward water pixels above 1.5x the off-source mean.
//
//   THE WAKE is measured the same way round: the ship is put under way, the
//   wake's churn mask is evaluated ON THE CPU (wake.js wakeEval — the shader's
//   own verified twin) at every unprojected water point, so the wake's pixels
//   are identified by arithmetic and not by colour. The identical frame is then
//   rendered under a MORNING and an EVENING sun of equal altitude: same
//   geometry, opposite bearing. If the wake's brightness is the same in both,
//   the wake does not know where the sun is.
//
//   npm run dev                                  (terminal 1)
//   node scripts/live-glitter.mjs --tag=after     (terminal 2)
//
// Options: --url=  --tag=  --tier=fine|plain  --spot=atlantic|caribbean
//          --nofps (skip the frame-time section)  --burnonly (frame time only)
// Exits non-zero if any pinned source fails its gate (see GATE below).

import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const hit = argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};
const APP_URL = arg('url', 'http://localhost:5173');
const TAG = arg('tag', 'now');
const TIER = arg('tier', 'fine');
const NOFPS = argv.includes('--nofps');
const BURNONLY = argv.includes('--burnonly');
const OUT = resolve('media');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SPOTS = {
  atlantic: { lat: 32.0, lon: -48.0, name: 'mid-Atlantic 32N 48W' },
  caribbean: { lat: 17.4, lon: -76.6, name: 'off Port Royal 17.4N 76.6W' },
};
const SPOT = SPOTS[arg('spot', 'atlantic')];

// the sources to pin. `alt` is solarState's raw sunAlt, so 0.10 is about 5.4
// degrees of real elevation; `moon` switches to the lunar branch.
const SOURCES = [
  { key: 'lowsun', label: 'a low sun (~5 deg)', alt: 0.10 },
  { key: 'goldsun', label: 'a golden-hour sun (~13 deg)', alt: 0.23 },
  { key: 'highsun', label: 'a high sun (~50 deg)', alt: 0.78 },
  { key: 'moon', label: 'a full moon on a dark sea', moon: true },
];

const SECTOR = 12;                    // degrees of bearing either side of centre
const DIST_MAX = 340, DIST_BINS = 10; // metres: the mesh's own reach
const STRIDE = 3;
const FRAMES = 3;
const WIND = 10;                      // m/s: the owner's ordinary day
const VIEW = { width: 1280, height: 720 };

// GATES — the claims the change has to keep, not aspirations. The low sun and
// the moon must both put a clearly brighter road down their own bearing from the
// DEFAULT rig, and it must reach down the water rather than sit at the ship.
//
// A RATIO AND A REACH ONLY BOUND THE CORRIDOR FROM BELOW, and both rise as it
// saturates — set GLITTER.gain to 15 and they both go greener while the sunward
// sea clips to white. So every source is also bounded from ABOVE: on the sector's
// median luminance and on the share of it that has clipped. (verify-glitter's
// check 6b is the headless half of the same bound.)
//
// ATTRIBUTION, per source, and the numbers are not the same because the physics
// is not. `ablate` is how much of the sunward excess the GLITTER PATH itself
// accounts for (ratio with it on / ratio with uSparkle forced to 0); `drop` is
// the same thing in absolute luminance counts off the sector's mean. Measured
// 2026-07-26, fine tier, working sea: low sun 1.144x / 11.4 counts, golden hour
// 1.308x / 31.3, high sun 1.057x / 7.3, full moon 1.482x / 21.6. The LOW sun's
// share is the smallest of the four and that is expected rather than
// disappointing: uSparkle carries lightrig's dayness (0.59 at 5 degrees against
// 0.90 at 13), while the fresnel reflection of a gold sky — which is not this
// change's doing — is at its strongest exactly there. Thresholds sit below the
// measurements with room, because a gate set at the measurement is a gate that
// goes red on a calm day.
//
// AND THE TWO TIERS ARE GATED SEPARATELY, on their own measurements, because
// they are not the same renderer. Plain keeps GLITTER.plainScale of the
// corridor's amplitude AND runs with NoToneMapping (main.js applyQuality), so a
// bright noon sea there clips where the fine tier's ACES curve would have rolled
// off — that is pre-existing behaviour, not this change's, so plain's clipping is
// gated on the DELTA the corridor adds rather than on an absolute ceiling.
// Deriving plain's thresholds from fine's by a multiplier was tried and is
// wrong: a luminance ratio is not linear in amplitude. These are measured.
const GATE = {
  fine: {
    lowsun: { ratio: 1.30, reach: 200, p50: 190, clip: 0.05, ablate: 1.08, drop: 6 },
    goldsun: { ratio: 1.20, reach: 150, p50: 190, clip: 0.06, ablate: 1.20, drop: 18 },
    highsun: { p50: 200, clip: 0.08, ablate: 1.02, drop: 3 },
    moon: { ratio: 1.30, reach: 150, p50: 170, clip: 0.04, ablate: 1.30, drop: 12 },
  },
  // measured on the plain tier the same day: low sun 1.093x / 2.3 counts,
  // golden 1.276x / 12.6, high sun 1.001x / 1.1, moon 1.080x / 5.0. The high
  // sun's corridor is not separable from Phong's own highlight there, so it is
  // not gated on attribution — the phenomenon plain must keep is the LOW-source
  // road, and that is what ratio/reach/contiguity hold.
  plain: {
    lowsun: { ratio: 1.15, reach: 150, clipDelta: 0.05, ablate: 1.04, drop: 1.5 },
    goldsun: { ratio: 1.15, reach: 150, clipDelta: 0.08, ablate: 1.15, drop: 8 },
    highsun: { clipDelta: 0.10 },
    moon: { ratio: 1.15, reach: 150, clipDelta: 0.05, ablate: 1.03, drop: 2.5 },
  },
}[TIER] || {};
const GATE_WAKE = 1.12;      // up-sun / down-sun wake brightness

const browser = await puppeteer.launch({
  headless: true,
  args: [`--window-size=${VIEW.width},${VIEW.height}`, '--enable-gpu'],
  defaultViewport: VIEW,
});
const fails = [];
const report = { tag: TAG, tier: TIER, spot: SPOT.name, sector: SECTOR, sources: {}, wake: null, fps: null };
let step = 'launch';
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('error', (e) => pageErrors.push(`PAGE CRASH: ${e}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('404')) pageErrors.push(m.text());
  });

  step = 'boot';
  await page.goto(APP_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.type('#invitename', 'GlitterProbe');
  await page.click('#btnguest');
  await page.waitForSelector('#btnnew', { visible: true });
  await page.click('#btnnew');
  await page.waitForSelector('#btnpirate', { visible: true });
  await page.click('#btnpirate');
  await page.waitForFunction('!!window.saltstead', { timeout: 30000 });
  await sleep(4000);
  await page.evaluate(() => document.querySelector('#briefingclose')?.click());

  // ---- the rig. It forces the weather, the clock and the sea state; it does
  // NOT place the camera, because the whole question is what the default camera
  // shows. Only cam.yaw is driven, which is a player's own drag.
  step = 'install rig';
  await page.evaluate(async ([wind, tier]) => {
    const S = await import('/src/skymath.js');
    const Wv = await import('/src/waves.js');
    const E = await import('/src/earth.js');
    const Wk = await import('/src/wake.js');
    window.__mod = { S, Wv, E, Wk };
    const g = window.saltstead;
    g.weatherLock = true;
    g.weatherState = 'clear';
    g.gloom = 0;
    g.applyQuality(tier);
    g.gfxWatch.manual = true;   // the readbacks tank fps; no demotion mid-run
    g.wind.speed = wind;
    g.wind.from = 2.3;
    // FORCE the sea state. seaBandsFor eases toward its target and the probe
    // must compare frames on identical water, so pin the bands the owner's
    // ordinary 10 m/s day offshore produces.
    window.__sea = { swell: 1.54, chop: 1.05 };
    window.__cfg = { skyT: null, hideShip: true, speed: 0, yaw: null, pin: null,
      sparkleOff: false };
    window.__buf = null;
    // the yaw the game hands the player at spawn, remembered so "as given" is
    // still as given after the probe has turned the rig about
    window.__yaw0 = g.cam.yaw;

    const R = g.renderer;
    const orig = R.render.bind(R);
    R.render = (scene, camera) => {
      const c = window.__cfg;
      if (c.skyT !== null) g.dayStart = c.skyT - g.t;
      g.cam.yaw = c.yaw === null ? window.__yaw0 : c.yaw;
      if (c.pin) { g.ship.x = c.pin.x; g.ship.z = c.pin.z; }
      if (c.speed !== null) g.ship.speed = c.speed;
      if (c.shipYaw !== null && c.shipYaw !== undefined) g.ship.yaw = c.shipYaw;
      if (c.sparkleOff) g.ocean.uniforms.uSparkle.value = 0;
      const sea = window.__sea;
      g.seaBands.swell = sea.swell; g.seaBands.chop = sea.chop;
      Wv.setSeaBands(sea.swell, sea.chop);
      g.ocean.uniforms.uSwellL.value = sea.swell;
      g.ocean.uniforms.uSwellS.value = sea.chop;
      if (g.shipGroup) g.shipGroup.visible = !c.hideShip;
      if (g.captain && g.captain.group) g.captain.group.visible = !c.hideShip;
      // the foam SPRITES are a separate layer with their own light drive; hide
      // them for the measurement so what is measured is the water shader alone
      if (g.foam) for (const k of ['wakeMesh', 'fleckMesh'])
        if (g.foam[k]) g.foam[k].visible = !c.hideShip;
      orig(scene, camera);
      if (window.__grab && camera && camera.isPerspectiveCamera && R.getRenderTarget() === null) {
        window.__grab = false;
        const gl = R.getContext();
        const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
        // ONE buffer for the whole run: a fresh 3.7 MB array per grab was
        // enough GC pressure to lose the CDP connection
        if (!window.__buf || window.__buf.length !== W * H * 4) window.__buf = new Uint8Array(W * H * 4);
        gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, window.__buf);
        const m = camera.matrixWorld.elements;
        window.__last = {
          W, H,
          eye: [m[12], m[13], m[14]],
          right: [m[0], m[1], m[2]],
          up: [m[4], m[5], m[6]],
          fwd: [-m[8], -m[9], -m[10]],
          tanV: Math.tan((camera.fov * Math.PI / 180) / 2),
          aspect: camera.aspect,
          sun: g.ocean.uniforms.uSunDirW.value.toArray(),
          sparkle: g.ocean.uniforms.uSparkle.value,
          glitAmp: g.ocean.uniforms.uGlitAmp ? g.ocean.uniforms.uGlitAmp.value : null,
          bands: { ...g.seaBands },
          camYaw: g.cam.yaw, camPitch: g.cam.pitch, camDist: g.cam.dist,
          shipYaw: g.ship.yaw, shipSpeed: g.ship.speed,
          wakeSrc: g.wakeSources ? { ...g.wakeSources[0] } : null,
        };
      }
    };
  }, [WIND, TIER]);

  // ---- the in-page instrument -----------------------------------------------
  // Unprojects the frame onto the sea plane with the frame's OWN camera basis
  // and accumulates the central sector by range bin. Histograms, not arrays:
  // only a summary travels back.
  const measure = async () => page.evaluate(([SECTOR, DMAX, NBIN, STR, FR]) =>
    new Promise((done) => {
      const { Wk } = window.__mod;
      const D2R = Math.PI / 180;
      const nb = NBIN;
      const sum = new Float64Array(nb), cnt = new Float64Array(nb);
      const hist = new Float64Array(256), wHist = new Float64Array(256);
      let nSec = 0, waterSum = 0, waterN = 0;
      let wkAll = 0, wkAllN = 0;
      // THE BEARING-RESOLVED GRID. A sector average cannot see a road that is
      // two degrees wide: at 300 m the corridor's own half-width is about that,
      // so a +-12 degree average dilutes it sixfold and reports nothing. So
      // also bin by BEARING FROM THE SOURCE in 2 degree buckets out to 24
      // degrees, with a wide off-source reference at 30-46 degrees, at every
      // range. That measures the road where the road is, and proves it is
      // centred on the source rather than merely somewhere in the frame.
      const NBRG = 12, BRG_W = 2;   // 12 buckets of 2 degrees: out to 24
      const bSum = new Float64Array(nb * NBRG), bCnt = new Float64Array(nb * NBRG);
      const rSum = new Float64Array(nb), rCnt = new Float64Array(nb);
      let meta = null, frames = 0;
      const grab = () => new Promise((okk) => {
        window.__last = null; window.__grab = true;
        const wait = () => (window.__last ? okk(window.__last) : setTimeout(wait, 30));
        wait();
      });
      const step = async () => {
        const L = await grab();
        meta = L;
        const px = window.__buf;
        const { W, H, eye, right, up, fwd, tanV, aspect, sun } = L;
        const tanH = tanV * aspect;
        // THE SECTOR IS THE FRAME'S OWN CENTRE, not the sun's bearing. That is
        // what makes the three aims comparable: each reading is "the middle of
        // the picture", and only where the picture points changes.
        const lookAz = Math.atan2(fwd[0], fwd[2]);
        const sunAz = Math.atan2(sun[0], sun[2]);
        const src = L.wakeSrc;
        const doWake = src && src.speed > 1.4;
        for (let y = 0; y < H; y += STR) {
          const ndcY = ((y + 0.5) / H) * 2 - 1;
          for (let x = 0; x < W; x += STR) {
            const ndcX = ((x + 0.5) / W) * 2 - 1;
            let dx = fwd[0] + right[0] * ndcX * tanH + up[0] * ndcY * tanV;
            let dy = fwd[1] + right[1] * ndcX * tanH + up[1] * ndcY * tanV;
            let dz = fwd[2] + right[2] * ndcX * tanH + up[2] * ndcY * tanV;
            const dl = Math.hypot(dx, dy, dz); dx /= dl; dy /= dl; dz /= dl;
            if (dy > -1e-4) continue;            // above the horizon: sky
            const t = -eye[1] / dy;
            if (!(t > 0)) continue;
            const wxp = eye[0] + dx * t, wzp = eye[2] + dz * t;
            const rng = Math.hypot(wxp - eye[0], wzp - eye[2]);
            if (rng > DMAX) continue;            // past the mesh, into the fog
            const i = (y * W + x) * 4;
            const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
            waterSum += lum; waterN++;
            wHist[lum < 255 ? lum | 0 : 255]++;
            // bearing of this water point from the eye, against the frame's axis
            const az = Math.atan2(wxp - eye[0], wzp - eye[2]);
            const d = Math.abs(((((az - lookAz) / D2R) % 360) + 540) % 360 - 180);
            const bin = Math.min(nb - 1, (rng / DMAX * nb) | 0);
            if (d <= SECTOR) {
              sum[bin] += lum; cnt[bin]++; nSec++;
              hist[lum < 255 ? lum | 0 : 255]++;
            }
            // the bearing-resolved grid, measured from the SOURCE's bearing
            const ds = Math.abs(((((az - sunAz) / D2R) % 360) + 540) % 360 - 180);
            if (ds < NBRG * BRG_W) {
              const bb = (ds / BRG_W) | 0;
              bSum[bin * NBRG + bb] += lum; bCnt[bin * NBRG + bb]++;
            } else if (ds >= 30 && ds <= 46) { rSum[bin] += lum; rCnt[bin]++; }
            // the wake, identified by wake.js's own churn arithmetic
            if (doWake && rng < 140 && Wk.wakeEval(wxp, wzp, src).f > 0.35) {
              wkAll += lum; wkAllN++;
            }
          }
        }
        frames++;
        // 200 ms apart, not 40: the wave clock has to move enough between
        // frames for them to be worth averaging. At 40 ms three frames were
        // barely one sample of the sea.
        if (frames < FR) { setTimeout(step, 200); return; }
        const mean = (s, n) => (n > 0 ? s / n : 0);
        const q = (h, total, p) => {
          let acc = 0;
          for (let i = 0; i < 256; i++) { acc += h[i]; if (acc >= total * p) return i; }
          return 255;
        };
        let sT = 0, sN = 0;
        const bins = [];
        for (let b = 0; b < nb; b++) {
          sT += sum[b]; sN += cnt[b];
          // the road, at this range: the brightest 2 degree bearing bucket with
          // enough support, and where it stands relative to the source
          let peak = 0, peakAt = null, peakN = 0;
          const prof = [];
          for (let k = 0; k < NBRG; k++) {
            const n = bCnt[b * NBRG + k];
            const m = mean(bSum[b * NBRG + k], n);
            prof.push({ deg: k * BRG_W, mean: +m.toFixed(2), n });
            if (n >= 25 && m > peak) { peak = m; peakAt = k * BRG_W; peakN = n; }
          }
          bins.push({
            d0: Math.round((b / nb) * DMAX), d1: Math.round(((b + 1) / nb) * DMAX),
            mean: mean(sum[b], cnt[b]), n: cnt[b],
            roadPeak: peak, roadAt: peakAt, roadN: peakN,
            offRef: mean(rSum[b], rCnt[b]), offN: rCnt[b],
            prof,
          });
        }
        // CLIPPED: the share of the sunward sector that has run out of range.
        // A contrast ratio rises as a corridor saturates, so it cannot tell a
        // bright road from a flooded one; this can.
        let clipped = 0;
        for (let i = 253; i < 256; i++) clipped += hist[i];
        done({
          secMean: mean(sT, sN), nSec: sN,
          p99: q(hist, nSec, 0.99), p50: q(hist, nSec, 0.5),
          clip: nSec > 0 ? clipped / nSec : 0,
          waterMean: mean(waterSum, waterN), waterP99: q(wHist, waterN, 0.99), nWater: waterN,
          hist: Array.from(hist),
          bins,
          meta: {
            sun: meta.sun.map((v) => +v.toFixed(4)),
            sparkle: +meta.sparkle.toFixed(4),
            glitAmp: meta.glitAmp === null ? null : +meta.glitAmp.toFixed(4),
            bands: meta.bands, camYaw: +meta.camYaw.toFixed(3),
            camPitch: +meta.camPitch.toFixed(3), camDist: +meta.camDist.toFixed(2),
            eyeY: +meta.eye[1].toFixed(2), W: meta.W, H: meta.H,
            shipSpeed: +meta.shipSpeed.toFixed(2), shipYaw: +meta.shipYaw.toFixed(3),
            // how far the source stands off the frame's own axis: >90 means the
            // frame is looking DOWN-sun, <90 means UP-sun
            sunOffLook: +(Math.abs(((((Math.atan2(meta.sun[0], meta.sun[2])
              - Math.atan2(meta.fwd[0], meta.fwd[2])) * 180 / Math.PI) % 360 + 540) % 360 - 180))
              .toFixed(1)),
          },
          wake: { mean: mean(wkAll, wkAllN), n: wkAllN },
        });
      };
      step();
    }), [SECTOR, DIST_MAX, DIST_BINS, STRIDE, FRAMES]);

  // yaw the rig so its LOOK direction sits `off` radians from the source's
  // bearing. The camera stands opposite where it looks, hence the negation.
  const aimAt = async (off) => {
    await page.evaluate((o) => {
      const s = window.saltstead.ocean.uniforms.uSunDirW.value;
      const az = Math.atan2(s.x, s.z) + o;       // look toward this bearing
      window.__cfg.yaw = Math.atan2(-Math.sin(az), -Math.cos(az));
    }, off);
    await sleep(800);
  };

  const pinSource = async (spec) => page.evaluate((s) => {
    const { S } = window.__mod;
    let best = null;
    if (s.moon) {
      const span = S.DAY_LENGTH * S.MOON_MONTH_DAYS;
      for (let i = 0; i < 16000; i++) {
        const t = (i / 16000) * span;
        const sol = S.solarState(t), lun = S.lunarState(t);
        if (sol.nightness < 0.99) continue;
        const ph = S.moonPhase(t);
        const bright = 0.15 + 0.85 * (1 - Math.abs(ph - 0.5) * 2);
        if (bright < 0.9) continue;
        const d = Math.abs(lun.alt - 0.22);
        if (!best || d < best.d) best = { d, t };
      }
    } else {
      for (let i = 0; i < 4000; i++) {
        const t = (i / 4000) * S.DAY_LENGTH;
        const sol = S.solarState(t);
        if (sol.frac > 0.5) continue;            // the MORNING solution
        const d = Math.abs(sol.sunAlt - s.alt);
        if (!best || d < best.d) best = { d, t };
      }
    }
    window.__cfg.skyT = best.t;
    return best.t;
  }, spec);

  // ---- run -----------------------------------------------------------------
  step = 'teleport';
  await page.evaluate(([lat, lon]) => {
    const g = window.saltstead;
    const w = window.__mod.E.latLonToWorld(lat, lon);
    g.ship.x = w.x; g.ship.z = w.z;
    window.__cfg.pin = { x: w.x, z: w.z };
    g.geoClock = 0;
  }, [SPOT.lat, SPOT.lon]);
  await sleep(3500);

  console.log(`glitter probe  tag=${TAG}  tier=${TIER}  ${SPOT.name}  wind ${WIND} m/s`
    + `  ${VIEW.width}x${VIEW.height}`);
  console.log(`  central sector +-${SECTOR} deg, water out to ${DIST_MAX} m, DEFAULT camera rig`
    + ` (pitch/dist/fov untouched); the reference is the SAME rig turned 90 and 180 deg off`);

  for (const s of BURNONLY ? [] : SOURCES) {
    step = `source ${s.key}`;
    const skyT = await pinSource(s);
    await sleep(900);
    // the yaw exactly as the game hands it over — where does the sun stand?
    await page.evaluate(() => { window.__cfg.yaw = null; window.__cfg.speed = 0; });
    await sleep(700);
    const given = await page.evaluate(() => {
      const g = window.saltstead;
      const s2 = g.ocean.uniforms.uSunDirW.value;
      const look = [-Math.sin(g.cam.yaw), -Math.cos(g.cam.yaw)];
      const az = Math.atan2(s2.x, s2.z);
      const lk = Math.atan2(look[0], look[1]);
      return { camYaw: +g.cam.yaw.toFixed(3),
        sunOffLook: +(Math.abs((((az - lk) * 180 / Math.PI % 360) + 540) % 360 - 180)).toFixed(1) };
    });
    await aimAt(0);
    const at = await measure();
    await aimAt(Math.PI / 2);
    const off90 = await measure();
    await aimAt(Math.PI);
    const off180 = await measure();
    // THE ABLATION, without which the ratio is not an attribution. Crest
    // subsurface scatter and Phong's own specular are BOTH bearing-dependent and
    // both predate this change, so some of the sunward excess was always there.
    // Force uSparkle to 0 — the glitter path and nothing else — and re-measure
    // the same three aims. The difference is what the corridor is worth.
    await page.evaluate(() => { window.__cfg.sparkleOff = true; });
    await aimAt(0);
    const abAt = await measure();
    await aimAt(Math.PI / 2);
    const abOff90 = await measure();
    await aimAt(Math.PI);
    const abOff180 = await measure();
    await page.evaluate(() => { window.__cfg.sparkleOff = false; });
    const abRef = (abOff90.secMean + abOff180.secMean) / 2;
    const abRatio = abRef > 0 ? abAt.secMean / abRef : 0;

    const ref = (off90.secMean + off180.secMean) / 2;
    const ratio = ref > 0 ? at.secMean / ref : 0;
    // REACH is measured on the bearing-resolved grid, because that is the only
    // instrument that can see a two-degree road at three hundred metres. But
    // roadPeak is a MAX over twelve bucket means held against a near-unbiased
    // mean of hundreds of samples, so its null expectation is above 1.0 — water
    // that knows nothing about the sun still scores perhaps 1.07-1.13 — and
    // taking the FURTHEST passing bin picks precisely the bin where that bias is
    // largest. Two discriminators, and they cost nothing:
    //   WHERE the peak stands. A real road peaks in the 0-2 degree bucket, next
    //   to the source. Noise peaks anywhere, so a bin whose brightest bearing is
    //   14 degrees off the sun is not evidence of a road at that range.
    //   CONTIGUITY. A road is connected: reach is the furthest bin such that it
    //   AND every nearer qualifying bin passes, not the furthest bin that does.
    let reach = 0;
    const roadBins = at.bins.filter((b) => b.roadN >= 25 && b.offN >= 25 && b.offRef > 0);
    for (const b of roadBins) {
      const passes = b.roadPeak > b.offRef * 1.25 && b.roadAt <= 4;
      if (!passes) break;              // the road has ended; nothing past here counts
      reach = b.d1;
    }
    const offBearingBins = roadBins.filter((b) => b.roadAt > 4).length;
    let road = 0;
    { let acc = 0, tot = at.nSec;
      for (let i = Math.min(255, Math.ceil(ref * 1.5)); i < 256; i++) acc += at.hist[i];
      road = tot > 0 ? acc / tot : 0; }

    console.log(`\n=== ${s.label} ===  skyT ${skyT.toFixed(1)}  sun dir ${at.meta.sun.slice(0, 3).join(', ')}`
      + `  uSparkle ${at.meta.sparkle}  glitAmp ${at.meta.glitAmp}`);
    console.log(`    eye ${at.meta.eyeY} m  pitch ${at.meta.camPitch}  dist ${at.meta.camDist}`
      + `  bands swell ${at.meta.bands.swell.toFixed(2)} chop ${at.meta.bands.chop.toFixed(2)}`
      + `  (default yaw put the sun ${given.sunOffLook} deg off the look direction)`);
    console.log(`    AT source   mean ${at.secMean.toFixed(2)}  p50 ${at.p50}  p99 ${at.p99}`
      + `  (n ${at.nSec})`);
    console.log(`    90 deg off  mean ${off90.secMean.toFixed(2)}  p99 ${off90.p99}`);
    console.log(`    180 deg off mean ${off180.secMean.toFixed(2)}  p99 ${off180.p99}`);
    console.log(`    RATIO ${ratio.toFixed(3)}   reach ${reach} m (contiguous, peak within 4 deg`
      + ` of the source; ${offBearingBins} of ${roadBins.length} bins peaked off-bearing)`
      + `   road ${(road * 100).toFixed(1)}%`
      + `   glint p99/p50 ${(at.p99 / Math.max(1, at.p50)).toFixed(2)}`
      + `   sunward p50 ${at.p50}  clipped ${(at.clip * 100).toFixed(2)}%`);
    console.log('    sector by range:  ' + at.bins.map((b, i) => {
      if (b.n <= 100) return null;
      const r = (off90.bins[i].mean + off180.bins[i].mean) / 2;
      return `${b.d0}-${b.d1}m ${(r > 0 ? b.mean / r : 0).toFixed(2)}x`;
    }).filter(Boolean).join('  '));
    console.log('    THE ROAD (brightest 2 deg bearing bucket / the 30-46 deg water beside it):');
    for (const b of at.bins) {
      if (b.roadN < 25 || b.offN < 25) continue;
      console.log(`      ${String(b.d0).padStart(4)}-${String(b.d1).padEnd(4)} m`
        + `  peak ${b.roadPeak.toFixed(1).padStart(6)} at ${String(b.roadAt).padStart(2)}-`
        + `${b.roadAt + 2} deg off the source (n ${b.roadN})`
        + `   beside it ${b.offRef.toFixed(1)} (n ${b.offN})`
        + `   ${(b.offRef > 0 ? b.roadPeak / b.offRef : 0).toFixed(2)}x`);
    }
    console.log(`    ABLATION (uSparkle = 0, nothing else touched): RATIO ${abRatio.toFixed(3)}`
      + `  sunward ${abAt.secMean.toFixed(2)}  p50 ${abAt.p50}`
      + `  clipped ${(abAt.clip * 100).toFixed(2)}%`
      + `   => the glitter path is worth ${(ratio / Math.max(1e-6, abRatio)).toFixed(3)}x`
      + ' of the sunward excess; the remainder is crest scatter and Phong specular');
    report.sources[s.key] = { skyT, at, off90, off180, ratio, reach, road, given,
      ablated: { at: abAt, ratio: abRatio }, attribution: ratio / Math.max(1e-6, abRatio) };

    // two pictures per source: the frame a player would actually see (ship in
    // it, aimed at the source, nothing else touched), and the same frame with
    // the hull out of the way so the whole corridor can be compared before and
    // after without a sloop standing in the middle of it
    await aimAt(0);
    await sleep(600);
    await page.screenshot({ path: `${OUT}/glitter-${TAG}-${s.key}-water.png` });
    await page.evaluate(() => { window.__cfg.hideShip = false; });
    await sleep(700);
    await page.screenshot({ path: `${OUT}/glitter-${TAG}-${s.key}.png` });
    await page.evaluate(() => { window.__cfg.hideShip = true; });

    const gate = GATE[s.key] || {};
    if (gate.ratio && ratio < gate.ratio)
      fails.push(`${s.label}: the corridor is only ${ratio.toFixed(3)}x the off-source sea`
        + ` from the default rig (want ${gate.ratio})`);
    if (gate.reach && reach < gate.reach)
      fails.push(`${s.label}: the contiguous corridor only reaches ${reach} m (want ${gate.reach})`);
    // the ceilings — brightness is bounded in BOTH directions
    if (gate.p50 && at.p50 > gate.p50)
      fails.push(`${s.label}: the sunward sector's median is ${at.p50} of 255 (ceiling ${gate.p50})`
        + ' — the road is flooding the frame, not lighting it');
    if (gate.clip !== undefined && at.clip > gate.clip)
      fails.push(`${s.label}: ${(at.clip * 100).toFixed(1)}% of the sunward sector has clipped`
        + ` (ceiling ${(gate.clip * 100).toFixed(0)}%)`);
    if (gate.clipDelta !== undefined && at.clip - abAt.clip > gate.clipDelta)
      fails.push(`${s.label}: the corridor itself pushed`
        + ` ${((at.clip - abAt.clip) * 100).toFixed(1)}% of the sunward sector into clipping`
        + ` (ceiling ${(gate.clipDelta * 100).toFixed(0)}%)`);
    // ATTRIBUTION: the corridor must be the GLITTER PATH's doing, in ratio and
    // in absolute counts. Crest scatter and Phong specular are both
    // bearing-dependent and both predate this change, so without these two the
    // headline ratio is an observation and not an attribution.
    if (gate.ablate && ratio < abRatio * gate.ablate)
      fails.push(`${s.label}: killing uSparkle only takes the ratio ${ratio.toFixed(3)} ->`
        + ` ${abRatio.toFixed(3)} = ${(ratio / abRatio).toFixed(3)}x (want ${gate.ablate}x) —`
        + ' the sunward excess is not the glitter path, so this probe is not measuring'
        + ' the change');
    if (gate.drop && at.secMean - abAt.secMean < gate.drop)
      fails.push(`${s.label}: the corridor is worth only`
        + ` ${(at.secMean - abAt.secMean).toFixed(1)} luminance counts on the sunward`
        + ` sector (want ${gate.drop})`);
  }

  // ---- THE WAKE: identical geometry, opposite sun bearing -------------------
  step = 'wake';
  if (BURNONLY) { await aimAt(0); await page.evaluate(() => { window.__cfg.hideShip = false; }); }
  if (!BURNONLY) {
  console.log('\n=== the wake against the sun ===');
  console.log('    ONE sun, ONE clock, ONE sea. She sails first AWAY from it and then'
    + ' TOWARD it,\n    with the camera always ahead of her bow looking aft down the'
    + ' Kelvin V — so the\n    wake is first up-sun and then down-sun and nothing else'
    + ' whatever has changed.\n    Churn pixels are picked out by wake.js\'s own churn'
    + ' arithmetic on the CPU, not\n    by their colour, and the wake is judged on its'
    + ' EXCESS over the open water in\n    the same frame, so a brighter sky cannot be'
    + ' mistaken for a brighter wake.');
  // a low sun: the case the owner sails in and the one where forward scatter
  // has most to say
  const wakeSkyT = await page.evaluate(() => {
    const { S } = window.__mod;
    let best = null;
    for (let i = 0; i < 4000; i++) {
      const t = (i / 4000) * S.DAY_LENGTH;
      const sol = S.solarState(t);
      if (sol.frac > 0.5) continue;
      const d = Math.abs(sol.sunAlt - 0.14);
      if (!best || d < best.d) best = { d, t };
    }
    window.__cfg.skyT = best.t;
    window.__cfg.speed = 7;
    return best.t;
  });
  await sleep(2600);
  const wakeRun = async (which) => {
    await page.evaluate((w) => {
      const s = window.saltstead.ocean.uniforms.uSunDirW.value;
      const sunAz = Math.atan2(s.x, s.z);
      // the camera stands one ship-length ahead of the bow and looks aft, so
      // the frame's axis is the ship's REVERSED heading. Sail away from the sun
      // and that axis points at it; sail toward it and it points away.
      const yaw = w === 'up' ? sunAz + Math.PI : sunAz;
      window.__cfg.shipYaw = yaw;
      window.__cfg.yaw = yaw;
    }, which);
    await sleep(3200); // let the old wake wash out of the map and the new one build
    const m = await measure();
    // the hull out of the way so the Kelvin V itself can be compared
    await page.screenshot({ path: `${OUT}/glitter-${TAG}-wake-${which}sun.png` });
    return { m };
  };
  const upRun = await wakeRun('up');
  const dnRun = await wakeRun('down');
  const wl = (label, r) => console.log(`    ${label.padEnd(9)} sun`
    + ` ${r.m.meta.sun.slice(0, 3).map((v) => v.toFixed(2)).join(',')}`
    + `  ${r.m.meta.sunOffLook} deg off the frame's axis`
    + `  churn ${r.m.wake.mean.toFixed(2)} (n ${r.m.wake.n})`
    + `  open water ${r.m.waterMean.toFixed(2)}  speed ${r.m.meta.shipSpeed}`);
  wl('up-sun', upRun); wl('down-sun', dnRun);
  const exUp = upRun.m.wake.mean / Math.max(1e-6, upRun.m.waterMean);
  const exDn = dnRun.m.wake.mean / Math.max(1e-6, dnRun.m.waterMean);
  const wrAbs = upRun.m.wake.mean / Math.max(1e-6, dnRun.m.wake.mean);
  const wr = exUp / Math.max(1e-6, exDn);
  console.log(`    up-sun run: ${upRun.m.meta.sunOffLook} deg off axis, churn`
    + ` ${upRun.m.wake.mean.toFixed(2)} over water ${upRun.m.waterMean.toFixed(2)}`
    + ` = ${exUp.toFixed(3)}x`);
  console.log(`    down-sun  : ${dnRun.m.meta.sunOffLook} deg off axis, churn`
    + ` ${dnRun.m.wake.mean.toFixed(2)} over water ${dnRun.m.waterMean.toFixed(2)}`
    + ` = ${exDn.toFixed(3)}x`);
  console.log(`    WAKE SUN-TRACKING: churn's excess over its own water, up-sun / down-sun`
    + ` = ${wr.toFixed(3)}x   (raw churn ratio ${wrAbs.toFixed(3)}x)`);
  report.wake = {
    skyT: wakeSkyT,
    upSun: { wake: upRun.m.wake, water: upRun.m.waterMean, off: upRun.m.meta.sunOffLook },
    downSun: { wake: dnRun.m.wake, water: dnRun.m.waterMean, off: dnRun.m.meta.sunOffLook },
    excessUp: exUp, excessDown: exDn, ratio: wr, rawRatio: wrAbs,
  };
  if (wr < GATE_WAKE)
    fails.push(`the wake is only ${wr.toFixed(3)}x brighter up-sun than down-sun`
      + ` (want ${GATE_WAKE}) — it still does not know where the sun is`);
  }

  // ---- frame time ----------------------------------------------------------
  if (!NOFPS) {
    step = 'fps';
    console.log('\n=== frame time ===  (ship visible, aimed at the source, no readbacks)');
    await aimAt(0);
    // THE BURN. A rAF median only ever reports the vsync interval on a machine
    // that is keeping up, which says nothing about what a shader costs. So
    // render the same frame back to back with a gl.finish() around the batch,
    // at twice the pixel ratio so the FRAGMENT shader is unambiguously the
    // bottleneck, and divide. That number is comparable before and after.
    for (const ratio of [1, 2]) {
      const b = await page.evaluate(async (r) => {
        const g = window.saltstead;
        const R = g.renderer;
        const gl = R.getContext();
        const prev = R.getPixelRatio();
        R.setPixelRatio(r);
        R.setSize(window.innerWidth, window.innerHeight, false);
        // more pixels means each one covers LESS sea, so the glitter lobe's
        // resolution model has to be re-told or the burn measures a stale uPixA
        g.ocean.setLens(g.camera.fov, R.domElement.height);
        // gl.finish() does not reliably stall through ANGLE; a one-pixel
        // readback does, because the driver cannot answer it until the queue
        // has drained. That is the difference between measuring the GPU and
        // measuring how fast JS can enqueue draw calls.
        const sync = () => { const p = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p); return p[0]; };
        for (let i = 0; i < 12; i++) R.render(g.scene, g.camera);
        sync();
        const N = 60;
        const t0 = performance.now();
        for (let i = 0; i < N; i++) R.render(g.scene, g.camera);
        sync();
        const ms = (performance.now() - t0) / N;
        const out = { ms, w: gl.drawingBufferWidth, h: gl.drawingBufferHeight, ratio: r };
        R.setPixelRatio(prev);
        R.setSize(window.innerWidth, window.innerHeight, false);
        g.ocean.setLens(g.camera.fov, R.domElement.height);
        return out;
      }, ratio);
      console.log(`    burn @ ratio ${b.ratio} (${b.w}x${b.h}): ${b.ms.toFixed(2)} ms/frame`);
      report[`burn${ratio}`] = b;
    }
    await page.evaluate(() => {
      window.__cfg.hideShip = false;
      window.__fps = [];
      let last = performance.now();
      const tick = () => {
        const n = performance.now();
        window.__fps.push(n - last); last = n;
        if (window.__fps.length < 900) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await sleep(17000);
    const fps = await page.evaluate(() => {
      const a = window.__fps.slice(150).sort((x, y) => x - y); // drop the settle
      return { n: a.length, median: a[a.length >> 1], p10: a[(a.length * 0.1) | 0], p90: a[(a.length * 0.9) | 0] };
    });
    console.log(`    ${fps.n} frames  median ${fps.median.toFixed(2)} ms`
      + `  p10 ${fps.p10.toFixed(2)}  p90 ${fps.p90.toFixed(2)}`);
    report.fps = fps;
  }

  // A SHADER THAT DOES NOT COMPILE IS A FAILED RUN. These were printed and
  // otherwise ignored, so a broken shader could only fail this probe indirectly
  // — through whatever a black frame happened to do to the ratios.
  if (pageErrors.length) {
    console.log(`\n${pageErrors.length} page/console error(s):`);
    for (const e of pageErrors.slice(0, 6)) console.log('  ' + e.replace(/\n/g, ' ').slice(0, 300));
    fails.push(`${pageErrors.length} page/console error(s) — first: `
      + pageErrors[0].replace(/\n/g, ' ').slice(0, 240));
  }
  report.pageErrors = pageErrors.slice(0, 6);
} catch (e) {
  console.log(`\nPROBE FAILED during "${step}": ${e && e.message}`);
  fails.push(`probe aborted during ${step}: ${e && e.message}`);
} finally {
  await browser.close();
}
writeFileSync(`${OUT}/glitter-${TAG}.json`, JSON.stringify(report, null, 1));
console.log(`\nwrote media/glitter-${TAG}.json and media/glitter-${TAG}-*.png`);
if (fails.length) {
  console.log('\nGLITTER GATE FAILED:');
  for (const f of fails) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('\nglitter gate green.');
