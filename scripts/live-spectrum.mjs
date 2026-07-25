// The sea's spectrum, measured — not eyeballed. Boots the game headless,
// pins a nadir (straight-down) camera over the ship so screen axes are world
// axes (east right, north up), reads rendered frames back, 2D-FFTs the water
// luminance into a wavelength × band-angle histogram, and prints each
// ablation config as EXCESS energy over a flat-sea reference (all waves and
// wake off) — so window artifacts, glare gradients and HUD leakage cancel,
// and every surviving cell belongs to a sea mechanism. Built to hunt the
// east-west narrow banding of 2026-07-25.
//   npm run dev                        (terminal 1)
//   node scripts/live-spectrum.mjs     (terminal 2)
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const URL = process.argv[2] || 'http://localhost:5173';
const OUT = resolve('media');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Mid-Atlantic: no coast, no shore set — the bands are reported "everywhere
// on the globe, including mid oceans" (2026-07-25), so hunt them clean.
const SPOT = { lat: 44, lon: -35 };
const CAM_H = 150;     // nadir camera height (m)
const FRAMES = 5;      // power spectra averaged per config
const NLAM = 36, NANG = 36; // histogram bins: log-λ 1.2–80 m × band-angle 5°

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
    if (m.type() === 'error' && !m.text().includes('404')) pageErrors.push(m.text());
  });

  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.type('#invitename', 'SpectrumProbe');
  await page.click('#btnguest');
  await page.waitForSelector('#btnnew', { visible: true });
  await page.click('#btnnew');
  await page.waitForSelector('#btnpirate', { visible: true });
  await page.click('#btnpirate');
  await page.waitForFunction('!!window.saltstead', { timeout: 30000 });
  await sleep(4000);
  await page.evaluate(() => document.querySelector('#briefingclose')?.click());

  await page.evaluate(async ([lat, lon, camH]) => {
    const { DAY_LENGTH } = await import('/src/skymath.js');
    const { latLonToWorld } = await import('/src/earth.js');
    const g = window.saltstead;
    g.dayStart = 0.45 * DAY_LENGTH - g.t;
    g.weatherLock = true;
    g.applyQuality('fine');
    g.gfxWatch.manual = true; // pin the tier: the probe's readbacks tank fps
                              // and the watchdog demoted mid-run (2026-07-25)
    const w = latLonToWorld(lat, lon);
    g.ship.x = w.x; g.ship.z = w.z;
    g.geoClock = 0;
    window.__pin = setInterval(() => { g.ship.x = w.x; g.ship.z = w.z; }, 50);
    // the ship itself is pure contamination in the crop's centre — hide every
    // scene child that follows the hull (ship group, crew, sails)
    for (const k of Object.keys(g)) {
      const v = g[k];
      if (v && v.isObject3D && /ship|hull|boat/i.test(k)) v.visible = false;
    }
    if (g.shipGroup) g.shipGroup.visible = false;
    window.__cfg = { wakeOff: false, chop: null, swell: null };
    const R = g.renderer;
    const orig = R.render.bind(R);
    const blank = new g.coastMap.texture.constructor(
      new Uint16Array([0]), 1, 1, g.coastMap.texture.format, g.coastMap.texture.type);
    blank.needsUpdate = true;
    window.__wakeTex = { live: g.wakemap.rt.texture, blank };
    R.render = (scene, camera) => {
      const c = window.__cfg;
      if (c.chop != null) g.seaBands.chop = c.chop;
      if (c.swell != null) g.seaBands.swell = c.swell;
      // detail-stack ablation: glitterScale drives uDetailAmp -> ALL fbm
      // (detail normals, far-field band, whitecaps, churn texture) off
      g.ocean.glitterScale = c.detailOff ? 0 : 1;
      // shadow ablation: the ocean receives the 2048² shadow map on fine —
      // acne bands would run east-west under a southern sun
      if (!!c.shadowOff === g.ocean.mesh.receiveShadow) {
        g.ocean.mesh.receiveShadow = !c.shadowOff;
        g.ocean.mesh.material.needsUpdate = true;
      }
      // shadow-bias probe: hunt the banding's kill-threshold with the
      // ship's shadow-on-sea feature kept alive
      g.sky.sun.shadow.normalBias = c.nBias != null ? c.nBias : 0.5;
      // sprite ablation: the foam layer's wake quads + flecks
      if (g.foam) for (const kk of ['wakeMesh', 'fleckMesh'])
        if (g.foam[kk]) g.foam[kk].visible = !c.spritesOff;
      // specular-path ablation: Phong glint + sparkle + crest scatter off
      const m = g.ocean.mesh.material;
      if (c.specOff) {
        m.specular.setRGB(0, 0, 0);
        g.ocean.uniforms.uSparkle.value = 0;
        g.ocean.uniforms.uScatter.value = 0;
      } else m.specular.setHex(0x86a8bd);
      g.ocean.uniforms.uWakeMap.value = c.wakeOff ? window.__wakeTex.blank : window.__wakeTex.live;
      if (camera && camera.isPerspectiveCamera) {
        if (c.graze != null) {
          // grazing view like a player's: low over the water, looking out
          // toward compass azimuth `graze` (radians, 0 = north(-z), π/2 = east)
          camera.position.set(g.ship.x, 9, g.ship.z);
          camera.up.set(0, 1, 0);
          camera.lookAt(g.ship.x + Math.sin(c.graze) * 55, 0, g.ship.z - Math.cos(c.graze) * 55);
        } else {
          camera.position.set(g.ship.x, camH, g.ship.z);
          camera.up.set(0, 0, -1);
          camera.lookAt(g.ship.x, 0, g.ship.z);
        }
        camera.updateMatrixWorld(true);
      }
      orig(scene, camera);
      if (window.__grab && camera && camera.isPerspectiveCamera && R.getRenderTarget() === null) {
        window.__grab = false;
        const gl = R.getContext();
        const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
        const px = new Uint8Array(W * H * 4);
        gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
        window.__last = { W, H, px };
      }
    };
  }, [SPOT.lat, SPOT.lon, CAM_H]);
  await sleep(6000);

  // one config -> averaged wavelength×angle histogram (computed in-page;
  // only NLAM×NANG numbers travel back)
  const measure = async (label, cfg) => {
    await page.evaluate((c) => {
      Object.assign(window.__cfg, c);
      const g = window.saltstead;
      if (g.gfxQuality !== 'fine') g.applyQuality('fine');
    }, cfg);
    await sleep(1200);
    const res = await page.evaluate(([camH, FRAMES, NLAM, NANG]) => new Promise(async (done) => {
      const grab = () => new Promise((ok) => {
        window.__grab = true;
        const wait = () => (window.__last ? ok(window.__last) : setTimeout(wait, 50));
        wait();
      });
      const N = 512;
      const hist = new Float64Array(NLAM * NANG);
      let meanLum = 0;
      // the EW-stripe channel: collapse x, FFT the north-south profile —
      // east-west bands land ENTIRELY in this 1D spectrum, whatever else
      // is in frame
      const ewSpec = new Float64Array(N / 2);
      const fft1d = (re, im) => {
        const n = re.length;
        for (let i = 1, j = 0; i < n; i++) {
          let bit = n >> 1;
          for (; j & bit; bit >>= 1) j ^= bit;
          j ^= bit;
          if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
        }
        for (let len = 2; len <= n; len <<= 1) {
          const ang = (-2 * Math.PI) / len;
          for (let i = 0; i < n; i += len) {
            for (let k = 0; k < len / 2; k++) {
              const c = Math.cos(ang * k), s = Math.sin(ang * k);
              const ur = re[i + k], ui = im[i + k];
              const vr = re[i + k + len / 2] * c - im[i + k + len / 2] * s;
              const vi = re[i + k + len / 2] * s + im[i + k + len / 2] * c;
              re[i + k] = ur + vr; im[i + k] = ui + vi;
              re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
            }
          }
        }
      };
      const hann = new Float64Array(N);
      for (let i = 0; i < N; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
      for (let f = 0; f < FRAMES; f++) {
        const { W, H, px } = await grab();
        window.__last = null;
        const x0 = (W - N) >> 1;
        // nadir: centre crop; grazing: lower-third crop (near-field water)
        const y0 = window.__cfg.graze != null ? Math.max(0, ((H * 0.30) | 0) - N / 2) : (H - N) >> 1;
        const lum = new Float64Array(N * N);
        let mean = 0;
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
          const i = ((y0 + y) * W + (x0 + x)) * 4;
          const v = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
          lum[y * N + x] = v; mean += v;
        }
        mean /= N * N; meanLum += mean / FRAMES;
        {
          const prof = new Float64Array(N), pim = new Float64Array(N);
          for (let y = 0; y < N; y++) {
            let s = 0;
            for (let x = 0; x < N; x++) s += lum[y * N + x];
            prof[y] = s / N;
          }
          const pm = prof.reduce((a, b) => a + b, 0) / N;
          for (let y = 0; y < N; y++) prof[y] = (prof[y] - pm) * hann[y];
          fft1d(prof, pim);
          for (let k = 1; k < N / 2; k++) ewSpec[k] += (prof[k] ** 2 + pim[k] ** 2) / FRAMES;
        }
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++)
          lum[y * N + x] = (lum[y * N + x] - mean) * hann[y] * hann[x];
        const re = Float64Array.from(lum), im = new Float64Array(N * N);
        const rr = new Float64Array(N), ri = new Float64Array(N);
        for (let y = 0; y < N; y++) {
          for (let x = 0; x < N; x++) { rr[x] = re[y * N + x]; ri[x] = im[y * N + x]; }
          fft1d(rr, ri);
          for (let x = 0; x < N; x++) { re[y * N + x] = rr[x]; im[y * N + x] = ri[x]; }
        }
        for (let x = 0; x < N; x++) {
          for (let y = 0; y < N; y++) { rr[y] = re[y * N + x]; ri[y] = im[y * N + x]; }
          fft1d(rr, ri);
          for (let y = 0; y < N; y++) { re[y * N + x] = rr[y]; im[y * N + x] = ri[y]; }
        }
        const dpr = H / 900;
        const mpp = (2 * camH * Math.tan((62 / 2) * Math.PI / 180)) / (900 * dpr);
        const lamMin = 1.2, lamMax = 80;
        for (let ky = 0; ky <= N / 2; ky++) {
          for (let kx = -N / 2 + 1; kx < N / 2; kx++) {
            if (ky === 0 && kx <= 0) continue;
            const kr = Math.hypot(kx, ky);
            const lam = (N * mpp) / kr;
            if (lam < lamMin || lam > lamMax) continue;
            const ix = (kx + N) % N;
            const p = re[ky * N + ix] ** 2 + im[ky * N + ix] ** 2;
            const li = Math.min(NLAM - 1, Math.floor(
              (Math.log(lam / lamMin) / Math.log(lamMax / lamMin)) * NLAM));
            // +ky = northward (readPixels row 0 = screen bottom = south)
            const travel = Math.atan2(ky, kx);
            const band = ((travel + Math.PI / 2) % Math.PI + Math.PI) % Math.PI;
            const ai = Math.min(NANG - 1, Math.floor((band / Math.PI) * NANG));
            hist[li * NANG + ai] += p / FRAMES;
          }
        }
      }
      // EW verdict: strongest north-south frequency, λ 0.5–10 m
      const dpr2 = (window.saltstead.renderer.getContext().drawingBufferHeight) / 900;
      const mpp2 = (2 * camH * Math.tan((62 / 2) * Math.PI / 180)) / (900 * dpr2);
      let ewPeak = { lam: 0, p: 0 }, ewTotal = 0;
      for (let k = 1; k < N / 2; k++) {
        const lam = (N * mpp2) / k;
        if (lam < 0.5 || lam > 10) continue;
        ewTotal += ewSpec[k];
        if (ewSpec[k] > ewPeak.p) ewPeak = { lam, p: ewSpec[k] };
      }
      done({ hist: Array.from(hist), meanLum: +meanLum.toFixed(1),
        ew: { lambda: +ewPeak.lam.toFixed(2), power: +ewPeak.p.toExponential(2),
          share: +(ewTotal ? ewPeak.p / ewTotal : 0).toFixed(3) },
        tier: window.saltstead.gfxQuality, bands: { ...window.saltstead.seaBands } });
    }), [CAM_H, FRAMES, NLAM, NANG]);
    console.log(`measured ${label} (tier ${res.tier}, swell ${res.bands.swell.toFixed(2)}, chop ${res.bands.chop.toFixed(2)}, meanLum ${res.meanLum})`);
    console.log(`    EW-stripe: λ ${res.ew.lambda} m  power ${res.ew.power}  share-of-EW-band ${res.ew.share}`);
    await page.screenshot({ path: `${OUT}/spectrum-${label.replace(/\W+/g, '-')}.png` });
    return res;
  };

  const lamOf = (li) => 1.2 * Math.exp(((li + 0.5) / NLAM) * Math.log(80 / 1.2));
  const angOf = (ai) => ((ai + 0.5) / NANG) * 180;

  // flat reference FIRST: everything off — what the probe sees with no sea
  // James's weather at the repro: wind 10 m/s -> chop 1.05, swell ~0.55.
  // Values are FORCED per config — releasing to the easing loop leaves the
  // sea flat for tens of seconds and measures nothing (the first run's bug).
  const CHOP = 1.05, SWELL = 0.55;
  const ref = await measure('flat-reference', { wakeOff: true, detailOff: true, chop: 0, swell: 0 });
  const configs = [
    ['baseline', { chop: CHOP, swell: SWELL }],
    ['shadow-off', { shadowOff: true, chop: CHOP, swell: SWELL }],
    ['wake-off', { wakeOff: true, chop: CHOP, swell: SWELL }],
    ['sprites-off', { spritesOff: true, chop: CHOP, swell: SWELL }],
    ['detail-off', { detailOff: true, chop: CHOP, swell: SWELL }],
    ['waves-off', { chop: 0, swell: 0 }],
    ['all-off', { shadowOff: true, wakeOff: true, spritesOff: true, detailOff: true, chop: 0, swell: 0 }],
  ];
  for (const [label, cfg] of configs) {
    const res = await measure(label, cfg);
    const excess = res.hist.map((p, i) => p - ref.hist[i]);
    const cells = excess.map((p, i) => ({ p, li: Math.floor(i / NANG), ai: i % NANG }))
      .filter((c) => c.p > 0).sort((a, b) => b.p - a.p);
    const total = cells.reduce((s, c) => s + c.p, 0) || 1;
    console.log(`  total excess power ${total.toExponential(2)}; top cells:`);
    for (const c of cells.slice(0, 8))
      console.log(`    λ ~${lamOf(c.li).toFixed(1).padStart(5)} m   band-line ${angOf(c.ai).toFixed(0).padStart(3)}°E   share ${(c.p / total).toFixed(3)}`);
    // James's metric: narrow (λ < 12 m) energy within ±20° of east-west
    let ew = 0, narrow = 0;
    for (const c of cells) {
      if (lamOf(c.li) >= 12) continue;
      narrow += c.p;
      const a = angOf(c.ai);
      if (a < 20 || a > 160) ew += c.p;
    }
    console.log(`    narrow-band (λ<12 m) energy within ±20° of east-west: ${(narrow ? ew / narrow : 0).toFixed(3)}\n`);
  }

  // ---- the grazing-view azimuth sweep: is the banding WORLD-locked or ----
  // ---- VIEW-locked? Full sea + wake; screen-space band angles only.    ----
  // World-locked east-west bands predict: looking N or S -> bands ~horizontal
  // (0°); looking E or W -> bands ~vertical-ish (steep). A view/sun-geometry
  // artifact keeps the same screen angle at every azimuth.
  console.log('\n== grazing sweep (screen-space band-line angles, 0° = horizontal) ==');
  for (const [name, az] of [['north', 0], ['east', Math.PI / 2], ['south', Math.PI], ['west', -Math.PI / 2]]) {
    const res = await measure(`graze-${name}`, { wakeOff: false, chop: CHOP, swell: SWELL, graze: az });
    const cells = res.hist.map((p, i) => ({ p, li: Math.floor(i / NANG), ai: i % NANG }))
      .sort((a, b) => b.p - a.p);
    const total = cells.reduce((s, c) => s + c.p, 0) || 1;
    console.log(`  looking ${name}:`);
    for (const c of cells.slice(0, 5))
      console.log(`    λ' ~${lamOf(c.li).toFixed(1).padStart(5)} m-equiv   screen band-line ${angOf(c.ai).toFixed(0).padStart(3)}°   share ${(c.p / total).toFixed(3)}`);
  }
  console.log('\n== grazing sweep, SPECULAR OFF (glint + sparkle + scatter dead) ==');
  for (const [name, az] of [['north', 0], ['east', Math.PI / 2], ['west', -Math.PI / 2]]) {
    const res = await measure(`graze-${name}-specoff`, { wakeOff: false, chop: CHOP, swell: SWELL, graze: az, specOff: true });
    const cells = res.hist.map((p, i) => ({ p, li: Math.floor(i / NANG), ai: i % NANG }))
      .sort((a, b) => b.p - a.p);
    const total = cells.reduce((s, c) => s + c.p, 0) || 1;
    console.log(`  looking ${name} (spec off):`);
    for (const c of cells.slice(0, 5))
      console.log(`    λ' ~${lamOf(c.li).toFixed(1).padStart(5)} m-equiv   screen band-line ${angOf(c.ai).toFixed(0).padStart(3)}°   share ${(c.p / total).toFixed(3)}`);
  }
  await page.evaluate(() => { window.__cfg.graze = null; window.__cfg.specOff = false; });

  if (pageErrors.length) console.log('\npage errors:', pageErrors.slice(0, 5));
} finally {
  await browser.close();
}
