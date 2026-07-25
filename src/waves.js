// The wave table — the ONE source of truth for the ocean surface.
// Both the GLSL vertex displacement (ocean.js) and the CPU evaluator below
// (buoyancy, anything that needs to know where the water is) are generated
// from this table, so the sea the eye sees and the sea the hull feels are
// the same sea. verify-waves.mjs guards the parity.
//
// Pure module: no THREE, no DOM — safe for the headless gate.

// THE GRATING LESSON (2026-07-24): the old table's single dominant swell
// (len 46, amp 0.55 — over half the whole sea) was a diffraction grating:
// one set of identical crest lines marching one diagonal forever, and every
// downstream reader of the surface (specular banding, the whitecap mask)
// inherited the stripes. The swell energy now spreads across THREE spread
// components on non-commensurate wavelengths (63/52/39, headings fanned
// ~±20°), plus cross-sea and chop — same total height, no single grating:
// crests knot and vanish the way a real sea's do.
export const WAVES = [
  { dirX: 0.99,  dirZ: -0.14,  len: 63,  amp: 0.24, speed: 6.1 },
  { dirX: 0.966, dirZ: 0.259,  len: 52,  amp: 0.20, speed: 5.5 },
  { dirX: 0.86,  dirZ: 0.51,   len: 39,  amp: 0.15, speed: 4.7 },
  { dirX: 0.71,  dirZ: 0.71,   len: 23,  amp: 0.13, speed: 3.9 },
  { dirX: 0.549, dirZ: -0.836, len: 17,  amp: 0.10, speed: 3.3 },
  { dirX: -0.32, dirZ: 0.95,   len: 11,  amp: 0.08, speed: 2.6 },
  { dirX: 0.94,  dirZ: -0.34,  len: 5.5, amp: 0.05, speed: 1.9 },
];

const TAU = Math.PI * 2;

export const MAX_WAVE_HEIGHT = WAVES.reduce((s, w) => s + w.amp, 0);

// ---- TWO SEAS IN ONE WATER (2026-07-25) ----
// A real sea is two populations: SWELL — the long rollers (len >= SWELL_LEN),
// born of strong wind over open water, slow to build and slow to die — and
// CHOP, the local wind-sea that answers the breeze in minutes and lives
// everywhere. One scalar on the whole sum made a gale just a magnified calm;
// two band multipliers give blue water its rolling heave under a hard wind
// and leave sheltered light-air water genuinely quiet. CPU and GPU scale the
// SAME per-band sums by the same two factors (verify-waves holds the parity).
// SEA_STATE_MIN is the WIND's floor (weather.js) — the open sea never reads
// glassy. RIVER_STATE sits below it: inland water is sheltered by the land
// itself, so a river runs near-flat whatever the wind does.
export const SEA_STATE_MIN = 0.6, SEA_STATE_MAX = 2.0;
export const SEA_SWELL_MAX = 2.4;  // storm rollers may top the chop ceiling
export const RIVER_STATE = 0.05;
export const SWELL_LEN = 45;       // the band boundary (aligned with GRAD_BANDS.long)
export const MAX_SWELL_HEIGHT = WAVES.filter((w) => w.len >= SWELL_LEN)
  .reduce((s, w) => s + w.amp, 0);
export const MAX_CHOP_HEIGHT = MAX_WAVE_HEIGHT - MAX_SWELL_HEIGHT;
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
const bandOf = (w) => (w.len >= SWELL_LEN ? 0 : 1); // 0 swell, 1 chop

// ---- THE WIND'S OWN SEA, AND THE END OF THE GRATING (2026-07-25) ----
// Measured, not guessed: live-spectrum.mjs ablated every effect layer over
// mid-Atlantic water and the narrow east-west stripes died ONLY when the
// wave table itself was zeroed (stripe power 17100 -> 65). They were never
// foam, shadows, wake or noise: two chop trains whose wave-vectors differ
// by a near-north vector of period ~7.4 m beat against each other, and the
// sea's nonlinear shading (foam thresholds, fresnel) draws that second-order
// beat as a THIRD wave train. World-locked, because the table's headings
// were constants — which is why it stood in every ocean, every weather, and
// survived every amplitude retune ever tried.
//
// Two cures, both here, both closed-form (the parity doctrine holds):
//  1. THE CHOP TURNS WITH THE WIND. The wind-sea's fan rotates as a body to
//     run downwind (main.js eases it; the swell keeps its own heading, so a
//     wind shift leaves a crossed sea — the ocean's memory). A beat that
//     rotates with the weather cannot etch a permanent grid on the world.
//  2. EVERY TRAIN'S PHASE WANDERS. Each train carries a slow phase warp on
//     its own heading and wavelength (golden-angle fan, ~96-230 m features),
//     so crest lines bend and knot instead of ruling straight to the horizon
//     — and the difference-phase that makes the beat wanders with them, so
//     the beat smears instead of stacking. The warp is a pure function of
//     (x, z, t): the gradient keeps its closed form by the chain rule, and
//     verify-waves holds the CPU/GPU twins together as ever.
// The warp's strength as a FRACTION of each train's own wavenumber — so the
// crest-line wander is a bounded ANGLE (atan 0.35 ≈ 19°) for every train
// alike, not a fixed phase. A flat phase amplitude was the first cut, and
// verify-waves rejected it: the swing it bought the SHORT beats (0.2-0.9 rad
// against the 1 rad the stripes need to smear) was far too small, while the
// same amplitude would have swung the 63 m swell through ±55° of heading.
export const CHOP_WARP = 0.35;
// the table's own mean chop heading — the angle setChopRot() turns FROM
const CHOP_BASE = (() => {
  let dx = 0, dz = 0;
  for (const w of WAVES) if (bandOf(w) === 1) { dx += w.dirX; dz += w.dirZ; }
  return Math.atan2(dz, dx);
})();
export function chopRotFor(windFrom) {
  // wind blows FROM yaw `windFrom` (wind.js), so it drives the sea TOWARD
  // -(sin, cos); in the table's atan2(dirZ, dirX) frame that is:
  return Math.atan2(-Math.cos(windFrom), -Math.sin(windFrom)) - CHOP_BASE;
}
let chopRot = 0;
export function setChopRot(a) { chopRot = a; }
export function getChopRot() { return chopRot; }
export function chopCS() { return { x: Math.cos(chopRot), y: Math.sin(chopRot) }; }

// each train's warp: a golden-angle fan of headings on wavelengths far
// longer than any train's own, so no two trains wander together
// Each train wanders on a warp FOUR TIMES its own wavelength — so a 5.5 m
// ripple bends over ~22 m and a 63 m roller over ~250 m, each on its own
// scale, and the phase excursion is the same modest 1.4 rad for all of them
// (CHOP_WARP × WARP_SCALE). A single long warp wavelength for every train
// was the second cut: it drove the short trains' phase amplitude to ~15 rad,
// where the emitted constants' own rounding broke CPU/GPU parity (3.4e-3
// against a 2e-3 contract) — the gate caught it, 2026-07-25.
const WARP_SCALE = 4;
const warpOf = (i, kTrain) => {
  const a = i * 2.39996;                 // golden angle: never repeats
  const k = kTrain / WARP_SCALE;
  return { dx: Math.cos(a), dz: Math.sin(a), k, w: k * 0.55,
    amp: CHOP_WARP * WARP_SCALE };
};
const kOf = (w) => TAU / w.len;
// a chop train's heading after the wind's turn (swell keeps the table's)
const dirOf = (w, cs) => (bandOf(w) === 0
  ? { x: w.dirX, z: w.dirZ }
  : { x: w.dirX * cs.x - w.dirZ * cs.y, z: w.dirX * cs.y + w.dirZ * cs.x });

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
export const SHORE_WAVES = [
  { len: 30, amp: 0.15, speed: 4.6 },
  { len: 14, amp: 0.06, speed: 3.2 },
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

// Water surface height at world (x, z) at time t (seconds). Sum of sines —
// deliberately the exact expression glslWaveSum() emits, times the sea state.
// With a shore sampler installed the open set attenuates toward the coast and
// the shore-parallel set rides in — the same composition the ocean shader
// performs from the coast map texture.
export function waveHeight(x, z, t) {
  let y = 0;
  const cs = chopCS();
  for (let i = 0; i < WAVES.length; i++) {
    const w = WAVES[i];
    const k = TAU / w.len;
    const m = bandOf(w) === 0 ? seaSwell : seaChop;
    const d = dirOf(w, cs), p = warpOf(i, k);
    const warp = p.amp * Math.sin(p.k * (p.dx * x + p.dz * z) - p.w * t);
    y += m * w.amp * Math.sin(k * (d.x * x + d.z * z) - k * w.speed * t + warp);
  }
  const s = shoreSampler && shoreSampler(x, z);
  // the shore set is local wind-sea breaking on a beach — it rides the CHOP
  // band's state, never the far-travelled swell's
  if (!s) return y;
  const g = s.gLen === undefined ? 1 : shoreGate(s.gLen);
  return y * shoreOpenAtten(s.d) + shoreHeight(s.d, t) * g * seaChop;
}

// The same sum as a GLSL expression over `wx`, `wz` (world xz) and `uTime`.
// Generated from the table so CPU and GPU can never drift apart.
// ---- the emitted term, ONE generator for every emitter below ----
// `uChopCS` is the wind's turn (cos, sin) — a uniform on the GPU, a plain
// {x, y} in the JS the verify script compiles. Swell terms ignore it.
const gDir = (w) => (bandOf(w) === 0
  ? { x: `${w.dirX.toFixed(4)}`, z: `${w.dirZ.toFixed(4)}` }
  : {
      x: `(${w.dirX.toFixed(4)} * uChopCS.x - ${w.dirZ.toFixed(4)} * uChopCS.y)`,
      z: `(${w.dirX.toFixed(4)} * uChopCS.y + ${w.dirZ.toFixed(4)} * uChopCS.x)`,
    });
// the warp argument, and the phase that carries it
// NOTE the 9-decimal warp constants. A direction rounded to 4 places is a
// 5e-5 error on a unit vector, and at 2 km of world coordinate that is 0.03
// of a radian of phase — enough to break the 2e-3 parity contract on its own
// (the gate caught this too). The wave table's own headings are exact at 4
// places, so they stay short; the warp's cosines are not.
const gWarpArg = (i, k) => {
  const p = warpOf(i, k);
  return `(${p.k.toFixed(9)} * (${p.dx.toFixed(9)} * wx + ${p.dz.toFixed(9)} * wz) - ${p.w.toFixed(9)} * uTime)`;
};
const gPhase = (w, i) => {
  const k = kOf(w), d = gDir(w), p = warpOf(i, k);
  return `${k.toFixed(6)} * (${d.x} * wx + ${d.z} * wz) - ${(k * w.speed).toFixed(6)} * uTime`
    + ` + ${p.amp.toFixed(9)} * sin(${gWarpArg(i, k)})`;
};
const gHeightTerm = (w, i) => `${w.amp.toFixed(4)} * sin(${gPhase(w, i)})`;
// the gradient term: ONE vec2 constructor with scalar components (no vec2
// algebra), so the verify shim needs nothing but a vec2 constructor
const gGradTerm = (w, i) => {
  const k = kOf(w), d = gDir(w), p = warpOf(i, k);
  const c = `${w.amp.toFixed(4)} * cos(${gPhase(w, i)})`;
  const dw = `${(p.amp * p.k).toFixed(9)} * cos(${gWarpArg(i, k)})`;
  return `vec2((${c}) * (${k.toFixed(6)} * ${d.x} + (${dw}) * ${p.dx.toFixed(9)}),`
    + `\n        (${c}) * (${k.toFixed(6)} * ${d.z} + (${dw}) * ${p.dz.toFixed(9)}))`;
};

export function glslWaveSum() {
  return WAVES.map(gHeightTerm).join('\n      + ');
}

// the sum split at the SWELL_LEN boundary, so the shader can scale each
// population by its own state uniform (uSwellL / uSwellS) exactly as the
// CPU evaluator above scales its bands
export function glslWaveSumBand(minLen, maxLen) {
  const terms = WAVES.map((w, i) => (w.len >= minLen && w.len < maxLen ? gHeightTerm(w, i) : null))
    .filter(Boolean);
  return terms.length ? terms.join('\n      + ') : '0.0';
}

// The analytic surface gradient (dy/dx, dy/dz) — the sum of sines has a
// closed-form derivative, so the smooth-shaded ocean's per-pixel normals are
// EXACT, not finite-differenced. Scaled by the same sea state as the height:
// the normal always belongs to the surface being drawn.
export function waveGradient(x, z, t) {
  let gx = 0, gz = 0;
  const cs = chopCS();
  for (let i = 0; i < WAVES.length; i++) {
    const w = WAVES[i];
    const k = TAU / w.len;
    const m = bandOf(w) === 0 ? seaSwell : seaChop;
    const d = dirOf(w, cs), p = warpOf(i, k);
    const wArg = p.k * (p.dx * x + p.dz * z) - p.w * t;
    // the chain rule through the warp — the phase is no longer linear in
    // position, so the gradient carries the warp's own slope
    const dw = p.amp * p.k * Math.cos(wArg);
    const c = m * w.amp * Math.cos(k * (d.x * x + d.z * z) - k * w.speed * t
      + p.amp * Math.sin(wArg));
    gx += c * (k * d.x + dw * p.dx);
    gz += c * (k * d.z + dw * p.dz);
  }
  const s = shoreSampler && shoreSampler(x, z);
  if (!s) return [gx, gz];
  const a = shoreOpenAtten(s.d);
  const g = s.gLen === undefined ? 1 : shoreGate(s.gLen);
  // rides the landward unit gradient of d, softened for the normals; the
  // shore set follows the chop band, like the height it belongs to
  const gm = shoreGradMag(s.d, t) * g * SHORE_SHADE * seaChop;
  return [gx * a + gm * s.gx, gz * a + gm * s.gz];
}

// The gradient as a GLSL vec2 expression over `wx`, `wz`, `uTime` — generated
// from the SAME table (verify-waves.mjs guards parity against waveGradient).
// NOTE: unscaled, like glslWaveSum — the shader multiplies by uSwell itself.
export function glslWaveGrad() {
  return WAVES.map(gGradTerm).join('\n      + ');
}

// ---- SHADING LOD BANDS (2026-07-24, the stripes-to-the-horizon fix) ----
// The same gradient split by wavelength band, so the FRAGMENT shader can
// treat each honestly: long swell shades everywhere; mid sea fades its
// normals out where a wavelength is pixels; short chop both fades AND comes
// in wind-patched cat's-paws (a global sinusoid of 5 m ripple is a stripe
// field — real chop is patchy and local). HEIGHT is untouched: the drawn
// surface is still exactly the felt one; only the LIGHTING resolves what a
// camera at that distance could resolve. verify-waves asserts the three
// bands partition the full gradient exactly.
export const GRAD_BANDS = { long: 45, mid: 20 }; // len >= long | >= mid | rest
export function glslWaveGradBand(minLen, maxLen) {
  const terms = WAVES.map((w, i) => (w.len >= minLen && w.len < maxLen ? gGradTerm(w, i) : null))
    .filter(Boolean);
  return terms.length ? terms.join('\n      + ') : 'vec2(0.0)';
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
