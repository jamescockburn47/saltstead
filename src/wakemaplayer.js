// The wake map — the THREE half of wake.js. The Kelvin V's arm structure is
// 2–3 m wide; the ocean grid's 4 m lattice cannot resolve it, so evaluating
// the wake per VERTEX smeared the V into a shapeless road (the lesson of
// 2026-07-24). Instead the wake field renders into a small offscreen texture
// each frame — wake.js's own GLSL on a full-screen quad, 512² texels over a
// 180 m square around the ship (~0.35 m/texel) — and the ocean samples that
// texture PER PIXEL: crisp diverging arms, sharp foam lines, constant cost
// no matter how many hulls drag wakes.
//
// R = wake height (metres), G = churn/foam mask. Half-float target; the
// centre snaps to the texel grid so the field never swims under the sea.

import * as THREE from 'three';
import { glslWake, WAKE_MAX } from './wake.js';

export const WAKEMAP_METRES = 180; // world metres the map covers
const RES = 512;

export class WakeMapLayer {
  constructor(renderer) {
    this.renderer = renderer;
    this.rt = new THREE.WebGLRenderTarget(RES, RES, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
    const wakeSrc = [];
    for (let i = 0; i < WAKE_MAX; i++) wakeSrc.push(new THREE.Vector4());
    this.uniforms = {
      uCenter: { value: new THREE.Vector2() },
      uWakeSrc: { value: wakeSrc },
      uWakeSpd: { value: new Float32Array(WAKE_MAX) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `precision highp float;
varying vec2 vUv;
uniform vec2 uCenter;
uniform vec4 uWakeSrc[${WAKE_MAX}];
uniform float uWakeSpd[${WAKE_MAX}];
${glslWake()}
void main() {
  vec2 p = uCenter + (vUv - 0.5) * ${WAKEMAP_METRES.toFixed(1)};
  // fade to nothing at the map's rim so the field never CUTS at the border
  vec2 e = abs(vUv - 0.5) * 2.0;
  float rim = 1.0 - smoothstep(0.9, 1.0, max(e.x, e.y));
  gl_FragColor = vec4(wakeSumHF(p) * rim, 0.0, 1.0);
}`,
      depthTest: false,
      depthWrite: false,
    });
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.texel = WAKEMAP_METRES / RES;
    this.center = new THREE.Vector2();
  }

  // cx/cz: follow point (the ship). wakes: wake.js sources or null.
  // Renders the field and returns the SNAPPED centre the ocean must use.
  update(cx, cz, wakes) {
    this.center.set(
      Math.round(cx / this.texel) * this.texel,
      Math.round(cz / this.texel) * this.texel);
    this.uniforms.uCenter.value.copy(this.center);
    const src = this.uniforms.uWakeSrc.value, spd = this.uniforms.uWakeSpd.value;
    for (let i = 0; i < WAKE_MAX; i++) {
      const w = wakes && wakes[i];
      if (w) { src[i].set(w.x, w.z, w.fx, w.fz); spd[i] = w.speed; }
      else spd[i] = 0;
    }
    const prev = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(this.scene, this.cam);
    this.renderer.setRenderTarget(prev);
    return this.center;
  }

  dispose() {
    this.rt.dispose();
    this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }
}
