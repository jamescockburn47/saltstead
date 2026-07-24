// The wave table — the ONE source of truth for the ocean surface.
// Both the GLSL vertex displacement (ocean.js) and the CPU evaluator below
// (buoyancy, anything that needs to know where the water is) are generated
// from this table, so the sea the eye sees and the sea the hull feels are
// the same sea. verify-waves.mjs guards the parity.
//
// Pure module: no THREE, no DOM — safe for the headless gate.

export const WAVES = [
  { dirX: 1.0,   dirZ: 0.18,  len: 46,  amp: 0.55, speed: 5.2 },
  { dirX: 0.71,  dirZ: 0.71,  len: 23,  amp: 0.28, speed: 3.9 },
  { dirX: -0.32, dirZ: 0.95,  len: 11,  amp: 0.12, speed: 2.6 },
  { dirX: 0.94,  dirZ: -0.34, len: 5.5, amp: 0.05, speed: 1.9 },
];

const TAU = Math.PI * 2;

export const MAX_WAVE_HEIGHT = WAVES.reduce((s, w) => s + w.amp, 0);

// Sea state: ONE linear multiplier on the whole sum, mirrored to the GPU as
// the uSwell uniform (ocean.js) — inshore chop is gentle, blue water heaves,
// a storm heaves harder, and CPU/GPU parity survives because both sides
// scale the SAME sum by the same factor.
// SEA_STATE_MIN is the WIND's floor (weather.js seaStateFor) — the open sea
// never reads glassy. RIVER_STATE sits below it: inland water is sheltered
// by the land itself, so a river runs near-flat whatever the wind does.
export const SEA_STATE_MIN = 0.6, SEA_STATE_MAX = 2.0;
export const RIVER_STATE = 0.05;
let seaState = 1;
export function setSeaState(k) {
  seaState = Math.max(0, Math.min(SEA_STATE_MAX, k));
}
export function getSeaState() { return seaState; }

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
export const SHORE_WAVES = [
  { len: 30, amp: 0.34, speed: 4.6 },
  { len: 14, amp: 0.14, speed: 3.2 },
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
// approach, breaking hardest over the last ~80 m, spent at the sand
export function shoreEnv(d) {
  return (1 - sstep(80, 480, -d)) * sstep(4, 34, -d);
}

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
  for (const w of WAVES) {
    const k = TAU / w.len;
    y += w.amp * Math.sin(k * (w.dirX * x + w.dirZ * z) - k * w.speed * t);
  }
  const s = shoreSampler && shoreSampler(x, z);
  if (!s) return y * seaState;
  return (y * shoreOpenAtten(s.d) + shoreHeight(s.d, t)) * seaState;
}

// The same sum as a GLSL expression over `wx`, `wz` (world xz) and `uTime`.
// Generated from the table so CPU and GPU can never drift apart.
export function glslWaveSum() {
  return WAVES.map((w) => {
    const k = TAU / w.len;
    return `${w.amp.toFixed(4)} * sin(${k.toFixed(6)} * (${w.dirX.toFixed(4)} * wx + ${w.dirZ.toFixed(4)} * wz) - ${(k * w.speed).toFixed(6)} * uTime)`;
  }).join('\n      + ');
}

// The analytic surface gradient (dy/dx, dy/dz) — the sum of sines has a
// closed-form derivative, so the smooth-shaded ocean's per-pixel normals are
// EXACT, not finite-differenced. Scaled by the same sea state as the height:
// the normal always belongs to the surface being drawn.
export function waveGradient(x, z, t) {
  let gx = 0, gz = 0;
  for (const w of WAVES) {
    const k = TAU / w.len;
    const c = w.amp * k * Math.cos(k * (w.dirX * x + w.dirZ * z) - k * w.speed * t);
    gx += c * w.dirX;
    gz += c * w.dirZ;
  }
  const s = shoreSampler && shoreSampler(x, z);
  if (!s) return [gx * seaState, gz * seaState];
  const a = shoreOpenAtten(s.d);
  const gm = shoreGradMag(s.d, t); // rides the landward unit gradient of d
  return [(gx * a + gm * s.gx) * seaState, (gz * a + gm * s.gz) * seaState];
}

// The gradient as a GLSL vec2 expression over `wx`, `wz`, `uTime` — generated
// from the SAME table (verify-waves.mjs guards parity against waveGradient).
// NOTE: unscaled, like glslWaveSum — the shader multiplies by uSwell itself.
export function glslWaveGrad() {
  return WAVES.map((w) => {
    const k = TAU / w.len;
    return `vec2(${(w.amp * k * w.dirX).toFixed(6)}, ${(w.amp * k * w.dirZ).toFixed(6)}) * cos(${k.toFixed(6)} * (${w.dirX.toFixed(4)} * wx + ${w.dirZ.toFixed(4)} * wz) - ${(k * w.speed).toFixed(6)} * uTime)`;
  }).join('\n      + ');
}

// ---- the shore field's GLSL, generated from the SAME tables ----
// Raw expression emitters (over `sd` = signed coast distance and `uTime`) are
// exported separately so verify-waves can compile each one as JS and hold it
// against its CPU twin above.
export function glslShoreAttenExpr() {
  return `${SHORE_CALM.toFixed(4)} + ${(1 - SHORE_CALM).toFixed(4)} * smoothstep(40.0, ${SHORE_RANGE.toFixed(1)}, -sd)`;
}
export function glslShoreEnvExpr() {
  return '(1.0 - smoothstep(80.0, 480.0, -sd)) * smoothstep(4.0, 34.0, -sd)';
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

// the function block the ocean shader inlines (vertex AND fragment)
export function glslShore() {
  return `
float oShoreAtten(float sd) { return ${glslShoreAttenExpr()}; }
float oShoreEnv(float sd) { return ${glslShoreEnvExpr()}; }
float oShoreSum(float sd) { return oShoreEnv(sd) * (${glslShoreSumExpr()}); }
float oShoreGradMag(float sd) { return oShoreEnv(sd) * (${glslShoreGradExpr()}); }
`;
}
