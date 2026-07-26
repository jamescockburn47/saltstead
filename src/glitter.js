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
// ================== AND THE ROAD IS MADE OF SEPARATE GLINTS ==================
// (2026-07-26, second pass — the regression the owner caught.)
//
// Everything above is a MEAN. It is the right mean, and it was measured against
// photographs; and a mean is not what the eye sees. Sun glitter is thousands of
// INDEPENDENT BINARY EVENTS — a facet either throws the whole disc of the sun at
// you or it throws none of it — and the picture that makes is small, hard, sparse
// and very high contrast. The lobe alone draws the ensemble average of that,
// which is a soft continuous smear: a searchlight beam painted on the water.
// That is what 08-glitter-sun-road-low-sun.png showed, and the first attempt to
// cure it (a thresholded noise lattice MULTIPLIED onto the smooth lobe) was
// texture, not geometry — the field's duty was a constant, so it knew nothing
// about where the light was or which way the water was facing, and it still read
// as blobs.
//
// THE SPLIT. A pixel's reflection is the sum over the facets it covers, and
// those facets come in two populations that the model must keep apart:
//
//   RESOLVED   — the drawn surface. The fragment shader already computes its
//                normal EXACTLY, per pixel, from the closed-form wave gradient
//                plus the detail bands. Against that normal a near-MIRROR is
//                legitimate, because the geometry is genuinely known: the pixel
//                either satisfies the reflection condition or it does not.
//   UNRESOLVED — everything shorter than the pixel's own footprint, plus the
//                capillary sea nobody draws. Only its STATISTICS are known, so
//                it can only be a lobe.
//
// So: the CORRIDOR is `lobe` at the FULL Cox & Munk width, evaluated over the
// MEAN surface — it decides where on the water the road can be at all, how wide
// it is, and how it opens with sea state and range, which is exactly the part
// 68e8eae got right and which a mirror provably cannot draw (a 10 degree sun
// asks for 5 degrees of facet tilt at the horizon; the retired pow(...,260) was
// half-maximum at 2.09). INSIDE it, the light is placed by `glint` — the same
// reflection taken against the exact drawn normal at the hardness the retired
// mirror had, and NORMALISED so that its expectation over the sea's own slope
// statistics is exactly 1. The corridor's mean brightness is therefore still the
// lobe's, by construction and not by a measured duty constant; what changed is
// that the light is now delivered in separate hard hits instead of spread evenly.
//
// WHY THE GLINT IS ALLOWED TO BE HARD, AND WHERE IT SOFTENS. The width of the
// glint lobe is the honest anti-aliasing bound and nothing else:
//     sigma_g^2 = glintSigma^2 + (drawn spectrum BELOW this pixel's footprint)
//                 + (half the pixel's own angular size)^2
// Close aboard the middle term is nothing, so the glint is as hard as the mirror
// was — and it does not alias, because the lit set of a two-component slope
// condition is a set of ISOLATED POINTS on the surface, each a fraction of a
// metre across, not a curve. Down the road the footprint swallows the spectrum,
// sigma_g overtakes what is left of the resolved slope, the normalisation runs to
// 1 and the road returns smoothly to the smooth lobe — which is what a real road
// does at the horizon, for the same reason.
//
// ONE APPROXIMATION, STATED. The drawn spectrum carries under a third of a real
// sea's slope sd (point 2 above), so on a strict reading only that share of the
// glitter can be placed geometrically and the rest would have to stay smooth.
// The stand-in is deliberate: the resolved surface carries the discreteness of
// the whole facet population, because the alternative is a smooth road, and a
// smooth road is a worse lie about what the sea looks like than a glint field
// whose glints sit on the drawn waves rather than on capillaries nobody can
// afford to draw. glintFloor is the share left smooth.
//
// Nothing here touches the height field. This is shading: waves.js is consulted
// only for its slope STATISTICS, which are read, never written.

import { COMPONENTS, SWELL_LEN, GRAD_BANDS } from './waves.js';

// THE RETIRED MIRROR'S OWN WIDTH, recovered as a slope-space sigma. The sparkle
// pass that shipped before 68e8eae was pow(max(dot(reflect(-V,N), sun), 0), 260):
// half-maximum at acos(0.5^(1/260)) = 4.182 deg in reflection space, so 2.091 deg
// of facet tilt, and a Gaussian is half-maximum at sqrt(2 ln 2) sigma. That term
// could not draw the corridor — but it IS the term the owner recognised as
// glitter, so it is what the glint's hardness is pinned to rather than a number
// chosen by eye. (The physical floor is far tighter still: the sun and the moon
// both subtend about 0.53 deg, which is a facet-slope sigma of 0.0012 — 27 times
// narrower. A lobe that tight would be a genuine mirror and would put every
// glint inside a single pixel, which is the aliasing the footprint term exists
// to prevent; there is no need to go there to get hard sparks.)
export const MIRROR_EXP = 260;
const MIRROR_SIGMA = Math.acos(0.5 ** (1 / MIRROR_EXP)) / 2 / Math.sqrt(2 * Math.LN2);

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
  gain: 1.90, clamp: 3.2,
  // ---- THE GLINT (2026-07-26, second pass) ---------------------------------
  // The hardness of one reflection off the RESOLVED surface, as a slope-space
  // sigma. It is the ONE taste in this file and it is stated as one — it sets
  // how big a drawn glint is and nothing else depends on it — but it is BRACKETED
  // at both ends by things that are not tastes at all:
  //
  //   FLOOR   the source's own angular radius. The sun and the moon both subtend
  //           about 0.53 degrees, which is a facet-slope sigma of 0.00116. Below
  //           that the model would be claiming to resolve the disc itself, and
  //           every glint would land inside one pixel — the aliasing the whole
  //           footprint apparatus exists to prevent. 0.014 is twelve times it.
  //   CEILING MIRROR_SIGMA, the retired pow(...,260) — 0.0310. A glint's drawn
  //           size on the water is sigma divided by how fast the surface's slope
  //           changes across it, and the drawn sea's finest shading structure is
  //           the 0.74 m detail lattice, so at the ceiling a glint comes out
  //           about a metre across: sixty pixels at fifteen metres, which is a
  //           soft blob and not a spark. Shot in the browser at 0.028 and at
  //           0.014 on the identical staged frame; 0.014 is the one that reads as
  //           glitter.
  //
  // verify-glitter MEASURES the drawn glint's size in pixels over a real stretch
  // of water rather than trusting either bound — the same discipline the retired
  // noise lattice's pixel ladder had, on a geometric quantity instead of a
  // lattice constant.
  glintSigma: 0.018,
  // ...and the share of the corridor that stays SMOOTH between them. This is
  // where the approximation in the header is paid for: the drawn spectrum cannot
  // honestly place every facet, so a floor of the corridor's light is left as the
  // lobe drew it and the rest is delivered as hits. floor + (1 - floor) * E[hit]
  // = 1 by construction, so the mean is preserved at any range and at any sea
  // state without a measured duty constant anywhere. It is also what keeps a road
  // a ROAD: at 0.22 the corridor's flanks went to black between glints and the
  // phenomenon read as sparks scattered on empty water.
  glintFloor: 0.50,
  // THE SHADING DETAIL BANDS CARRY SLOPE TOO, and the normalisation has to know
  // about it or the road runs bright close aboard, where the bands are strongest.
  // This is the per-axis slope sd of ocean.js's FINE detail construction at unit
  // amplitude — fbm(p * 1.35) * 0.55 + fbm(p * 0.42) * 0.45, differenced over
  // 0.35 m, which is that block term for term. MEASURED from oceannoise's own
  // float64 twin; verify-glitter re-measures it and fails if it has drifted.
  // (The broad far-field band's own figure is 0.0082 at unit amplitude, i.e.
  // 0.0005 rad once its 0.065 amplitude is applied against the fine band's
  // 0.0315 — a rounding, and it is left out rather than carried.)
  detailSd: 0.19207,
  // plain tier keeps this fraction of the path: the whole of it — corridor AND
  // glints — is arithmetic now, two exponentials and a square root with not one
  // noise read in it, so the cheap tier gets the phenomenon entire. What it does
  // not get is the DENSITY, because it draws no detail bands and no sub-20 m
  // components, so its resolved surface is smoother and its glints are fewer and
  // broader. That is a resolution difference and not a switch.
  // The plain tier also drops
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

  // ---- THE RAFT HAS A SHAPE (2026-07-26, from the v2 showcase) ------------
  // 03-crest-gale-downwind-breaking.png shows whitecaps as flat white decals:
  // no relief, no bright tumbling head, no dissipating tail, no relationship to
  // the wave face they sit on. The break field already knows all of it — its
  // window is asymmetric about the crest (lead 0.50, front 1.05, trail 2.10),
  // so waves.js breakAge reads 0 at the head and 1 at the spent end — and the
  // shader was throwing that coordinate away. These four numbers spend it.
  //
  //  foamShred  how much of a SPENT raft the lace may punch out. A tumbling head
  //             is dense water and admits almost none; the sheet the crest has
  //             left behind is thin and full of holes, and that contrast IS the
  //             difference between a torn-paper decal and breaking water.
  //  foamThin   how white the spent tail draws against the head.
  //  foamRelief the raft's own bumpiness, as a slope added to the shading
  //             normal. Foam is a bubble raft, not a decal on a plane.
  //  foamFlat   and how far the raft's MACRO normal is levelled toward vertical.
  //             This is the fix for the measured defect that the hardest-breaking
  //             water rendered DARKER than unbroken water (117 luminance counts
  //             against 122): the steepest forward face is the facet tilted
  //             furthest from the sky, and foam keeps only foamSkyKeep of the sky
  //             reflection, so geometry was cancelling the whitening. A raft of
  //             bubbles is a DIFFUSE scatterer — its radiance barely depends on
  //             the slope of the water under it — so levelling the macro normal
  //             inside foam is not a cheat, it is the physics the flat-albedo
  //             model was missing.
  foamShred: 0.85, foamThin: 0.62, foamRelief: 0.55, foamFlat: 0.80,
  // AND THE RAFT KEEPS THICKENING AFTER IT HAS STOPPED GETTING WIDER. breakFoam
  // is min(1, 3b), so the drawn opacity saturates at b = 1/3 — a third of the
  // way up a field that reaches 1. Past that point nothing about the picture
  // changed with break strength except the facet's own tilt, and the tilt runs
  // the WRONG way, so the very hardest-breaking water could still come out
  // darker than water breaking half as hard. It is also just false: past
  // optical thickness a breaker does not stop piling up bubbles, it piles up
  // DEEPER ones, and a deeper raft scatters more of the light that enters it
  // back out. So the raft's own radiance carries a thickness term over exactly
  // the span where the opacity has nothing left to say.
  foamThick: 0.60, raft0: 0.34, raft1: 0.80,
  // THE LACE'S OWN SCALE. The churn rag runs at 1.9 per metre — a 0.526 m cell,
  // which is lace at 30 m and a chain of half-metre HOLES at three (one cell
  // covers about 130 px there, and the fbm's minima sit at 0.40 of its peak).
  // That was the showcase's near-field defect. Two levers, both driven by the
  // pixel's own footprint, both reusing oGlFoot: cross-fade to a finer lattice,
  // and taper the lace's CONTRAST as the cell is magnified, because a magnified
  // octave is standing in for structure the medium does not have at that scale.
  // ragNear is held at 4 per metre by verify-oceannoise's own float32 bound.
  ragFar: 1.9, ragNear: 4.0,
  ragPx0: 22, ragPx1: 78,   // px per far cell: where the cross-fade runs
  ragMagKeep: 0.42,         // contrast left at full magnification
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

// The CORRIDOR'S own width: the same line with nothing resolved at all, i.e.
// Cox & Munk's full per-axis sd (or the drawn spectrum's, on the one contrived
// state where that is larger). It is what sigmaFor returns as lamC -> infinity,
// written out so the shader does not pay two logarithms for a smoothstep whose
// answer is 1. This is the width of the ENVELOPE — the average over the whole
// facet population, resolved and unresolved together — and it is a property of
// the sea and not of the camera, which is why no footprint enters it.
export function sigmaFull(swellG, chopG) {
  const G = GLITTER;
  const drawn = swellG * swellG * G.swellVar + chopG * chopG * G.windVar;
  return Math.sqrt(Math.max(coxMunkVar(chopG), drawn, 1e-9));
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
// `glint` is the contrast factor from the RESOLVED surface (see glintOf below).
// The mean-field value — the corridor as the statistics draw it, with nothing
// placed geometrically — is glint = 1, and that is what pathValue evaluates.
// The glints ride the CORE only: the tail is the non-Gaussian wings, which are
// multiply-scattered light off facets far out in slope space, and those are
// genuinely a smooth sheen rather than a set of separate hits.
export function lobe(hAlong, hAcross, hUp, sigA, sigB, glint = 1) {
  const G = GLITTER;
  const up = Math.max(hUp, 1e-3);
  const sx = hAlong / up, sy = hAcross / up;
  const q = (sx * sx) / (sigA * sigA) + (sy * sy) / (sigB * sigB);
  const up2 = up * up;
  const j = 1 / (up2 * up2);
  const e = Math.min(G.energyCap, (SIGMA_REF * SIGMA_REF) / (sigA * sigB));
  const w = G.tailW * G.tailW;
  const core = Math.exp(-0.5 * q) * e * glint;
  const tail = Math.exp(-0.5 * q / w) * G.tailK * (e / w);
  return (core + tail) * j;
}

// ---- THE GLINT --------------------------------------------------------------
// The corridor's envelope is `lobe` above, at sigmaFull, over the MEAN surface.
// What follows is what the envelope is filled WITH: a mirror taken against the
// exact drawn normal, normalised so its expectation over the sea's own slope
// statistics is 1. verify-glitter runs this arithmetic against the emitted GLSL
// exactly as it runs the lobe's.

// The two numbers a pixel needs about the drawn surface, from one pair of
// belowFrac evaluations because they are complements of each other:
//
//   [0] sigG   the GLINT lobe's width — the drawn spectrum this pixel CANNOT
//              resolve, plus the mirror's own hardness, floored by half the
//              pixel's angular size. This is the anti-aliasing bound and the
//              only thing that softens the glint with range.
//   [1] resVar the per-axis slope VARIANCE the shading normal actually carries:
//              the drawn spectrum this pixel CAN resolve, plus detVar, which is
//              whatever the shading detail bands add at this pixel (ocean.js
//              accumulates it from their own live amplitudes — it fades with
//              range and stands down on the plain tier, both automatically).
//
// Returned as a pair rather than computed twice: the caller needs both, per axis,
// and the two logarithms are the expensive part.
export function glintSplit(lamC, swellG, chopG, floorSd, detVar) {
  const G = GLITTER;
  const sw = swellG * swellG * G.swellVar, wd = chopG * chopG * G.windVar;
  const below = sw * belowFrac(lamC, G.swellA, G.swellB)
    + wd * belowFrac(lamC, G.windA, G.windB);
  const sg = Math.sqrt(Math.max(below + G.glintSigma * G.glintSigma,
    floorSd * floorSd, 1e-9));
  return [sg, Math.max(0, sw + wd - below) + detVar];
}

// THE GLINT ITSELF, and the whole of the appearance claim is in three lines.
// `h` is the half-vector in the DRAWN normal's own frame, so h.xy/h.z is the
// RESIDUAL slope: what the unresolved facets are being asked for after the drawn
// water has supplied what it can. `m` is the same half-vector in the MEAN
// surface's frame, so m.xy/m.z is the slope the corridor demands of the water
// here at all. A hard Gaussian on the residual is 1 where the drawn water happens
// to face the source and 0 a few centimetres away, and the set where a
// TWO-component condition holds is a set of ISOLATED POINTS: hard, separate,
// high-contrast hits, which is what glitter is.
//
// AND THE DRAWN SURFACE IS STRETCHED TO STAND FOR THE WHOLE FACET POPULATION.
// This is the approximation named in the header, and here is its arithmetic.
// The drawn spectrum's slope sd is `a = sqrt(resVar) / sigmaFull` of the real
// sea's — about a third — so a residual taken at face value can only ever light
// the corridor's SPINE: past two or three times 0.07 rad the drawn water simply
// never faces the right way, and the road collapses to a thin line of glints
// with a dark corridor around it (measured: the drawn road came out 0.37 of the
// envelope's own width). So the surface is asked to supply only its own SHARE of
// the demanded slope — the residual becomes u + (a - 1) m, which is
// `a * m - s_drawn` written in the terms the shader has — and the glints then
// reach across the corridor instead of hugging its axis (0.74 of the envelope's
// width, and the remaining narrowing is the phenomenon: a road really is densest
// under the source and thins outward).
//
// Note what does NOT change: at the corridor's heart m is zero and the term
// vanishes, and when the footprint has swallowed the spectrum resVar goes to zero
// so a goes to zero, the residual goes to the resolved slope alone, and it goes to
// zero with it. The glint softens to the smooth lobe at range on its own.
//
// The divisor is the Gaussian's own expectation over the resolved slope's
// distribution, per axis
//     E[exp(-s^2 / 2 sigG^2)],  s ~ N(0, resVar)  =  sigG / sqrt(sigG^2 + resVar)
// so floor + (1 - floor) * E[glint] = 1 EXACTLY, at every range and every sea
// state, with no measured duty constant and nothing tuned.
export function glintOf(hAlong, hAcross, hUp, mAlong, mAcross, mUp,
  sigA, resA, sigB, resB, sigE) {
  const G = GLITTER;
  const up = Math.max(hUp, 1e-3), mup = Math.max(mUp, 1e-3);
  const kA = Math.sqrt(resA) / Math.max(sigE, 1e-6) - 1;
  const kB = Math.sqrt(resB) / Math.max(sigE, 1e-6) - 1;
  const sx = hAlong / up + kA * (mAlong / mup);
  const sy = hAcross / up + kB * (mAcross / mup);
  const q = (sx * sx) / (sigA * sigA) + (sy * sy) / (sigB * sigB);
  const d = Math.sqrt((sigA * sigA) / (sigA * sigA + resA)
    * ((sigB * sigB) / (sigB * sigB + resB)));
  return G.glintFloor + (1 - G.glintFloor) * Math.exp(-0.5 * q) / Math.max(d, 1e-4);
}

// ---- THE RAFT ---------------------------------------------------------------
// How much of the far lace has been magnified past its useful scale: 0 at
// ordinary range, 1 close aboard. `footA` is the pixel's across-range footprint
// (oGlFoot's first component) and the numerator is one cell of the far lattice.
export function ragNearness(footA) {
  const G = GLITTER;
  const px = 1 / G.ragFar / Math.max(footA, 1e-5);
  const x = clamp01((px - G.ragPx0) / (G.ragPx1 - G.ragPx0));
  return x * x * (3 - 2 * x);
}
// the lace, composed: cross-faded onto the finer lattice and tapered in
// contrast, both by the same lever. `far`/`near` are the two fbm samples.
export function ragOf(far, near, w) {
  const m = mix(far, near, w) - 0.469;      // oFbm's own mean (verify-oceannoise)
  return 0.469 + m * mix(1, GLITTER.ragMagKeep, w);
}
// what the lace does to a raft of a given age: nothing to a tumbling head,
// holes to a spent tail
export function shredOf(rag, age) {
  return 1 - GLITTER.foamShred * age * (1 - rag);
}
// and how white that raft draws
export function thickOf(age) { return mix(1, GLITTER.foamThin, age); }
// the raft's DEPTH, over the span where its opacity has already saturated: 1 up
// to raft0, climbing to 1 + foamThick by raft1. This is what keeps the hardest-
// breaking water the whitest water in the frame.
export function raftOf(brk) {
  const x = clamp01((brk - GLITTER.raft0) / (GLITTER.raft1 - GLITTER.raft0));
  return 1 + GLITTER.foamThick * x * x * (3 - 2 * x);
}

function mix(a, b, t) { return a + (b - a) * t; }

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
// at it). This is the closed form of what the shader computes per pixel over a
// flat mean surface — which, since E[glint] = 1 by construction, is exactly the
// EXPECTATION of what the shader draws over a real one. The gate drives it to
// prove the corridor is a corridor; the glint field's own appearance is proved
// separately (verify-glitter section 8), because a mean cannot see it.
//
// sigA/sigB are returned as the GLINT's widths, since the envelope's is a single
// isotropic number (sigmaFull) that no longer depends on the camera at all.
export function pathValue(eyeH, dist, elev, bearing, swellG, chopG, pixA) {
  const d = Math.max(dist, 0.5);
  const dep = Math.atan2(eyeH, d);            // the view ray's depression
  const graze = Math.sin(dep);
  const f = footprint(d, graze, pixA);
  const flr = pixA * 0.5;                     // the shader's own pixel floor
  const sigE = sigmaFull(swellG, chopG);
  const [sigA, resA] = glintSplit(2 * f.along, swellG, chopG, flr, 0);
  const [sigB, resB] = glintSplit(2 * f.across, swellG, chopG, flr, 0);
  // V: surface -> eye. Down-range is -x, so the eye lies at +x.
  const V = [Math.cos(dep), graze, 0];
  // L: surface -> source, `bearing` off the down-range direction
  const cl = Math.cos(elev);
  const L = [-cl * Math.cos(bearing), Math.sin(elev), -cl * Math.sin(bearing)];
  let H = [V[0] + L[0], V[1] + L[1], V[2] + L[2]];
  const hn = Math.hypot(...H) || 1;
  H = H.map((v) => v / hn);
  // the frame: up = (0,1,0), along-range = -x, across-range = -z
  const val = lobe(-H[0], -H[2], H[1], sigE, sigE);
  const c = H[0] * L[0] + H[1] * L[1] + H[2] * L[2];
  // the peak of one glint, as a multiple of the mean-field value it sits in:
  // what the eye reads as the contrast between a spark and the water beside it
  const peak = glintOf(0, 0, 1, 0, 0, 1, sigA, resA, sigB, resB, sigE);
  return {
    val, lit: val * fresnelWater(c), sigE, sigA, sigB, resA, resB, peak,
    graze, foot: f, beta: (elev - dep) / 2,
  };
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
// the CORRIDOR'S own width: Cox & Munk's full per-axis sd. No footprint enters
// it — the envelope is the average over the whole facet population and is a
// property of the sea, not of the camera.
float oGlSigmaFull(float swellG, float chopG) {
  float drawn = swellG * swellG * ${n(G.swellVar)} + chopG * chopG * ${n(G.windVar)};
  return sqrt(max(max(max(0.0, ${n(G.coxA)} + ${n(G.coxB)} * chopG), drawn), 1e-9));
}
// the envelope. glint is the resolved surface's own contrast factor (oGlGlint
// below) and rides the CORE only: the tail is the non-Gaussian wings, which are
// a genuinely smooth sheen and not a set of separate hits. Pass 1.0 for the
// mean field.
float oGlLobe(vec3 h, float sigA, float sigB, float glint) {
  float up = max(h.z, 1e-3);
  float sx = h.x / up, sy = h.y / up;
  float q = (sx * sx) / (sigA * sigA) + (sy * sy) / (sigB * sigB);
  float up2 = up * up;
  float j = 1.0 / (up2 * up2);
  float e = min(${n(G.energyCap)}, ${n(SIGMA_REF * SIGMA_REF)} / (sigA * sigB));
  float w = ${n(G.tailW)} * ${n(G.tailW)};
  float core = exp(-0.5 * q) * e * glint;
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
}
// ---- THE GLINT ------------------------------------------------------------
// what the pixel knows about the drawn surface, in one pair of logarithms:
//   [0] the GLINT lobe's width  — the drawn spectrum BELOW this footprint, plus
//       the mirror's own hardness, floored by half the pixel's angular size
//   [1] the resolved slope VARIANCE — the drawn spectrum ABOVE it, plus detVar,
//       which is whatever the shading detail bands add at this pixel
// NOT A NOISE READ ANYWHERE IN IT. The discreteness comes from the surface.
vec2 oGlSplit(float lamC, float swellG, float chopG, float floorSd, float detVar) {
  float sw = swellG * swellG * ${n(G.swellVar)};
  float wd = chopG * chopG * ${n(G.windVar)};
  float below = sw * oGlBelow(lamC, ${n(G.swellA)}, ${n(1 / Math.log(G.swellB / G.swellA))})
    + wd * oGlBelow(lamC, ${n(G.windA)}, ${n(1 / Math.log(G.windB / G.windA))});
  float sg = sqrt(max(max(below + ${n(G.glintSigma)} * ${n(G.glintSigma)},
    floorSd * floorSd), 1e-9));
  return vec2(sg, max(0.0, sw + wd - below) + detVar);
}
// THE GLINT. h is the half-vector in the DRAWN normal's frame, so h.xy/h.z is the
// RESIDUAL slope — what the unresolved facets are asked for after the drawn water
// has supplied what it can. m is the same half-vector in the MEAN surface's
// frame, so m.xy/m.z is what the corridor demands of this water at all, and the
// (a - 1) m term asks the drawn surface for only its own SHARE of that — without
// it the glints hug the corridor's axis and the road is a thin line (see
// glintOf). A hard Gaussian on the result is 1 where the surface faces the source
// and 0 a few centimetres off, and the set where a two-component condition holds
// is a set of ISOLATED POINTS. The divisor is the Gaussian's own expectation over
// the resolved slope's distribution, so floor + (1 - floor) * E[glint] = 1
// exactly, at every range and every sea state.
float oGlGlint(vec3 h, vec3 m, float sigA, float resA, float sigB, float resB, float sigE) {
  float up = max(h.z, 1e-3), mup = max(m.z, 1e-3);
  float kA = sqrt(resA) / max(sigE, 1e-6) - 1.0;
  float kB = sqrt(resB) / max(sigE, 1e-6) - 1.0;
  float sx = h.x / up + kA * (m.x / mup);
  float sy = h.y / up + kB * (m.y / mup);
  float q = (sx * sx) / (sigA * sigA) + (sy * sy) / (sigB * sigB);
  float d = sqrt((sigA * sigA) / (sigA * sigA + resA)
    * ((sigB * sigB) / (sigB * sigB + resB)));
  return ${n(G.glintFloor)} + ${n(1 - G.glintFloor)} * exp(-0.5 * q) / max(d, 1e-4);
}
// ---- THE RAFT -------------------------------------------------------------
// how far the far lace has been magnified past its useful scale: 0 at ordinary
// range, 1 close aboard, from the pixel's own across-range footprint
float oGlRagNear(float footA) {
  return smoothstep(${n(G.ragPx0)}, ${n(G.ragPx1)}, ${n(1 / G.ragFar)} / max(footA, 1e-5));
}
// the lace, cross-faded onto the finer lattice and tapered in contrast by the
// same lever. 0.469 is oFbm's own mean (verify-oceannoise holds it there).
float oGlRag(float far, float near, float w) {
  float m = mix(far, near, w) - 0.469;
  return 0.469 + m * mix(1.0, ${n(G.ragMagKeep)}, w);
}
// what the lace does to a raft of a given age: nothing to a tumbling head,
// holes to a spent tail
float oGlShred(float rag, float age) {
  return 1.0 - ${n(G.foamShred)} * age * (1.0 - rag);
}
// and how white that raft draws
float oGlThick(float age) { return mix(1.0, ${n(G.foamThin)}, age); }
// the raft's DEPTH, over the span where its opacity has already saturated —
// breakFoam saturates at a third of the field, and past there only the facet's
// tilt was still changing, which runs the wrong way
float oGlRaft(float brk) {
  return 1.0 + ${n(G.foamThick)} * smoothstep(${n(G.raft0)}, ${n(G.raft1)}, brk);
}`;
}
