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
    };
    const mat = new THREE.MeshPhongMaterial({
      color: 0x1a5e80,
      specular: 0x9ab8cc,
      shininess: 210,     // tight sun sparkle on the facets
      flatShading: true,  // the low-poly look: derivative normals, faceted swell
    });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uniforms.uTime;
      sh.uniforms.uOrigin = this.uniforms.uOrigin;
      sh.vertexShader = 'uniform float uTime;\nuniform vec2 uOrigin;\n' + sh.vertexShader
        .replace('#include <begin_vertex>',
          '#include <begin_vertex>\n'
          + '  float wx = position.x + uOrigin.x;\n'
          + '  float wz = position.z + uOrigin.y;\n'
          + `  transformed.y += ${glslWaveSum()};`);
    };
    mat.customProgramCacheKey = () => 'saltstead-ocean';
    this.step = SIZE / SEG;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  update(t, cx, cz) {
    this.uniforms.uTime.value = t;
    const sx = Math.round(cx / this.step) * this.step;
    const sz = Math.round(cz / this.step) * this.step;
    this.mesh.position.set(sx, 0, sz);
    this.uniforms.uOrigin.value.set(sx, sz);
  }
}
