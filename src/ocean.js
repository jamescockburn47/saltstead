// The ocean surface: one big low-poly grid that follows the ship in
// segment-snapped steps (so vertices never swim), displaced in the vertex
// shader by THE SAME wave sum the CPU uses (src/waves.js) — the sea the eye
// sees is the sea the hull feels.
//
// The onBeforeCompile injection idiom is inherited from Moorstead's
// living-water material (mesher.js addWater).

import * as THREE from 'three';
import { glslWaveSum } from './waves.js';

const SIZE = 720, SEG = 180;

export class Ocean {
  constructor(scene) {
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    this.uniforms = {
      uTime: { value: 0 },
      uOrigin: { value: new THREE.Vector2(0, 0) },
      // the sword-of-the-sun rig (Moorstead mesher.js addWater, ported):
      // glitter lives ONLY in a corridor from the camera toward the light's
      // azimuth; k blends broad noon pool -> narrow blazing blade at a low sun
      uCamPos: { value: new THREE.Vector3() },
      uSunAzim: { value: new THREE.Vector2(0, 1) },
      uSunLow: { value: 0 },
      uGlitter: { value: 0 },
      uFresnel: { value: 0.35 },
      uFresCol: { value: new THREE.Color(0x9ecbea) }, // driven to the horizon colour
    };
    const mat = new THREE.MeshPhongMaterial({
      color: 0x1a5e80,
      specular: 0x9ab8cc,
      shininess: 210,     // tight sun sparkle on the facets
      flatShading: true,  // the low-poly look: derivative normals, faceted swell
    });
    mat.onBeforeCompile = (sh) => {
      for (const k of Object.keys(this.uniforms)) sh.uniforms[k] = this.uniforms[k];
      sh.vertexShader = 'uniform float uTime;\nuniform vec2 uOrigin;\nvarying vec2 vWXZ;\n' + sh.vertexShader
        .replace('#include <begin_vertex>',
          '#include <begin_vertex>\n'
          + '  float wx = position.x + uOrigin.x;\n'
          + '  float wz = position.z + uOrigin.y;\n'
          + '  vWXZ = vec2(wx, wz);\n'
          + `  transformed.y += ${glslWaveSum()};`);
      sh.fragmentShader = 'uniform float uTime;\nuniform vec3 uCamPos;\nuniform vec2 uSunAzim;\n'
        + 'uniform float uSunLow;\nuniform float uGlitter;\nuniform float uFresnel;\nuniform vec3 uFresCol;\nvarying vec2 vWXZ;\n'
        + 'float wHash(vec2 p){ p = fract(p * vec2(123.34, 345.45)); p += dot(p, p + 34.345); return fract(p.x * p.y); }\n'
        + sh.fragmentShader
          .replace('#include <color_fragment>',
            '#include <color_fragment>\n'
            // the corridor: face the light over the sea and a blade of glints
            // runs out to it; turn your back and the whole term zeroes
            + '  vec2 wView = vWXZ - uCamPos.xz;\n'
            + '  float wVL = max(length(wView), 1e-3);\n'
            + '  float wAlign = max(0.0, dot(wView / wVL, uSunAzim));\n'
            + '  float wCorr = pow(wAlign, mix(6.0, 24.0, uSunLow)) * (1.0 + uSunLow);\n'
            // aperiodic cellular sparkle: per-cell speed AND phase from a second
            // hash so no shared frequency survives the population sum ([sword-2])
            + '  float wH = wHash(floor(vWXZ * 0.6));\n'
            + '  float wH2 = wHash(floor(vWXZ * 0.6) + 19.19);\n'
            + '  float wTw = 0.55 + 0.45 * sin(uTime * (1.5 + wH2 * 2.5) + wH2 * 6.2831);\n'
            + '  float wG = step(1.0 - 0.42 * wCorr, wH) * wTw * (0.5 + 0.5 * wH);\n'
            + '  float wDist = smoothstep(12.0, 40.0, wVL);\n'
            + '  diffuseColor.rgb += wG * wCorr * wDist * uGlitter;\n')
          .replace('#include <opaque_fragment>',
            // grazing-angle fresnel: the far sea takes the horizon colour, a
            // poor man's sky reflection that reads perfectly on flat facets
            '  float wFres = pow(1.0 - abs(dot(normalize(vViewPosition), normalize(normal))), 3.0);\n'
            + '  outgoingLight = mix(outgoingLight, uFresCol, min(1.0, wFres * uFresnel));\n'
            + '#include <opaque_fragment>');
    };
    mat.customProgramCacheKey = () => 'saltstead-ocean-sword';
    this.step = SIZE / SEG;
    this.glitterScale = 1; // parked at 0 under Plain (invariant 5)
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  // glit: { ax, az, low, amp } from lightrig.glitterSource
  update(t, cx, cz, camPos, glit, horizon) {
    this.uniforms.uTime.value = t;
    const sx = Math.round(cx / this.step) * this.step;
    const sz = Math.round(cz / this.step) * this.step;
    this.mesh.position.set(sx, 0, sz);
    this.uniforms.uOrigin.value.set(sx, sz);
    if (camPos) this.uniforms.uCamPos.value.copy(camPos);
    if (glit) {
      this.uniforms.uSunAzim.value.set(glit.ax, glit.az);
      this.uniforms.uSunLow.value = glit.low;
      this.uniforms.uGlitter.value = glit.amp * this.glitterScale;
    }
    if (horizon) this.uniforms.uFresCol.value.copy(horizon);
  }
}
