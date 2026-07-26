// THE SEA — one spectrum, two consumers. Both the GLSL surface (ocean.js) and
// the CPU evaluator below (buoyancy, camera clamp, foam, kraken, flotsam,
// wildlife, merchants) read the SAME component set through the SAME emitted
// expression, so the sea the eye sees and the sea the hull feels are the same
// sea. verify-waves.mjs guards the parity; verify-seamotion.mjs guards that the
// resulting motion is physical; live-spectrum.mjs guards the pixels.
//
// Pure module: no THREE, no DOM, no Math.random — safe for the headless gate.
//
// ============================ SEA v2 (2026-07-26) ============================
// docs/superpowers/specs/2026-07-25-sea-v2-design.md, Phase A + B. v1's seven
// fixed sine trains are gone. Three faults were structural, and all three are
// answered here.
//
// FAULT 1 — WORLD-ABSOLUTE PHASE. v1's phase was k·p with p in world metres,
// and play happens 20-40 km from the origin. Rotating a direction therefore
// pivoted the whole field about a point twenty kilometres away: 1e-4 rad of
// turn slewed the phase under the hull by over a radian and the ship bucked
// (the reverted 1d38aca). v2 evaluates in a LOCAL FRAME — phase is
// k·(p - origin) where `origin` is the ocean mesh's own snapped following
// origin — and each component carries a PHASE ACCUMULATOR that absorbs the
// difference whenever the origin moves. The field is therefore exactly
// invariant under an origin snap (verify-waves proves it to 1e-9), while a
// direction turn pivots about a point under the hull instead of over the
// horizon. Rotation becomes free; float32 phase precision becomes a non-issue
// (the GPU never sees a coordinate over ~360 m or a phase over ~2π).
//
// FAULT 2 — A HANDFUL OF PLANE WAVES IS A GRATING. Seven trains give 21 exact
// pairwise beats, and the sea's nonlinear shading draws a second-order beat as
// if it were a third wave train. Measured by ablation: the narrow east-west
// stripes died ONLY when the wave table was zeroed (stripe power 17100 -> 65
// with every effect layer still live); the 11 m and 17 m trains' difference
// vector pointed near-north with a ~7.4 m period, matching the stripes. No
// amplitude retune can fix a coherent beat. v2 draws a SPECTRUM: 28 components
// on non-commensurate wavelengths, amplitudes from a Pierson-Moskowitz
// envelope, directions from a cos^2s spreading fan, phases seeded — 378
// pairwise beats, dense and incoherent, which is what a sea looks like.
//
// FAULT 3 — A FIXED TABLE CANNOT ANSWER THE WIND. v1's headings were
// constants, so a gale from the north drew the same water as a gale from the
// south and the player could not read the wind off the water. v2 gives each
// BAND an axis: the wind-sea's axis eases downwind over about a minute, the
// swell's over a quarter of an hour, so a shift leaves a genuine crossed sea.
// Both slews are rate-capped, because the rate is what the hull feels.
//
// AND THE SEA IS BIGGER. v1's whole sea summed to 0.95 m of amplitude over a
// 63 m longest wave — about 1.5% steepness at the swell cap, which is why
// tripling the swell BAND changed nothing anybody could see. v2's reference
// sea (bands 1,1) is a Pierson-Moskowitz sea peaking near 145 m with a
// significant height around 1.5 m; an ordinary 10 m/s day offshore (swell band
// 1.54) puts 2+ m rollers on 145 m under the keel, and a storm is genuinely
// frightening. SPECTRUM_LEVEL is the one knob.

const TAU = Math.PI * 2;
const G = 9.81;                       // deep-water dispersion: omega^2 = g k

// ---- THE BAND BOUNDARY ----
// SWELL is the long sea (len >= SWELL_LEN): born of hard wind over open water,
// slow to build and slow to die. WIND-SEA is the short local sea that answers
// the breeze in minutes. The two are scaled apart by weather.js seaBandsFor,
// on GPU exactly as on CPU. GRAD_BANDS.long IS SWELL_LEN so the shading LOD's
// long band is the swell population (verify-waves asserts it).
export const SWELL_LEN = 45;
export const GRAD_BANDS = { long: 45, mid: 20 }; // len >= long | >= mid | rest

// ---- THE SPECTRUM'S KNOBS ----
// Everything about the sea's SIZE and SHAPE lives here. The seed is fixed and
// the generator is integer-only (mulberry32), so every client on every engine
// builds the identical sea — determinism is a property of the code, not of a
// convention (CLAUDE.md: no Math.random for anything shared).
export const SPECTRUM = {
  seed: 0x5A175EAD,
  // wavelength ladders, longest first. Two geometric runs so the band
  // boundary at SWELL_LEN is exact and the LOD bands stay contiguous.
  swellN: 10, swellLamMax: 265, swellLamMin: 47,
  windN: 18, windLamMax: 43, windLamMin: 6,
  lamJitter: 0.045,     // ±4.5% seeded jitter: no two wavelengths commensurate
  // the Pierson-Moskowitz envelope's peak. 145 m is a 9.6 s roller — the long
  // ocean swell the game has never had, and the middle of the 100-250 m band
  // the design calls for.
  lamPeak: 145,
  alpha: 8.1e-3,        // PM's Phillips constant
  // THE ONE LEVEL KNOB, and it is measured, not guessed. At 1.0 this is a
  // literal fully-developed 13.4 m/s Pierson-Moskowitz sea: Hs 3.7 m at bands
  // (1,1), which the weather's own swell band then multiplies by up to 2.4 —
  // a 12 m peak-to-peak North Atlantic hurricane under a 9 m sloop. 0.46 puts
  // the REFERENCE sea at Hs 1.71 m, so the ordinary 10 m/s day offshore
  // (seaBandsFor -> swell 1.54) stands the rollers at 2.5 m over a 124 m mean
  // wavelength — the middle of the 1.5-3 m / 100-250 m band the design calls
  // for — and a full gale runs 4 m. verify-waves asserts both numbers.
  //
  // Settled at 0.52, the UPPER half of that band, deliberately: a long sea is a
  // gentle sea, and side-by-side stills at 0.46 showed the transformation
  // reading clearly in the hull's motion and only faintly in a single frame
  // (slope, which is what shading sees, falls as wavelength grows at fixed
  // height). 0.52 buys 13% more slope for 13% more height and still leaves the
  // motion gate 1.5x headroom on every bound. Measured at 0.52: reference sea
  // Hs 1.93 m, rollers 2.80 m over 124 m in a working breeze, 4.4 m in a gale.
  level: 0.52,
  // directional spreading, cos^2s(theta/2) about each band's axis. Swell is
  // narrow (a long-travelled sea arrives on one bearing); wind-sea is broad
  // (a local sea fans wide either side of the wind).
  swellSpread: 34 * Math.PI / 180, swellS: 18,
  windSpread: 80 * Math.PI / 180, windS: 3.5,
};

// mulberry32 — integer-only, so the sequence is identical on every engine
function mulberry32(a) {
  return function next() {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// cos^2s(theta/2) spreading by rejection — deterministic given the generator,
// and the cap keeps a rogue draw from putting a swell train across the swell
const drawSpread = (rand, half, s) => {
  for (let g = 0; g < 64; g++) {
    const th = (rand() * 2 - 1) * half;
    if (rand() < Math.cos(th / 2) ** (2 * s)) return th;
  }
  return 0;
};

// Pierson-Moskowitz S(omega) — the fully developed sea's energy density
const pmS = (w, wp, alpha) => (alpha * G * G / w ** 5) * Math.exp(-1.25 * (wp / w) ** 4);

function buildSpectrum(S = SPECTRUM) {
  const rand = mulberry32(S.seed);
  const wp = Math.sqrt(TAU * G / S.lamPeak);
  const ladder = (n, lamMax, lamMin, band) => {
    const r = (lamMin / lamMax) ** (1 / (n - 1));
    const dwOverW = Math.abs(Math.log(r)) / 2; // omega spacing: w ~ lam^-1/2
    const out = [];
    for (let i = 0; i < n; i++) {
      const len = lamMax * r ** i * (1 + (rand() * 2 - 1) * S.lamJitter);
      const k = TAU / len;
      const w = Math.sqrt(G * k);
      out.push({
        len, k, band,
        omega: w,
        amp: Math.sqrt(2 * pmS(w, wp, S.alpha) * w * dwOverW) * S.level,
        off: drawSpread(rand, band === 0 ? S.swellSpread : S.windSpread,
          band === 0 ? S.swellS : S.windS),
        ph0: rand() * TAU,
      });
    }
    return out;
  };
  // sort each ladder strictly descending: the jitter may cross adjacent rungs,
  // and the LOD/band index ranges below are only contiguous if the whole set
  // is monotone in wavelength
  const sw = ladder(S.swellN, S.swellLamMax, S.swellLamMin, 0).sort((a, b) => b.len - a.len);
  const wd = ladder(S.windN, S.windLamMax, S.windLamMin, 1).sort((a, b) => b.len - a.len);
  return [...sw, ...wd];
}

export const COMPONENTS = buildSpectrum();
export const NWAVE = COMPONENTS.length;
// the three index boundaries every emitter and every band sum is cut on.
// Because the set is monotone descending in wavelength these are contiguous
// ranges, which is what lets the GLSL loops carry literal bounds.
export const NSWELL = COMPONENTS.filter((c) => c.len >= SWELL_LEN).length;
export const NMID = COMPONENTS.filter((c) => c.len >= GRAD_BANDS.mid).length;

// ---- the sea's gross measures (ocean.js normalisation, verify-ship bounds) ----
export const MAX_WAVE_HEIGHT = COMPONENTS.reduce((s, c) => s + c.amp, 0);
export const MAX_SWELL_HEIGHT = COMPONENTS.filter((c) => c.band === 0)
  .reduce((s, c) => s + c.amp, 0);
export const MAX_CHOP_HEIGHT = MAX_WAVE_HEIGHT - MAX_SWELL_HEIGHT;
// significant wave height of a band at state 1 — Hs = 4 sqrt(sum a^2 / 2).
// This, not the amplitude sum, is the number a sailor would recognise.
export function significantHeight(band = null) {
  let v = 0;
  for (const c of COMPONENTS) if (band === null || c.band === band) v += c.amp * c.amp / 2;
  return 4 * Math.sqrt(v);
}
// the energy-weighted mean wavelength of a band — "how long are the rollers"
export function meanWavelength(band = 0) {
  let num = 0, den = 0;
  for (const c of COMPONENTS) {
    if (band !== null && c.band !== band) continue;
    const e = c.amp * c.amp;
    num += e * c.len; den += e;
  }
  return den > 0 ? num / den : 0;
}

// ---- TWO SEAS IN ONE WATER ----
// One scalar on the whole sum made a gale just a magnified calm; two band
// multipliers give blue water its rolling heave under a hard wind and leave
// sheltered light-air water genuinely quiet. CPU and GPU scale the SAME
// per-band sums by the same two factors (verify-waves holds the parity).
// SEA_STATE_MIN is the WIND's floor (weather.js) — the open sea never reads
// glassy. RIVER_STATE sits below it: inland water is sheltered by the land
// itself, so a river runs near-flat whatever the wind does. RIVER_STATE fell
// from 0.05 to 0.018 with sea v2: it is a FRACTION of the open sea, and the
// open sea grew threefold, so the old fraction would have put a visible chop
// on the Thames (verify-seamotion's river ceiling caught it).
export const SEA_STATE_MIN = 0.6, SEA_STATE_MAX = 2.0;
export const SEA_SWELL_MAX = 2.4;  // storm rollers may top the chop ceiling
export const RIVER_STATE = 0.018;
let seaSwell = 1, seaChop = 1;
export function setSeaBands(swell, chop) {
  seaSwell = Math.max(0, Math.min(SEA_SWELL_MAX, swell));
  seaChop = Math.max(0, Math.min(SEA_STATE_MAX, chop));
}
// legacy door: one number drives both bands (the title scene's heavy sea,
// and every caller from the one-scalar era)
export function setSeaState(k) { setSeaBands(Math.min(k, SEA_STATE_MAX), k); }
export function getSeaState() { return seaChop; }
export function getSeaBands() { return { swell: seaSwell, chop: seaChop }; }

// ============================ THE LOCAL FRAME ============================
// The live field state: the two band axes, the following origin, and one
// phase accumulator per component. Everything the GPU needs is derived from
// these (packWaveUniforms), so the drawn sea can never be a different sea
// from the felt one.
//
// WHY AN ACCUMULATOR. Phase is k·(p - O) + acc - omega·t. When the ocean
// mesh's origin O snaps a step, continuity demands
//     k·(p - O) + acc  ==  k·(p - O') + acc'      =>   acc' = acc + k·(O' - O)
// so absorbing the snap is one dot product per component and the surface
// under the hull does not move at all (verify-waves: origin invariance to
// 1e-9 at 120 km). Turning a direction, meanwhile, leaves the phase AT the
// origin untouched — the field pivots about a point a few metres from the
// hull instead of twenty kilometres away, which is the entire judder fix.
let axSwell = 0, axWind = 0;         // band axis headings (direction of travel)
let originX = 0, originZ = 0;
const acc = new Float64Array(NWAVE);
const kx = new Float64Array(NWAVE);  // the live wave-vectors, axis applied
const kz = new Float64Array(NWAVE);
const wrapPhase = (p) => p - TAU * Math.floor(p / TAU);
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function refreshK() {
  for (let i = 0; i < NWAVE; i++) {
    const c = COMPONENTS[i];
    const th = c.off + (c.band === 0 ? axSwell : axWind);
    kx[i] = c.k * Math.cos(th);
    kz[i] = c.k * Math.sin(th);
  }
}
// the seeded phases are the field's starting condition; the accumulator
// carries them from here
for (let i = 0; i < NWAVE; i++) acc[i] = COMPONENTS[i].ph0;
refreshK();

// The direction a wind-driven sea TRAVELS, given the bearing the wind blows
// FROM (main.js wind.from, the shipphysics yaw convention: a yaw of `a` points
// along (sin a, cos a)). A sea runs downwind, so it travels along -(sin, cos).
export function waveAxisFor(windFrom) {
  return Math.atan2(-Math.cos(windFrom), -Math.sin(windFrom));
}

// THE SLEW RATE IS WHAT THE HULL FEELS. A turn of the axis moves the phase
// under the hull by k·r·(dtheta/dt), where r is the hull's distance from the
// origin (a few metres, because the origin follows the ship). The exponential
// ease gives the honest lag; the RATE CAP bounds the worst case, so even a
// 180-degree wind reversal can never slew a 6 m ripple's phase faster than it
// runs of its own accord. verify-seamotion sails the reversal and judges it.
export const AXIS_EASE = {
  windTau: 55, windRate: 0.030,     // the wind-sea answers in about a minute
  swellTau: 900, swellRate: 0.004,  // the ocean's memory: a quarter of an hour
};
const slew = (a, target, dt, tau, rate) => {
  const d = wrapPi(target - a);
  const step = d * Math.min(1, dt / tau);
  const cap = rate * dt;
  return a + Math.max(-cap, Math.min(cap, step));
};

// one frame of wind-following. Called by main.js BEFORE anything samples the
// sea, so the hull and the drawn surface share the same axes within a frame.
export function easeWaveAxes(windFrom, dt) {
  const target = waveAxisFor(windFrom);
  axWind = slew(axWind, target, dt, AXIS_EASE.windTau, AXIS_EASE.windRate);
  axSwell = slew(axSwell, target, dt, AXIS_EASE.swellTau, AXIS_EASE.swellRate);
  refreshK();
}
export function setWaveAxes(swellAxis, windAxis) {
  axSwell = swellAxis; axWind = windAxis; refreshK();
}
export function getWaveAxes() { return { swell: axSwell, wind: axWind }; }

// hand the field the ocean mesh's snapped origin. The accumulators absorb the
// move, so this changes NOTHING about the surface — it only keeps the local
// coordinates (and hence the GPU's float32 phases) small.
export function setWaveOrigin(x, z) {
  if (x === originX && z === originZ) return;
  const dx = x - originX, dz = z - originZ;
  for (let i = 0; i < NWAVE; i++) {
    acc[i] = wrapPhase(acc[i] + kx[i] * dx + kz[i] * dz);
  }
  originX = x; originZ = z;
}
export function getWaveOrigin() { return { x: originX, z: originZ }; }

// THE UNIFORM BLOCK the shader loops over: vec4(kx, kz, amp, phase) per
// component, where phase folds the accumulator AND the clock together and
// wraps to [0, 2π). Folding omega·t in here is what keeps the GPU exact: a
// float32 never carries more than 2π of phase or 360 m of coordinate, so the
// old "k·p reaches 1e5 radians" precision hole is closed by construction.
// The CPU evaluator below computes acc - omega·t unwrapped; sin is periodic,
// so the two agree exactly (verify-waves compares against THIS array).
export function packWaveUniforms(t, out = new Float32Array(NWAVE * 4)) {
  for (let i = 0; i < NWAVE; i++) {
    const c = COMPONENTS[i], o = i * 4;
    out[o] = kx[i]; out[o + 1] = kz[i]; out[o + 2] = c.amp;
    out[o + 3] = wrapPhase(acc[i] - c.omega * t);
  }
  return out;
}

// ---- THE SHORE FIELD (2026-07-24) ----
// Near land the sea grows shore-aware: the open-water set calms as the coast
// closes (shoreOpenAtten) and a second, SHORE-PARALLEL set rises in its place
// (shoreHeight) whose phase rides the signed coast distance itself — the
// wavefronts are the distance field's own level sets, so they lie parallel to
// any shoreline, any shape, by construction, and march up the beach.
// A sampler injected by main.js (the coast map, coastmaplayer.js) supplies
// d = signed coast distance in game m (negative offshore, positive inland)
// and the landward unit gradient; waves.js itself stays pure — no earth.js
// import, and with no sampler installed the sea is the open sea everywhere
// (which is what the headless gate and the title scene get).

export const SHORE_RANGE = 700;  // m offshore where the land starts to tell
export const SHORE_CALM = 0.25;  // open-wave amplitude left at the waterline
// small on purpose: the shore set rides INSIDE the calming — the coast must
// stay quieter than blue water even in the surf band (the design's first law)
// SEA v2 scaled these with the open sea (x2.7, and a little longer): surf that
// stayed at v1's 0.15 m against a threefold bigger swell would have read as a
// ripple at the beach of an ocean.
export const SHORE_WAVES = [
  { len: 36, amp: 0.40, speed: 5.2 },
  { len: 16, amp: 0.16, speed: 3.4 },
];
export const MAX_SHORE_HEIGHT = SHORE_WAVES.reduce((s, w) => s + w.amp, 0);

let shoreSampler = null; // fn(x, z) -> { d, gx, gz } | null
export function setShoreSampler(fn) { shoreSampler = fn; }

const sstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// open-sea attenuation: 1 in blue water, SHORE_CALM at the waterline & inland
export function shoreOpenAtten(d) {
  return SHORE_CALM + (1 - SHORE_CALM) * sstep(40, SHORE_RANGE, -d);
}

// the shore set's envelope: silent in blue water, swelling through the
// approach, breaking hardest over the last ~80 m, spent at the sand.
// Deliberately NARROW — a wide envelope striped every strait and sound
// on earth with full-channel surf (the Solent corduroy, 2026-07-24)
export function shoreEnv(d) {
  return (1 - sstep(40, 240, -d)) * sstep(4, 34, -d);
}

// the STRAIT gate: shore waves march up a real approach, where the coast
// distance field's gradient is clean (|∇d| ≈ 1). In a channel between two
// facing shores the medial line collapses the gradient — and that is
// exactly where breakers must NOT be: sheltered water lies calm. Both the
// CPU evaluator and the shader compute this from the same sampled field.
export function shoreGate(gLen) {
  return sstep(0.35, 0.75, gLen);
}

// how much of the shore set's slope reaches the NORMALS: full-strength
// shading painted the surf band as broad bright sheets; the height (and the
// hull that rides it) keeps the full set, the shading takes it gently
export const SHORE_SHADE = 0.6;

// shore-parallel surface height at signed coast distance d, time t. UNscaled
// by sea state — waveHeight applies it to the whole shore-aware sum.
export function shoreHeight(d, t) {
  let y = 0;
  for (const w of SHORE_WAVES) {
    const k = TAU / w.len;
    y += w.amp * Math.sin(k * d - k * w.speed * t);
  }
  return y * shoreEnv(d);
}

// d(shoreHeight)/dd with the envelope factored OUTSIDE the derivative — the
// envelope varies over tens of metres against wavelengths of metres, so both
// CPU and GPU drop the envelope's own slope, identically (parity holds
// because the approximation is shared, verify-waves guards it).
export function shoreGradMag(d, t) {
  let g = 0;
  for (const w of SHORE_WAVES) {
    const k = TAU / w.len;
    g += w.amp * k * Math.cos(k * d - k * w.speed * t);
  }
  return g * shoreEnv(d);
}

// ============================ THE EVALUATOR ============================
// Water surface height at world (x, z) at time t (seconds) — a closed-form
// HEIGHT FIELD, deliberately the exact expression the shader loops over
// (GLSL_WAVE_TERM below), times the sea state. No Gerstner, no horizontal
// displacement: the fragment shader re-evaluates this per pixel for exact
// normals and a dozen CPU consumers sample it directly, and both depend on
// y being a single-valued function of (x, z, t).
// With a shore sampler installed the open set attenuates toward the coast and
// the shore-parallel set rides in — the same composition the ocean shader
// performs from the coast map texture.
export function waveHeight(x, z, t) {
  const lx = x - originX, lz = z - originZ;
  let ySw = 0, yWd = 0;
  for (let i = 0; i < NSWELL; i++) {
    ySw += COMPONENTS[i].amp * Math.sin(kx[i] * lx + kz[i] * lz
      + acc[i] - COMPONENTS[i].omega * t);
  }
  for (let i = NSWELL; i < NWAVE; i++) {
    yWd += COMPONENTS[i].amp * Math.sin(kx[i] * lx + kz[i] * lz
      + acc[i] - COMPONENTS[i].omega * t);
  }
  const y = seaSwell * ySw + seaChop * yWd;
  const s = shoreSampler && shoreSampler(x, z);
  // the shore set is local wind-sea breaking on a beach — it rides the CHOP
  // band's state, never the far-travelled swell's
  if (!s) return y;
  const g = s.gLen === undefined ? 1 : shoreGate(s.gLen);
  return y * shoreOpenAtten(s.d) + shoreHeight(s.d, t) * g * seaChop;
}

// The analytic surface gradient (dy/dx, dy/dz) — a sum of sines has a
// closed-form derivative, so the smooth-shaded ocean's per-pixel normals are
// EXACT, not finite-differenced. Scaled by the same sea state as the height:
// the normal always belongs to the surface being drawn.
export function waveGradient(x, z, t) {
  const lx = x - originX, lz = z - originZ;
  let sx = 0, sz = 0, wx2 = 0, wz2 = 0;
  for (let i = 0; i < NSWELL; i++) {
    const c = COMPONENTS[i].amp * Math.cos(kx[i] * lx + kz[i] * lz
      + acc[i] - COMPONENTS[i].omega * t);
    sx += kx[i] * c; sz += kz[i] * c;
  }
  for (let i = NSWELL; i < NWAVE; i++) {
    const c = COMPONENTS[i].amp * Math.cos(kx[i] * lx + kz[i] * lz
      + acc[i] - COMPONENTS[i].omega * t);
    wx2 += kx[i] * c; wz2 += kz[i] * c;
  }
  const gx = seaSwell * sx + seaChop * wx2;
  const gz = seaSwell * sz + seaChop * wz2;
  const s = shoreSampler && shoreSampler(x, z);
  if (!s) return [gx, gz];
  const a = shoreOpenAtten(s.d);
  const g = s.gLen === undefined ? 1 : shoreGate(s.gLen);
  // rides the landward unit gradient of d, softened for the normals; the
  // shore set follows the chop band, like the height it belongs to
  const gm = shoreGradMag(s.d, t) * g * SHORE_SHADE * seaChop;
  return [gx * a + gm * s.gx, gz * a + gm * s.gz];
}

// the band sums on their own — what the shader's per-band functions return,
// so verify-waves can hold each half against its GLSL twin
export function waveBandHeight(band, x, z, t) {
  const lx = x - originX, lz = z - originZ;
  let y = 0;
  const lo = band === 0 ? 0 : NSWELL, hi = band === 0 ? NSWELL : NWAVE;
  for (let i = lo; i < hi; i++) {
    y += COMPONENTS[i].amp * Math.sin(kx[i] * lx + kz[i] * lz
      + acc[i] - COMPONENTS[i].omega * t);
  }
  return y;
}

// ============================ THE EMITTED GLSL ============================
// THE PARITY DOCTRINE, v2. The spectrum is far too large to inline as one
// monolithic expression (28 sin plus 28 cos, three times over, would be a
// kilobyte of generated maths and an ANGLE compile stall), so the components
// travel as a UNIFORM ARRAY and the shader loops. The parity check therefore
// has three independent locks, and all three are in verify-waves:
//   1. the ARITHMETIC is one shared string — GLSL_WAVE_TERM below is the exact
//      text the shader compiles AND the exact text the gate compiles as JS;
//   2. the DATA is one shared array — packWaveUniforms() writes the very
//      Float32Array handed to the GPU, and the gate reads that array;
//   3. the PARTITION is asserted structurally — the emitted loop bounds must
//      equal NSWELL / NMID / NWAVE, so no component can be lit twice or lost.
// `lp` is the LOCAL position (p - origin); `w` is one component's vec4.
export const GLSL_WAVE_TERM = 'w.z * sin(w.x * lp.x + w.y * lp.y + w.w)';
export const GLSL_WAVE_COS = 'w.z * cos(w.x * lp.x + w.y * lp.y + w.w)';

const sumLoop = (lo, hi) => `  for (int i = ${lo}; i < ${hi}; i++) {`
  + ` vec4 w = uWave[i]; s += ${GLSL_WAVE_TERM}; }`;
const gradLoop = (lo, hi) => `  for (int i = ${lo}; i < ${hi}; i++) {`
  + ` vec4 w = uWave[i]; float c = ${GLSL_WAVE_COS};`
  + ' g += vec2(w.x * c, w.y * c); }';

// The function block the ocean shader inlines (vertex AND fragment).
// oWaveSwell / oWaveWind are the HEIGHT halves — the vertex shader's
// displacement, and therefore the surface the hull is promised. oWaveWindLod
// is the fragment's cheaper twin: on the plain tier the short components are
// dropped from SHADING only (the existing wavelength LOD idiom — a 6 m ripple
// is sub-pixel past 60 m anyway), never from the height the CPU agrees with.
// oWaveGrad{Long,Mid,Short} are the three shading LOD bands, which must
// partition the components exactly.
export function glslWaves() {
  return `
uniform vec4 uWave[${NWAVE}];
uniform float uWaveLOD;
float oWaveSwell(vec2 lp) { float s = 0.0;
${sumLoop(0, NSWELL)}
  return s; }
float oWaveWind(vec2 lp) { float s = 0.0;
${sumLoop(NSWELL, NWAVE)}
  return s; }
float oWaveWindLod(vec2 lp) { float s = 0.0;
${sumLoop(NSWELL, NMID)}
  if (uWaveLOD > 0.5) {
${sumLoop(NMID, NWAVE)}
  }
  return s; }
vec2 oWaveGradLong(vec2 lp) { vec2 g = vec2(0.0);
${gradLoop(0, NSWELL)}
  return g; }
vec2 oWaveGradMid(vec2 lp) { vec2 g = vec2(0.0);
${gradLoop(NSWELL, NMID)}
  return g; }
vec2 oWaveGradShort(vec2 lp) { vec2 g = vec2(0.0);
  if (uWaveLOD > 0.5) {
${gradLoop(NMID, NWAVE)}
  }
  return g; }
`;
}

// the emitted loop bounds, exported so the gate can assert the partition
// without parsing GLSL: [lo, hi) per emitted function
export function glslWaveBounds() {
  return {
    swell: [0, NSWELL], wind: [NSWELL, NWAVE],
    long: [0, NSWELL], mid: [NSWELL, NMID], short: [NMID, NWAVE],
  };
}

// ---- the shore field's GLSL, generated from the SAME tables ----
// Raw expression emitters (over `sd` = signed coast distance and `uTime`) are
// exported separately so verify-waves can compile each one as JS and hold it
// against its CPU twin above.
export function glslShoreAttenExpr() {
  return `${SHORE_CALM.toFixed(4)} + ${(1 - SHORE_CALM).toFixed(4)} * smoothstep(40.0, ${SHORE_RANGE.toFixed(1)}, -sd)`;
}
export function glslShoreEnvExpr() {
  return '(1.0 - smoothstep(40.0, 240.0, -sd)) * smoothstep(4.0, 34.0, -sd)';
}
export function glslShoreSumExpr() {
  return SHORE_WAVES.map((w) => {
    const k = TAU / w.len;
    return `${w.amp.toFixed(4)} * sin(${k.toFixed(6)} * sd - ${(k * w.speed).toFixed(6)} * uTime)`;
  }).join(' + ');
}
export function glslShoreGradExpr() {
  return SHORE_WAVES.map((w) => {
    const k = TAU / w.len;
    return `${(w.amp * k).toFixed(6)} * cos(${k.toFixed(6)} * sd - ${(k * w.speed).toFixed(6)} * uTime)`;
  }).join(' + ');
}
export function glslShoreGateExpr() {
  return 'smoothstep(0.35, 0.75, gl)';
}

// the function block the ocean shader inlines (vertex AND fragment)
export function glslShore() {
  return `
float oShoreAtten(float sd) { return ${glslShoreAttenExpr()}; }
float oShoreEnv(float sd) { return ${glslShoreEnvExpr()}; }
float oShoreSum(float sd) { return oShoreEnv(sd) * (${glslShoreSumExpr()}); }
float oShoreGradMag(float sd) { return oShoreEnv(sd) * (${glslShoreGradExpr()}); }
float oShoreGate(float gl) { return ${glslShoreGateExpr()}; }
`;
}
