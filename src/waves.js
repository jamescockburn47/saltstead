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

// Water surface height at world (x, z) at time t (seconds). Sum of sines —
// deliberately the exact expression glslWaveSum() emits, times the sea state.
export function waveHeight(x, z, t) {
  let y = 0;
  for (const w of WAVES) {
    const k = TAU / w.len;
    y += w.amp * Math.sin(k * (w.dirX * x + w.dirZ * z) - k * w.speed * t);
  }
  return y * seaState;
}

// The same sum as a GLSL expression over `wx`, `wz` (world xz) and `uTime`.
// Generated from the table so CPU and GPU can never drift apart.
export function glslWaveSum() {
  return WAVES.map((w) => {
    const k = TAU / w.len;
    return `${w.amp.toFixed(4)} * sin(${k.toFixed(6)} * (${w.dirX.toFixed(4)} * wx + ${w.dirZ.toFixed(4)} * wz) - ${(k * w.speed).toFixed(6)} * uTime)`;
  }).join('\n      + ');
}
