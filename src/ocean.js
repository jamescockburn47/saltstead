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
//  - Phong's own specular from the real sun/moon DirectionalLights over the
//    perturbed normal IS the glitter path now — it elongates toward a low
//    sun because that is what specular over a rough sea does. The old
//    per-facet corridor rig (aCentroid hash glints) died with the facets.
//  - a sharp sparkle pass over the reflected ray adds the blinding
//    pinpricks, twinkling by scrolling noise, scaled by lightrig's
//    glitterSource amp (sun by day, the moon's blade by night).
//  - fresnel mixes toward the REAL sky gradient (horizon -> zenith along
//    the reflected ray), not one flat colour: near water reads deep, far
//    water mirrors the sky.
//  - crests pass light: a subsurface-scatter tint lifts high water toward
//    green-glass when you look through a crest toward the light.
//  - froth: whitecaps ride the crests when the sea state is up (fbm-patchy,
//    never a uniform dusting), and the wake's churn mask lays a white road
//    astern that widens and fades. Foam kills specular and fresnel — churned
//    water is matte.

import * as THREE from 'three';
import {
  glslWaveSumBand, glslWaveGradBand, GRAD_BANDS, glslShore,
  MAX_SWELL_HEIGHT, MAX_CHOP_HEIGHT, MAX_SHORE_HEIGHT, SHORE_SHADE,
  SEA_STATE_MAX, SEA_SWELL_MAX, SWELL_LEN, getChopRot,
} from './waves.js';
import { WAKEMAP_METRES } from './wakemaplayer.js';
import { COASTMAP_METRES } from './coastmaplayer.js';

const SIZE = 720, SEG = 180;

// the family fbm (Marsstead glsl.js), o-prefixed against chunk collisions.
// Decorative GPU noise: deliberately NOT noise.js — only geometry heights
// carry the determinism contract.
const O_FBM = /* glsl */`
  float oH21(vec2 p){ p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23); return fract(p.x * p.y); }
  float oVnoise(vec2 p){ vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(oH21(i), oH21(i + vec2(1,0)), f.x),
               mix(oH21(i + vec2(0,1)), oH21(i + vec2(1,1)), f.x), f.y); }
  float oFbm(vec2 p){ float a = .5, s = 0.;
    for (int i = 0; i < 4; i++){ s += a * oVnoise(p); p *= 2.03; a *= .5; }
    return s; }
`;

export class Ocean {
  constructor(scene) {
    // indexed grid — smooth shading needs no per-triangle attributes, so the
    // non-indexed centroid rig of the faceted era is gone with the facets
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
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
      // the wind's turn on the chop fan (cos, sin) — MUST track waves.js
      // getChopRot(), or the drawn wind-sea runs a different way from the
      // felt one. update() reads it from the module every frame.
      uChopCS: { value: new THREE.Vector2(1, 0) },
      uSunDirW: { value: new THREE.Vector3(0, 1, 0) }, // world, sun or moon
      uSparkle: { value: 0 },   // glitterSource amp × the quality lever
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
}` + glslShore();
      sh.vertexShader = 'uniform float uTime;\nuniform vec2 uOrigin;\n'
        + 'uniform float uSwellL;\nuniform float uSwellS;\nuniform vec2 uChopCS;\n'
        + 'uniform sampler2D uWakeMap;\nuniform vec2 uWakeC;\n'
        + 'uniform sampler2D uCoastMap;\nuniform vec2 uCoastC;\n'
        + 'varying vec3 vWPos;\nvarying float vVDist;\n'
        + wakeSample + '\n' + coastSample + '\n'
        + sh.vertexShader
          .replace('#include <begin_vertex>',
            '#include <begin_vertex>\n'
            + '  float wx = position.x + uOrigin.x;\n'
            + '  float wz = position.z + uOrigin.y;\n'
            + '  vec2 wWUv = oWakeUv(vec2(wx, wz));\n'
            + '  float wWakeH = texture2D(uWakeMap, wWUv).r * oWakeIn(wWUv);\n'
            + '  float wSd = oCoastSd(vec2(wx, wz));\n'
            + '  float wGate = oShoreGate(length(oCoastGradW(vec2(wx, wz))));\n'
            // the two populations scaled apart, exactly as waves.js scales
            // them (the shore set is chop's kin — it rides uSwellS)
            + `  transformed.y += oShoreAtten(wSd) * (uSwellL * (${glslWaveSumBand(SWELL_LEN, 1e9)}) + uSwellS * (${glslWaveSumBand(0, SWELL_LEN)}))\n`
            + '    + uSwellS * oShoreSum(wSd) * wGate + wWakeH;\n'
            + '  vWPos = vec3(wx, transformed.y, wz);')
          .replace('#include <project_vertex>',
            '#include <project_vertex>\n'
            + '  vVDist = -mvPosition.z;');
      sh.fragmentShader = 'uniform float uTime;\n'
        + 'uniform float uSwellL;\nuniform float uSwellS;\nuniform vec2 uChopCS;\n'
        + 'uniform vec3 uSunDirW;\nuniform float uSparkle;\nuniform float uScatter;\n'
        + 'uniform float uFresnel;\nuniform vec3 uHor;\nuniform vec3 uZen;\nuniform float uDetailAmp;\n'
        + 'uniform sampler2D uWakeMap;\nuniform vec2 uWakeC;\n'
        + 'uniform sampler2D uCoastMap;\nuniform vec2 uCoastC;\n'
        + 'varying vec3 vWPos;\nvarying float vVDist;\n'
        + `const float O_MAXHL = ${MAX_SWELL_HEIGHT.toFixed(4)};\n`
        + `const float O_MAXHS = ${MAX_CHOP_HEIGHT.toFixed(4)};\n`
        + `const float O_MAXSH = ${MAX_SHORE_HEIGHT.toFixed(4)};\n`
        + O_FBM + wakeSample + '\n' + coastSample + '\n'
        + sh.fragmentShader
          .replace('#include <color_fragment>', `#include <color_fragment>
  // ---- the water's own colour work (main-scope: later passes read these)
  float wx = vWPos.x; float wz = vWPos.z;
  vec3 oV = normalize(cameraPosition - vWPos);
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
  float oSEnv = oShoreEnv(oSd);
  vec2 oCG = oCoastGrad(vWPos.xz);
  float oCLen = length(oCG);
  // the strait gate: no shore set where the wide-baseline gradient sags —
  // the middle of a channel is SHELTERED water, not a surf zone
  float oCGate = oShoreGate(length(oCoastGradW(vWPos.xz)));
  vec2 oCDir = oCLen > 1e-4 ? oCG / oCLen : vec2(0.0);
  float oH = oSAtt * (uSwellL * (${glslWaveSumBand(SWELL_LEN, 1e9)})
    + uSwellS * (${glslWaveSumBand(0, SWELL_LEN)}))
    + uSwellS * oShoreSum(oSd) * oCGate;
  // the gradient by WAVELENGTH BAND (waves.js GRAD_BANDS): long swell shades
  // to the horizon; mid sea fades out where its wavelength is pixels; short
  // chop fades sooner AND comes in cat's-paw patches — a 5 m ripple drawn as
  // a global sinusoid was a stripe field to the horizon (the title scene
  // only ever looked right because its fog hid everything past 120 m).
  // HEIGHT above stays the exact felt surface; this is lighting resolution.
  // Each band also carries its OWN sea state: the swell rollers ride uSwellL,
  // the wind-sea rides uSwellS (GRAD_BANDS.long === SWELL_LEN, so the LOD
  // long band IS the swell population).
  vec2 oWGl = ${glslWaveGradBand(GRAD_BANDS.long, 1e9)};
  vec2 oWGm = ${glslWaveGradBand(GRAD_BANDS.mid, GRAD_BANDS.long)};
  vec2 oWGs = ${glslWaveGradBand(0, GRAD_BANDS.mid)};
  float oChop = uDetailAmp > 0.001
    ? 0.35 + 0.65 * oFbm(vWPos.xz * 0.021 + uTime * vec2(0.013, 0.009))
    : 0.7;
  float oFadeS = 1.0 - smoothstep(60.0, 240.0, vVDist);
  float oFadeM = 1.0 - smoothstep(240.0, 700.0, vVDist);
  vec2 oWGopen = uSwellL * oWGl
    + uSwellS * (oWGm * mix(0.55, 1.0, oChop) * oFadeM + oWGs * oChop * oFadeS);
  vec2 oWG = oSAtt * oWGopen
    + uSwellS * oShoreGradMag(oSd) * ${SHORE_SHADE.toFixed(2)} * oCGate * oCDir + oWkG;
  // crest measure: -1 trough -> +1 highest possible crest at this sea state
  float oCrest = clamp(0.5 + 0.5 * oH / max(0.2, uSwellL * O_MAXHL + uSwellS * O_MAXHS), 0.0, 1.0);
  // froth. Whitecaps only when the wind has the sea up (weather.js drives
  // uSwellS): fbm patches pick WHICH crests break — never a uniform dusting.
  // froth on EVERY tier: the wake's churn is a texture read, so even Plain
  // keeps her white road (flat-toned there). Fine adds the whitecaps and
  // the streaky fbm lace.
  float oFoam = 0.0;
  {
    float oWc = 0.0;
    float oRag = 0.72;
    if (uDetailAmp > 0.001) {
      // whitecaps are the WIND-SEA breaking — the chop state is the wind
      // proxy, and far-travelled swell under light air must not foam
      float wcGate = smoothstep(1.05, 1.75, uSwellS);
      // WHICH crests break: two independent fbm masks at well-separated
      // scales. One mask at one scale still let every crest of a wave row
      // break inside a patch — rows of identical blobs marching in step
      // (the storm rings, 2026-07-24). The broad mask breaks the rows: a
      // crest must win both lotteries, and the winners scatter.
      float wcPatch = smoothstep(0.50, 0.80, oFbm(vWPos.xz * 0.05 + uTime * 0.02))
        * smoothstep(0.33, 0.58, oFbm(vWPos.xz * 0.013 - uTime * 0.008 + 7.3));
      oWc = smoothstep(0.72, 0.95, oCrest) * wcGate * wcPatch;
      // churned texture inside any foam: streaky lace, alive — high-contrast
      // fine fbm so heavy churn still reads as WATER torn white, not paint
      oRag = 0.40 + 0.60 * oFbm(vWPos.xz * 1.9 + uTime * vec2(0.11, 0.07));
    }
    // breakers: the shore set's own crests whiten as they close the beach —
    // foam lines that lie parallel to the shore because the crests do.
    // Confined to the SURF ZONE (the last ~140 m): the crest measure is
    // normalized, and unconfined it painted faint stripes 400 m out.
    // thin LINES on the highest crests only — sheets of white read as
    // artifact, a line of white reads as surf
    float oBrk = 0.0;
    if (oSEnv > 0.02) {
      float oSC = clamp(0.5 + 0.5 * oShoreSum(oSd) / max(0.05, oSEnv * O_MAXSH), 0.0, 1.0);
      float oSurf = 1.0 - smoothstep(90.0, 200.0, -oSd);
      oBrk = smoothstep(0.84, 0.97, oSC) * smoothstep(0.06, 0.5, oSEnv) * oSurf * oCGate;
    }
    oFoam = clamp((oWkHF.y * 0.85 + oWc + oBrk * 0.5) * oRag, 0.0, 1.0);
  }
  // crests pass light: looking through high water toward the sun finds
  // green glass (cheap subsurface scatter — reads huge, costs nothing)
  float oToward = max(0.0, dot(vec3(-oV.x, 0.35, -oV.z), uSunDirW));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.10, 0.42, 0.40),
    oCrest * oCrest * oToward * uScatter);
  // foam takes the scene light like everything else: tinted BEFORE lighting;
  // capped short of pure white so the sea always shows through the lace
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.90, 0.95, 0.96), oFoam * 0.85);`)
          .replace('#include <specularmap_fragment>', `#include <specularmap_fragment>
  specularStrength *= 1.0 - 0.85 * oFoam; // churned water is matte`)
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
  normal = normalize((viewMatrix * vec4(oNw, 0.0)).xyz);`)
          .replace('#include <opaque_fragment>', `
  // fresnel to the REAL sky: the reflected ray picks its own point on the
  // horizon->zenith gradient. Foam is matte and opts out.
  vec3 oR = reflect(-oV, oNw);
  float oFr = pow(1.0 - max(dot(oNw, oV), 0.0), 3.0);
  vec3 oSky = mix(uHor, uZen, pow(clamp(oR.y, 0.0, 1.0), 0.55));
  outgoingLight = mix(outgoingLight, oSky, clamp(oFr * uFresnel, 0.0, 1.0) * (1.0 - oFoam));
  // the sparkle pass: blinding pinpricks where the reflected ray finds the
  // light, twinkling by scrolling noise — sun by day, the moon's blade by
  // night (lightrig glitterSource feeds uSparkle for both)
  float oGl = pow(max(dot(oR, uSunDirW), 0.0), 260.0);
  float oTw = 0.6 + 0.4 * oVnoise(vWPos.xz * 2.3 + uTime * vec2(1.1, 0.7));
  outgoingLight += uSparkle * oGl * oTw * vec3(1.0, 0.95, 0.85) * (1.0 - oFoam);
#include <opaque_fragment>`);
    };
    mat.customProgramCacheKey = () => 'saltstead-ocean-twoband';
    this.step = SIZE / SEG;
    this.glitterScale = 1; // the tier lever: parked at 0 under Plain (invariant 5)
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  // hand over the live wake map (wakemaplayer.js render target)
  setWakeMap(texture) { this.uniforms.uWakeMap.value = texture; }

  // hand over the coast map (coastmaplayer.js). The layer owns uvCenter —
  // parked far away until the first bake lands, then the live snapped centre.
  setCoastMap(layer) {
    this.uniforms.uCoastMap.value = layer.texture;
    this.uniforms.uCoastC.value = layer.uvCenter;
  }

  // glit: { ax, az, low, amp } from lightrig.glitterSource
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
    // the wind's turn, read from the same module the hull reads
    const rot = getChopRot();
    this.uniforms.uChopCS.value.set(Math.cos(rot), Math.sin(rot));
    const sx = Math.round(cx / this.step) * this.step;
    const sz = Math.round(cz / this.step) * this.step;
    this.mesh.position.set(sx, 0, sz);
    this.uniforms.uOrigin.value.set(sx, sz);
    if (glit) {
      // rebuild the light's world direction from the corridor drive: low is
      // 1 - alt * 1.15 (lightrig), so invert; grazing light stays a whisker up
      const y = Math.max(0.04, Math.min(1, (1 - glit.low) / 1.15));
      const h = Math.sqrt(Math.max(0, 1 - y * y));
      this.uniforms.uSunDirW.value.set(glit.ax * h, y, glit.az * h).normalize();
      this.uniforms.uSparkle.value = glit.amp * this.glitterScale;
      this.uniforms.uScatter.value = glit.amp * 0.55;
    }
    this.uniforms.uDetailAmp.value = this.glitterScale;
    if (horizon) this.uniforms.uHor.value.copy(horizon);
    if (zen) this.uniforms.uZen.value.copy(zen);
    else if (horizon) this.uniforms.uZen.value.copy(horizon).multiplyScalar(0.55);
    if (wakeC) this.uniforms.uWakeC.value.copy(wakeC);
  }
}
