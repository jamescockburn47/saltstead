// The inshore flock — Moorstead's murmuration idiom (birds.js there) put to
// sea: ONE THREE.Points, fully GPU-animated. Per-bird attributes are baked
// once from the deterministic hash (noise.js unit2 — invariant 6, no
// Math.random), all motion is summed sines in the vertex shader driven by
// uTime, and the CPU pokes a handful of uniforms a frame: the flock's
// wheeling centre, the stretch that morphs the cloud (ball → ribbon →
// sheet), and the fade that wildlife.js's flockGate drives from the coast
// distance — the flock IS the depth sounder you can see.
//
// The gulls read as WHITE flecks with a per-bird flap flicker in the point
// size — small birds at range are a shimmer, not geometry.

import * as THREE from 'three';
import { unit2 } from './noise.js';

const COUNT = 64;

const FLOCK_VERT = /* glsl */`
  attribute vec3 aSeed;
  uniform float uTime;
  uniform vec3 uCentre;
  uniform vec3 uStretch;
  uniform float uFade;
  varying float vAlpha;
  void main() {
    float t = uTime;
    // three slow orbits per bird, phase-locked to its seed: each keeps her
    // own lane inside the flock instead of swimming through her neighbours
    vec3 orbit = vec3(
      sin(t * 0.42 + aSeed.x * 6.2831) * cos(t * 0.19 + aSeed.y * 6.2831),
      sin(t * 0.31 + aSeed.y * 6.2831 + 1.7) * 0.6,
      cos(t * 0.37 + aSeed.z * 6.2831) * sin(t * 0.23 + aSeed.x * 6.2831 + 0.9));
    vec3 jitter = vec3(
      sin(t * 5.0 + aSeed.x * 40.0),
      sin(t * 5.0 + aSeed.y * 40.0 + 2.1),
      sin(t * 5.0 + aSeed.z * 40.0 + 4.2)) * 0.3;
    vec3 pos = uCentre + orbit * uStretch + jitter;
    vAlpha = uFade;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    // the flap flicker: each bird's beat pulses her fleck — the shimmer a
    // real flock has at range
    float flap = 0.75 + 0.25 * sin(t * (6.0 + aSeed.y * 3.0) + aSeed.x * 40.0);
    gl_PointSize = uFade <= 0.001 ? 0.0 : clamp(420.0 / -mv.z, 1.0, 7.0) * flap;
  }
`;

const FLOCK_FRAG = /* glsl */`
  precision mediump float;
  uniform sampler2D uMap;
  varying float vAlpha;
  void main() {
    if (vAlpha <= 0.004) discard;
    vec4 tex = texture2D(uMap, gl_PointCoord);
    float a = tex.a * vAlpha;
    if (a <= 0.004) discard;
    gl_FragColor = vec4(tex.rgb, a);
  }
`;

// soft white fleck — a gull against sea or sky (built once; the module is
// only ever imported by the layer, never headless)
let _fleckTex = null;
function gullFleck() {
  if (_fleckTex) return _fleckTex;
  const S = 8;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(244,248,250,0.95)');
  g.addColorStop(0.6, 'rgba(238,243,246,0.7)');
  g.addColorStop(1, 'rgba(238,243,246,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  _fleckTex = new THREE.CanvasTexture(c);
  return _fleckTex;
}

export class FlockLayer {
  constructor(scene) {
    this.scene = scene;
    this.fade = 0;
    const seeds = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      seeds[i * 3] = unit2(i * 3.1, 7.7);
      seeds[i * 3 + 1] = unit2(i * 5.3, 13.9);
      seeds[i * 3 + 2] = unit2(i * 9.7, 3.3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
    this.uniforms = {
      uTime: { value: 0 },
      uCentre: { value: new THREE.Vector3() },
      uStretch: { value: new THREE.Vector3(14, 6, 14) },
      uFade: { value: 0 },
      uMap: { value: gullFleck() },
    };
    this.points = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: FLOCK_VERT,
      fragmentShader: FLOCK_FRAG,
      transparent: true,
      depthWrite: false,
    }));
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
  }

  // gate: wildlife.js flockGate(coastDist) — eased here so the flock
  // GATHERS and disperses rather than popping
  update(t, dt, sx, sz, gate) {
    this.fade += (gate - this.fade) * Math.min(1, dt * 0.4);
    const on = this.fade > 0.01;
    this.points.visible = on;
    if (!on) return;
    const u = this.uniforms;
    u.uTime.value = t;
    u.uFade.value = Math.min(1, this.fade);
    // the flock patrols its own patch of sky off the ship — a slow wheeling
    // Lissajous, never glued to the masthead: you sail PAST the flock
    u.uCentre.value.set(
      sx + Math.sin(t * 0.045) * 90,
      16 + Math.sin(t * 0.06 + 1.1) * 7,
      sz + Math.cos(t * 0.038 + 2.3) * 90);
    // the cloud morphs: ball -> ribbon -> sheet, the murmuration signature
    u.uStretch.value.set(
      8 + 12 * (0.5 + 0.5 * Math.sin(t * 0.08)),
      3 + 5 * (0.5 + 0.5 * Math.sin(t * 0.065 + 2.1)),
      8 + 12 * (0.5 + 0.5 * Math.sin(t * 0.071 + 4.2)));
  }
}
