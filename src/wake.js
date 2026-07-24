// The Kelvin wake — pure, no THREE, no DOM. verify-wake.mjs guards it.
//
// A moving hull drags a wave pattern that is STATIC in the hull's frame:
// transverse crests astern spaced by the hull speed, feathered divergent
// arms along the ~19.5° Kelvin V. This module is the ONE source of truth
// for that pattern: `wakeBody(decl)` emits the maths as a template that is
// valid GLSL (decl='float') AND valid JS (decl='let'), the ocean shader
// displaces with the GLSL side, `wakeEval` below is the hand-written CPU
// twin (buoyancy-adjacent consumers: foam patches ride the humps), and the
// verify script compiles the template as JS and asserts the twins agree —
// the wake the eye sees is the wake the foam rides.
//
// Deliberate simplifications, stated honestly:
//  - the pattern re-aims instantly with the ship's CURRENT heading (no
//    track history); the world-anchored foam trail (foam.js) carries the
//    memory of a turn.
//  - hulls do not FEEL wakes (shipphysics samples waveHeight only). The
//    fade-in over the first metres astern means a ship never stands on her
//    own wake; another hull crossing a wake at ≤0.3 m amplitude reads fine.

export const WAKE_MAX = 4;        // uniform slots in the ocean shader
export const WAKE_MIN_SPEED = 1.3; // below this a hull throws no wake (m/s)
export const WAKE_RANGE = 240;    // metres: cull sources beyond this

// The shared maths. Inputs in scope: px, pz (sample point), sx, sz (source),
// fx, fz (unit forward), spd. Defines wY (height, metres) and wF (foam churn
// 0..1). Only scalar ops that exist in both GLSL and JS (the verify script
// shims smoothstep/clamp for the JS side).
export function wakeBody(d) {
  return `
${d} dx = px - sx;
${d} dz = pz - sz;
${d} b = -(dx * fx + dz * fz);
${d} l = dx * fz - dz * fx;
${d} bp = max(b, 0.0);
${d} spdK = min(1.0, max(0.0, spd - ${WAKE_MIN_SPEED.toFixed(1)}));
${d} u = min(spd, 9.0);
${d} lam = clamp(0.35 * u * u, 7.0, 30.0);
${d} k = 6.2831853 / lam;
${d} halfW = 2.0 + b * 0.36397;
${d} fadeIn = smoothstep(0.0, 6.0, b);
${d} dec = exp(-bp * 0.012);
${d} amp = min(0.42, 0.032 * u * u) * spdK;
${d} envL = 1.0 - smoothstep(halfW * 0.7, halfW + 3.0, abs(l));
${d} trans = cos(k * b) * envL;
${d} armD = abs(l) - halfW * 0.85;
${d} r = sqrt(b * b + l * l);
${d} armWave = cos(k * 1.35 * r);
${d} arm = exp(-armD * armD * 0.14) * armWave;
${d} wY = amp * fadeIn * dec * (0.45 * trans + 1.1 * arm);
${d} fW = 1.0 + b * 0.045 + u * 0.10;
${d} fDec = exp(-bp * 0.018);
${d} fIn = smoothstep(-1.0, 2.5, b);
${d} wFc = fIn * fDec * (1.0 - smoothstep(fW * 0.55, fW, abs(l)));
${d} wFa = exp(-armD * armD * 0.20) * fDec * max(0.0, armWave) * 0.9 * smoothstep(1.0, 6.0, b);
${d} wFt = pow(max(0.0, cos(k * b)), 3.0) * envL * fDec * 0.3 * smoothstep(6.0, 14.0, b);
${d} wF = clamp((wFc + wFa + wFt) * spdK * 0.8, 0.0, 1.0);`;
}

// The GLSL side: one function, height in .x and foam churn in .y, plus the
// summing loop over the uniform slots (speed 0 marks an empty slot).
export function glslWake() {
  return `
vec2 wakeHF(vec2 p, vec4 sf, float spd) {
  if (spd < ${WAKE_MIN_SPEED.toFixed(2)}) return vec2(0.0);
  float px = p.x; float pz = p.y;
  float sx = sf.x; float sz = sf.y; float fx = sf.z; float fz = sf.w;
${wakeBody('  float')}
  return vec2(wY, wF);
}
vec2 wakeSumHF(vec2 p) {
  vec2 s = vec2(0.0);
  for (int i = 0; i < ${WAKE_MAX}; i++) s += wakeHF(p, uWakeSrc[i], uWakeSpd[i]);
  return vec2(s.x, min(s.y, 1.0));
}`;
}

// ---- the CPU twin ----------------------------------------------------------
const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

// src: { x, z, fx, fz, speed } with (fx, fz) the unit forward vector.
// Returns { h, f } — identical maths to wakeBody (verify-wake.mjs proves it).
export function wakeEval(px, pz, src) {
  const spd = src.speed;
  if (spd < WAKE_MIN_SPEED) return { h: 0, f: 0 };
  const dx = px - src.x, dz = pz - src.z;
  const b = -(dx * src.fx + dz * src.fz);
  const l = dx * src.fz - dz * src.fx;
  const bp = Math.max(b, 0);
  const spdK = Math.min(1, Math.max(0, spd - WAKE_MIN_SPEED));
  const u = Math.min(spd, 9);
  const lam = Math.min(30, Math.max(7, 0.35 * u * u));
  const k = 6.2831853 / lam;
  const halfW = 2.0 + b * 0.36397;
  const fadeIn = smoothstep(0, 6, b);
  const dec = Math.exp(-bp * 0.012);
  const amp = Math.min(0.42, 0.032 * u * u) * spdK;
  const envL = 1 - smoothstep(halfW * 0.7, halfW + 3, Math.abs(l));
  const trans = Math.cos(k * b) * envL;
  const armD = Math.abs(l) - halfW * 0.85;
  const r = Math.sqrt(b * b + l * l);
  const armWave = Math.cos(k * 1.35 * r);
  const arm = Math.exp(-armD * armD * 0.14) * armWave;
  const h = amp * fadeIn * dec * (0.45 * trans + 1.1 * arm);
  const fW = 1.0 + b * 0.045 + u * 0.10;
  const fDec = Math.exp(-bp * 0.018);
  const fIn = smoothstep(-1, 2.5, b);
  const wFc = fIn * fDec * (1 - smoothstep(fW * 0.55, fW, Math.abs(l)));
  const wFa = Math.exp(-armD * armD * 0.20) * fDec * Math.max(0, armWave) * 0.9 * smoothstep(1, 6, b);
  const wFt = Math.max(0, Math.cos(k * b)) ** 3 * envL * fDec * 0.3 * smoothstep(6, 14, b);
  return { h, f: Math.min(1, Math.max(0, (wFc + wFa + wFt) * spdK * 0.8)) };
}

// Total wake height at (px, pz) — what scene layers add to waveHeight so
// foam patches and flotsam ride the humps the shader draws.
export function wakeSum(px, pz, sources) {
  let h = 0;
  if (sources) for (const s of sources) h += wakeEval(px, pz, s).h;
  return h;
}
