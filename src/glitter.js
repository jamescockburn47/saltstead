// THE GLITTER PATH — pure module, no THREE, no DOM. verify-glitter.mjs guards
// it. One source of truth for the maths that puts the sun's and the moon's
// road on the water: the GLSL the GPU compiles is EMITTED from here, and the
// JS twins below are the gate's instrument.
//
// ============================ WHY THIS MODULE EXISTS ============================
// The sea shipped with a MIRROR for a sun. The sparkle pass was
// `pow(max(dot(reflect(-V, N), sunDir), 0.0), 260.0)` — half-maximum at 4.18
// degrees in reflection space, so a facet had to stand within 2.09 degrees
// (0.0365 rad) of the exact half-vector to light up at all.
//
// Measure that against the sea it was pointed at. Sea v2's drawn spectrum
// carries an rms slope of 0.0563 rad over both axes at band gain 1 — 0.0398 per
// axis, rising to 0.049 per axis on the working 10 m/s day the game calls an
// ordinary breeze — and a real sea of that state carries 0.164 per axis (see
// COX & MUNK below). The tilt the corridor ASKS for is not zero either: for an
// eye h metres up and a source at elevation e, the facet that throws the light
// into your eye at horizontal range d must stand at
//
//     beta = (e - atan(h/d)) / 2
//
// which is 0 at the source's mirror image (d = h/tan e, about 31 m for a 5.5 m
// eye and a 10 degree sun) and tends to e/2 at the horizon — 0.0873 rad for a
// 10 degree sun. Against a 0.0365 rad mirror that is nothing at all, which is
// why the owner had to hunt for the reflection with the camera.
//
// ============================ THE MODEL ============================
// Cox & Munk (1954) is the honest frame, and it is the right one twice over:
// they derived sea-surface slope statistics FROM SUN GLITTER PHOTOGRAPHS, so
// their numbers are literally a measurement of the thing being drawn here.
//
//  1. THE LOBE IS A SLOPE-SPACE GAUSSIAN, not a power of a cosine. The
//     half-vector is expressed as the facet slope it demands (sx, sy) and the
//     lobe is exp(-(sx^2/2 sigA^2 + sy^2/2 sigB^2)), with Beckmann's cos^-4
//     Jacobian carrying slope space into solid angle. Sigma is a ROUGHNESS, so
//     the corridor's width is a property of the sea state and not of a magic
//     exponent — and it can be, and is, gated for monotonicity.
//
//  2. THE ROUGHNESS IS MOSTLY WAVES NOBODY DRAWS. waves.js stops at a 5.7 m
//     component; a real sea's slope variance lives overwhelmingly in the short
//     gravity and capillary waves below that. Cox & Munk fitted, for wind U m/s,
//         sigma_crosswind^2 = 0.003 + 1.92e-3 U      sigma_upwind^2 = 3.16e-3 U
//     i.e. a per-axis slope sd near 0.09 in light airs, 0.16 at 10 m/s and 0.26
//     in a gale. The drawn spectrum reaches 0.049 at 10 m/s. So the unmodelled
//     remainder is not a rounding, it is nine tenths of the VARIANCE, and a lobe
//     built on the drawn spectrum alone is three times too tight. COX_A/COX_B
//     below are Cox & Munk's own line re-parameterised through weather.js's own
//     wind-to-chop map, and the floor is that line MINUS what the drawn
//     spectrum already carries — nothing invented, nothing double-counted.
//     verify-glitter holds the result against the published fit across the whole
//     sea-state range the weather can produce.
//
//  3. THE CORRIDOR'S SHAPE IS GEOMETRY, and it comes out for free. Numbers from
//     pathValue() itself, for a 5.5 m eye under a 10 degree sun on a working
//     breeze: |beta| stays under 0.6 sigma from 15 m all the way to 4 km, so the
//     whole of that span lights, and the road reads at half its far-field
//     brightness by 18 m and nine tenths by 60 m. A bearing offset, by contrast,
//     is amplified by 1/|V+L| — small at grazing incidence, because V and L
//     nearly cancel — so at 300 m two degrees off the source is already down to
//     0.55, four degrees to 0.09 and six degrees to 0.007. The result is a
//     wedge, in FULL width across: 4.2 m at 31 m, 22.4 m at 300 m, 69.8 m at a
//     kilometre. In ground metres it opens away from the eye; in SCREEN terms it
//     subtends 7.8 degrees close aboard against 4.0 at a kilometre, i.e. a road
//     that widens as it approaches. That is the phenomenon, and no stretching
//     term is needed to fake it. (An earlier draft leaned on slope anisotropy
//     for the elongation. It was wrong: once the capillary floor is honest it
//     dominates, and the anisotropy below is a 5 per cent correction, not the
//     mechanism.)
//
//  4. RESOLUTION IS STILL PART OF THE ROUGHNESS, and it is where what little
//     anisotropy there is comes from. A pixel of sea at grazing incidence does
//     not cover a square of water: it covers `dist * pixelAngle` across the view
//     ray and that divided by sin(grazing) ALONG it — 0.8 m by 87 m at 600 m
//     from a 5.5 m eye. Every drawn component shorter than twice the footprint
//     varies WITHIN the pixel: it is in the drawn normal, aliasing, and belongs
//     in the lobe's width instead (the ordinary specular-antialiasing argument
//     — Toksvig, LEAN). So the lobe is slightly broader along the view ray than
//     across it, and broader still on the plain tier, which does not draw the
//     sub-20 m components at all.
//
//  5. FRESNEL IS WHY A LOW SOURCE IS THE CINEMATIC ONE. Light arriving at a
//     facet near grazing is reflected an order of magnitude more strongly than
//     light arriving near normal (Schlick over water's 0.02). That one term is
//     the difference between a sunset road of fire and a midday shimmer, and it
//     costs three instructions.
//
//  6. THE TAIL. A real sea's slope distribution is not Gaussian — Cox & Munk
//     measured a positive kurtosis, and capillary-covered flanks and breaking
//     faces put facets far out in the wings. A second broad weak lobe carries
//     them. It is what keeps a HIGH sun's sea a sparkle field instead of a dark
//     sheet with one bright spot under the mast.
//
// Nothing here touches the height field. This is shading: waves.js is consulted
// only for its slope STATISTICS, which are read, never written.

import { COMPONENTS, SWELL_LEN, GRAD_BANDS } from './waves.js';

// ---- the drawn sea's own slope statistics, summed from the real table -------
// A component of amplitude a and wavenumber k contributes a slope a*k*cos(phase)
// along its own heading, so its variance is (a k)^2 / 2, and a spread spectrum
// lays that over both horizontal axes. The swell fan is narrow (34 deg) so its
// variance really leans on the swell axis; we split it evenly because the lobe's
// frame is the VIEW's, not the swell's — the one place this model is
// deliberately isotropic, and at 5 per cent of the total it is not a hill worth
// dying on.
const bandVarAxis = (band) => COMPONENTS
  .filter((c) => (c.len >= SWELL_LEN ? 0 : 1) === band)
  .reduce((s, c) => s + 0.25 * (c.amp * c.k) ** 2, 0);

export const GLITTER = {
  // per-axis slope variance at band gain 1 (swell rides uSwellL, wind uSwellS)
  swellVar: bandVarAxis(0),
  windVar: bandVarAxis(1),
  // belowFrac's log-wavelength smoothstep edges, least-squares fitted to the
  // cumulative slope variance of the live spectrum. verify-glitter re-runs the
  // fit against the table and fails if these have drifted from it.
  swellA: 38.70, swellB: 143.46,
  windA: 4.555, windB: 53.13,
  // COX & MUNK's line, per axis, through weather.js's wind->chop map.
  //   their fit:  mean per-axis var = (0.003 + 1.92e-3 U + 3.16e-3 U) / 2
  //   weather.js: chop = 0.5 + 0.055 U   =>   U = (chop - 0.5) / 0.055
  //   hence:      var = 0.046182 * chop - 0.021591
  // Clamped at zero: below chop 0.4674 the line asks for negative variance, so
  // river water (RIVER_STATE 0.018) is left with the drawn spectrum's own slopes
  // and nothing else — 6.0e-4 rad. That is NOT "glass": a lobe that narrow is
  // narrower than the pixel it is drawn into, which is an aliasing bug, not a
  // mirror. sigmaFor takes a pixel-angle floor for exactly that reason (below).
  coxA: -0.021591, coxB: 0.046182,
  // the tail lobe (point 6 above): width multiple and share of the energy
  tailW: 6.0, tailK: 0.075,
  // energy: the same light in a narrower lobe is brighter. Referenced to
  // SIGMA_REF (a working 10 m/s day) so that sea reads about 1 at the heart of
  // the path, and capped so a flat calm cannot produce a nova.
  energyCap: 3.0,
  // the working breeze the energy is referenced to (weather.js seaBandsFor at
  // 10 m/s, well offshore)
  refSwell: 1.54, refChop: 1.05,
  // the corridor's overall brightness, and the ceiling on what one pixel may
  // add to the frame (ACES rolls anything past ~2 off to white anyway).
  // SETTLED BY MEASUREMENT, NOT BY EYE. scripts/live-glitter.mjs reads the
  // brightest 2-degree bearing bucket against the water beside it, range bin by
  // range bin, from the default camera. 1.15 already beat the retired mirror
  // near the ship but sat a few per cent under it in the middle distance, where
  // Phong's own narrow highlight had been doing the work; 1.50 stands at or
  // above it in EVERY bin from 0 to 340 m and lifts the road's coverage from
  // 27.6% of the sunward sector to 43.4%, with the sunward 99th percentile at
  // 226 of 255 — bright, and still short of clipping.
  //
  // TWO HONEST LIMITS ON THAT. The probe pins ONE sea state (swell 1.54, chop
  // 1.05) at ONE place (32N 48W), so 1.50 is tuned for the ordinary offshore day
  // and only bounded — not tuned — anywhere else. And a contrast ratio rises as
  // a corridor saturates, so it cannot by itself say a road is too bright: the
  // two-sided bound lives in verify-glitter (check 6b), which holds the brightest
  // pixel of the road at three sea states inside a window, and the probe now also
  // caps the sunward median and the clipped fraction.
  gain: 1.50, clamp: 3.2,
  // how hard the twinkle noise breaks the corridor into individual glints,
  // near the eye and far off. Contrast only — the mean is preserved, so the
  // corridor's brightness is the lobe's and not the noise's.
  twNear: 0.85, twFar: 0.22, twFade: 320,
  // plain tier keeps this fraction of the path: the lobe is arithmetic, not
  // noise, so the cheap tier can afford the phenomenon even though it cannot
  // afford the twinkle that breaks it into glints. The plain tier also drops
  // every component shorter than GRAD_BANDS.mid from its shading (waves.js
  // oWaveGradShort under uWaveLOD 0), so its lobe has to carry them at every
  // distance: plainCut is the cutoff floor it works at, and it IS that band
  // boundary rather than a number that resembles it.
  plainScale: 0.62, plainCut: GRAD_BANDS.mid,
  // Foam is ROUGH WATER, not matte paint: churn gets at least this per-axis
  // slope sd, which is what makes the Kelvin V take a broad sheen that tracks
  // the source instead of a flat white road that ignores it.
  foamSigma: 0.30,
  // and it scatters. A bubble raft is a dense forward-scattering medium: from
  // the sunward side it is dazzling, from the antisolar side it is merely pale.
  // foamBack is the antisolar floor of that phase function, foamFwd the sunward
  // gain, foamAlbedo the flat white that survives (it was 0.85 of pure white).
  // The 3.5:1 sunward-to-antisolar ratio is what the eye reads as "the wake
  // knows where the sun is"; live-glitter.mjs measures it in pixels.
  foamBack: 0.22, foamFwd: 0.55, foamAlbedo: 0.62,
  // how much the source's ELEVATION matters to that scatter. Not sin(elevation):
  // a raft lit edge-on scatters its light forward, which is exactly why a wake
  // seen into a low sun dazzles. Irradiance falls, the forward lobe does not.
  foamElevFloor: 0.45,
  // foam's other two amputations, restored in part: churn keeps this much of
  // its specular and this much of the sky
  foamSpecKeep: 0.55, foamSkyKeep: 0.45,
  // the view ray's grazing sine is floored here — at the true horizon the
  // along-range footprint diverges, and a 500 m cutoff already saturates both
  // bands, so the floor costs nothing and keeps the arithmetic finite
  minGraze: 0.006, maxFoot: 500,
};

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// How much of a band's slope variance lies BELOW a wavelength cutoff.
// Smoothstep in log-wavelength: the component ladder is geometric, so log is
// the natural coordinate, and the fitted edges are where the band's energy
// starts and stops.
// (the reciprocal is formed FIRST and multiplied, not divided, because the
// emitted GLSL carries 1/log(b/a) as a literal and the parity gate holds the two
// to 1e-12 — a division here and a multiplication there disagree in the last
// bits, which is exactly the kind of difference the gate exists to notice.)
export function belowFrac(lamC, a, b) {
  const invLog = 1 / Math.log(b / a);
  const x = clamp01(Math.log(Math.max(lamC, 1e-3) / a) * invLog);
  return x * x * (3 - 2 * x);
}

// Cox & Munk's total per-axis slope variance for a wind-sea band gain.
export function coxMunkVar(chopG) {
  return Math.max(0, GLITTER.coxA + GLITTER.coxB * chopG);
}

// The per-axis slope sd the lobe must carry at a pixel that cannot resolve
// anything shorter than lamC. swellG/chopG are the two band gains (the shader's
// uSwellL / uSwellS). `floor` is the smallest sd the lobe is allowed — the
// shader passes half the pixel's angular size, because a lobe narrower than the
// pixel it is drawn into is not a sharper reflection, it is an aliased one (the
// same specular-antialiasing argument as the footprint term). Without it river
// water, where Cox & Munk's line clamps to zero, gets a 6e-4 rad lobe: 0.03 of a
// pixel wide, so nothing ever lands in it and inland water has no sun road at
// all.
//
// At lamC -> infinity this returns Cox & Munk's sd WHENEVER their line exceeds
// what the drawn spectrum carries, which is every sea state the weather can
// produce (chop >= 0.55 with the swell band tied to the same wind). It is not an
// identity in general: force a big swell onto flat-calm chop — swell 2.4, chop
// 0 — and the drawn spectrum alone gives 0.0523 against a Cox & Munk line of 0,
// because the clamp cannot subtract what is not there.
export function sigmaFor(lamC, swellG, chopG, floor = 0) {
  const G = GLITTER;
  const sw = swellG * swellG * G.swellVar, wd = chopG * chopG * G.windVar;
  const unmodelled = Math.max(0, coxMunkVar(chopG) - sw - wd);
  const v = unmodelled
    + sw * belowFrac(lamC, G.swellA, G.swellB)
    + wd * belowFrac(lamC, G.windA, G.windB);
  return Math.sqrt(Math.max(v, floor * floor, 1e-9));
}

// the working breeze's fully unresolved sd: the energy datum
export const SIGMA_REF = sigmaFor(1e9, GLITTER.refSwell, GLITTER.refChop);

// The pixel's world footprint on the water, in metres: across the view ray and
// along it. pixA is the angular size of one pixel (2 tan(fovY/2) / height);
// graze is the view ray's vertical component at the surface (|V.y|).
export function footprint(dist, graze, pixA) {
  const across = Math.max(dist, 0.1) * pixA;
  const along = Math.min(GLITTER.maxFoot, across / Math.max(graze, GLITTER.minGraze));
  return { across, along };
}

// The lobe. h is the half-vector in the surface's (along-range, across-range,
// up) frame — so h.z is cos(facet tilt) and h.xy/h.z are the slopes demanded.
// Returns a radiance factor: 1 is "the heart of a working sea's path".
//
// THE EXPRESSION FORMS HERE ARE THE EMITTED SHADER'S, TERM FOR TERM AND IN THE
// SAME ORDER. verify-glitter transliterates glslGlitter()'s own text into JS and
// holds the two to 1e-12, so a shuffled operand or a folded constant would show
// up as a numeric difference rather than as nothing at all. Keep them identical.
// (The tail's energy carried a min() against energyCap until it was measured:
// the argument is e/tailW^2 <= 3.0/36 = 0.083, so the cap could never bind and
// the min was dead code in both twins. Removed from both together.)
export function lobe(hAlong, hAcross, hUp, sigA, sigB) {
  const G = GLITTER;
  const up = Math.max(hUp, 1e-3);
  const sx = hAlong / up, sy = hAcross / up;
  const q = (sx * sx) / (sigA * sigA) + (sy * sy) / (sigB * sigB);
  const up2 = up * up;
  const j = 1 / (up2 * up2);
  const e = Math.min(G.energyCap, (SIGMA_REF * SIGMA_REF) / (sigA * sigB));
  const w = G.tailW * G.tailW;
  const core = Math.exp(-0.5 * q) * e;
  const tail = Math.exp(-0.5 * q / w) * G.tailK * (e / w);
  return (core + tail) * j;
}

// Schlick over water: the reason a low source is the cinematic one. c is the
// cosine of the angle between the half-vector and the light — the incidence
// angle on the facet itself.
export function fresnelWater(c) {
  const m = clamp01(1 - c);
  const m2 = m * m;
  return 0.02 + 0.98 * m2 * m2 * m;
}

// ---- the whole phenomenon, once, for the gate and for reasoning ------------
// eyeH: eye height over the mean surface; dist: horizontal range to the water
// sample; elev: source elevation (rad); bearing: horizontal angle between the
// sample's down-range direction and the source's azimuth (0 = looking straight
// at it). This is the closed form of what the shader computes per pixel, over a
// flat mean surface, and the gate drives it to prove the corridor is a corridor.
export function pathValue(eyeH, dist, elev, bearing, swellG, chopG, pixA) {
  const d = Math.max(dist, 0.5);
  const dep = Math.atan2(eyeH, d);            // the view ray's depression
  const graze = Math.sin(dep);
  const f = footprint(d, graze, pixA);
  const flr = pixA * 0.5;                     // the shader's own pixel floor
  const sigA = sigmaFor(2 * f.along, swellG, chopG, flr);
  const sigB = sigmaFor(2 * f.across, swellG, chopG, flr);
  // V: surface -> eye. Down-range is -x, so the eye lies at +x.
  const V = [Math.cos(dep), graze, 0];
  // L: surface -> source, `bearing` off the down-range direction
  const cl = Math.cos(elev);
  const L = [-cl * Math.cos(bearing), Math.sin(elev), -cl * Math.sin(bearing)];
  let H = [V[0] + L[0], V[1] + L[1], V[2] + L[2]];
  const hn = Math.hypot(...H) || 1;
  H = H.map((v) => v / hn);
  // the frame: up = (0,1,0), along-range = -x, across-range = -z
  const val = lobe(-H[0], -H[2], H[1], sigA, sigB);
  const c = H[0] * L[0] + H[1] * L[1] + H[2] * L[2];
  return { val, lit: val * fresnelWater(c), sigA, sigB, graze, foot: f, beta: (elev - dep) / 2 };
}

// ---- the GLSL the ocean shader inlines -------------------------------------
// Every number comes from GLITTER above, and every EXPRESSION is the twin's,
// term for term and in the same order — because verify-glitter transliterates
// the text below into JS and holds it against the functions above to 1e-12.
// That is what "cannot drift" means here: not just the constants, the
// arithmetic. Two consequences for anyone editing this:
//   - literals are emitted at 17 significant digits (glslNum), so the shader's
//     number IS the module's number in float64 and the parity margin is not
//     spent on rounding. The GPU will truncate to float32 at compile time; that
//     is its business, and the float32 headroom is checked separately.
//   - do not "tidy" an expression on one side only. exp(-0.5 * q / w) here and
//     Math.exp(-0.5 * q / w) there agree bit for bit; folding -0.5/w into a
//     constant does not, and the gate will say so.
// Names are oGl-prefixed against chunk collisions, matching ocean.js's own
// o-prefix convention.
export function glslGlitter() {
  const G = GLITTER;
  // a GLSL-legal float literal that round-trips exactly in float64
  const n = (v) => {
    const s = Number(v).toPrecision(17);
    return /[.eE]/.test(s) ? s : `${s}.0`;
  };
  return /* glsl */`
float oGlBelow(float lamC, float a, float invLog) {
  float x = clamp(log(max(lamC, 1e-3) / a) * invLog, 0.0, 1.0);
  return x * x * (3.0 - 2.0 * x);
}
// per-axis slope sd at a pixel that cannot resolve anything shorter than lamC.
// floor is the smallest sd allowed — the shader hands it half a pixel's angle.
float oGlSigma(float lamC, float swellG, float chopG, float floorSd) {
  float sw = swellG * swellG * ${n(G.swellVar)};
  float wd = chopG * chopG * ${n(G.windVar)};
  float un = max(0.0, ${n(G.coxA)} + ${n(G.coxB)} * chopG - sw - wd);
  float v = un
    + sw * oGlBelow(lamC, ${n(G.swellA)}, ${n(1 / Math.log(G.swellB / G.swellA))})
    + wd * oGlBelow(lamC, ${n(G.windA)}, ${n(1 / Math.log(G.windB / G.windA))});
  return sqrt(max(max(v, floorSd * floorSd), 1e-9));
}
float oGlLobe(vec3 h, float sigA, float sigB) {
  float up = max(h.z, 1e-3);
  float sx = h.x / up, sy = h.y / up;
  float q = (sx * sx) / (sigA * sigA) + (sy * sy) / (sigB * sigB);
  float up2 = up * up;
  float j = 1.0 / (up2 * up2);
  float e = min(${n(G.energyCap)}, ${n(SIGMA_REF * SIGMA_REF)} / (sigA * sigB));
  float w = ${n(G.tailW)} * ${n(G.tailW)};
  float core = exp(-0.5 * q) * e;
  float tail = exp(-0.5 * q / w) * ${n(G.tailK)} * (e / w);
  return (core + tail) * j;
}
float oGlFresnel(float c) {
  float m = clamp(1.0 - c, 0.0, 1.0);
  float m2 = m * m;
  return 0.02 + 0.98 * m2 * m2 * m;
}
// the pixel's world footprint on the water: across the view ray, then along it
vec2 oGlFoot(float dist, float graze, float pixA) {
  float across = max(dist, 0.1) * pixA;
  return vec2(across, min(${n(G.maxFoot)}, across / max(graze, ${n(G.minGraze)})));
}`;
}
