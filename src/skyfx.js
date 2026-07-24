// The visible weather — rain, the THREE half of the forecast. weather.js
// decides WHAT the sky is doing (state + skyDressing table); this layer
// makes the WET half visible: rain streaking past the camera when the state
// calls for it. The clouds themselves live in the sky DOME now (sky.js):
// per-pixel fbm cumulus and cirrus, never instanced blobs — the zeppelin
// fleet of solid puffs is gone (2026-07-24, the family verdict: no blimps).

import * as THREE from 'three';
import { unit2 } from './noise.js';
import { skyDressing } from './weather.js';

const RAIN_N = 600;          // streaks in the rain volume
const RAIN_R = 45;           // rain volume radius around the camera
const RAIN_H = 34;           // rain volume height
const RAIN_FALL = 22;        // m/s straight down; the wind slants it

const wrap = (v, size) => ((v % size) + size) % size;

export class SkyFx {
  constructor(scene) {
    this.scene = scene;

    // ---- the rain: line streaks in a cylinder that rides with the camera ----
    this.drops = [];
    for (let i = 0; i < RAIN_N; i++) {
      const ang = unit2(i * 4.7, 9.13) * Math.PI * 2;
      const r = Math.sqrt(unit2(i * 6.1, 3.71)) * RAIN_R;
      this.drops.push({
        x: Math.sin(ang) * r, z: Math.cos(ang) * r,
        y0: unit2(i * 2.9, 7.31) * RAIN_H,
        speed: RAIN_FALL * (0.85 + 0.3 * unit2(i * 5.3, 1.19)),
      });
    }
    this.rainGeo = new THREE.BufferGeometry();
    this.rainPos = new Float32Array(RAIN_N * 6);
    this.rainGeo.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    this.rainMat = new THREE.LineBasicMaterial({
      color: 0xaebdc8, transparent: true, opacity: 0.4,
    });
    this.rain = new THREE.LineSegments(this.rainGeo, this.rainMat);
    this.rain.frustumCulled = false; // the volume is glued to the camera anyway
    this.rain.visible = false;
    scene.add(this.rain);
  }

  // camPos: the rain rides the lens. state: weather.js state string.
  // dayness dims the streaks at night. (px/pz/gloom kept for signature
  // stability; the dome owns the clouds they once steered.)
  update(t, dt, px, pz, camPos, windFrom, state, gloom, dayness) {
    const dress = skyDressing(state);
    const toX = -Math.sin(windFrom), toZ = -Math.cos(windFrom);

    // rain: streaks fall through a camera-glued cylinder, slanted downwind
    if (dress.rain <= 0) { this.rain.visible = false; return; }
    this.rain.visible = true;
    const n = Math.max(1, Math.floor(RAIN_N * dress.rain));
    this.rainGeo.setDrawRange(0, n * 2);
    const slantX = toX * 6 * dress.rain, slantZ = toZ * 6 * dress.rain;
    for (let i = 0; i < n; i++) {
      const d = this.drops[i];
      const y = RAIN_H - wrap(d.y0 + t * d.speed, RAIN_H);
      const u = y / RAIN_H; // higher drops sit further upwind of their landing
      const x = d.x + slantX * u, z = d.z + slantZ * u;
      const len = 0.055 * d.speed;
      const o = i * 6;
      this.rainPos[o] = x; this.rainPos[o + 1] = y; this.rainPos[o + 2] = z;
      this.rainPos[o + 3] = x + slantX * (len / RAIN_H);
      this.rainPos[o + 4] = y - len;
      this.rainPos[o + 5] = z + slantZ * (len / RAIN_H);
    }
    this.rainGeo.attributes.position.needsUpdate = true;
    this.rain.position.copy(camPos).setY(0);
    this.rainMat.opacity = (0.28 + 0.25 * dress.rain) * (0.4 + 0.6 * dayness);
  }
}
