// THE GRATING PROBE — the instrument that finally saw it.
//
// live-spectrum.mjs hunted the east-west banding for two days and could not
// convict it, for three reasons that are all measurement faults, not sea
// faults, and this probe exists to close all three:
//
//  1. IT SEARCHED THE WRONG BAND. live-spectrum's histogram runs 1.2-80 m.
//     The filaments James sees are the ocean shader's own noise LATTICE:
//     0.435 m (the sparkle twinkle), 0.526 m (the churn rag), 0.741 m (the
//     detail normals). Every one of them sat BELOW the search floor, so the
//     probe was blind by construction. Here the band runs 0.20-1.20 m.
//  2. IT LOOKED STRAIGHT DOWN. A nadir camera 150 m up resolves 0.35 m/pixel,
//     so a 0.4 m feature aliases rather than peaks — and the fresnel term is
//     pow(1 - N.V, 3), which is ~0 at nadir and ~1 at the grazing incidence a
//     player actually has. The artifact is strongest in exactly the view the
//     probe never took. Here the camera stands 9 m over the water and looks
//     out at the sun, and the water is UNPROJECTED back to world metres
//     (using the real wave height, so the rectification is not a flat-plane
//     approximation) before it is transformed. Wavelengths come out in metres
//     and orientations come out in world axes.
//  3. IT ABLATED INSTEAD OF DIFFING. "Zero the wave table and the stripes
//     die" convicts nothing: zeroing the sea also flattens the surface, kills
//     every layer gated by wave state and changes the grazing geometry. Here
//     the sea is FROZEN (wave clock, phase accumulators, band axes, sun) so
//     that two frames differing in exactly one uniform are otherwise
//     identical, and each layer is judged on its OWN pixel difference.
//
// THE DECISIVE EXPERIMENT is the last one it runs: the same frame, the same
// ship, the same weather, at 0N 0E and then at the two places James reported.
// The ocean's noise reads RAW WORLD METRES, so only its float32 hash cares
// where on earth the hull is; the wake map and the coast map follow the ship,
// and the wave field is local-frame (verify-waves proves origin invariance to
// 1e-9). If the filaments appear with longitude and latitude and vanish at the
// origin, nothing but the world-coordinate noise can own them.
//
//   npm run dev                       (terminal 1)
//   node scripts/live-grating.mjs     (terminal 2)
//
// Exits non-zero if the axis-locked sub-metre filament amplitude passes the
// gate ceiling at any spot. Options:
//   --url=http://localhost:5173   --tag=before   --spots=channel,indian,origin

import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const arg = (k, d) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};
const URL = arg('url', 'http://localhost:5173');
const TAG = arg('tag', 'now');
const OUT = resolve('media');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// James's two confirmed sightings, plus the control the diagnosis turns on.
// 0N 0E is the ONE place on earth where the shader's world-coordinate noise
// still has its full float32 mantissa, so it is the reference frame for
// "what the sea is supposed to look like".
const SPOTS = {
  channel: { lat: 50.50, lon: -1.16, name: 'Channel 50.50N 1.16W' },
  indian: { lat: -4.59, lon: 72.96, name: 'Indian Ocean 4.59S 72.96E' },
  origin: { lat: 0, lon: 0, name: 'world origin 0N 0E (control)' },
};
const WANT = arg('spots', 'origin,channel,indian').split(',').map((s) => s.trim());

// the measurement's shape. PATCH_N x PATCH_STEP is the rectified water patch,
// world-axis aligned: 256 samples at 0.05 m spans 12.8 m, which holds 29
// periods of a 0.44 m filament and resolves down to 0.10 m. PATCH_D puts it
// 22 m ahead, where the screen still gives 0.05-0.10 m per pixel in the range
// direction — a 0.35 m feature is 4-7 px there, comfortably above Nyquist.
const PATCH_N = 256, PATCH_STEP = 0.05, PATCH_D = 22;
const CAM_H = 9;          // the owner's eye: on deck, not in a balloon
const FRAMES = 6;         // the sea is frozen, so these only average GPU noise
const WIND = 10;          // m/s — James's weather at the repro
const FIL_LO = 0.15, FIL_HI = 3.00;  // THE BAND live-spectrum could not see.
                       // The shortest WAVE component is 6 m, so everything in
                       // here belongs to the shading noise and nothing else.
const AXIS_TOL = 12;   // degrees either side of a world axis
// A LOW-CONTRAST SEA IS NOT THE GOAL, AN ISOTROPIC ONE IS. The first cut of
// this gate measured the raw amplitude of axis-parallel filaments and was
// therefore a detail-contrast meter: it flagged the honest isotropic ripple at
// the world origin as hard as it flagged the grating. Both numbers below are
// RATIOS against what the same frame carries at 45 degrees to the world axes,
// so a sea can be as textured as it likes and still pass, and a grating cannot.
//   ANISO  — amplitude along a world axis over amplitude along a diagonal.
//            Isotropic noise gives ~1; the Channel grating gave 6.5.
//   EXCESS — the share of sub-metre energy lying within AXIS_TOL of a world
//            axis, over the share isotropic noise would put there by chance
//            (4*AXIS_TOL/180). Saturates at 3.75, so it is the coarse detector;
//            ANISO carries the dynamic range.
const GATE_ANISO = 2.2, GATE_EXCESS = 1.7;
const ISO_SHARE = (4 * AXIS_TOL) / 180;

const browser = await puppeteer.launch({
  headless: true,
  args: ['--window-size=1600,900', '--enable-gpu'],
  defaultViewport: { width: 1600, height: 900 },
});
const fails = [];
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('404')) pageErrors.push(m.text());
  });

  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.type('#invitename', 'GratingProbe');
  await page.click('#btnguest');
  await page.waitForSelector('#btnnew', { visible: true });
  await page.click('#btnnew');
  await page.waitForSelector('#btnpirate', { visible: true });
  await page.click('#btnpirate');
  await page.waitForFunction('!!window.saltstead', { timeout: 30000 });
  await sleep(4000);
  await page.evaluate(() => document.querySelector('#briefingclose')?.click());

  // ---- install the frozen grazing rig -------------------------------------
  await page.evaluate(async ([camH, wind]) => {
    const S = await import('/src/skymath.js');
    const Wv = await import('/src/waves.js');
    const E = await import('/src/earth.js');
    const g = window.saltstead;
    window.__mod = { S, Wv, E };

    // A LOW SUN, PINNED. The artifact is amplified by grazing specular and by
    // the glare corridor, so measure where it lives: pick the day fraction
    // whose sun stands ~10 deg up with full daylight, and hold it there.
    let best = null;
    for (let i = 0; i < 2000; i++) {
      const frac = i / 2000, s = S.solarState(frac * S.DAY_LENGTH);
      if (s.dayness < 0.75) continue;
      const d = Math.abs(s.sunAlt - 0.18);
      if (!best || d < best.d) best = { d, frac, s };
    }
    window.__solFrac = best.frac;

    g.weatherLock = true;
    g.weatherState = 'clear';
    g.gloom = 0;
    g.applyQuality('fine');
    g.gfxWatch.manual = true;     // the readbacks tank fps; do not let the
                                  // watchdog demote the tier mid-measurement
    g.wind.speed = wind;
    g.wind.from = 2.3;
    for (const k of Object.keys(g)) {
      const v = g[k];
      if (v && v.isObject3D && /ship|hull|boat/i.test(k)) v.visible = false;
    }
    if (g.shipGroup) g.shipGroup.visible = false;

    const blank = new g.coastMap.texture.constructor(
      new Uint16Array([0]), 1, 1, g.coastMap.texture.format, g.coastMap.texture.type);
    blank.needsUpdate = true;
    window.__wakeTex = { live: g.wakemap.rt.texture, blank };
    window.__cfg = {
      az: 0, sparkle: 1, detail: 1, spec: 1, fresnel: 1, wakeBlank: false,
      chop: null, swell: null,
    };
    window.__pin = null;

    // THE FREEZE. Two frames may differ in exactly one uniform and nothing
    // else, which is what makes a pixel difference attributable. The wave
    // clock, the phase accumulators' axes, the sea state and the sun are all
    // forced every frame from constants.
    const FT = 137.0;
    const R = g.renderer;
    const orig = R.render.bind(R);
    R.render = (scene, camera) => {
      const c = window.__cfg;
      if (window.__pin) { g.ship.x = window.__pin.x; g.ship.z = window.__pin.z; }
      g.dayStart = window.__solFrac * S.DAY_LENGTH - g.t;
      Wv.setWaveAxes(0.7, 1.9);
      if (c.chop != null || c.swell != null) {
        g.seaBands.swell = c.swell; g.seaBands.chop = c.chop;
        Wv.setSeaBands(c.swell, c.chop);
        g.ocean.uniforms.uSwellL.value = c.swell;
        g.ocean.uniforms.uSwellS.value = c.chop;
      }
      g.ocean.uniforms.uTime.value = FT;
      Wv.packWaveUniforms(FT, g.ocean.uniforms.uWave.value);
      g.ocean.uniforms.uSparkle.value = window.__sparkle0 * c.sparkle;
      g.ocean.uniforms.uDetailAmp.value = c.detail;
      g.ocean.uniforms.uFresnel.value = window.__fresnel0 * c.fresnel;
      g.ocean.uniforms.uWakeMap.value = c.wakeBlank ? window.__wakeTex.blank : window.__wakeTex.live;
      const m = g.ocean.mesh.material;
      if (c.spec < 0.5) m.specular.setRGB(0, 0, 0); else m.specular.setHex(0x86a8bd);
      if (g.foam) for (const kk of ['wakeMesh', 'fleckMesh'])
        if (g.foam[kk]) g.foam[kk].visible = false;
      if (camera && camera.isPerspectiveCamera) {
        // the owner's view: eye on deck, looking out at a point 60 m off on
        // the water, so the horizon rides high and the water fills the frame
        camera.position.set(g.ship.x, camH, g.ship.z);
        camera.up.set(0, 1, 0);
        camera.lookAt(g.ship.x + Math.sin(c.az) * 60, 0, g.ship.z - Math.cos(c.az) * 60);
        camera.updateMatrixWorld(true);
        camera.updateProjectionMatrix();
      }
      orig(scene, camera);
      if (window.__grab && camera && camera.isPerspectiveCamera && R.getRenderTarget() === null) {
        window.__grab = false;
        const gl = R.getContext();
        const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
        const px = new Uint8Array(W * H * 4);
        gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
        window.__last = {
          W, H, px, t: FT,
          proj: Array.from(camera.projectionMatrix.elements),
          view: Array.from(camera.matrixWorldInverse.elements),
          eye: [camera.position.x, camera.position.y, camera.position.z],
        };
      }
    };
  }, [CAM_H, WIND]);

  // remember the shader's own sparkle / fresnel levels so the levers scale
  // them rather than invent them
  await page.evaluate(() => {
    const g = window.saltstead;
    window.__sparkle0 = g.ocean.uniforms.uSparkle.value || 0.9;
    window.__fresnel0 = g.ocean.uniforms.uFresnel.value || 0.45;
  });

  // ---- the in-page instrument --------------------------------------------
  // Grabs FRAMES frames, unprojects the water into a world-axis-aligned patch
  // and returns the patch itself (Float64 -> plain array) so the node side can
  // difference two configs pixel for pixel. Only 256x256 numbers travel.
  const capture = async (cfg) => {
    await page.evaluate((c) => { Object.assign(window.__cfg, c); }, cfg);
    await sleep(900);
    return page.evaluate(([N, STEP, D, FR]) => new Promise(async (done) => {
      const g = window.saltstead;
      const { Wv } = window.__mod;
      const grab = () => new Promise((ok) => {
        window.__last = null; window.__grab = true;
        const wait = () => (window.__last ? ok(window.__last) : setTimeout(wait, 40));
        wait();
      });
      const patch = new Float64Array(N * N);
      let rows = null, bandRows = null, misses = 0;
      for (let f = 0; f < FR; f++) {
        const { W, H, px, t, proj, view } = await grab();
        const az = window.__cfg.az;
        const dx = Math.sin(az), dz = -Math.cos(az);
        const cx = g.ship.x + dx * D, cz = g.ship.z + dz * D;
        const lum = (sx, sy) => {
          // sy measured from the BOTTOM row, which is readPixels' row 0
          const x0 = Math.floor(sx), y0 = Math.floor(sy);
          if (x0 < 0 || y0 < 0 || x0 >= W - 1 || y0 >= H - 1) return null;
          const tx = sx - x0, ty = sy - y0;
          const at = (X, Y) => {
            const i = (Y * W + X) * 4;
            return 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
          };
          const a = at(x0, y0), b = at(x0 + 1, y0), c2 = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
          return (a + (b - a) * tx) + ((c2 + (d - c2) * tx) - (a + (b - a) * tx)) * ty;
        };
        // rectify: for every world sample take the REAL water height, project
        // it with the frame's own matrices, and read the pixel back
        for (let j = 0; j < N; j++) {
          for (let i = 0; i < N; i++) {
            const wx = cx + (i - N / 2 + 0.5) * STEP;
            const wz = cz + (j - N / 2 + 0.5) * STEP;
            const wy = Wv.waveHeight(wx, wz, t);
            const vx = view[0] * wx + view[4] * wy + view[8] * wz + view[12];
            const vy = view[1] * wx + view[5] * wy + view[9] * wz + view[13];
            const vz = view[2] * wx + view[6] * wy + view[10] * wz + view[14];
            const cxp = proj[0] * vx + proj[4] * vy + proj[8] * vz + proj[12];
            const cyp = proj[1] * vx + proj[5] * vy + proj[9] * vz + proj[13];
            const cwp = proj[3] * vx + proj[7] * vy + proj[11] * vz + proj[15];
            if (cwp <= 1e-6) { misses++; continue; }
            const v = lum((cxp / cwp * 0.5 + 0.5) * W, (cyp / cwp * 0.5 + 0.5) * H);
            if (v === null) { misses++; continue; }
            patch[j * N + i] += v / FR;
          }
        }
        // the screen-space companion: fine banding parallel to the horizon,
        // which is what the eye actually complains about in the far field
        if (!rows) {
          rows = { W, H };
          bandRows = new Float64Array(H);
        }
        for (let y = 0; y < H; y++) {
          let s = 0;
          const xa = (W * 0.36) | 0, xb = (W * 0.64) | 0;
          for (let x = xa; x < xb; x++) {
            const i = ((H - 1 - y) * W + x) * 4; // y from TOP
            s += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
          }
          bandRows[y] += s / (xb - xa) / FR;
        }
      }
      done({
        patch: Array.from(patch), band: Array.from(bandRows),
        W: rows.W, H: rows.H, misses: misses / FR,
        tier: g.gfxQuality, bands: { ...g.seaBands },
        sun: g.ocean.uniforms.uSunDirW.value.toArray().map((v) => +v.toFixed(3)),
      });
    }), [PATCH_N, PATCH_STEP, PATCH_D, FRAMES]);
  };

  // ---- node-side analysis -------------------------------------------------
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
  // high-pass a profile by removing a moving average, then RMS. The window is
  // 15 samples = 0.75 m, so anything longer than a filament is subtracted out.
  const hpRms = (p, win = 15) => {
    let s = 0, n = 0;
    for (let i = 0; i < p.length; i++) {
      let a = 0, c = 0;
      for (let k = -((win - 1) / 2); k <= (win - 1) / 2; k++) {
        const j = i + k;
        if (j < 0 || j >= p.length) continue;
        a += p[j]; c++;
      }
      const d = p[i] - a / c;
      s += d * d; n++;
    }
    return Math.sqrt(s / n);
  };
  // amplitude of world-axis-locked filaments, in luminance counts. Averaging
  // the patch along one world axis suppresses everything that is NOT a line
  // parallel to that axis by sqrt(256) = 16x, so what survives the high-pass
  // IS the filament.
  // ...and the SAME measurement at 45 degrees to the world axes, which is the
  // control. Anything real in the water is equally likely to lie along a
  // diagonal; only an arithmetic artifact knows where east is.
  const axisAmp = (patch, N) => {
    const rowM = new Float64Array(N), colM = new Float64Array(N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      rowM[j] += patch[j * N + i] / N;  // varies with NORTH -> east-west lines
      colM[i] += patch[j * N + i] / N;  // varies with EAST  -> north-south lines
    }
    // diagonal profiles: sum over i+j and over j-i. Successive indices are
    // step/sqrt(2) apart on the ground, so the high-pass window widens to
    // match, and only the central half is used (where the support is deep).
    const sum = new Float64Array(2 * N), cnt = new Float64Array(2 * N);
    const dif = new Float64Array(2 * N), dcn = new Float64Array(2 * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const v = patch[j * N + i];
      sum[i + j] += v; cnt[i + j]++;
      dif[j - i + N] += v; dcn[j - i + N]++;
    }
    const central = (a, c) => {
      const out = [];
      for (let m = (N * 0.5) | 0; m < (N * 1.5) | 0; m++) if (c[m] > N * 0.4) out.push(a[m] / c[m]);
      return out;
    };
    const W = Math.round(15 * Math.SQRT2) | 1;
    return {
      ew: hpRms(rowM), ns: hpRms(colM),
      d1: hpRms(central(sum, cnt), W), d2: hpRms(central(dif, dcn), W),
    };
  };
  const aniso = (a) => Math.max(a.ew, a.ns) / Math.max(1e-6, Math.max(a.d1, a.d2));
  const spectrum = (patch, N, step) => {
    const hann = new Float64Array(N);
    for (let i = 0; i < N; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
    let mean = 0;
    for (let i = 0; i < N * N; i++) mean += patch[i] / (N * N);
    const re = new Float64Array(N * N), im = new Float64Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++)
      re[j * N + i] = (patch[j * N + i] - mean) * hann[i] * hann[j];
    const rr = new Float64Array(N), ri = new Float64Array(N);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) { rr[i] = re[j * N + i]; ri[i] = im[j * N + i]; }
      fft1d(rr, ri);
      for (let i = 0; i < N; i++) { re[j * N + i] = rr[i]; im[j * N + i] = ri[i]; }
    }
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) { rr[j] = re[j * N + i]; ri[j] = im[j * N + i]; }
      fft1d(rr, ri);
      for (let j = 0; j < N; j++) { re[j * N + i] = rr[j]; im[j * N + i] = ri[j]; }
    }
    const L = N * step;
    const cells = [];
    let filEW = 0, filNS = 0, filOff = 0, total = 0;
    for (let kz = 0; kz <= N / 2; kz++) {
      for (let kx = -N / 2 + 1; kx < N / 2; kx++) {
        if (kz === 0 && kx <= 0) continue;
        const kr = Math.hypot(kx, kz);
        const lam = L / kr;
        const ix = (kx + N) % N;
        const p = re[kz * N + ix] ** 2 + im[kz * N + ix] ** 2;
        total += p;
        if (lam < FIL_LO || lam > FIL_HI) continue;
        // the LINE the stripes lie along is perpendicular to (kx, kz);
        // 0 deg = a line running east-west, 90 deg = north-south
        let line = (Math.atan2(kx, -kz) * 180) / Math.PI;
        line = ((line % 180) + 180) % 180;
        const dEW = Math.min(line, 180 - line), dNS = Math.abs(line - 90);
        if (dEW <= AXIS_TOL) filEW += p;
        else if (dNS <= AXIS_TOL) filNS += p;
        else filOff += p;
        cells.push({ p, lam, line });
      }
    }
    cells.sort((a, b) => b.p - a.p);
    return { filEW, filNS, filOff, total, top: cells.slice(0, 5) };
  };

  const report = (label, cap) => {
    const a = axisAmp(cap.patch, PATCH_N);
    const s = spectrum(cap.patch, PATCH_N, PATCH_STEP);
    const fil = s.filEW + s.filNS + s.filOff;
    const an = aniso(a), ex = (fil ? (s.filEW + s.filNS) / fil : 0) / ISO_SHARE;
    console.log(`  ${label.padEnd(22)} filament amp  EW ${a.ew.toFixed(3)}  NS ${a.ns.toFixed(3)}`
      + `  diag ${Math.max(a.d1, a.d2).toFixed(3)}`
      + `   ANISO ${an.toFixed(2)}x   EXCESS ${ex.toFixed(2)}x`);
    for (const c of s.top)
      console.log(`      peak  lambda ${c.lam.toFixed(3)} m   line ${c.line.toFixed(0)} deg from east`
        + `   power ${c.p.toExponential(2)}`);
    return { a, s, an, ex };
  };
  const diffPatch = (A, B) => A.patch.map((v, i) => v - B.patch[i]);
  const bandAmp = (cap) => {
    // rows spanning roughly 28-150 m of water in this rig; the horizon sits
    // near 0.35 H, so take the strip just under it
    const y0 = (cap.H * 0.40) | 0, y1 = (cap.H * 0.62) | 0;
    return hpRms(cap.band.slice(y0, y1), 9);
  };

  console.log(`grating probe  tag=${TAG}  band ${FIL_LO}-${FIL_HI} m  patch ${PATCH_N}x${PATCH_STEP} m `
    + `at ${PATCH_D} m  camera ${CAM_H} m grazing  wind ${WIND} m/s`);

  const summary = [];
  for (const key of WANT) {
    const spot = SPOTS[key];
    if (!spot) { console.log(`unknown spot ${key}`); continue; }
    // move the hull, hold everything else. This IS the decisive experiment.
    await page.evaluate(([lat, lon]) => {
      const g = window.saltstead;
      const w = window.__mod.E.latLonToWorld(lat, lon);
      g.ship.x = w.x; g.ship.z = w.z;
      window.__pin = { x: w.x, z: w.z };
      g.geoClock = 0;
    }, [spot.lat, spot.lon]);
    await sleep(3500); // let the coast map bake and the sea state settle
    // AND ONLY THEN aim the camera. The pinned day fraction takes a frame or
    // two to reach uSunDirW through lightrig, and the first cut of this probe
    // read the sun before that — so the first spot of every run looked at
    // where the sun had been, not at the glare, and its numbers were not
    // comparable with the rest. Read it settled, then aim.
    const sun = await page.evaluate(() => {
      const s = window.saltstead.ocean.uniforms.uSunDirW.value;
      window.__cfg.az = Math.atan2(s.x, -s.z);
      return [+s.x.toFixed(3), +s.y.toFixed(3), +s.z.toFixed(3)];
    });
    await sleep(500);

    // the owner's water: an ordinary 10 m/s day. Forced, not eased.
    const SEA = { chop: 1.05, swell: 1.30 };
    console.log(`\n=== ${spot.name} ===  sun dir ${sun.join(', ')}  looking at the glare`);
    const base = await capture({ ...SEA, sparkle: 1, detail: 1, spec: 1, fresnel: 1, wakeBlank: false });
    console.log(`  tier ${base.tier}  swell ${base.bands.swell.toFixed(2)} chop ${base.bands.chop.toFixed(2)}`
      + `  rectify misses ${base.misses.toFixed(0)}/${PATCH_N * PATCH_N}`
      + `  horizon-parallel fine banding ${bandAmp(base).toFixed(3)}`);
    const r = report('full player view', base);

    // ---- pixel diffs: one uniform at a time, everything else identical ----
    const levers = [
      ['- sparkle pass', { sparkle: 0 }],
      ['- detail normals', { detail: 0 }],
      ['- wake map', { wakeBlank: true }],
      ['- specular', { spec: 0 }],
      ['- fresnel', { fresnel: 0 }],
    ];
    for (const [name, cfg] of levers) {
      const alt = await capture({ ...SEA, sparkle: 1, detail: 1, spec: 1, fresnel: 1, wakeBlank: false, ...cfg });
      const d = diffPatch(base, alt);
      const da = axisAmp(d, PATCH_N);
      const ds = spectrum(d, PATCH_N, PATCH_STEP);
      const dfil = ds.filEW + ds.filNS + ds.filOff;
      const rms = Math.sqrt(d.reduce((s2, v) => s2 + v * v, 0) / d.length);
      console.log(`    diff ${name.padEnd(18)} rms ${rms.toFixed(2)}`
        + `  its own filaments  EW ${da.ew.toFixed(3)}  NS ${da.ns.toFixed(3)}`
        + `  ANISO ${aniso(da).toFixed(2)}x`
        + `  EXCESS ${((dfil ? (ds.filEW + ds.filNS) / dfil : 0) / ISO_SHARE).toFixed(2)}x`
        + (ds.top[0] ? `  peak ${ds.top[0].lam.toFixed(3)} m @ ${ds.top[0].line.toFixed(0)} deg` : ''));
      // restore the baseline config before the next lever
      await page.evaluate(() => Object.assign(window.__cfg,
        { sparkle: 1, detail: 1, spec: 1, fresnel: 1, wakeBlank: false }));
    }

    await page.screenshot({ path: `${OUT}/grating-${TAG}-${key}.png` });
    summary.push({
      key, name: spot.name, ew: r.a.ew, ns: r.a.ns, diag: Math.max(r.a.d1, r.a.d2),
      an: r.an, ex: r.ex, band: bandAmp(base),
    });
    if (r.an > GATE_ANISO)
      fails.push(`${spot.name}: sub-metre structure is ${r.an.toFixed(2)}x stronger along a world`
        + ` axis than along a diagonal (ceiling ${GATE_ANISO})`);
    if (r.ex > GATE_EXCESS)
      fails.push(`${spot.name}: ${r.ex.toFixed(2)}x as much sub-metre energy on the world axes as`
        + ` isotropic noise would put there (ceiling ${GATE_EXCESS})`);
  }

  console.log('\n== verdict ==');
  for (const s of summary)
    console.log(`  ${s.name.padEnd(34)} EW ${s.ew.toFixed(3)} NS ${s.ns.toFixed(3)} diag ${s.diag.toFixed(3)}`
      + `  ANISO ${s.an.toFixed(2)}x (max ${GATE_ANISO})  EXCESS ${s.ex.toFixed(2)}x (max ${GATE_EXCESS})`
      + `  far-field banding ${s.band.toFixed(3)}`
      + `  ${s.an > GATE_ANISO || s.ex > GATE_EXCESS ? 'FAIL' : 'ok'}`);
  if (pageErrors.length) console.log('\npage errors:', pageErrors.slice(0, 5));
} finally {
  await browser.close();
}
if (fails.length) {
  console.log('\nGRATING GATE FAILED:');
  for (const f of fails) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('\ngrating gate green.');
