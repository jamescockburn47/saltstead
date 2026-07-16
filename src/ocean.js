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
    // non-indexed so every TRIANGLE carries its own centroid attribute: the
    // glitter lights whole facets (the sea's own language), not the square
    // voxel cells the idiom used on Moorstead
    let geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    geo = geo.toNonIndexed();
    {
      const pos = geo.attributes.position;
      const cen = new Float32Array(pos.count * 2);
      for (let v = 0; v < pos.count; v += 3) {
        const cx = (pos.getX(v) + pos.getX(v + 1) + pos.getX(v + 2)) / 3;
        const cz = (pos.getZ(v) + pos.getZ(v + 1) + pos.getZ(v + 2)) / 3;
        for (let k = 0; k < 3; k++) { cen[(v + k) * 2] = cx; cen[(v + k) * 2 + 1] = cz; }
      }
      geo.setAttribute('aCentroid', new THREE.BufferAttribute(cen, 2));
    }
    this.uniforms = {
      uTime: { value: 0 },
      uOrigin: { value: new THREE.Vector2(0, 0) },
      uSwell: { value: 1 }, // sea state — MUST track waves.js getSeaState()
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
      sh.vertexShader = 'uniform float uTime;\nuniform vec2 uOrigin;\nuniform float uSwell;\nattribute vec2 aCentroid;\nvarying vec2 vWXZ;\nvarying vec2 vTriC;\n' + sh.vertexShader
        .replace('#include <begin_vertex>',
          '#include <begin_vertex>\n'
          + '  float wx = position.x + uOrigin.x;\n'
          + '  float wz = position.z + uOrigin.y;\n'
          + '  vWXZ = vec2(wx, wz);\n'
          // constant across each triangle (all 3 verts share aCentroid), so
          // the varying IS the facet id; mod keeps the hash in float precision
          + '  vTriC = mod(aCentroid + uOrigin, vec2(4096.0));\n'
          + `  transformed.y += uSwell * (${glslWaveSum()});`);
      sh.fragmentShader = 'uniform float uTime;\nuniform vec3 uCamPos;\nuniform vec2 uSunAzim;\n'
        + 'uniform float uSunLow;\nuniform float uGlitter;\nuniform float uFresnel;\nuniform vec3 uFresCol;\nvarying vec2 vWXZ;\nvarying vec2 vTriC;\n'
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
            // per-FACET sparkle: hashes key off the triangle centroid, so a
            // glint is one whole tilted facet catching the light — triangular
            // glitter for a triangular sea ([sword-2] anti-pulse kept: each
            // facet has its own twinkle speed AND phase). Centroids sit on
            // multiples of 4/3 m, so *1.5 lands exact integers: the round
            // scrubs off interpolation ulp-noise the hash would amplify
            + '  vec2 wCell = floor(vTriC * 1.5 + 0.5);\n'
            + '  float wH = wHash(wCell * 0.37);\n'
            + '  float wH2 = wHash(wCell * 0.37 + 19.19);\n'
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
  update(t, cx, cz, camPos, glit, horizon, swell = 1) {
    this.uniforms.uTime.value = t;
    this.uniforms.uSwell.value = swell;
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
