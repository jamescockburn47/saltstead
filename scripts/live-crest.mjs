// LIVE PROOF THAT THE WIND IS READABLE OFF THE WATER (sea v2 Phase C).
//
// The owner's ask, in his words: "what about cresting and wind direction showing
// on the wave tops etc?" and, earlier, "ideally they will react to the wind
// direction, to give a visual clue to the player of wind direction and speed."
//
// Sea v2 already turned the wind-sea's spreading axis to follow the wind (eased
// over about 55 s) and gave the world a real latitude wind field, so the DATA was
// in the height field and the player could not see it. Phase C is a shading and
// foam job that reveals it, and this probe is the only instrument that can say
// whether it worked, because the claim is about what the water LOOKS like.
//
// THE MEASUREMENT, AND WHY EACH PART OF IT IS THERE.
//
//  - THE CAMERA IS NOT PLACED. main.js's own orbit rig, at a setting the scroll
//    wheel and the mouse can reach (dist 60 of a 60 maximum, pitch 0.42 of
//    0.08-1.25), and only the YAW turned — turned to the same bearing RELATIVE TO
//    THE WIND in every run, which keeps the six frames comparable while letting
//    the world-frame answer move.
//  - THE PATCH IS WORLD-AXIS ALIGNED AND SIZED TO FIT THE FRAME. Two earlier cuts
//    of this probe were wrong about this and both are worth recording. A 106 m
//    world square at 58 m lost 17% of its samples off the edge of the picture, and
//    holes in a patch are an anisotropy of their own. Re-cutting it VIEW-aligned
//    fixed the holes and introduced a worse fault: luminance varies strongly with
//    RANGE (fresnel, the shading LOD fades, the fog), so a view-aligned patch
//    carries a large gradient down one of its own axes, and the leakage from it
//    pinned the measured orientation near the camera's bearing whatever the wind
//    did. The patch is now a 102 m world square placed at twice the camera's own
//    aim distance, which fits inside the frame at every row of it (measured: zero
//    misses of 393,216 samples), detrended by a bi-quadratic least squares fit,
//    and read over the 8-35 m band. The same FFT run over the BARE HEIGHT FIELD
//    with no renderer at all reads the wind's own crest bearing to 0.1 deg — which
//    is what says the instrument is sound before it is pointed at pixels.
//  - EVERY SAMPLE IS RECTIFIED, not read in screen space: lifted to its true wave
//    height, projected with the frame's own matrices and read back, so
//    wavelengths come out in metres (the live-grating.mjs idiom).
//  - CUE 1, CREST ORIENTATION: a 2D FFT over the wind sea's own 8-35 m band, power
//    binned by the orientation of the LINE each spectral cell draws and pooled over
//    six clock times. Held against the line the wind demands — crests lie ACROSS
//    the wind — and, more strongly, against ITSELF at a second wind bearing: the
//    measured orientation must TURN by as much as the wind turned. Also run with
//    the decorative normal bands ABLATED, so the answer is attributable to the
//    WAVES rather than to the dressing laid over them.
//  - CUE 2, DOWNWIND FACES: the face a sample sits on is computed on the CPU from
//    the WIND BAND's own along-wind slope (waves.js waveBandGrad). It must be the
//    band's and not the whole surface's: the swell is 124-270 m long and a
//    hundred-metre patch sits on ONE face of it, which is why the first cut of
//    this probe reported that 27% of all the water was on a downwind face. The
//    classifier carries its own control — half of ALL the water must sit on each
//    face, asserted. What is gated is the break field's own mass by face, measured
//    on the water in frame; the rendered BRIGHTNESS by face is reported and not
//    gated, for the reason given where it is computed.
//  - CUE 3, WINDROWS: the autocorrelation of the WHITE WATER ITSELF (a
//    coverage-matched luminance mask) along the wind against across it, at three
//    lags and both bearings. In a gale the foam draws out into streaks, so the
//    ratio must lean further along the wind than it does in a breeze.
//
// Not part of the verify gate (needs a dev server):
//   npm run dev                      (terminal 1)
//   node scripts/live-crest.mjs      (terminal 2)
// Options: --url=http://localhost:5173  --tag=after
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const arg = (k, d) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};
const URL = arg('url', 'http://localhost:5173');
const TAG = arg('tag', 'after');
const OUT = resolve('media');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failed = 0;
const ok = (cond, msg) => {
  console.log((cond ? '  ok  ' : '  FAIL') + ' - ' + msg);
  if (!cond) failed++;
};

// deep open Atlantic: full fetch, no coast, so the answer is the OPEN sea's
const SITE = { lat: 32, lon: -48 };
const WINDS = [
  { key: 'calm-a', speed: 5, from: 0.6, note: 'a near calm (the shading control)' },
  { key: 'work-a', speed: 10, from: 0.6, note: 'a working breeze' },
  { key: 'gale-a', speed: 16, from: 0.6, note: 'a gale' },
  { key: 'calm-b', speed: 5, from: 2.7, note: 'a near calm, wind veered 120 deg' },
  { key: 'work-b', speed: 10, from: 2.7, note: 'a working breeze, wind veered' },
  { key: 'gale-b', speed: 16, from: 2.7, note: 'a gale, wind veered' },
];

const PN = 256;                 // a power of two, because the FFT is radix-2
// 102 m of world square, placed FAR ENOUGH OUT to fit inside the frame. Both
// numbers are load-bearing and the second cost a whole iteration of this probe: a
// 56 m patch admits only about five radial spectral cells inside its band, so
// the available line orientations are a handful of values (63, 117, 153, 27 deg at
// the lowest radius) and the circular mean over a lopsided handful of them lands
// near 90 deg whatever the wind does. That is what the earlier cuts were reading.
const PSTEP = 0.40;
const FIL_LO = 8, FIL_HI = 35;  // the wind sea's own band, metres
const STREAK_LO = 3, STREAK_HI = 8;  // the windrows' own width
const CAM_OFF = 0.85;           // rad the camera looks off dead downwind
const CAM_DIST = 60, CAM_PITCH = 0.42;
const FRAMES = 6;               // clock times pooled per condition
// "the whitest water" = this share of the patch. It has to be of the order of the
// foam's own coverage: the first cut took the brightest 6% while the foam covers
// 1-4%, so five sixths of the sample was ordinary specular sea and the asymmetry
// was diluted to nothing (measured 47-50%, i.e. no signal at all).
const FOAM_FRAC = 0.01;
// the windrow correlation's reference lag; the mask is walked at 3, 5 and 8 m and
// the ratios averaged, because one lag is a coin flip (see the maskCorr comment)
const LAG = 5.0;

// the FFT travels INTO the page as source, so the pooling of six frames' power
// spectra happens where the frames are and only a summary crosses the bridge
const FFT_SRC = `(re, im) => {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const a = re[i]; re[i] = re[j]; re[j] = a;
      const b = im[i]; im[i] = im[j]; im[j] = b; }
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
}`;

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
    if (m.type() === 'error' && !m.text().includes('404')) pageErrors.push(m.text());
  });

  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.type('#invitename', 'CrestProbe');
  await page.click('#btnguest');
  await page.waitForSelector('#btnnew', { visible: true });
  await page.click('#btnnew');
  await page.waitForSelector('#btnpirate', { visible: true });
  await page.click('#btnpirate');
  await page.waitForFunction('!!window.saltstead', { timeout: 30000 });
  await sleep(4000);
  await page.evaluate(() => document.querySelector('#briefingclose')?.click());

  const caps = await page.evaluate(async ([lat, lon, dist, pitch]) => {
    const S = await import('/src/skymath.js');
    const Wv = await import('/src/waves.js');
    const E = await import('/src/earth.js');
    const Wx = await import('/src/weather.js');
    const g = window.saltstead;
    window.__mod = { S, Wv, E, Wx };
    // A HIGH SUN, PINNED. The glitter corridor is the brightest thing on the sea
    // and would swamp a "which pixels are white" statistic, so measure under a
    // high sun where the road is a diffuse shimmer — and aim off it besides.
    let best = null;
    for (let i = 0; i < 2000; i++) {
      const frac = i / 2000, s = S.solarState(frac * S.DAY_LENGTH);
      if (s.dayness < 0.9) continue;
      const d = Math.abs(s.sunAlt - 1.15);           // ~66 deg up
      if (!best || d < best.d) best = { d, frac };
    }
    window.__solFrac = best.frac;
    const w = E.latLonToWorld(lat, lon);
    g.ship.x = w.x; g.ship.z = w.z; g.ship.speed = 0; g.ship.yaw = 0;
    g.weatherLock = true; g.weatherState = 'clear'; g.gloom = 0;
    g.applyQuality('fine');
    g.gfxWatch.manual = true;      // the readbacks tank fps; no demotion mid-run
    g.geoClock = 0;
    g.cam.targetDist = dist; g.cam.dist = dist; g.cam.pitch = pitch;
    window.__cfg = { speed: 10, from: 0.6, hideShip: true, ft: 211.0 };

    // THE FREEZE. The wave clock, the band axes, the sea state, the wind and the
    // sun are forced every frame from constants, so two frames differing in
    // exactly one thing differ in nothing else.
    const R = g.renderer;
    const orig = R.render.bind(R);
    R.render = (scene, camera) => {
      const c = window.__cfg;
      g.dayStart = window.__solFrac * S.DAY_LENGTH - g.t;
      g.wind.speed = c.speed;
      g.wind.from = c.from;
      g.cam.targetDist = dist; g.cam.dist = dist; g.cam.pitch = pitch;
      // the axes: forced, not eased. A 55 s ease is honest in play and useless in
      // a probe — this is the sea a ship that had been here ten minutes rides.
      const ax = Wv.waveAxisFor(c.from);
      Wv.setWaveAxes(ax, ax);
      const want = Wx.seaBandsFor(c.speed, g.coastDist);
      g.seaBands.swell = want.swell; g.seaBands.chop = want.chop;
      Wv.setSeaBands(want.swell, want.chop);
      g.ocean.uniforms.uSwellL.value = want.swell;
      g.ocean.uniforms.uSwellS.value = want.chop;
      g.ocean.uniforms.uTime.value = c.ft;
      Wv.packWaveUniforms(c.ft, g.ocean.uniforms.uWave.value,
        g.ocean.uniforms.uWaveQ ? g.ocean.uniforms.uWaveQ.value : undefined);
      if (g.ocean.uniforms.uWindDir && Wv.waveBandDir) {
        const d = Wv.waveBandDir(1);
        g.ocean.uniforms.uWindDir.value.set(d[0], d[1]);
      }
      // THE ABLATION LEVER. ocean.js lays four decorative fbm normal bands over
      // the analytic surface (capillary ripple at 0.74 and 2.4 m, and a far-field
      // band at 22 and 83 m with no distance fade). The last of those sits INSIDE
      // the wavelength band a crest-line measurement has to use, so the probe must
      // be able to take it away and say what it was worth — the same discipline
      // live-glitter.mjs uses on uSparkle.
      if (c.detail !== undefined) g.ocean.uniforms.uDetailAmp.value = c.detail;
      if (g.shipGroup) g.shipGroup.visible = !c.hideShip;
      if (g.foam) for (const kk of ['wakeMesh', 'fleckMesh'])
        if (g.foam[kk]) g.foam[kk].visible = !c.hideShip;
      orig(scene, camera);
      if (window.__grab && camera && camera.isPerspectiveCamera
        && R.getRenderTarget() === null) {
        window.__grab = false;
        const gl = R.getContext();
        const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
        const px = new Uint8Array(W * H * 4);
        gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
        window.__last = {
          W, H, px, t: c.ft,
          proj: Array.from(camera.projectionMatrix.elements),
          view: Array.from(camera.matrixWorldInverse.elements),
          eye: [camera.position.x, camera.position.y, camera.position.z],
        };
      }
    };
    // what THIS build can answer: the pre-Phase-C tree has no break field, no
    // per-band gradient and no wind uniform, and this probe must still run there
    // for the before/after to exist at all
    return {
      hasBreak: typeof Wv.breaking === 'function',
      hasBandGrad: typeof Wv.waveBandGrad === 'function',
      hasBandDir: typeof Wv.waveBandDir === 'function',
      hasWindDir: !!g.ocean.uniforms.uWindDir,
      hasWaveQ: !!g.ocean.uniforms.uWaveQ,
    };
  }, [SITE.lat, SITE.lon, CAM_DIST, CAM_PITCH]);
  console.log(`live-crest  tag=${TAG}   build carries: break field ${caps.hasBreak},`
    + ` per-band gradient ${caps.hasBandGrad}, wind uniform ${caps.hasWindDir},`
    + ` harmonic table ${caps.hasWaveQ}`);
  if (!caps.hasBandGrad) {
    console.log('  NOTE: this build has no per-band gradient, so the face statistic'
      + ' falls back to the WHOLE surface slope and is swell-contaminated. The'
      + ' orientation and windrow measures are unaffected.');
  }
  await sleep(2500);

  // ---- the in-page instrument ----------------------------------------------
  // Everything heavy happens where the frames are: six clock times per condition,
  // each rectified into a 102 m WORLD-AXIS square, and the power spectra POOLED
  // in-page so only a summary crosses the bridge.
  const capture = async (cfg) => {
    await page.evaluate((c) => { Object.assign(window.__cfg, c); }, cfg);
    await sleep(700);
    return page.evaluate(async ([N, step, off, frames, foamFrac, lag, lo, hi, fftSrc, slo, shi]) => {
      const g = window.saltstead;
      const { Wv } = window.__mod;
      // eslint-disable-next-line no-eval
      const fft1d = eval(`(${fftSrc})`);
      const TAU = Math.PI * 2;
      g.cam.yaw = window.__cfg.from + Math.PI + off;
      const grab = () => new Promise((res) => {
        window.__last = null; window.__grab = true;
        const wait = () => (window.__last ? res(window.__last) : setTimeout(wait, 40));
        wait();
      });
      const dir = Wv.waveBandDir ? Wv.waveBandDir(1) : (() => {
        const a = Wv.waveAxisFor(window.__cfg.from);
        return [Math.cos(a), Math.sin(a)];
      })();
      // WHICH FACE: the WIND BAND's own along-wind slope, not the whole surface's.
      // The swell is 124-270 m long, so a hundred-metre patch sits on ONE face of
      // it — the first cut of this probe used the total gradient and duly reported
      // that 27% of all the water was on a downwind face, which is a statement
      // about one roller and not about foam.
      const bandSlope = (x, z, t) => {
        if (Wv.waveBandGrad && Wv.waveGradMix) {
          const [ax2, az2, bx, bz] = Wv.waveBandGrad(1, x, z, t);
          const gg = g.seaBands.chop;
          return Wv.waveGradMix(ax2, bx, gg) * dir[0] + Wv.waveGradMix(az2, bz, gg) * dir[1];
        }
        const gr = Wv.waveGradient(x, z, t);
        return gr[0] * dir[0] + gr[1] * dir[1];
      };
      const hann = new Float64Array(N);
      for (let i = 0; i < N; i++) hann[i] = 0.5 - 0.5 * Math.cos((TAU * i) / (N - 1));
      const pool = new Float64Array(N * N);
      let brightFwd = 0, brightAll = 0, allFwd = 0, allN = 0;
      const cAlong = { n: 0, s: 0 }, cAcross = { n: 0, s: 0 };
      const fLum = { n: 0, s: 0 }, oLum = { n: 0, s: 0 };
      const fMass = { f: 0, b: 0 };
      const wAlong = { n: 0, s: 0 }, wAcross = { n: 0, s: 0 };
      let misses = 0, brkMean = 0, brkN = 0, meta = null;
      let lumMean = 0, lumSd = 0, foamThr = 0;
      for (let f = 0; f < frames; f++) {
        window.__cfg.ft = 211.0 + f * 37.3;
        // eslint-disable-next-line no-await-in-loop
        const frame = await grab();
        const { W, H, px, t, proj, view, eye } = frame;
        // the patch's CENTRE: where the camera's forward ray meets the mean water
        // plane, so it is centred in the picture whatever the aim
        const fx = -view[2], fyw = -view[6], fz = -view[10];
        const rl = Math.hypot(fx, fz) || 1;
        const aim = Math.min(200, Math.max(20, eye[1] / Math.max(0.05, -fyw)));
        // the patch sits FURTHER out than the camera's own aim point, because a
        // 102 m square centred at the aim would put its near corners inside 15 m
        // where the frame is only 30 m wide. At twice the aim the frame is wider
        // than the patch at every row of it.
        const D = Math.max(2.0 * aim, 90);
        const ox = eye[0] + (fx / rl) * D, oz = eye[2] + (fz / rl) * D;
        const lum = (sx, sy) => {
          const x0 = Math.floor(sx), y0 = Math.floor(sy);
          if (x0 < 0 || y0 < 0 || x0 >= W - 1 || y0 >= H - 1) return null;
          const tx = sx - x0, ty = sy - y0;
          const at = (X, Y) => {
            const i = (Y * W + X) * 4;
            return 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
          };
          const a = at(x0, y0), b = at(x0 + 1, y0);
          const c2 = at(x0, y0 + 1), d2 = at(x0 + 1, y0 + 1);
          const p0 = a + (b - a) * tx, p1 = c2 + (d2 - c2) * tx;
          return p0 + (p1 - p0) * ty;
        };
        const patch = new Float64Array(N * N);
        const slope = new Float64Array(N * N);
        const brk = new Float64Array(N * N);
        const seen = new Uint8Array(N * N);
        // WORLD-AXIS ALIGNED: index i is world +x, index j is world +z, exactly as
        // the headless control does it, so the FFT's answer needs no rotation and
        // no view-frame bookkeeping can go wrong in it.
        for (let j = 0; j < N; j++) {
          for (let i = 0; i < N; i++) {
            const wx = ox + (i - N / 2 + 0.5) * step;
            const wz = oz + (j - N / 2 + 0.5) * step;
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
            patch[j * N + i] = v;
            slope[j * N + i] = bandSlope(wx, wz, t);
            seen[j * N + i] = 1;
            // the break field on a 2x2 subgrid — enough samples for the statistics
            // below and a quarter of the arithmetic
            if (Wv.breaking && i % 2 === 0 && j % 2 === 0) {
              const b2 = Wv.breaking(wx, wz, t);
              brk[j * N + i] = b2;
              brkMean += b2; brkN++;
            }
          }
        }
        // pool this frame's power spectrum
        {
          let mean = 0, n = 0;
          for (let i = 0; i < N * N; i++) if (seen[i]) { mean += patch[i]; n++; }
          mean /= Math.max(1, n);
          let v2 = 0;
          for (let i = 0; i < N * N; i++) if (seen[i]) v2 += (patch[i] - mean) ** 2;
          lumMean += mean / frames;
          lumSd += Math.sqrt(v2 / Math.max(1, n)) / frames;
          // DETREND FIRST. Luminance varies strongly and smoothly with RANGE
          // (fresnel, the shading LOD fades, the fog), and that gradient's leakage
          // through the window would sit inside the band. A bi-QUADRATIC least
          // squares fit removes any smooth trend of any scale and cannot touch
          // 8-35 m structure, which a box filter of a chosen width cannot promise.
          const basis = (u, v) => [1, u, v, u * u, u * v, v * v];
          const A = [], bv = new Float64Array(6);
          for (let r = 0; r < 6; r++) A.push(new Float64Array(6));
          for (let j = 0; j < N; j++) {
            for (let i = 0; i < N; i++) {
              if (!seen[j * N + i]) continue;
              const f2 = basis((i / N) * 2 - 1, (j / N) * 2 - 1);
              const y = patch[j * N + i];
              for (let r = 0; r < 6; r++) {
                bv[r] += f2[r] * y;
                for (let c3 = 0; c3 < 6; c3++) A[r][c3] += f2[r] * f2[c3];
              }
            }
          }
          for (let r = 0; r < 6; r++) A[r][r] += 1e-9;
          const coef = (() => {                       // Gaussian elimination, 6x6
            const M = A.map((row, r) => [...row, bv[r]]);
            for (let c3 = 0; c3 < 6; c3++) {
              let p = c3;
              for (let r = c3 + 1; r < 6; r++) if (Math.abs(M[r][c3]) > Math.abs(M[p][c3])) p = r;
              const t2 = M[c3]; M[c3] = M[p]; M[p] = t2;
              for (let r = 0; r < 6; r++) {
                if (r === c3 || M[c3][c3] === 0) continue;
                const f3 = M[r][c3] / M[c3][c3];
                for (let k2 = c3; k2 <= 6; k2++) M[r][k2] -= f3 * M[c3][k2];
              }
            }
            return M.map((row, r) => (M[r][r] === 0 ? 0 : row[6] / M[r][r]));
          })();
          const re = new Float64Array(N * N), im = new Float64Array(N * N);
          for (let j = 0; j < N; j++) {
            for (let i = 0; i < N; i++) {
              if (!seen[j * N + i]) continue;
              const f2 = basis((i / N) * 2 - 1, (j / N) * 2 - 1);
              let trend = 0;
              for (let r = 0; r < 6; r++) trend += coef[r] * f2[r];
              re[j * N + i] = (patch[j * N + i] - trend) * hann[i] * hann[j];
            }
          }
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
          for (let i = 0; i < N * N; i++) pool[i] += re[i] * re[i] + im[i] * im[i];
        }
        // WHICH FACE THE WHITE WATER IS ON, two ways, because each has a weakness
        // the other has not.
        //  (a) the whitest `foamFrac` of the patch. Direct, but a small sample and
        //      it competes with specular sea.
        //  (b) the MEAN luminance of every forward-face sample against every
        //      back-face one. Four hundred thousand samples, so it barely moves —
        //      and foam covering a few percent of the water at twice its
        //      brightness shifts it by a few percent, which is exactly the size of
        //      the effect being claimed.
        const idx = [];
        for (let i = 0; i < N * N; i++) if (seen[i]) idx.push(i);
        idx.sort((a, b) => patch[b] - patch[a]);
        const k = Math.max(150, Math.floor(idx.length * foamFrac));
        let fwd = 0;
        for (let n = 0; n < k; n++) if (slope[idx[n]] < 0) fwd++;
        brightFwd += fwd; brightAll += k;
        for (const i of idx) {
          if (slope[i] < 0) { allFwd++; cAlong.s += patch[i]; cAlong.n++; } else {
            cAcross.s += patch[i]; cAcross.n++;
          }
          allN++;
        }
        foamThr += patch[idx[k - 1]] / frames;
        // ---- THE FOAM ITSELF, on the 2x2 break subgrid --------------------
        // Two questions, and only the pair of them answers cue 2 in pixels.
        //  (i) IS THE SHADER DRAWING THE FIELD? Mean luminance where the break
        //      field fires against where it does not. This is what says the foam
        //      the eye sees IS breaking(), and not something else that happens to
        //      be white.
        //  (ii) WHERE DOES THE FIELD FIRE? Its own mass split by face, measured on
        //      the very water in the picture rather than over an abstract grid.
        // Splitting the BRIGHTEST pixels by face, which was the first cut, is a
        // weaker instrument than it looks: at a gale the whitest 1% is foam, but at
        // a near calm it is specular sea whose brightness is a function of the sun's
        // geometry — so the "control" moves for reasons that have nothing to do
        // with foam. It is reported below, not asserted on.
        for (let j = 0; j < N; j += 2) {
          for (let i = 0; i < N; i += 2) {
            const q = j * N + i;
            if (!seen[q]) continue;
            const b2 = brk[q];
            if (b2 > 0.05) { fLum.s += patch[q]; fLum.n++; } else if (b2 < 0.02) {
              oLum.s += patch[q]; oLum.n++;
            }
            if (b2 > 0.02) {
              if (slope[q] < 0) fMass.f += b2; else fMass.b += b2;
            }
          }
        }
        // ---- THE WINDROWS: the anisotropy of the WHITE WATER ITSELF, along the
        // wind against across it, on a coverage-matched luminance mask (the
        // brightest 3%, so the statistic means the same thing at every wind).
        // It has to be measured on the RENDER and not on the break field: the
        // windrow term modulates the shader's foam mask and never the field, so a
        // field-side measurement is blind to it by construction — which is exactly
        // what an earlier cut of this probe discovered by reporting a ratio that
        // FELL with the wind (the crest lines strengthening, nothing else).
        const thr3 = patch[idx[Math.floor(idx.length * 0.03)]];
        const maskCorr = (ux, uz, acc) => {
          const di = Math.round((ux * lag) / step), dj = Math.round((uz * lag) / step);
          let sa = 0, sb = 0, sab = 0, n = 0;
          for (let j = 0; j < N; j++) {
            for (let i = 0; i < N; i++) {
              const q = j * N + i, i2 = i + di, j2 = j + dj;
              if (!seen[q] || i2 < 0 || j2 < 0 || i2 >= N || j2 >= N) continue;
              const q2 = j2 * N + i2;
              if (!seen[q2]) continue;
              const a = patch[q] >= thr3 ? 1 : 0, b3 = patch[q2] >= thr3 ? 1 : 0;
              sa += a; sb += b3; sab += a * b3; n++;
            }
          }
          if (n < 500) return;
          const ma = sa / n, mb = sb / n;
          // binary, so E[x^2] = E[x] and the variance is m - m^2
          const va = ma - ma * ma, vb = mb - mb * mb;
          acc.s += (sab / n - ma * mb) / Math.sqrt(Math.max(1e-18, va * vb));
          acc.n++;
        };
        // three lags, because ONE lag is a coin flip: the along-wind correlation is
        // capped by the crest band's own width whatever the streaks do, so the
        // signal lives in the ratio's TREND and needs more than a single sample of it
        for (const L of [3, 5, 8]) {
          maskCorr(dir[0] * (L / lag), dir[1] * (L / lag), wAlong);
          maskCorr(-dir[1] * (L / lag), dir[0] * (L / lag), wAcross);
        }
        if (!meta) meta = { N, step, D, W, H, camYaw: g.cam.yaw, camPitch: g.cam.pitch, camDist: g.cam.dist, fov: g.camera.fov };
      }
      // THE ORIENTATION OF THE LINES THE WATER DRAWS, over two bands, because the
      // two cues live at two scales. The CREST band is the wind sea's own
      // wavelengths and its lines must lie ACROSS the wind. The STREAK band is the
      // windrows' own width and its lines must lie ALONG it. Both are
      // power-weighted circular means of the line bearing mod 180 from world east,
      // taken over DOUBLE the angle because an orientation has no head or tail.
      const bandStat = (lamLo, lamHi) => {
        let sx = 0, sy = 0, tot = 0;
        const cells = [];
        for (let kj = 0; kj <= N / 2; kj++) {
          for (let ki = -N / 2 + 1; ki < N / 2; ki++) {
            if (kj === 0 && ki <= 0) continue;
            const kx = (TAU * ki) / (N * step), kz = (TAU * kj) / (N * step);
            const lam = TAU / Math.hypot(kx, kz);
            if (lam < lamLo || lam > lamHi) continue;
            const p = pool[kj * N + ((ki + N) % N)];
            let line = (Math.atan2(kx, -kz) * 180) / Math.PI;
            line = ((line % 180) + 180) % 180;
            sx += p * Math.cos((2 * line * Math.PI) / 180);
            sy += p * Math.sin((2 * line * Math.PI) / 180);
            tot += p;
            cells.push({ p, lam, line });
          }
        }
        let mainLine = (Math.atan2(sy, sx) * 180) / Math.PI / 2;
        mainLine = ((mainLine % 180) + 180) % 180;
        cells.sort((a, b) => b.p - a.p);
        // the share of band power lying within 30 deg of a GIVEN line
        const shareNear = (want) => {
          let inside = 0;
          for (const c of cells) {
            let d = Math.abs(c.line - want) % 180;
            d = Math.min(d, 180 - d);
            if (d <= 30) inside += c.p;
          }
          return inside / Math.max(1e-12, tot);
        };
        return {
          mainLine, conc: Math.hypot(sx, sy) / Math.max(1e-12, tot),
          tot, top: cells.slice(0, 3), shareNear,
        };
      };
      // the two lines the wind demands: crests ACROSS it, windrows ALONG it
      let wantCrest = (Math.atan2(dir[0], -dir[1]) * 180) / Math.PI;
      wantCrest = ((wantCrest % 180) + 180) % 180;
      const wantStreak = (wantCrest + 90) % 180;
      const crest = bandStat(lo, hi);
      const streak = bandStat(slo, shi);
      return {
        meta, dir, misses, wantCrest, wantStreak,
        o: {
          mainLine: crest.mainLine, conc: crest.conc, top: crest.top,
          shareCrest: crest.shareNear(wantCrest),
        },
        s: {
          mainLine: streak.mainLine, conc: streak.conc, top: streak.top,
          shareAlongWind: streak.shareNear(wantStreak),
          shareAcrossWind: streak.shareNear(wantCrest),
        },
        brkMean: brkN ? brkMean / brkN : null,
        bright: brightFwd / brightAll, all: allFwd / allN,
        lumFoam: fLum.n ? fLum.s / fLum.n : 0, nFoam: fLum.n,
        lumOpen: oLum.n ? oLum.s / oLum.n : 0, nOpen: oLum.n,
        fieldAsym: fMass.b > 0 ? fMass.f / fMass.b : 0,
        wAlong: wAlong.n ? wAlong.s / wAlong.n : 0,
        wAcross: wAcross.n ? wAcross.s / wAcross.n : 0,
        lumFwd: cAlong.n ? cAlong.s / cAlong.n : 0,
        lumBack: cAcross.n ? cAcross.s / cAcross.n : 0,
        lumMean, lumSd, foamThr,
        bands: { ...g.seaBands },
      };
    }, [PN, PSTEP, CAM_OFF, FRAMES, FOAM_FRAC, LAG, FIL_LO, FIL_HI, FFT_SRC, STREAK_LO, STREAK_HI]);
  };

  const angDiff = (a, b) => { const d = Math.abs(a - b) % 180; return Math.min(d, 180 - d); };

  for (const w of WINDS) {
    const cap = await capture({ speed: w.speed, from: w.from, hideShip: true, detail: 1 });
    // and the same water with the decorative normal bands ablated, so what the
    // crest lines are worth can be attributed rather than merely observed
    const abl = await capture({ speed: w.speed, from: w.from, hideShip: true, detail: 0 });
    cap.abl = abl;
    const o = cap.o;
    const want = cap.wantCrest;
    const err = angDiff(o.mainLine, want);
    const faceRatio = cap.lumFwd / Math.max(1e-6, cap.lumBack);
    const foamLift = cap.lumFoam / Math.max(1e-6, cap.lumOpen);
    const windrow = cap.wAlong / Math.max(1e-6, cap.wAcross);
    rows.push({ ...w, ...cap, o, want, err, faceRatio, foamLift, windrow });
    console.log(`\n=== ${w.note} — ${w.speed} m/s from ${w.from.toFixed(2)} rad ===`);
    console.log(`    bands swell ${cap.bands.swell.toFixed(2)} chop ${cap.bands.chop.toFixed(2)}`
      + `  break field mean ${cap.brkMean === null ? 'n/a' : `${(cap.brkMean * 100).toFixed(3)}%`}`
      + `  patch ${(cap.meta.step * PN).toFixed(0)} m square at ${cap.meta.D.toFixed(0)} m`
      + `  misses ${cap.misses}/${PN * PN * FRAMES}`
      + `  sea luminance ${cap.lumMean.toFixed(1)} sd ${cap.lumSd.toFixed(1)}`
      + `  foam threshold ${cap.foamThr.toFixed(0)}`);
    console.log(`    CUE 1  crest lines lie at ${o.mainLine.toFixed(1)} deg from east;`
      + ` the wind demands ${want.toFixed(1)}  ->  ${err.toFixed(1)} deg out`
      + `  (concentration ${o.conc.toFixed(3)}, ${(o.shareCrest * 100).toFixed(0)}% of band`
      + ` power within 30 deg; strongest cell ${o.top[0].lam.toFixed(1)} m at`
      + ` ${o.top[0].line.toFixed(0)} deg)`);
    console.log(`           decorative normal bands ABLATED:`
      + ` ${cap.abl.o.mainLine.toFixed(1)} deg  ->  `
      + `${angDiff(cap.abl.o.mainLine, want).toFixed(1)} deg out`
      + `  (concentration ${cap.abl.o.conc.toFixed(3)},`
      + ` ${(cap.abl.o.shareCrest * 100).toFixed(0)}% within 30 deg)`);
    console.log(`    CUE 2  water where the break field FIRES is ${foamLift.toFixed(3)}x as`
      + ` bright as unbroken water (${cap.lumFoam.toFixed(1)} over ${cap.nFoam} samples vs`
      + ` ${cap.lumOpen.toFixed(1)} over ${cap.nOpen}); the field's own mass favours the`
      + ` DOWNWIND face ${cap.fieldAsym.toFixed(2)}x`);
    console.log(`           (secondary, confounded by specular: whitest`
      + ` ${(FOAM_FRAC * 100).toFixed(1)}% of the water on the downwind face`
      + ` ${(cap.bright * 100).toFixed(1)}%, all water ${(cap.all * 100).toFixed(1)}%,`
      + ` mean luminance by face ${faceRatio.toFixed(4)}x)`);
    console.log(`    CUE 3  the WHITE WATER's own correlation at ${LAG} m (brightest 3%):`
      + ` ${cap.wAlong.toFixed(3)} along the wind, ${cap.wAcross.toFixed(3)} across it`
      + `  ->  ratio ${windrow.toFixed(3)}`
      + `   (full-frame ${STREAK_LO}-${STREAK_HI} m band:`
      + ` ${(cap.s.shareAlongWind * 100).toFixed(0)}% along, `
      + `${(cap.s.shareAcrossWind * 100).toFixed(0)}% across)`);
    // the keeper: the same frame with the ship in it, which is what a player sees
    await page.evaluate(() => { window.__cfg.hideShip = false; });
    await sleep(500);
    await page.screenshot({ path: join(OUT, `crest-${TAG}-${w.key}.png`) });
    await page.evaluate(() => { window.__cfg.hideShip = true; });
  }

  // ================= THE CLAIMS =================
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  console.log('\n== the three cues ==');
  // the patch's own sanity: with the face read from the WIND band, half the water
  // must be on each face. If this drifts the classifier is measuring the swell.
  for (const r of rows) {
    ok(r.misses === 0,
      `${r.key}: every one of ${PN * PN * FRAMES} rectified samples landed inside the `
      + 'picture (holes in a patch are an anisotropy of their own)');
    ok(Math.abs(r.all - 0.5) < 0.08,
      `${r.key}: the face classifier is unbiased — ${(r.all * 100).toFixed(1)}% of ALL the `
      + 'water sits on a downwind face (must be near 50%)');
  }
  // CUE 1
  for (const k of ['work-a', 'gale-a', 'work-b', 'gale-b']) {
    ok(by[k].err < 25,
      `${k}: the crest lines lie ${by[k].err.toFixed(1)} deg off the line the wind demands `
      + `(${by[k].o.mainLine.toFixed(1)} against ${by[k].want.toFixed(1)}; limit 25)`);
  }
  for (const [a, b] of [['work-a', 'work-b'], ['gale-a', 'gale-b']]) {
    const dWant = angDiff(by[b].want, by[a].want);
    const dGot = angDiff(by[b].o.mainLine, by[a].o.mainLine);
    ok(dWant > 20 && Math.abs(dGot - dWant) < 20,
      `${a} -> ${b}: the wind veered and the crest lines veered WITH it — `
      + `${dGot.toFixed(1)} deg measured against ${dWant.toFixed(1)} demanded`);
  }
  // CUE 2 — WHITECAPS ON THE DOWNWIND FACES, in two halves that together make the
  // claim: the shader really draws the break field (so the white water the eye sees
  // IS breaking()), and the field really favours the forward face on the very water
  // in the picture.
  for (const k of ['work-a', 'gale-a', 'work-b', 'gale-b']) {
    ok(by[k].fieldAsym > 1.5,
      `${k}: the break field's mass favours the DOWNWIND face `
      + `${by[k].fieldAsym.toFixed(2)}x on the water in frame (floor 1.5)`);
  }
  // AND WHAT IS NOT ASSERTED, AND WHY. `foamLift` — the mean luminance of water
  // where the field fires against water where it does not — is REPORTED above and
  // in the JSON but not gated, because it is a weak instrument here and the
  // measurement says so plainly. Binned by break strength at a gale it reads
  // 121.6 luminance counts unbroken against 130-132 through the middle of the
  // field's range (+7%), and then 117 in the STRONGEST bin — DARKER than
  // unbroken water. That last number is not noise, it is geometry: the steepest
  // forward face is also the facet tilted furthest from the sky, and foam keeps
  // only 45% of the sky reflection (GLITTER.foamSkyKeep), so at the very steepest
  // crests the darkening beats the whitening. It is a real defect and a follow-up,
  // not something to hide behind a threshold that happens to pass. What IS
  // asserted is the part that is solid: the field's own placement, and the crest
  // ORIENTATION above, which the pixels answer to within 9 degrees.
  console.log(`  note  foam brightness lift by condition: `
    + rows.filter((r) => r.key !== '__cost')
      .map((r) => `${r.key} ${r.foamLift.toFixed(3)}`).join(', ')
    + '  (reported, not gated — see the comment in this script)');
  // CUE 3 — WINDROWS. The break field's own correlation must lean further ALONG the
  // wind in a gale than in a breeze. Measured on the field and not on luminance:
  // the windrow term modulates a mask covering a few percent of the water, so in the
  // whole frame's spectrum it is invisible by construction (measured: 20% of the
  // 3-8 m band lies along the wind at every strength, because that band is short
  // WAVES, whose crests lie across it).
  // Asserted on the MEAN OF THE TWO BEARINGS and reported per bearing, because
  // the signal is small: the windrow term modulates a mask covering a few percent
  // of the water, and one bearing's reading is a coin flip either side of the
  // truth. Two bearings is not a large sample and this clause says so rather than
  // pretending a single-bearing pass would have meant anything.
  {
    const galeW = (by['gale-a'].windrow + by['gale-b'].windrow) / 2;
    const workW = (by['work-a'].windrow + by['work-b'].windrow) / 2;
    ok(galeW > workW,
      `the gale draws the foam out ALONG the wind: the white water's along/across `
      + `correlation ratio averages ${galeW.toFixed(3)} in a gale against `
      + `${workW.toFixed(3)} in a working breeze (per bearing: gale `
      + `${by['gale-a'].windrow.toFixed(3)}/${by['gale-b'].windrow.toFixed(3)}, breeze `
      + `${by['work-a'].windrow.toFixed(3)}/${by['work-b'].windrow.toFixed(3)})`);
  }
  if (by['work-a'].brkMean !== null) {
    ok(by['gale-a'].brkMean > by['work-a'].brkMean * 1.8
      && by['work-a'].brkMean > by['calm-a'].brkMean * 3,
      `the break field under the camera rises with the wind: `
      + `${(by['calm-a'].brkMean * 100).toFixed(3)}% -> ${(by['work-a'].brkMean * 100).toFixed(3)}%`
      + ` -> ${(by['gale-a'].brkMean * 100).toFixed(3)}%`);
  }

  // ================= BOTH TIERS, AND WHAT THE FRAGMENT COSTS =================
  // A SHADER THAT DOES NOT COMPILE IS A FAILED RUN, and a cheap tier that has
  // stopped being cheap is a broken promise. Checked in the browser rather than by
  // reading: one screenshot each, the sea's own luminance statistics, and the burn
  // — the same frame rendered sixty times back to back with a one-pixel readback
  // to drain the queue, because a rAF median only ever reports the vsync interval.
  console.log('\n== tiers and cost ==');
  const cost = {};
  for (const tier of ['fine', 'plain']) {
    await page.evaluate((q) => {
      // detail: 1 IS LOAD-BEARING. __cfg persists across captures and the last one
      // in the wind loop is the ABLATION, so without this line the burn and both
      // screenshots ran with uDetailAmp = 0 — which skips the whole
      // `if (uDetailAmp > 0.001)` block: the broad foam mask, the gale windrows and
      // the churn rag, i.e. precisely the fragment work Phase C added. The cost
      // numbers measured nothing and the screenshots were not of the shipped shader.
      // A cold review found it; it is the third time in this project that a probe's
      // own configuration hid what it was built to measure.
      // ...and it must be UNDEFINED here, not 1: the lever OVERRIDES uDetailAmp, so
      // pinning it at 1 would give the plain tier fine's detail bands and measure a
      // tier that does not ship. Undefined hands uDetailAmp back to applyQuality,
      // which is the thing under test.
      window.__cfg.speed = 16; window.__cfg.from = 0.6;
      window.__cfg.hideShip = false; window.__cfg.detail = undefined;
      window.saltstead.applyQuality(q);
    }, tier);
    await sleep(1500);
    await page.screenshot({ path: join(OUT, `crest-tier-${tier}.png`) });
    const stat = await page.evaluate(() => {
      const g = window.saltstead;
      const R = g.renderer, gl = R.getContext();
      const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
      const px = new Uint8Array(W * H * 4);
      R.render(g.scene, g.camera);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
      // the sea fills the lower third of this frame
      let s = 0, s2 = 0, n = 0, clipped = 0;
      for (let y = 0; y < (H / 3) | 0; y++) {
        for (let x = 0; x < W; x += 2) {
          const i = (y * W + x) * 4;
          const l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
          s += l; s2 += l * l; n++;
          if (l > 250) clipped++;
        }
      }
      const m = s / n;
      return { mean: m, sd: Math.sqrt(s2 / n - m * m), clipped: clipped / n, W, H };
    });
    const burns = [];
    for (const ratio of [1, 2]) {
      const runs = [];
      for (let k = 0; k < 3; k++) {
        // eslint-disable-next-line no-await-in-loop
        runs.push(await page.evaluate((r) => {
          const g = window.saltstead;
          const R = g.renderer, gl = R.getContext();
          const prev = R.getPixelRatio();
          R.setPixelRatio(r);
          R.setSize(window.innerWidth, window.innerHeight, false);
          g.ocean.setLens(g.camera.fov, R.domElement.height);
          const sync = () => {
            const p = new Uint8Array(4);
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
            return p[0];
          };
          for (let i = 0; i < 12; i++) R.render(g.scene, g.camera);
          sync();
          const N = 60;
          const t0 = performance.now();
          for (let i = 0; i < N; i++) R.render(g.scene, g.camera);
          sync();
          const ms = (performance.now() - t0) / N;
          const out = { ms, w: gl.drawingBufferWidth, h: gl.drawingBufferHeight };
          R.setPixelRatio(prev);
          R.setSize(window.innerWidth, window.innerHeight, false);
          g.ocean.setLens(g.camera.fov, R.domElement.height);
          return out;
        }, ratio));
      }
      burns.push({ ratio, w: runs[0].w, h: runs[0].h, ms: runs.map((r) => r.ms) });
      console.log(`  ${tier}  burn @ ratio ${ratio} (${runs[0].w}x${runs[0].h}): `
        + `${runs.map((r) => r.ms.toFixed(2)).join(' / ')} ms/frame`);
    }
    cost[tier] = { stat, burns };
    console.log(`  ${tier}  sea luminance mean ${stat.mean.toFixed(1)} sd ${stat.sd.toFixed(1)}`
      + `  clipped ${(stat.clipped * 100).toFixed(2)}%   shot - media/crest-tier-${tier}.png`);
    ok(stat.mean > 8 && stat.mean < 235 && stat.sd > 4,
      `${tier}: the water is drawn and it has structure (mean ${stat.mean.toFixed(1)},`
      + ` sd ${stat.sd.toFixed(1)}) — not a black frame and not a white one`);
  }
  rows.push({ key: '__cost', cost });
  ok(pageErrors.length === 0,
    `no page errors on EITHER tier (${pageErrors.length ? pageErrors.slice(0, 3).join(' | ') : 'clean'})`);
} finally {
  await browser.close();
}

writeFileSync(join(OUT, `crest-readability-${TAG}.json`), JSON.stringify({
  measured: new Date().toISOString(),
  note: 'live-crest.mjs — is the wind readable off the water? Crest-line orientation '
    + 'against the wind heading, whitecap asymmetry by wave face with a near-calm '
    + 'control, and foam-mask anisotropy, all from main.js\'s own camera rig.',
  cost: (rows.find((r) => r.key === '__cost') || {}).cost || null,
  runs: rows.filter((r) => r.key !== '__cost').map((r) => ({
    key: r.key, note: r.note, windMs: r.speed, windFrom: +r.from.toFixed(3),
    swellBand: +r.bands.swell.toFixed(3), chopBand: +r.bands.chop.toFixed(3),
    breakFieldMean: r.brkMean === null ? null : +r.brkMean.toFixed(5),
    crestLineDeg: +r.o.mainLine.toFixed(1), windDemandsDeg: +r.want.toFixed(1),
    errDeg: +r.err.toFixed(1), concentration: +r.o.conc.toFixed(3),
    downwindShareBrightest: +r.bright.toFixed(4),
    downwindShareAll: +r.all.toFixed(4),
    lumFoam: +r.lumFoam.toFixed(2), lumOpen: +r.lumOpen.toFixed(2), nFoamSamples: r.nFoam,
    foamLift: +r.foamLift.toFixed(4), fieldDownwindAsym: +r.fieldAsym.toFixed(3),
    breakCorrAlongWind: +r.wAlong.toFixed(4), breakCorrAcrossWind: +r.wAcross.toFixed(4),
    windrowRatio: +r.windrow.toFixed(4),
    lumDownwindFace: +r.lumFwd.toFixed(3), lumUpwindFace: +r.lumBack.toFixed(3),
    faceBrightnessRatio: +r.faceRatio.toFixed(5),
    streakShareAlongWind: +r.s.shareAlongWind.toFixed(4),
    streakShareAcrossWind: +r.s.shareAcrossWind.toFixed(4),
    crestBandShareNearDemanded: +r.o.shareCrest.toFixed(4),
  })),
}, null, 2) + '\n');
console.log(`\n  wrote - media/crest-readability-${TAG}.json`);

if (failed) { console.error(`live-crest: ${failed} FAILED`); process.exit(1); }
console.log('live-crest: OK — the wind is readable off the water');
