// verify-waves: THE PARITY GATE (DESIGN.md risk 3, sea v2 gate axis 1).
//
// The sea the eye sees must be the sea the hull feels. In sea v1 that was
// proved by generating one monolithic GLSL expression from the wave table and
// compiling it as JS. v2's spectrum is 28 components — far too much maths to
// inline three times over — so the components travel as a UNIFORM ARRAY and
// the shader loops. The promise is unchanged and is now held by THREE
// independent locks, all below:
//
//   1. THE ARITHMETIC IS ONE STRING. waves.js exports GLSL_WAVE_TERM /
//      GLSL_WAVE_COS, the exact text the shader compiles; this gate compiles
//      that same text as JS. Nobody can edit one side.
//   2. THE DATA IS ONE ARRAY. packWaveUniforms() writes the very Float32Array
//      handed to the GPU; this gate reads that array, at float32 precision,
//      and holds it against the float64 CPU evaluator.
//   3. THE PARTITION IS STRUCTURAL. The emitted loop bounds must equal
//      NSWELL / NMID / NWAVE, so no component can be double-lit or lost, and
//      the emitted block must contain the shared term strings verbatim.
//
// The honest limit of lock 2: it proves the FORMULA and the INPUTS agree. It
// cannot prove the GPU's own float32 rounding, which no headless check can —
// live-spectrum.mjs looks at the pixels for that.
//
// Beyond parity this gate holds the two things v1 got structurally wrong:
// ORIGIN INVARIANCE (the local-frame phase must make an origin snap a
// non-event) and the ANTI-GRATING CONTRACT (a sparse coherent set beats into
// a grid; a dense incoherent one reads as sea).
import {
  COMPONENTS, NWAVE, NSWELL, NMID, SWELL_LEN, GRAD_BANDS, SPECTRUM,
  waveHeight, waveGradient, waveBandHeight, MAX_WAVE_HEIGHT,
  MAX_SWELL_HEIGHT, MAX_CHOP_HEIGHT, significantHeight, meanWavelength,
  setSeaBands, getSeaBands, SEA_SWELL_MAX, SEA_STATE_MAX, RIVER_STATE,
  SEA_STATE_MIN, setWaveAxes, getWaveAxes, setWaveOrigin, getWaveOrigin,
  easeWaveAxes, waveAxisFor, AXIS_EASE, packWaveUniforms,
  glslWaves, glslWaveBounds, GLSL_WAVE_TERM, GLSL_WAVE_COS,
  SHORE_WAVES, SHORE_RANGE, SHORE_CALM, MAX_SHORE_HEIGHT, SHORE_SHADE,
  shoreOpenAtten, shoreEnv, shoreHeight, shoreGradMag, setShoreSampler,
  glslShoreAttenExpr, glslShoreEnvExpr, glslShoreSumExpr, glslShoreGradExpr, glslShore,
} from '../src/waves.js';
import { readFileSync } from 'node:fs';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// deterministic sample points (LCG — no Math.random in the gate)
let seed = 12345;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const TAU = Math.PI * 2;

// ============================ LOCK 1 + 2: PARITY ============================
// Compile the SHADER'S OWN term strings as JS. `w` is one component's vec4,
// `lp` the local position (lp.y is the z coordinate, as in GLSL).
const termJS = new Function('w', 'lp', `const sin = Math.sin; return ${GLSL_WAVE_TERM};`);
const cosJS = new Function('w', 'lp', `const cos = Math.cos; return ${GLSL_WAVE_COS};`);
const wOf = (u, i) => ({ x: u[i * 4], y: u[i * 4 + 1], z: u[i * 4 + 2], w: u[i * 4 + 3] });
const gpuSum = (u, lo, hi, lp) => {
  let s = 0;
  for (let i = lo; i < hi; i++) s += termJS(wOf(u, i), lp);
  return s;
};
const gpuGrad = (u, lo, hi, lp) => {
  let gx = 0, gz = 0;
  for (let i = lo; i < hi; i++) {
    const w = wOf(u, i), c = cosJS(w, lp);
    gx += w.x * c; gz += w.y * c;
  }
  return [gx, gz];
};

const block = glslWaves();
ok(block.includes(`uniform vec4 uWave[${NWAVE}];`), 'the spectrum is declared as a uniform array');
ok(block.includes(GLSL_WAVE_TERM), 'the emitted block carries the shared height term verbatim');
ok(block.includes(GLSL_WAVE_COS), 'the emitted block carries the shared gradient term verbatim');
ok(!block.includes('NaN') && !block.includes('undefined'), 'the emitted block is well-formed');
for (const fn of ['oWaveSwell', 'oWaveWind', 'oWaveWindLod',
  'oWaveGradLong', 'oWaveGradMid', 'oWaveGradShort']) {
  ok(block.includes(`${fn}(vec2 lp)`), `${fn} is emitted`);
}
// LOCK 3: the loop bounds ARE the component partition, and they are literally
// in the emitted text (so a hand-edit of the block cannot pass)
{
  const B = glslWaveBounds();
  ok(B.swell[0] === 0 && B.swell[1] === NSWELL, 'the swell loop is [0, NSWELL)');
  ok(B.wind[0] === NSWELL && B.wind[1] === NWAVE, 'the wind-sea loop is [NSWELL, NWAVE)');
  ok(B.long[0] === 0 && B.long[1] === NSWELL, 'the LOD long band IS the swell population');
  ok(B.mid[0] === NSWELL && B.mid[1] === NMID && B.short[0] === NMID && B.short[1] === NWAVE,
    'the LOD mid/short bands partition the wind-sea with no gap and no overlap');
  ok(GRAD_BANDS.long === SWELL_LEN, 'GRAD_BANDS.long === SWELL_LEN (one boundary, not two)');
  for (const [lo, hi] of [B.swell, B.wind, B.mid, B.short]) {
    ok(block.includes(`for (int i = ${lo}; i < ${hi}; i++)`),
      `the emitted text carries the [${lo}, ${hi}) loop`);
  }
  // and the index ranges really do select the wavelengths they claim to
  for (let i = 0; i < NWAVE; i++) {
    const c = COMPONENTS[i];
    ok((i < NSWELL) === (c.len >= SWELL_LEN), `component ${i} (λ ${c.len.toFixed(1)}) is in its band`);
    ok((i < NMID) === (c.len >= GRAD_BANDS.mid), `component ${i} is in its LOD band`);
    if (i > 0) ok(c.len < COMPONENTS[i - 1].len, `the spectrum is monotone descending at ${i}`);
  }
}

// The parity sweep, run WHERE THE BUG LIVED: at 40+ km of world coordinate and
// at a NON-ZERO axis rotation (a check that only ever proves the windless case
// at the origin is the check that let 1d38aca through).
const FAR = [[0, 0], [0, -22000], [40000, -22000], [-38000, 40000], [120000, 90000]];
let worst = 0, worstG = 0, worstFD = 0, worstBand = 0, worstLod = 0;
for (const [ox, oz] of FAR) {
  for (const [ax, aw] of [[0, 0], [0.7, 2.4], [-1.9, 0.35]]) {
    setWaveOrigin(ox, oz);
    setWaveAxes(ax, aw);
    for (let i = 0; i < 60; i++) {
      const t = rnd() * 7200;
      const u = packWaveUniforms(t);
      // the shader only ever sees LOCAL coordinates — the mesh is 720 m across
      const lx = (rnd() - 0.5) * 720, lz = (rnd() - 0.5) * 720;
      const lp = { x: lx, y: lz };
      const x = ox + lx, z = oz + lz;
      setSeaBands(1, 1);
      const cpu = waveHeight(x, z, t);
      const gpu = gpuSum(u, 0, NSWELL, lp) + gpuSum(u, NSWELL, NWAVE, lp);
      worst = Math.max(worst, Math.abs(cpu - gpu));
      ok(Math.abs(cpu) <= MAX_WAVE_HEIGHT + 1e-9, `height within MAX at sample ${i}`);
      // the LOD twin must equal the full wind sum when the lever is up
      worstLod = Math.max(worstLod, Math.abs(
        gpuSum(u, NSWELL, NMID, lp) + gpuSum(u, NMID, NWAVE, lp) - gpuSum(u, NSWELL, NWAVE, lp)));
      // per-band parity under SPLIT states — what the shader actually does
      setSeaBands(1.7, 0.6);
      const bandCpu = waveHeight(x, z, t);
      const bandGpu = 1.7 * gpuSum(u, 0, NSWELL, lp) + 0.6 * gpuSum(u, NSWELL, NWAVE, lp);
      worstBand = Math.max(worstBand, Math.abs(bandCpu - bandGpu));
      // the gradient: analytic CPU vs the emitted term vs a finite difference
      const [gx, gz] = waveGradient(x, z, t);
      const [lx1, lz1] = gpuGrad(u, 0, NSWELL, lp);
      const [mx, mz] = gpuGrad(u, NSWELL, NMID, lp);
      const [sx2, sz2] = gpuGrad(u, NMID, NWAVE, lp);
      worstG = Math.max(worstG,
        Math.abs(gx - (1.7 * lx1 + 0.6 * (mx + sx2))),
        Math.abs(gz - (1.7 * lz1 + 0.6 * (mz + sz2))));
      const e = 0.01;
      const fx = (waveHeight(x + e, z, t) - waveHeight(x - e, z, t)) / (2 * e);
      const fz = (waveHeight(x, z + e, t) - waveHeight(x, z - e, t)) / (2 * e);
      worstFD = Math.max(worstFD, Math.abs(gx - fx), Math.abs(gz - fz));
      setSeaBands(1, 1);
    }
  }
}
ok(worst < 2e-3, `CPU/GPU height parity, 40+ km and turned (worst drift ${worst.toExponential(2)})`);
ok(worstBand < 2e-3, `two-band CPU/GPU parity (worst ${worstBand.toExponential(2)})`);
ok(worstLod < 1e-12, `the fragment's LOD twin equals the full wind sum (worst ${worstLod.toExponential(2)})`);
ok(worstG < 2e-3, `gradient CPU/GPU parity (worst ${worstG.toExponential(2)})`);
ok(worstFD < 2e-3, `gradient matches finite-differenced height (worst ${worstFD.toExponential(2)})`);
// the band halves the shader scales separately must sum to the whole
{
  setWaveOrigin(40000, -22000);
  setWaveAxes(0.4, 1.1);
  setSeaBands(1, 1);
  let wSplit = 0;
  for (let i = 0; i < 200; i++) {
    const x = 40000 + (rnd() - 0.5) * 700, z = -22000 + (rnd() - 0.5) * 700, t = rnd() * 3600;
    wSplit = Math.max(wSplit, Math.abs(
      waveBandHeight(0, x, z, t) + waveBandHeight(1, x, z, t) - waveHeight(x, z, t)));
  }
  ok(wSplit < 1e-12, `the two band sums partition the sea exactly (${wSplit.toExponential(2)})`);
}

// ==================== FAULT 1: THE LOCAL FRAME ====================
// v1's phase was k·p in ABSOLUTE world metres. v2's is k·(p - origin) plus a
// per-component accumulator, and the ONE promise that buys is this: moving the
// origin must change NOTHING about the water. If it does, the ocean mesh's
// 4 m snap puts a step under the hull thirty times a second.
{
  setWaveAxes(0.83, -2.1);
  setWaveOrigin(0, 0);
  const pts = [];
  for (let i = 0; i < 300; i++) {
    pts.push([(rnd() - 0.5) * 240000, (rnd() - 0.5) * 240000, rnd() * 7200]);
  }
  const before = pts.map(([x, z, t]) => waveHeight(x, z, t));
  const beforeG = pts.map(([x, z, t]) => waveGradient(x, z, t));
  let worstO = 0, worstOG = 0;
  // every snap the game can make: the 4 m mesh step, a coast-map jump, and
  // the warden's writ teleporting the ship to the other side of the earth
  for (const [ox, oz] of [[4, 0], [0, -4], [-8, 12], [40000, -22000],
    [-120000, 95000], [0, 0], [1e6, -1e6]]) {
    setWaveOrigin(ox, oz);
    pts.forEach(([x, z, t], i) => {
      worstO = Math.max(worstO, Math.abs(waveHeight(x, z, t) - before[i]));
      const [gx, gz] = waveGradient(x, z, t);
      worstOG = Math.max(worstOG, Math.abs(gx - beforeG[i][0]), Math.abs(gz - beforeG[i][1]));
    });
  }
  ok(worstO < 1e-6, `an origin snap is a NON-EVENT for the water (worst ${worstO.toExponential(2)} m over 300 points x 7 snaps out to 1000 km)`);
  ok(worstOG < 1e-7, `and for the surface gradient (worst ${worstOG.toExponential(2)})`);
  const o = getWaveOrigin();
  ok(o.x === 1e6 && o.z === -1e6, 'the origin reads back');
}

// A TURN PIVOTS ABOUT THE ORIGIN, WHICH IS UNDER THE HULL. This is the whole
// judder fix stated as a measurement: rotating an axis must leave the height AT
// the origin untouched, and the disturbance must grow with distance FROM the
// origin — not from (0, 0) twenty kilometres away.
{
  setWaveOrigin(40000, -22000);
  setWaveAxes(0.3, 0.9);
  const t = 12.5;
  const at = (r) => waveHeight(40000 + r, -22000, t);
  const h0 = at(0), h5 = at(5), h300 = at(300);
  setWaveAxes(0.3, 0.95);          // turn the wind-sea 50 mrad
  ok(Math.abs(at(0) - h0) < 1e-12,
    `a turn leaves the water AT the origin exactly where it was (${Math.abs(at(0) - h0).toExponential(2)} m)`);
  const d5 = Math.abs(at(5) - h5), d300 = Math.abs(at(300) - h300);
  ok(d5 < d300, `and the disturbance grows with distance from the origin (${d5.toExponential(2)} m at 5 m, ${d300.toExponential(2)} m at 300 m)`);
  ok(d5 < 0.02, `the water under the hull barely notices a 50 mrad turn (${d5.toExponential(2)} m)`);
}

// THE SLEW RATE IS BOUNDED BY CONSTRUCTION. A turn moves the phase under the
// hull at k·r·(dθ/dt). With the origin following the ship, r is the hull's own
// half-length; the assertion is that no component's phase can ever be slewed
// faster than a useful fraction of the speed it runs at anyway. v1's number
// here, at r = 22 km, was over 800x.
{
  const R = 15;   // the galleon's half-length — the furthest hull sample point
  let worstRatio = 0, worstLam = 0;
  for (const c of COMPONENTS) {
    const rate = c.band === 0 ? AXIS_EASE.swellRate : AXIS_EASE.windRate;
    const ratio = (c.k * R * rate) / c.omega;
    if (ratio > worstRatio) { worstRatio = ratio; worstLam = c.len; }
  }
  ok(worstRatio < 0.5,
    `a full wind reversal slews the worst component's phase at ${(worstRatio * 100).toFixed(0)}% `
    + `of its own frequency (λ ${worstLam.toFixed(1)} m; limit 50%)`);
  ok(AXIS_EASE.windRate > 0 && AXIS_EASE.swellRate > 0 && AXIS_EASE.swellRate < AXIS_EASE.windRate,
    'the swell turns more slowly than the wind-sea (a shift leaves a crossed sea)');
}

// ==================== FAULT 3: THE SEA ANSWERS THE WIND ====================
{
  setWaveAxes(0, 0);
  const windFrom = 0.8;                             // the wind blows FROM here
  const target = waveAxisFor(windFrom);
  // a wind-driven sea RUNS DOWNWIND: the axis must point away from the eye
  const toward = { x: -Math.sin(windFrom), z: -Math.cos(windFrom) };
  ok(Math.abs(Math.cos(target) - toward.x) < 1e-12
    && Math.abs(Math.sin(target) - toward.z) < 1e-12, 'the wave axis runs downwind');
  // A SETTLED SEA, THEN A 40° SHIFT — the case the design describes. The
  // wind-sea must cover most of it in a minute; the swell must barely move, so
  // for the next several minutes the ship sails a genuinely CROSSED sea; and
  // given an hour the rollers come round too. The absolute numbers here are the
  // AXIS_EASE time constants stated as behaviour.
  const from0 = 0.8, shift = 40 * Math.PI / 180;
  setWaveAxes(waveAxisFor(from0), waveAxisFor(from0));
  const tgt = waveAxisFor(from0 + shift);
  const err = (a) => Math.abs(Math.atan2(Math.sin(tgt - a), Math.cos(tgt - a)));
  for (let i = 0; i < 60 * 30; i++) easeWaveAxes(from0 + shift, 1 / 30);
  const a1 = getWaveAxes();
  const doneW = 1 - err(a1.wind) / shift, doneS = 1 - err(a1.swell) / shift;
  ok(doneW > 0.55,
    `a minute after a 40° shift the wind-sea has covered ${(doneW * 100).toFixed(0)}% of it (floor 55%)`);
  ok(doneS < 0.15,
    `and the swell only ${(doneS * 100).toFixed(0)}% (ceiling 15%) — the ocean's memory`);
  const crossed = Math.abs(Math.atan2(Math.sin(a1.wind - a1.swell), Math.cos(a1.wind - a1.swell)));
  ok(crossed > 15 * Math.PI / 180,
    `so she sails a CROSSED SEA: ${(crossed * 57.3).toFixed(0)}° between the rollers and the chop`);
  for (let i = 0; i < 3600 * 30; i++) easeWaveAxes(from0 + shift, 1 / 30);
  const a2 = getWaveAxes();
  ok(err(a2.wind) < 1e-3 && err(a2.swell) < 2 * Math.PI / 180,
    `given an hour even the rollers come round (swell ${(err(a2.swell) * 57.3).toFixed(2)}° out)`);
  // and the easing is RATE-CAPPED, which is what keeps the hull safe: the
  // hardest possible shift (a 180° reversal) may not exceed the cap
  setWaveAxes(0, 0);
  let peak = 0, prev = 0;
  for (let i = 0; i < 300 * 30; i++) {
    easeWaveAxes(Math.PI + 0.8, 1 / 30);
    const now = getWaveAxes().wind;
    if (i > 0) peak = Math.max(peak, Math.abs(Math.atan2(Math.sin(now - prev), Math.cos(now - prev))) * 30);
    prev = now;
  }
  ok(peak <= AXIS_EASE.windRate + 1e-9,
    `a 180° wind reversal never turns the sea faster than the cap (${peak.toFixed(4)} vs ${AXIS_EASE.windRate} rad/s)`);
  setWaveAxes(0, 0);
}

// ============ FAULT 2: THE ANTI-GRATING CONTRACT ============
// v1's narrow east-west stripes were a second-order BEAT between two of seven
// coherent trains: the 11 m and 17 m trains' difference wave-vector had a
// ~7.4 m period pointing near-north, and the sea's nonlinear shading (foam
// thresholds, fresnel) drew it as if it were a third wave train. Ablation
// convicted the table itself: stripe power 17100 -> 65 with the waves zeroed
// and every effect layer still live. Seven trains give 21 beats — few enough
// for one to dominate. A spectrum gives hundreds, none of them dominant.
// This gate holds the MODEL headlessly; live-spectrum.mjs holds the pixels.
{
  setSeaBands(1, 1);
  setWaveAxes(0.4, 1.1);
  const beats = [];
  for (let i = 0; i < NWAVE; i++) {
    for (let j = i + 1; j < NWAVE; j++) {
      const a = COMPONENTS[i], b = COMPONENTS[j];
      const tha = a.off + (a.band === 0 ? 0.4 : 1.1), thb = b.off + (b.band === 0 ? 0.4 : 1.1);
      const dx = a.k * Math.cos(tha) - b.k * Math.cos(thb);
      const dz = a.k * Math.sin(tha) - b.k * Math.sin(thb);
      const mag = Math.hypot(dx, dz);
      if (mag < 1e-12) continue;
      // the beat's own energy is the product of the two amplitudes; its
      // "band line" is the orientation of its stripes, mod 180°
      beats.push({
        lam: TAU / mag, e: a.amp * b.amp,
        ang: ((Math.atan2(dz, dx) + Math.PI / 2) % Math.PI + Math.PI) % Math.PI,
      });
    }
  }
  ok(beats.length === (NWAVE * (NWAVE - 1)) / 2, 'every pair produces a beat');
  // the eye's danger band: stripes of 2-12 m are what got reported
  const danger = beats.filter((b) => b.lam >= 2 && b.lam <= 12);
  const tot = danger.reduce((s, b) => s + b.e, 0);
  ok(danger.length >= 40,
    `the danger band (2-12 m stripes) is CROWDED, not sparse — ${danger.length} beats (v1 had at most a handful; floor 40)`);
  const strongest = danger.reduce((m, b) => (b.e > m.e ? b : m), { e: 0, lam: 0 });
  ok(strongest.e / tot < 0.06,
    `no single beat dominates the danger band (worst ${(100 * strongest.e / tot).toFixed(2)}% `
    + `at λ ${strongest.lam.toFixed(1)} m; ceiling 6%)`);
  // and no ORIENTATION may carry the band: the reported stripes were east-west,
  // which is one 20° slice of the 180° of possible stripe orientations (11%).
  const BINS = 9;
  const bin = new Float64Array(BINS);
  for (const b of danger) bin[Math.min(BINS - 1, Math.floor((b.ang / Math.PI) * BINS))] += b.e;
  let worstBin = 0, worstAt = 0;
  for (let i = 0; i < BINS; i++) if (bin[i] > worstBin) { worstBin = bin[i]; worstAt = i; }
  ok(worstBin / tot < 0.28,
    `no stripe orientation carries the danger band (worst 20° slice at `
    + `${(worstAt * 20).toFixed(0)}° holds ${(100 * worstBin / tot).toFixed(1)}%; even share 11%, ceiling 28%)`);
  // the crest lines of the sea itself must not rule straight: walk 400 m along
  // the dominant component's own crest and the water must move under you
  const dom = COMPONENTS.reduce((m, c) => (c.amp > m.amp ? c : m), COMPONENTS[0]);
  const th = dom.off + 0.4;
  let lo = Infinity, hi = -Infinity;
  setWaveOrigin(0, 0);
  for (let s = 0; s < 400; s += 2) {
    const h = waveHeight(-Math.sin(th) * s, Math.cos(th) * s, 0);
    lo = Math.min(lo, h); hi = Math.max(hi, h);
  }
  ok(hi - lo > 0.5 * significantHeight(),
    `crest lines knot and vanish instead of ruling to the horizon `
    + `(${(hi - lo).toFixed(2)} m of spread along the dominant crest)`);
  setWaveAxes(0, 0);
}

// ==================== THE SPECTRUM'S SHAPE AND SIZE ====================
// FINDING (C), 2026-07-25: v1's entire sea summed to 0.95 m of amplitude over
// a 63 m longest wave — about 1.5% steepness at the swell cap, which is why
// TRIPLING the swell band changed nothing anybody could see. Real ocean swell
// is 1.5-4 m over 100-250 m. These assertions are the contract that the sea
// stays big; they are the ones that would fail if somebody quietly retuned it
// back down.
{
  ok(NWAVE >= 24 && NWAVE <= 32,
    `the spectrum is dense enough to read as sea and cheap enough to draw (${NWAVE} components; spec says 24-32)`);
  ok(NSWELL >= 6, `the swell band is a spectrum too, not a train (${NSWELL} components)`);
  ok(NWAVE - NSWELL >= 12, `and so is the wind-sea (${NWAVE - NSWELL})`);
  ok(NMID > NSWELL && NMID < NWAVE, 'every shading LOD band carries real sea');
  const hsAll = significantHeight(), hsSw = significantHeight(0), hsWd = significantHeight(1);
  const lamSw = meanWavelength(0), lamWd = meanWavelength(1);
  ok(hsSw > 1.5 && hsSw < 2.4,
    `the REFERENCE sea's rollers stand ${hsSw.toFixed(2)} m (Hs, bands 1,1) — v1's stood 0.98 m. `
    + 'The band is wide on purpose: the PLAYABLE assertion below is the precise one, and this '
    + 'clause only forbids a sea that has quietly shrunk back or run away');
  ok(lamSw >= 100 && lamSw <= 250,
    `over a ${lamSw.toFixed(0)} m mean wavelength (the design's 100-250 m band; v1's was 52 m)`);
  // AND THE PLAYABLE SEA, which is the number the owner sees: an ordinary
  // 10 m/s day in open water is swell band 1.54 (weather.js seaBandsFor)
  ok(hsSw * 1.54 >= 1.5 && hsSw * 1.54 <= 3.0,
    `an ordinary breeze offshore puts ${(hsSw * 1.54).toFixed(2)} m of roller under her `
    + `over ${lamSw.toFixed(0)} m — finding (C)'s 1.5-3 m / 100-250 m target`);
  ok(hsSw * SEA_SWELL_MAX > 3.5, `and a full storm runs ${(hsSw * SEA_SWELL_MAX).toFixed(2)} m`);
  ok(lamWd > 12 && lamWd < 45, `the wind-sea's mean wavelength is a wind-sea's (${lamWd.toFixed(1)} m)`);
  ok(hsWd > 0.4 && hsWd < 0.9,
    `the wind-sea is held near v1's (${hsWd.toFixed(2)} m vs 0.53 m): the DECK feel and the `
    + 'water-over-the-bulwarks problem are driven by the short band, and neither should worsen');
  ok(hsAll > hsSw, 'the whole sea is more than its swell');
  // amplitude ladder: PM rises to its peak and falls away either side
  const peak = COMPONENTS.reduce((m, c) => (c.amp > m.amp ? c : m), COMPONENTS[0]);
  ok(peak.len > 90 && peak.len < 200, `the envelope peaks on a real roller (λ ${peak.len.toFixed(0)} m)`);
  ok(COMPONENTS[0].amp < peak.amp && COMPONENTS[NWAVE - 1].amp < peak.amp * 0.2,
    'the envelope falls away either side of the peak (a Pierson-Moskowitz shape, not a ramp)');
  // no component may be steep enough to be a cliff, and the whole sum's worst
  // possible slope must stay inside a surface a hull can ride
  let sumAk = 0;
  for (const c of COMPONENTS) {
    ok(c.amp * c.k < 0.06, `component λ ${c.len.toFixed(1)} m is not a cliff (ak ${(c.amp * c.k).toFixed(4)})`);
    ok(c.omega > 0 && Math.abs(c.omega - Math.sqrt(9.81 * c.k)) < 1e-9,
      `component λ ${c.len.toFixed(1)} m obeys deep-water dispersion`);
    ok(c.len >= SPECTRUM.windLamMin * 0.9 && c.len <= SPECTRUM.swellLamMax * 1.1,
      `component λ ${c.len.toFixed(1)} m is inside the designed ladder`);
    sumAk += c.amp * c.k;
  }
  ok(sumAk * SEA_SWELL_MAX < 1.2,
    `even at the storm cap the worst coherent slope is under 50° (Σak ${(sumAk * SEA_SWELL_MAX).toFixed(2)})`);
  ok(Math.abs(MAX_SWELL_HEIGHT + MAX_CHOP_HEIGHT - MAX_WAVE_HEIGHT) < 1e-12,
    'the two populations partition the sea\'s height');
  ok(Math.abs(MAX_WAVE_HEIGHT - COMPONENTS.reduce((s, c) => s + c.amp, 0)) < 1e-12,
    'MAX_WAVE_HEIGHT is the amplitude sum');
  // the river must stay a river now that the sea is threefold bigger: it is a
  // FRACTION of the open sea, so the fraction had to come down with the growth
  ok(RIVER_STATE < SEA_STATE_MIN, 'river calm undercuts the wind floor');
  ok(MAX_WAVE_HEIGHT * RIVER_STATE < 0.06,
    `a river's worst ripple is ${(MAX_WAVE_HEIGHT * RIVER_STATE * 100).toFixed(1)} cm (ceiling 6)`);
}

// ==================== DETERMINISM ====================
// Two players on the same water must see the same sea. That is a property of
// the CODE (a fixed seed and an integer-only generator), so it is checked as
// one: the module may not contain Math.random, and the spectrum it builds must
// match a fingerprint taken when it was designed. A deliberate change to the
// spectrum MUST update the fingerprint — that is the point of it.
{
  const src = readFileSync(new URL('../src/waves.js', import.meta.url), 'utf8');
  ok(!/Math\.random\s*\(/.test(src), 'the sea contains no Math.random call');
  ok(!/\bimport\b[^\n]*\bthree\b/.test(src) && !src.includes('document.'),
    'waves.js is pure: no THREE, no DOM');
  // fingerprint: 12 significant digits of a weighted checksum over every
  // component. Any drift in the generator, the ladder or the level moves it.
  let sum = 0;
  for (let i = 0; i < NWAVE; i++) {
    const c = COMPONENTS[i];
    sum += (i + 1) * (c.len + 1e3 * c.amp + 1e2 * c.off + 10 * c.ph0);
  }
  const FINGERPRINT = 53095.298864;
  ok(Math.abs(sum - FINGERPRINT) < 1e-5,
    `the seeded spectrum is the designed one (checksum ${sum.toFixed(6)} vs ${FINGERPRINT}) — `
    + 'if you changed the spectrum on purpose, update FINGERPRINT');
}

// ---- the shore field (calming + shore-parallel waves) ----
// The emitted GLSL expressions must equal their CPU twins: compile each as JS
// (smoothstep/clamp shimmed exactly as GLSL defines them) and sweep sd, t.
const glslEnv = 'const sin = Math.sin, cos = Math.cos;'
  + 'const clamp = (x, a, b) => Math.min(b, Math.max(a, x));'
  + 'const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };';
const gpuAtten = new Function('sd', `${glslEnv} return ${glslShoreAttenExpr()};`);
const gpuEnv = new Function('sd', `${glslEnv} return ${glslShoreEnvExpr()};`);
const gpuShoreSum = new Function('sd', 'uTime', `${glslEnv} return ${glslShoreSumExpr()};`);
const gpuShoreGrad = new Function('sd', 'uTime', `${glslEnv} return ${glslShoreGradExpr()};`);
let worstS = 0;
for (let i = 0; i < 500; i++) {
  const sd = (rnd() - 0.55) * 2000, t = rnd() * 3600;
  worstS = Math.max(worstS,
    Math.abs(gpuAtten(sd) - shoreOpenAtten(sd)),
    Math.abs(gpuEnv(sd) * gpuShoreSum(sd, t) - shoreHeight(sd, t)),
    Math.abs(gpuEnv(sd) * gpuShoreGrad(sd, t) - shoreGradMag(sd, t)));
}
ok(worstS < 2e-3, `shore field CPU/GPU parity (worst ${worstS.toExponential(2)})`);
ok(glslShore().includes('oShoreAtten') && glslShore().includes('oShoreSum'),
  'shore GLSL block well-formed');

// the shore field's shape: blue water untouched, the beach calm, the
// breaker band carrying the shore-parallel set
ok(Math.abs(shoreOpenAtten(-5000) - 1) < 1e-9, 'blue water: open waves at full strength');
ok(Math.abs(shoreOpenAtten(0) - SHORE_CALM) < 1e-9, 'waterline: open waves calmed to SHORE_CALM');
ok(shoreEnv(-5000) < 1e-9 && shoreEnv(0) < 1e-9 && shoreEnv(200) < 1e-9,
  'shore set silent in blue water, at the sand and inland');
ok(shoreEnv(-50) > 0.9, 'shore set at full song over the breaker band');
for (let sd = -900; sd < -40; sd += 7) {
  ok(shoreOpenAtten(sd) >= shoreOpenAtten(sd + 7) - 1e-9, `calming is monotone (sd=${sd})`);
}
// the surf must stay AUDIBLE against the bigger open sea it rides inside:
// at the waterline the open set is crushed to SHORE_CALM, and the shore set
// has to be of that order or the beach reads as a ripple at the edge of an
// ocean (sea v2 scaled SHORE_WAVES with the spectrum for exactly this reason)
ok(MAX_SHORE_HEIGHT > 0.35 * SHORE_CALM * MAX_WAVE_HEIGHT,
  `the surf reads against the calmed open sea (${MAX_SHORE_HEIGHT.toFixed(2)} m of shore set `
  + `vs ${(SHORE_CALM * MAX_WAVE_HEIGHT).toFixed(2)} m of open sea left at the waterline)`);
ok(MAX_SHORE_HEIGHT < SHORE_CALM * MAX_WAVE_HEIGHT * 2,
  'but the coast still lies quieter than blue water (the design\'s first law)');

// with a sampler installed (an analytic island: land inside r=500) the sea
// calms toward the beach and waves ride the landward gradient; without one,
// the open-sea sums above must be exactly what waveHeight returns
setWaveOrigin(0, 0);
setWaveAxes(0, 0);
const openBefore = waveHeight(700, 0, 123.4);       // CPU open sum, no sampler
const openGradBefore = waveGradient(700, 0, 123.4);
const plainBefore = waveHeight(100, 200, 33);
setShoreSampler((x, z) => {
  const r = Math.hypot(x, z) || 1e-9;
  if (r > 3500) return null;
  return { d: 500 - r, gx: -x / r, gz: -z / r, gLen: 1 };
});
const meanAmp = (r) => {
  let s = 0;
  for (let i = 0; i < 200; i++) s += Math.abs(waveHeight(r, 0, i * 0.37));
  return s / 200;
};
ok(meanAmp(560) < meanAmp(3000), 'the sea calms as it closes the beach');
{
  // waveHeight with the sampler = attenuated open sum + shore set, exactly
  const x = 700, z = 0, t = 123.4; // d = -200
  const want = openBefore * shoreOpenAtten(-200) + shoreHeight(-200, t);
  ok(Math.abs(waveHeight(x, z, t) - want) < 1e-9, 'shore-aware height composes exactly');
  const [gx2] = waveGradient(x, z, t);
  const wantG = openGradBefore[0] * shoreOpenAtten(-200)
    + shoreGradMag(-200, t) * SHORE_SHADE * -1;
  ok(Math.abs(gx2 - wantG) < 1e-9, 'shore-aware gradient composes exactly (shading softened)');
}
// THE STRAIT GATE: where the field's gradient collapses (a channel's
// medial line — two shores fighting over one distance field) the shore set
// stands down entirely; the calming stays. No more full-channel corduroy.
setShoreSampler((x, z) => ({ d: -30, gx: 1, gz: 0, gLen: 0.2 }));
{
  const x = 700, z = 0, t = 123.4;
  const want = openBefore * shoreOpenAtten(-30); // calm, but NO shore set
  ok(Math.abs(waveHeight(x, z, t) - want) < 1e-9,
    'a strait\'s sheltered water calms without breaking');
}
setShoreSampler(null);
ok(Math.abs(waveHeight(100, 200, 33) - plainBefore) < 1e-12,
  'sampler removed: the open sea is back untouched');

// the two band caps and the state getters
{
  setSeaBands(1.7, 0.6);
  const b = getSeaBands();
  ok(b.swell === 1.7 && b.chop === 0.6, 'the bands read back');
  setSeaBands(99, 99);
  ok(getSeaBands().swell === SEA_SWELL_MAX && getSeaBands().chop === SEA_STATE_MAX,
    'both band caps hold');
  setSeaBands(1, 1); // leave the world as we found it
}

for (let i = 1; i < SHORE_WAVES.length; i++) {
  ok(SHORE_WAVES[i].amp <= SHORE_WAVES[i - 1].amp, `shore amps descend (${i})`);
  ok(SHORE_WAVES[i].len < SHORE_WAVES[i - 1].len, `shore wavelengths descend (${i})`);
}
ok(Math.abs(MAX_SHORE_HEIGHT - SHORE_WAVES.reduce((s, w) => s + w.amp, 0)) < 1e-12,
  'MAX_SHORE is the shore amp sum');
ok(SHORE_RANGE > 100 && SHORE_CALM > 0 && SHORE_CALM < 1, 'shore constants sane');

// leave the field as the later gate scripts expect to find it
setWaveOrigin(0, 0);
setWaveAxes(0, 0);
setSeaBands(1, 1);
setShoreSampler(null);

if (failed) { console.error(`verify-waves: ${failed} FAILED`); process.exit(1); }
console.log('verify-waves: OK — CPU/GPU parity holds at 120 km and under a turned sea;',
  `${NWAVE} components (${NSWELL} swell + ${NWAVE - NSWELL} wind-sea) + ${SHORE_WAVES.length} shore;`,
  `Hs ${significantHeight().toFixed(2)} m over ${meanWavelength(0).toFixed(0)} m rollers`,
  `(${(significantHeight(0) * 1.54).toFixed(2)} m in a working breeze);`,
  'an origin snap is a non-event and no stripe orientation owns the sea');
