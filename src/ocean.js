// The ocean surface: one big grid that follows the ship in segment-snapped
// steps (so vertices never swim), displaced in the vertex shader by THE SAME
// wave sum the CPU uses (src/waves.js) plus the Kelvin wake (src/wake.js) —
// the sea the eye sees is the sea the hull feels.
//
// SMOOTH WATER (2026-07-24, the Marsstead port): the faceted flat-shaded sea
// is gone. Normals are ANALYTIC — the sum-of-sines gradient is closed-form
// (waves.js waveGradient), evaluated PER PIXEL from world xz, so the surface
// reads smooth at any mesh density with no seams and no facets. Over that,
// Marsstead terrain.js's per-pixel detail idiom: scrolling fbm ripple tilts
// the normal (shading only, never displacement), distance-faded before it
// can shimmer. The corduroy law travels with the idiom: the detail is
// ISOTROPIC — no periodic ripple fields, no sin() in the detail bands.
//
// Light on the water, in order:
//  - THE GLITTER PATH (src/glitter.js, 2026-07-26): a slope-space Gaussian over
//    the half-vector with Cox & Munk roughness and Schlick's Fresnel, broadened
//    by whatever the pixel's own footprint cannot resolve. It replaces the
//    pow(dot(R, sun), 260.0) mirror that shipped before — an exponent of 260 is
//    a 2-degree pinpoint, and the corridor asks for 5 degrees of facet tilt at
//    the horizon, so the road was never drawn and the owner had to hunt for the
//    reflection with the camera. The lobe IS the sparkle pass, the corridor and
//    the wake's wet sheen, all one term.
//  - Phong's own specular from the real sun/moon DirectionalLights still runs
//    over the perturbed normal; it is a narrow highlight near the source's
//    mirror image and the glitter path is additive over it.
//  - fresnel mixes toward the REAL sky gradient (horizon -> zenith along
//    the reflected ray), not one flat colour: near water reads deep, far
//    water mirrors the sky.
//  - crests pass light: a subsurface-scatter tint lifts high water toward
//    green-glass when you look through a crest toward the light.
//  - froth: whitecaps ride the water that is actually BREAKING — waves.js's
//    breaking() field (Phase C), the same function the hull is shoved by, so the
//    foam leads each crest down its downwind face and lingers behind it, and in
//    a gale draws out into windrows along the wind. It replaced a height
//    threshold that dusted the backs of waves as readily as their faces, which
//    is why the sea used to tell the player nothing about the wind. Over that
//    the wake's churn mask lays a road astern
//    that widens and fades. Foam is ROUGH WATER, not paint: it keeps part of
//    its specular and part of the sky, takes a broad sun-tracking sheen from
//    the glitter lobe, and carries a forward-scatter term so the Kelvin V
//    brightens as you look up-sun. It used to be flat albedo with specular and
//    fresnel amputated, which is why it read as fake and disconnected from the
//    sun.

import * as THREE from 'three';
import {
  glslWaves, glslShore, glslBreak, NWAVE, packWaveUniforms, setWaveOrigin,
  MAX_SWELL_HEIGHT, MAX_CHOP_HEIGHT, SHORE_SHADE,
  MAX_HARM_SWELL, MAX_HARM_CHOP, waveBandDir,
  SEA_STATE_MAX, SEA_SWELL_MAX,
} from './waves.js';
import { WAKEMAP_METRES } from './wakemaplayer.js';
import { COASTMAP_METRES } from './coastmaplayer.js';
import { glslOceanNoise } from './oceannoise.js';
import { GLITTER, glslGlitter } from './glitter.js';

const SIZE = 720, SEG = 180;
// THE SKIRT. The mesh is 720 m across, so its rim stands 360 m from the ship —
// and the fog does not close until 620, which leaves 260 m of half-fogged water
// with NOTHING BEYOND IT. Below about 45 m of eye height the rim is under the
// horizon and no one ever sees it; above that it swings up into frame as a hard
// polygonal boundary of bare sky, which is what the v2 showcase found when a
// 75 m plan view was tried for a clip. A warden's photo camera can get there,
// and so can a showreel beat.
//
// FOUR FIXES WERE AVAILABLE AND THIS IS THE CHEAPEST. Growing the mesh costs
// vertices as the square; a second horizon plane costs a draw call and puts a
// seam where the two meet; fading the rim into the fog leaves the boundary
// exactly where it was, because past it there is still sky; clamping the camera
// removes a capability the warden's writ exists to provide. Instead the mesh's
// OUTERMOST RING OF VERTICES is pushed out to SKIRT metres, which turns its last
// band of quads into an apron reaching well past the far plane. It costs NO new
// vertices, NO new draw call and NO new material — the apron's fragments run the
// same shader, and every one of them is beyond the fog's 620 m end, so what they
// draw is fog colour and nothing else — PAST 620 m. State the rest plainly: the
// apron's first 264 m (356 to 620) is still partly visible, and there the surface
// is a long quad whose height is INTERPOLATED between the 356 m ring and the far
// one, so that band has no wave geometry of its own. Per-pixel shading still runs
// off vWPos, so its colour and its normals are right; what is missing is the
// silhouette, under 47-100% fog, in a band nobody looks at from a low lens. The
// ring that was the rim is still the rim, still displaced by the same wave sum.
const SKIRT = 1400;

// the lens default: a 62 degree vertical field over a 900 px canvas (main.js's
// own camera on a laptop). It stands only for the frames before the first
// setLens() — both consumers (main.js, titlescene.js) call it at construction
// and on every resize, and main.js calls it again when the fps watchdog sheds
// pixels.
const DEFAULT_PIX_A = (2 * Math.tan((62 * Math.PI / 180) / 2)) / 900;

// The decorative fbm. It USED to be the family one-liner inlined here, reading
// the raw world lattice index through a fract-hash with 234/435 multipliers —
// which at real play coordinates (15-80 km from the world origin) overruns a
// float32 mantissa and collapses the noise into a one-dimensional staircase
// locked to a world axis. That was the east-west grating. It now lives in
// src/oceannoise.js: wrapped lattice index, small-multiplier hash, per-octave
// rotation, and a headless gate (verify-oceannoise.mjs) that will not let the
// field lose a dimension again. Still decorative — only geometry heights carry
// the determinism contract — but decorative is not the same as unguarded.
const O_FBM = glslOceanNoise();

export class Ocean {
  constructor(scene) {
    // indexed grid — smooth shading needs no per-triangle attributes, so the
    // non-indexed centroid rig of the faceted era is gone with the facets
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    // ...and the rim goes out to the skirt. Scaled on the SQUARE's own norm
    // (max of |x|, |z|) rather than radially, so the boundary stays a square and
    // the apron is an even band on all four sides. The 1e-3 guard is for the
    // centre vertex of an odd grid, which has no direction to be pushed in.
    {
      const p = geo.attributes.position, h = SIZE / 2, n = p.count;
      for (let i = 0; i < n; i++) {
        const x = p.getX(i), z = p.getZ(i);
        const m = Math.max(Math.abs(x), Math.abs(z));
        if (m < h - 1e-3) continue;                  // interior: untouched
        const k = SKIRT / Math.max(m, 1e-3);
        p.setX(i, x * k); p.setZ(i, z * k);
      }
      p.needsUpdate = true;
      geo.computeBoundingSphere();
    }
    // a 1×1 black texture stands in until setWakeMap hands over the live one
    const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
    blank.needsUpdate = true;
    this.uniforms = {
      uTime: { value: 0 },
      uOrigin: { value: new THREE.Vector2(0, 0) },
      // the two-band sea state — MUST track waves.js getSeaBands(): the long
      // rollers and the local wind-sea are scaled apart, on GPU as on CPU
      uSwellL: { value: 1 },
      uSwellS: { value: 1 },
      // THE SPECTRUM, as data (sea v2). vec4(kx, kz, amp, phase) per component
      // — the very Float32Array waves.js packWaveUniforms() writes, so the
      // drawn sea cannot be a different sea from the felt one. The phase folds
      // the local-frame accumulator AND the clock, wrapped to [0, 2π), which
      // is what keeps a float32 exact where v1's world-absolute k·p reached
      // 1e5 radians. Repacked every frame in update().
      uWave: { value: packWaveUniforms(0) },
      // the per-component STOKES HARMONIC coefficient (Phase C). A constant of
      // the spectrum, written by the same packWaveUniforms call as uWave so a
      // stale or forked harmonic table cannot happen; verify-crest recomputes it
      // from uWave itself and holds the two together.
      uWaveQ: { value: new Float32Array(NWAVE) },
      // the wind-sea band's unit TRAVEL direction (waves.js waveBandDir). The
      // break field resolves its slope along this and the gale's foam streaks
      // lie down it — which is how the player reads the wind off the water.
      uWindDir: { value: new THREE.Vector2(1, 0) },
      // the per-tier component lever: 1 keeps the whole spectrum in the
      // FRAGMENT (shading), 0 drops the sub-20 m components there. The vertex
      // displacement — the surface the hull is promised — always runs the full
      // set, so parity is never the thing being traded.
      uWaveLOD: { value: 1 },
      // the source's TRUE world direction, straight from lightrig's
      // glitterSource().dir — never rebuilt from a scalar (see lightrig.js)
      uSunDirW: { value: new THREE.Vector3(0, 1, 0) }, // world, sun or moon
      uSparkle: { value: 0 },   // glitterSource amp × the quality lever
      uGlitAmp: { value: 0 },   // glitterSource amp, TIER-INDEPENDENT (foam)
      // the corridor's colour: warm for the sun, cold for the moon, leaning
      // into the horizon's own hue as the source sinks (a low light is
      // reddened by the air it crosses, and uHor already carries exactly that)
      uGlitCol: { value: new THREE.Color(1, 0.95, 0.86) },
      // the angular size of one pixel — the lobe's resolution model needs it
      // to know how much of the sea a pixel is averaging over (glitter.js)
      uPixA: { value: DEFAULT_PIX_A },
      uScatter: { value: 0 },   // crest translucency strength
      uFresnel: { value: 0.35 },
      uHor: { value: new THREE.Color(0x9ecbea) }, // sky gradient, driven live
      uZen: { value: new THREE.Color(0x3d6d96) },
      uDetailAmp: { value: 1 }, // the tier lever: plain parks it at 0
      uWakeMap: { value: blank },              // wakemaplayer.js render target
      uWakeC: { value: new THREE.Vector2() },  // the map's snapped centre
      uCoastMap: { value: blank },             // coastmaplayer.js data texture
      // parked far away until the first bake lands: everywhere reads as
      // outside the map, i.e. open sea — never "on the beach"
      uCoastC: { value: new THREE.Vector2(1e9, 1e9) },
    };
    const mat = new THREE.MeshPhongMaterial({
      color: 0x175a7d,
      specular: 0x86a8bd,
      shininess: 240, // a tight path; the detail normal breaks it into sea
    });
    mat.onBeforeCompile = (sh) => {
      for (const k of Object.keys(this.uniforms)) sh.uniforms[k] = this.uniforms[k];
      // the wake arrives as a TEXTURE (wakemaplayer.js): the field renders
      // once per frame into a 512² map (~0.35 m/texel) and both shaders
      // sample it — per-PIXEL arm and foam structure the 4 m vertex grid
      // could never resolve, and zero wake maths inlined here (the ANGLE
      // compile-stall lesson)
      const wakeSample = /* glsl */`
vec2 oWakeUv(vec2 p) { return (p - uWakeC) / ${WAKEMAP_METRES.toFixed(1)} + 0.5; }
float oWakeIn(vec2 uv) {
  vec2 e = abs(uv - 0.5);
  return step(max(e.x, e.y), 0.5);
}`;
      // the coast map (coastmaplayer.js): signed coast distance per pixel.
      // Outside the map (or before the first bake) sd reads deep blue water,
      // so the shore terms vanish and the open sum is untouched.
      const coastSample = /* glsl */`
vec2 oCoastUv(vec2 p) { return (p - uCoastC) / ${COASTMAP_METRES.toFixed(1)} + 0.5; }
float oCoastSd(vec2 p) {
  vec2 uv = oCoastUv(p);
  vec2 e = abs(uv - 0.5);
  // fade the shore's influence out over the map's last tenth — a hard step
  // at the rim popped the sea from calmed to full in a visible line
  float inM = 1.0 - smoothstep(0.4, 0.5, max(e.x, e.y));
  return mix(-10000.0, texture2D(uCoastMap, uv).r, inM);
}
// the field's gradient, per world metre (texel 20 m, central diff over 2)
vec2 oCoastGrad(vec2 p) {
  vec2 uv = oCoastUv(p);
  float t = 1.0 / 128.0;
  return vec2(
    texture2D(uCoastMap, uv + vec2(t, 0.0)).r - texture2D(uCoastMap, uv - vec2(t, 0.0)).r,
    texture2D(uCoastMap, uv + vec2(0.0, t)).r - texture2D(uCoastMap, uv - vec2(0.0, t)).r) / 40.0;
}
// the SHELTER gradient: a ±100 m baseline. Facing shores cancel across a
// strait's middle, so |∇d| sags over a broad band there — the surf's gate.
vec2 oCoastGradW(vec2 p) {
  vec2 uv = oCoastUv(p);
  float t = 5.0 / 128.0;
  return vec2(
    texture2D(uCoastMap, uv + vec2(t, 0.0)).r - texture2D(uCoastMap, uv - vec2(t, 0.0)).r,
    texture2D(uCoastMap, uv + vec2(0.0, t)).r - texture2D(uCoastMap, uv - vec2(0.0, t)).r) / 200.0;
}` + glslShore() + glslWaves() + glslBreak();
      sh.vertexShader = 'uniform float uTime;\nuniform vec2 uOrigin;\n'
        + 'uniform float uSwellL;\nuniform float uSwellS;\n'
        + 'uniform sampler2D uWakeMap;\nuniform vec2 uWakeC;\n'
        + 'uniform sampler2D uCoastMap;\nuniform vec2 uCoastC;\n'
        + 'varying vec3 vWPos;\nvarying float vVDist;\n'
        + wakeSample + '\n' + coastSample + '\n'
        + sh.vertexShader
          .replace('#include <begin_vertex>',
            '#include <begin_vertex>\n'
            + '  float wx = position.x + uOrigin.x;\n'
            + '  float wz = position.z + uOrigin.y;\n'
            // THE LOCAL FRAME (sea v2): the mesh is drawn at uOrigin, so the
            // vertex's own position IS p - origin — the coordinate waves.js
            // evaluates its phases in. The coast and wake maps stay in world
            // metres; only the wave field goes local, which is what lets a
            // direction turn pivot under the hull instead of over the horizon.
            + '  vec2 wLP = vec2(position.x, position.z);\n'
            + '  vec2 wWUv = oWakeUv(vec2(wx, wz));\n'
            + '  float wWakeH = texture2D(uWakeMap, wWUv).r * oWakeIn(wWUv);\n'
            + '  float wSd = oCoastSd(vec2(wx, wz));\n'
            + '  float wGate = oShoreGate(length(oCoastGradW(vec2(wx, wz))));\n'
            // the two populations scaled apart, exactly as waves.js scales
            // them (the shore set is chop's kin — it rides uSwellS). oWaveMix
            // is the band composer: g * linear - g^2 * harmonic, the Stokes
            // second harmonic's own a^2 carrying the state's square (Phase C).
            + '  transformed.y += oShoreAtten(wSd) * (oWaveMix(oWaveSwell(wLP), uSwellL)\n'
            + '      + oWaveMix(oWaveWind(wLP), uSwellS))\n'
            + '    + uSwellS * oShoreSum(wSd) * wGate + wWakeH;\n'
            + '  vWPos = vec3(wx, transformed.y, wz);')
          .replace('#include <project_vertex>',
            '#include <project_vertex>\n'
            + '  vVDist = -mvPosition.z;');
      sh.fragmentShader = 'uniform float uTime;\nuniform vec2 uOrigin;\n'
        + 'uniform float uSwellL;\nuniform float uSwellS;\n'
        + 'uniform vec3 uSunDirW;\nuniform float uSparkle;\nuniform float uScatter;\n'
        + 'uniform float uGlitAmp;\nuniform vec3 uGlitCol;\nuniform float uPixA;\n'
        + 'uniform float uFresnel;\nuniform vec3 uHor;\nuniform vec3 uZen;\nuniform float uDetailAmp;\n'
        + 'uniform sampler2D uWakeMap;\nuniform vec2 uWakeC;\n'
        + 'uniform sampler2D uCoastMap;\nuniform vec2 uCoastC;\n'
        + 'uniform vec2 uWindDir;\n'
        + 'varying vec3 vWPos;\nvarying float vVDist;\n'
        + `const float O_MAXHL = ${MAX_SWELL_HEIGHT.toFixed(4)};\n`
        + `const float O_MAXHS = ${MAX_CHOP_HEIGHT.toFixed(4)};\n`
        // the harmonic's own amplitude sums, so the crest measure below stays a
        // measure of THIS surface and not of the linear one it replaced
        + `const float O_MAXQL = ${MAX_HARM_SWELL.toFixed(4)};\n`
        + `const float O_MAXQS = ${MAX_HARM_CHOP.toFixed(4)};\n`
        + O_FBM + glslGlitter() + wakeSample + '\n' + coastSample + '\n'
        + sh.fragmentShader
          .replace('#include <color_fragment>', `#include <color_fragment>
  // ---- the water's own colour work (main-scope: later passes read these)
  float wx = vWPos.x; float wz = vWPos.z;
  vec2 oLP = vWPos.xz - uOrigin;   // the wave field's LOCAL frame (sea v2)
  vec3 oEye = cameraPosition - vWPos;
  float oDist = max(length(oEye), 0.05); // TRUE range (vVDist is depth, not range)
  vec3 oV = oEye / oDist;
  // per-pixel wake: height + churn from the map, gradient from neighbours
  vec2 oWUv = oWakeUv(vWPos.xz);
  float oWIn = oWakeIn(oWUv);
  vec2 oWkHF = texture2D(uWakeMap, oWUv).rg * oWIn;
  float oWTexel = ${(WAKEMAP_METRES / 512).toFixed(5)};
  float oWTexUv = 1.0 / 512.0;
  vec2 oWkG = vec2(
    texture2D(uWakeMap, oWUv + vec2(oWTexUv, 0.0)).r - oWkHF.x,
    texture2D(uWakeMap, oWUv + vec2(0.0, oWTexUv)).r - oWkHF.x) / oWTexel * oWIn;
  // exact per-pixel surface height and gradient from the wave table — the
  // shore field folded in exactly as the CPU folds it (waves.js waveHeight)
  float oSd = oCoastSd(vWPos.xz);
  float oSAtt = oShoreAtten(oSd);
  vec2 oCG = oCoastGrad(vWPos.xz);
  float oCLen = length(oCG);
  // the strait gate: no shore set where the wide-baseline gradient sags —
  // the middle of a channel is SHELTERED water, not a surf zone
  float oCGate = oShoreGate(length(oCoastGradW(vWPos.xz)));
  vec2 oCDir = oCLen > 1e-4 ? oCG / oCLen : vec2(0.0);
  // the two open bands, each as (linear sum, Stokes harmonic sum), composed by
  // oWaveMix — the SAME arithmetic waves.js waveHeight uses, so the drawn crest
  // is the felt one. The wind band is kept separately because the break field
  // below is the LOCAL SEA breaking and nothing else.
  float oHsw = oSAtt * oWaveMix(oWaveSwell(oLP), uSwellL);
  float oHwd = oSAtt * oWaveMix(oWaveWind(oLP), uSwellS);
  float oShoreH = uSwellS * oShoreSum(oSd) * oCGate;
  float oH = oHsw + oHwd + oShoreH;
  // the gradient by WAVELENGTH BAND (waves.js GRAD_BANDS): long swell shades
  // to the horizon; mid sea fades out where its wavelength is pixels; short
  // chop fades sooner AND comes in cat's-paw patches — a 5 m ripple drawn as
  // a global sinusoid was a stripe field to the horizon (the title scene
  // only ever looked right because its fog hid everything past 120 m).
  // HEIGHT above stays the exact felt surface; this is lighting resolution.
  // Each band also carries its OWN sea state: the swell rollers ride uSwellL,
  // the wind-sea rides uSwellS (GRAD_BANDS.long === SWELL_LEN, so the LOD
  // long band IS the swell population).
  vec2 oWGl = oWaveGradMix(oWaveGradLong(oLP), uSwellL);
  vec2 oWGm = oWaveGradMix(oWaveGradMid(oLP), uSwellS);
  vec2 oWGs = oWaveGradMix(oWaveGradShort(oLP), uSwellS);
  float oChop = uDetailAmp > 0.001
    ? 0.35 + 0.65 * oFbm(vWPos.xz * 0.021 + uTime * vec2(0.013, 0.009))
    : 0.7;
  float oFadeS = 1.0 - smoothstep(60.0, 240.0, vVDist);
  float oFadeM = 1.0 - smoothstep(240.0, 700.0, vVDist);
  // THE TIER LEVER LIVES HERE NOW, and only here. uWaveLOD used to sit inside the
  // emitted sums, which took the sub-20 m components away from the BREAK FIELD too
  // and made the plain tier's foam a different field from the one the hull is
  // shoved by (see waves.js LOD_IS_SHADING_ONLY). As a multiplier on the SHADING
  // gradient it does exactly the job its comment claims — dropping a ripple that
  // is sub-pixel past 60 m out of the normals — and nothing else.
  float oLodS = uWaveLOD > 0.5 ? 1.0 : 0.0;
  vec2 oWGopen = oWGl + oWGm * mix(0.55, 1.0, oChop) * oFadeM
    + oWGs * oChop * oFadeS * oLodS;
  vec2 oWG = oSAtt * oWGopen
    + uSwellS * oShoreGradMag(oSd) * ${SHORE_SHADE.toFixed(2)} * oCGate * oCDir + oWkG;
  // crest measure: -1 trough -> +1 highest possible crest at this sea state
  float oCrest = clamp(0.5 + 0.5 * oH / max(0.2,
    uSwellL * O_MAXHL + uSwellS * O_MAXHS
    + uSwellL * uSwellL * O_MAXQL + uSwellS * uSwellS * O_MAXQS), 0.0, 1.0);
  // ---- THE BREAK FIELD (waves.js breaking) --------------------------------
  // ONE function, both consumers: this mask and the hull's breaker shove. The wind
  // band's gradient goes in UNFADED and UNGATED BY THE TIER — the shading fades and
  // the LOD lever exist to stop a 6 m ripple aliasing in the normals at 300 m, and
  // the CPU twin has neither, so feeding either into the criterion would put the
  // drawn foam on a different sea from the one the ship is shoved by. It did, on
  // plain, until a cold review measured it (waves.js LOD_IS_SHADING_ONLY).
  float oGsW = dot(oWGm + oWGs, uWindDir);
  float oBrkOpen = oBreakOpen(oHwd, oGsW * oSAtt);
  float oBrkShore = oBreakShore(oShoreH,
    uSwellS * oShoreGradMag(oSd) * oCGate, oSd);
  float oBrk = max(oBrkOpen, oBrkShore);
  // HOW OLD THIS WHITE WATER IS (waves.js breakAge): 0 at the tumbling head of
  // the breaker, 1 at the spent end of the trailing window. The break field
  // always knew this — the window is asymmetric about the crest, which is the
  // whole persistence mechanism — and the shader used to throw it away, so a
  // whitecap could only ever be drawn as a blob of uniform paint. One atan, and
  // only on water that is actually breaking.
  float oAge = 0.0;
  if (oBrk > 0.002) {
    oAge = oBrkShore > oBrkOpen
      ? oBreakAgeShore(oShoreH, uSwellS * oShoreGradMag(oSd) * oCGate)
      : oBreakAgeOpen(oHwd, oGsW * oSAtt);
  }
  // froth on EVERY tier: the wake's churn is a texture read and the break field
  // is arithmetic, so even Plain keeps her white road AND her whitecaps. Fine
  // adds the patchiness, the windrows and the streaky fbm lace.
  float oFoam = 0.0;
  float oWhiteK = 1.0;         // how white this pixel's raft draws (age)
  float oWcShare = 0.0;        // ...and how much of it is a BREAKER's, not the wake's
  vec2 oRagGrad = vec2(0.0);   // the raft's own relief, spent in the normal pass
  {
    // WHERE THE WATER IS ACTUALLY BREAKING, not where it happens to stand high.
    // What was here until Phase C: smoothstep(0.72, 0.95, oCrest) — a HEIGHT
    // threshold on the normalised surface, gated on chop > 1.05 and diced by two
    // fbm lotteries. It could not tell a crest's face from its back, so it
    // dusted both equally and the sea gave the player no clue which way the wind
    // blew. oBrk asks the two questions a sailor's eye asks instead (is this
    // water steep enough, and where on the wave am I) and answers them from the
    // wind sea's own local envelope. The chop gate is gone with it: the
    // steepness criterion IS the wind gate, and it is a smooth one — verify-crest
    // measures coverage 0.059% in the doldrums, 1.018% in a working breeze and
    // 3.222% in the fifties, against Monahan's photographed 0.09 / 1.0 / 3.9%.
    // the criterion turned into an opacity (waves.js BREAK.foamGain): a field
    // that fires at a quarter draws a seventh of a whitecap, which the live probe
    // measured as no whitecap at all. SHADING ONLY — the ship reads the ungained
    // field, so her motion and the gated coverage are untouched by this.
    float oWc = oBreakFoam(oBrk);
    float oRag = 0.72;
    if (uDetailAmp > 0.001 && max(oWc, oWkHF.y) > 0.004) {
      // the wind is not even, so neither is the breaking. ONE broad mask now,
      // and it MODULATES rather than gates: the two-lottery rig existed because
      // a height threshold breaks every crest of a wave row in step (the storm
      // rings, 2026-07-24), and the break field already scatters the winners by
      // the spectrum's own envelope. It is also DELIBERATELY GENTLE — 0.65-1.0
      // where the first cut used 0.45-1.0 — because the masks multiply, and three
      // of them at a median of 0.75 each turn the field's decision into half a
      // whitecap. Measured before softening: water in the STRONGEST break bin
      // rendered DARKER than unbroken water (116 against 122 luminance counts),
      // because a steep forward face also tilts away from the sky. A criterion
      // that has decided the water is breaking should not then be talked out of it.
      oWc *= 0.65 + 0.35 * smoothstep(0.30, 0.62,
        oFbm(vWPos.xz * 0.013 - uTime * 0.008 + 7.3));
      // WINDROWS — the third and last of the sailor's cues. In a gale the foam
      // stops being patches and draws out into streaks ALONG the wind: the noise
      // is sampled in the WIND's own frame, 50 m of period down the wind against
      // 3.6 m across it. Anchored to the wind and not to a world axis, so it can
      // never become a grating (live-grating measures world-axis anisotropy).
      // THE GATE IS ANCHORED TO WINDS THE GAME ACTUALLY BLOWS. It was
      // smoothstep(1.25, 1.75, chop), and chop is 0.5 + 0.055 U — so full strength
      // wanted 22.7 m/s and a real gale of 16 engaged it 20%, which is why the
      // live probe could not find the streaks. 1.10 -> 1.50 puts the fifties'
      // 15 m/s at 59% and a 16 m/s gale at 78%, and leaves a working breeze
      // (chop 1.05) at exactly nothing.
      float oGale = smoothstep(1.10, 1.50, uSwellS);
      float oStk = 0.469;                 // oFbm's own mean where no gale blows
      if (oGale > 0.001) {
        vec2 oWr = vec2(dot(vWPos.xz, uWindDir),
          dot(vWPos.xz, vec2(-uWindDir.y, uWindDir.x)));
        oStk = oFbm(vec2(oWr.x * 0.02, oWr.y * 0.28) + uTime * vec2(0.006, 0.0));
        oWc *= mix(1.0, 0.30 + 1.40 * oStk, oGale);
      }
      // CHURNED TEXTURE INSIDE ANY FOAM: streaky lace, alive — high-contrast
      // fine fbm so heavy churn still reads as WATER torn white, not paint.
      //
      // AND ITS SCALE FOLLOWS THE PIXEL NOW (glitter.js ragFar/ragNear). One
      // cell of the 1.9-per-metre lattice is 0.526 m: lace at thirty metres, and
      // at THREE metres a chain of dark half-metre ellipses down the wake road —
      // one cell covering about 130 px with its minima at 0.40 of its peak. That
      // was the showcase's near-field defect, and it is a resolution fault, not a
      // noise fault, so the cure is the pixel's own footprint: cross-fade onto a
      // finer lattice and taper the contrast, both off oGlFoot's across-range
      // component, which is the same machinery the glitter lobe is sized by.
      float oFootA = max(oDist, 0.05) * uPixA;
      float oNearW = oGlRagNear(oFootA);
      vec2 oRp = vWPos.xz * ${GLITTER.ragFar} + uTime * vec2(0.11, 0.07);
      vec2 oRq = vWPos.xz * ${GLITTER.ragNear.toFixed(1)} - uTime * vec2(0.09, 0.13) + 31.4;
      float oR0 = oFbm(oRp);
      float oRv = oGlRag(oR0, oFbm(oRq), oNearW);
      oRag = 0.40 + 0.60 * oRv;
      // THE RAFT IS A BUBBLE RAFT, NOT A DECAL. The same lace that shreds it
      // BUMPS it: two more taps of the far lattice give its gradient, and the
      // normal pass below mixes that in as the foam's own surface. Whitecaps had
      // no relief at all — only the wake's churn roughened the normals — which
      // is half of why they read as torn paper stuck on the water.
      // ...and it obeys the SAME two laws the lace does, because it is the same
      // lattice: a 0.53 m feature is sub-pixel past about forty metres, so the
      // relief fades with range exactly as the detail band does (the corduroy
      // law's own reasoning — an un-faded sub-pixel normal is a shimmer
      // generator), and it stands down close aboard where that lattice is the
      // very magnified octave this pass removed from the opacity.
      float oRe = 0.30;
      oRagGrad = vec2(oFbm(oRp + vec2(oRe * ${GLITTER.ragFar}, 0.0)) - oR0,
        oFbm(oRp + vec2(0.0, oRe * ${GLITTER.ragFar})) - oR0)
        / oRe * ${GLITTER.foamRelief.toFixed(3)}
        * smoothstep(150.0, 30.0, vVDist) * mix(1.0, ${GLITTER.ragMagKeep.toFixed(2)}, oNearW);
      // AND THE TAIL IS THE PART THAT SHREDS. The break window is asymmetric by
      // construction, so oAge already says which end of a whitecap this is: the
      // tumbling head admits almost no lace, the sheet the crest has left behind
      // is punched full of holes.
      //
      // IN A GALE IT IS THE WIND THAT TEARS IT, not an isotropic lace, and the
      // difference is measurable. The first cut shredded with oRv alone and
      // live-crest duly convicted it: the white water's along/across correlation
      // ratio fell from 0.443 in a breeze to 0.375 in a gale — i.e. the windrow
      // cue INVERTED, because isotropic holes punched across the streaks are
      // exactly what destroys an along-wind correlation. oStk is the windrow
      // field itself (50 m down the wind against 3.6 m across it), so as the gale
      // comes on, the tearing lies down the wind with everything else.
      oWc *= oGlShred(mix(oRv, oStk, oGale), oAge);
    }
    // the CHURN takes the rag whole — that texture is what makes the Kelvin V read
    // as water torn white rather than paint. A WHITECAP takes it lightly HERE and
    // gets its structure from oGlShred instead: multiplying its opacity by a mask
    // that reaches 0.40 everywhere is how a breaker ends up dimmer than the sea
    // beside it, which is the defect this pass is fixing, not repeating.
    float oFoamWk = oWkHF.y * 0.85 * oRag;
    float oFoamWc = oWc * (0.72 + 0.28 * oRag);
    oFoam = clamp(oFoamWk + oFoamWc, 0.0, 1.0);
    // a breaker's HEAD is thick water and draws near-white; its spent tail is a
    // thin sheet with the sea showing through. The churn is always thick.
    if (oFoam > 1e-4) {
      oWhiteK = (oFoamWk + oFoamWc * oGlThick(oAge)) / (oFoamWk + oFoamWc);
      oWcShare = oFoamWc / (oFoamWk + oFoamWc);
    }
  }
  // crests pass light: looking through high water toward the sun finds
  // green glass (cheap subsurface scatter — reads huge, costs nothing)
  float oToward = max(0.0, dot(vec3(-oV.x, 0.35, -oV.z), uSunDirW));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.10, 0.42, 0.40),
    oCrest * oCrest * oToward * uScatter);
  // foam takes the scene light like everything else: tinted BEFORE lighting;
  // capped short of pure white so the sea always shows through the lace. The
  // mix used to run to 0.85 and that flat white was ALL the wake had — the
  // rest of its light response was amputated below. It is now one part of
  // three (albedo here, forward scatter and a rough sheen in the light pass).
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.90, 0.95, 0.96),
    oFoam * ${GLITTER.foamAlbedo.toFixed(3)} * oWhiteK);`)
          .replace('#include <specularmap_fragment>', `#include <specularmap_fragment>
  // churned water is ROUGH, not matte: a bubble raft has wet slopes in every
  // direction and they glint. Killing specular outright (it was 0.85) is what
  // made the Kelvin V a painted road.
  specularStrength *= 1.0 - ${(1 - GLITTER.foamSpecKeep).toFixed(3)} * oFoam;`)
          .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
  // ---- the Marsstead idiom: exact analytic normal + per-pixel fbm detail.
  // Shading only, never displacement — the drawn surface stays the felt one.
  if (uDetailAmp > 0.001) {
    float oDF = smoothstep(120.0, 22.0, vVDist); // sub-pixel ripple shimmers: fade it
    if (oDF > 0.001) {
      // two scrolling ISOTROPIC fields (the corduroy law): capillary ripple
      // over a slower chop band, rougher in a running sea and in churn
      float oDe = 0.35;
      vec2 oP1 = vWPos.xz * 1.35 + uTime * vec2(0.18, 0.05);
      vec2 oP2 = vWPos.xz * 0.42 - uTime * vec2(0.06, 0.11) + 13.7;
      float oD0 = oFbm(oP1) * 0.55 + oFbm(oP2) * 0.45;
      float oDx = oFbm(oP1 + vec2(oDe * 1.35, 0.0)) * 0.55 + oFbm(oP2 + vec2(oDe * 0.42, 0.0)) * 0.45;
      float oDz = oFbm(oP1 + vec2(0.0, oDe * 1.35)) * 0.55 + oFbm(oP2 + vec2(0.0, oDe * 0.42)) * 0.45;
      float oDAmp = 0.16 * uDetailAmp * oDF * (0.55 + 0.45 * uSwellS) * (1.0 + 1.5 * oWkHF.y);
      oWG += vec2(oDx - oD0, oDz - oD0) / oDe * oDAmp;
    }
    // THE FAR FIELD (2026-07-24): past the fine band's 120 m the normals were
    // the bare wave sum — periodic, and periodic normals under a low sun are
    // stripes to the horizon. A BROAD isotropic band (features ~20-80 m,
    // supra-pixel at any distance the grid can show) tilts the far normals
    // too. No distance fade: its features never go sub-pixel, so the shimmer
    // law that fades the fine band has no claim on it.
    {
      float oDe2 = 3.0;
      vec2 oQ1 = vWPos.xz * 0.045 + uTime * vec2(0.020, -0.013);
      vec2 oQ2 = vWPos.xz * 0.012 - uTime * vec2(0.008, 0.011) + 41.7;
      float oB0 = oFbm(oQ1) * 0.5 + oFbm(oQ2) * 0.5;
      float oBx = oFbm(oQ1 + vec2(oDe2 * 0.045, 0.0)) * 0.5 + oFbm(oQ2 + vec2(oDe2 * 0.012, 0.0)) * 0.5;
      float oBz = oFbm(oQ1 + vec2(0.0, oDe2 * 0.045)) * 0.5 + oFbm(oQ2 + vec2(0.0, oDe2 * 0.012)) * 0.5;
      float oBAmp = 0.065 * uDetailAmp * (0.6 + 0.4 * uSwellS);
      oWG += vec2(oBx - oB0, oBz - oB0) / oDe2 * oBAmp;
    }
  }
  vec3 oNw = normalize(vec3(-oWG.x, 1.0, -oWG.y));
  // ---- FOAM IS A DIFFUSE SCATTERER, NOT A MIRROR --------------------------
  // THE MEASURED DEFECT: binned by break strength, the STRONGEST bin rendered
  // DARKER than unbroken water (117 luminance counts against 122). The cause is
  // geometry and not noise — the steepest forward face is the facet tilted
  // furthest from the sky, and foam keeps only 45% of the sky reflection, so the
  // whitening and the tilting cancelled and the whitest water in a gale was not
  // the breaking crest. But a raft of bubbles is a dense multiple-scattering
  // medium: its radiance hardly depends on the slope of the water underneath it.
  // So inside foam the MACRO normal levels toward vertical (the hemispheric
  // average the sky term wants) while the raft's OWN relief takes its place —
  // one mix does both, and the sky, the fresnel and the lobe's frame all follow.
  if (oFoam > 0.004) {
    vec3 oNf = normalize(vec3(-oRagGrad.x, 1.0, -oRagGrad.y));
    oNw = normalize(mix(oNw, oNf, ${GLITTER.foamFlat.toFixed(3)} * oFoam));
  }
  normal = normalize((viewMatrix * vec4(oNw, 0.0)).xyz);`)
          .replace('#include <opaque_fragment>', `
  // fresnel to the REAL sky: the reflected ray picks its own point on the
  // horizon->zenith gradient. Foam is rougher, so it takes LESS of the sky —
  // but it used to take none at all, which is part of why it read as paint.
  vec3 oR = reflect(-oV, oNw);
  float oFr = pow(1.0 - max(dot(oNw, oV), 0.0), 3.0);
  vec3 oSky = mix(uHor, uZen, pow(clamp(oR.y, 0.0, 1.0), 0.55));
  outgoingLight = mix(outgoingLight, oSky,
    clamp(oFr * uFresnel, 0.0, 1.0) * (1.0 - ${(1 - GLITTER.foamSkyKeep).toFixed(3)} * oFoam));

  // ---- THE GLITTER PATH (src/glitter.js) -----------------------------------
  // The sea's own frame at this pixel: down-range (away from the eye), across
  // the view ray, and up the surface normal. The corridor runs along the first
  // of these, which is why looking at the source is looking down the road.
  vec3 oRange = normalize(vec3(-oV.x, 0.0, -oV.z) + vec3(1e-5, 0.0, 1e-5));
  vec3 oAcr = normalize(cross(oNw, oRange));
  vec3 oAlg = cross(oAcr, oNw);
  // the lobe's width: the unmodelled capillary sea (Cox & Munk) plus every
  // drawn component this pixel's footprint cannot resolve. The footprint is
  // long down-range and narrow across it at grazing incidence, so the lobe is
  // slightly broader along the road than across it.
  vec2 oFt = oGlFoot(oDist, max(oV.y, 0.0), uPixA);
  // the plain tier drops the sub-20 m components from its shading entirely, so
  // ITS lobe must carry them at every distance
  float oCut = uWaveLOD > 0.5 ? 0.0 : ${GLITTER.plainCut.toFixed(1)};
  // and no lobe may be narrower than half a pixel's own angle: on river water
  // Cox & Munk's line clamps to zero and the drawn spectrum alone asks for a
  // 6e-4 rad lobe, which is 0.03 of a pixel — an aliased reflection, not a sharp
  // one, and in practice no reflection at all
  float oSFlr = uPixA * 0.5;
  float oSigA = oGlSigma(max(2.0 * oFt.y, oCut), uSwellL, uSwellS, oSFlr);
  float oSigB = oGlSigma(max(2.0 * oFt.x, oCut), uSwellL, uSwellS, oSFlr);
  // churn is rough water: the wake takes a BROAD lobe, not no lobe. This one
  // line is what makes the Kelvin V answer the sun instead of ignoring it.
  float oFS = ${GLITTER.foamSigma.toFixed(3)};
  oSigA = mix(oSigA, max(oSigA, oFS), oFoam);
  oSigB = mix(oSigB, max(oSigB, oFS), oFoam);
  // the epsilon is not decoration: at twilight, at grazing range, looking away
  // from a source that has just set, oV and uSunDirW can genuinely oppose and
  // the sum goes to zero. This is the one normalize here whose inputs can.
  vec3 oHalf = normalize(oV + uSunDirW + vec3(1e-6, 1e-6, 1e-6));
  vec3 oHl = vec3(dot(oHalf, oAlg), dot(oHalf, oAcr), dot(oHalf, oNw));
  float oGl = oGlLobe(oHl, oSigA, oSigB) * oGlFresnel(dot(oHalf, uSunDirW));
  // THE ROAD SHATTERS (src/glitter.js). CONTRAST ONLY, mean preserved, so the
  // corridor's brightness is still the lobe's and never the noise's — but the
  // corridor is now made of SEPARATE GLINTS instead of being a smooth streak,
  // which is the whole visual signature of sun glitter and the thing the v2
  // showcase did not have. The retired version sampled a world-locked 0.435 m
  // lattice, which is sub-pixel past about forty metres: it averaged to its own
  // mean exactly where the road is, and painted a searchlight beam. THE CELL IS
  // NOW MEASURED IN PIXELS — sparkPx across the view ray and sparkPx along it,
  // so a glint is drawn the same size at 40 m as at 400, and the foreshortening
  // at grazing incidence turns them into the dashes a real road is made of.
  // The frame is the pixel's own down-range direction, which depends on where
  // the EYE is and not on where it is pointed: panning cannot slide the glints.
  //
  // AND IT SHATTERS THE ROAD, NOT THE SEA. The lobe has a broad weak TAIL (the
  // term that keeps a high sun's water a sparkle field instead of a dark sheet
  // with one spot under the mast), and that tail reaches everywhere. Multiplying
  // it by a field that peaks near four turned the whole gale into television
  // static on the first cut — measured on the identical frame. A glint is a
  // FACET aligned to the source; the ambient sheen is multiply-scattered light
  // and is genuinely smooth, so the shatter rides in on the lobe's own strength.
  // Foam is the same argument again: a bubble raft's sheen is diffuse, so the
  // shatter stands down over it rather than making powder of every whitecap.
  float oTw = 1.0;
  if (uDetailAmp > 0.001) {
    float oShat = smoothstep(${GLITTER.sparkOn0.toFixed(3)}, ${GLITTER.sparkOn1.toFixed(3)}, oGl)
      * (1.0 - oFoam);
    if (oShat > 0.002) {
      oTw = mix(1.0, oGlTwinkleAt(vWPos.x, vWPos.z, uTime, oGlSparkNear(oFt.x)), oShat);
    }
  }
  outgoingLight += min(${GLITTER.clamp.toFixed(3)},
    uSparkle * ${GLITTER.gain.toFixed(3)} * oGl * oTw) * uGlitCol;
  // the churn's forward scatter: a bubble raft is a dense scattering medium and
  // scattering has a direction — dazzling from the sunward side, merely pale
  // from the antisolar one. Without this the wake was the same white whatever
  // the sun was doing, which is the whole of "fake and disconnected".
  vec3 oSunAz = normalize(vec3(uSunDirW.x, 0.0, uSunDirW.z) + vec3(1e-5, 0.0, 1e-5));
  float oFwd = 0.5 + 0.5 * dot(oRange, oSunAz);
  // ...and the raft's DEPTH rides on that (glitter.js oGlRaft). oBreakFoam
  // saturates at a third of the break field, so past that point nothing in the
  // picture answered break strength except the facet's own tilt — which runs the
  // wrong way and is exactly how the hardest-breaking water came out darker than
  // water breaking half as hard. A deeper raft scatters more light back out.
  outgoingLight += oFoam * mix(1.0, oGlRaft(oBrk), oWcShare) * uGlitAmp * uGlitCol
    * (${GLITTER.foamBack.toFixed(3)} + ${GLITTER.foamFwd.toFixed(3)} * oFwd * oFwd)
    * (${GLITTER.foamElevFloor.toFixed(3)}
      + ${(1 - GLITTER.foamElevFloor).toFixed(3)} * max(uSunDirW.y, 0.0));
#include <opaque_fragment>`);
    };
    mat.customProgramCacheKey = () => `saltstead-ocean-spectrum-${NWAVE}-glitter3-crest2-raft1`;
    this.step = SIZE / SEG;
    this.glitterScale = 1; // the tier lever: parked at 0 under Plain (invariant 5)
    this._gc = new THREE.Color();  // scratch for the corridor's hue lean
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  // hand over the live wake map (wakemaplayer.js render target)
  setWakeMap(texture) { this.uniforms.uWakeMap.value = texture; }

  // the lens: the glitter lobe's resolution model needs to know how much sea
  // one pixel covers, which is `distance * pixelAngle` across the view ray.
  // Call it at start-up and on every resize.
  setLens(fovYDeg, pxHeight) {
    if (!(pxHeight > 0)) return;
    this.uniforms.uPixA.value = (2 * Math.tan((fovYDeg * Math.PI / 180) / 2)) / pxHeight;
  }

  // hand over the coast map (coastmaplayer.js). The layer owns uvCenter —
  // parked far away until the first bake lands, then the live snapped centre.
  setCoastMap(layer) {
    this.uniforms.uCoastMap.value = layer.texture;
    this.uniforms.uCoastC.value = layer.uvCenter;
  }

  // glit: lightrig.glitterSource() — { dir, ax, az, low, amp, moon }. This
  //   body reads dir (the source's true unit direction), amp, low and moon;
  //   ax/az are the same bearing in scalar form and are not used here.
  // zen: zenith colour for the fresnel sky gradient (falls back near uHor)
  // wakeC: the wake map's snapped centre (wakemaplayer.update's return)
  update(t, cx, cz, camPos, glit, horizon, swell = 1, zen = null, wakeC = null) {
    this.uniforms.uTime.value = t;
    // swell may be the two-band object ({ swell, chop }) or the one-scalar
    // legacy number (the title scene) — either way, clamped to the SAME caps
    // the CPU applies (waves.js setSeaBands): an unclamped uniform once drew
    // a sea the hull wasn't feeling (the 2026-07-24 storm stripes)
    const bands = typeof swell === 'number' ? { swell, chop: swell } : swell;
    this.uniforms.uSwellL.value = Math.min(bands.swell, SEA_SWELL_MAX);
    this.uniforms.uSwellS.value = Math.min(bands.chop, SEA_STATE_MAX);
    const sx = Math.round(cx / this.step) * this.step;
    const sz = Math.round(cz / this.step) * this.step;
    this.mesh.position.set(sx, 0, sz);
    this.uniforms.uOrigin.value.set(sx, sz);
    // THE FOLLOWING ORIGIN IS THE WAVE FIELD'S FRAME (sea v2). Handing it to
    // waves.js keeps the shader's local coordinates small AND — because the
    // phase accumulators absorb the move exactly — changes nothing whatever
    // about the surface, so the snap is a non-event for the hull. The pack
    // must come AFTER the origin, or the GPU would draw last frame's phases
    // against this frame's frame.
    setWaveOrigin(sx, sz);
    packWaveUniforms(t, this.uniforms.uWave.value, this.uniforms.uWaveQ.value);
    // the wind sea's own travel direction — the axis the break field resolves
    // its slope along and the gale's foam streaks lie down. Read from waves.js
    // every frame so a wind shift moves the drawn foam and the felt breaker
    // together (the axes ease over ~55 s; main.js has already eased them by the
    // time this runs).
    const wd = waveBandDir(1);
    this.uniforms.uWindDir.value.set(wd[0], wd[1]);
    // the tier lever: Plain drops the sub-20 m components from the FRAGMENT's
    // shading loops (they are sub-pixel past 60 m and already fbm-patched and
    // distance-faded there). The vertex displacement keeps the full spectrum.
    const fine = this.glitterScale >= 0.5;
    this.uniforms.uWaveLOD.value = fine ? 1 : 0;
    if (glit) {
      // THE SOURCE'S OWN DIRECTION, handed over whole. This used to be rebuilt
      // from glit.low, which capped the elevation at 60.41 degrees and put the
      // sparkle pass and the scene's DirectionalLight on two different suns —
      // 29.6 degrees apart at noon (see lightrig.js glitterSource).
      this.uniforms.uSunDirW.value.fromArray(glit.dir).normalize();
      // THE GLITTER PATH IS NOT A FINE-TIER LUXURY. The lobe is arithmetic —
      // two logs and two exps, no fbm — so Plain can afford the phenomenon
      // even though it cannot afford the twinkle that breaks it into glints.
      // Parking it at 0 there (invariant 5 read too literally) left the cheap
      // tier with no sun on its water at all.
      this.uniforms.uSparkle.value = glit.amp * (fine ? 1 : GLITTER.plainScale);
      this.uniforms.uGlitAmp.value = glit.amp; // foam's light response: both tiers
      this.uniforms.uScatter.value = glit.amp * 0.55;
      // the corridor's colour: warm sun, cold moon, leaning into the horizon's
      // own hue as the source sinks — a low light really is reddened by the air
      // it crosses, and uHor already carries exactly that reddening. HUE ONLY:
      // the horizon sample is renormalised to unit LUMINANCE (not unit max
      // channel — that left a dark night sky dimming the moon's road by a fifth)
      // so the lean changes the colour of the road and never its brightness.
      const c = this.uniforms.uGlitCol.value;
      if (glit.moon) c.setRGB(0.70, 0.80, 1.0); else c.setRGB(1.0, 0.95, 0.86);
      if (horizon) {
        const hl = 0.2126 * horizon.r + 0.7152 * horizon.g + 0.0722 * horizon.b;
        const cl = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
        if (hl > 1e-5) {
          this._gc.copy(horizon).multiplyScalar(cl / hl); // same luminance as c
          c.lerp(this._gc, 0.5 * glit.low);
        }
      }
    }
    this.uniforms.uDetailAmp.value = this.glitterScale;
    if (horizon) this.uniforms.uHor.value.copy(horizon);
    if (zen) this.uniforms.uZen.value.copy(zen);
    else if (horizon) this.uniforms.uZen.value.copy(horizon).multiplyScalar(0.55);
    if (wakeC) this.uniforms.uWakeC.value.copy(wakeC);
  }
}
