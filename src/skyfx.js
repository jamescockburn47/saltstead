// The visible weather — clouds and rain, the THREE half of the forecast.
// weather.js decides WHAT the sky is doing (state + skyDressing table);
// this layer makes it visible: a fleet of flat-shaded cumulus drifting on
// the wind, and rain streaking past the camera when the state is wet.
// Procedural-only, deterministic shapes (noise.js unit2), cheap enough for
// any laptop: one shared cloud material, one rain buffer, no textures.

import * as THREE from 'three';
import { unit2 } from './noise.js';
import { skyDressing } from './weather.js';

const CLOUD_N = 18;          // the whole fleet; skyDressing says how many fly
const CLOUD_ALT = 88;        // cloudbase, metres — low enough to live in the frame
const CLOUD_R = 560;         // wrap square radius: the far rank fades into the fog,
                             // which reads as weather coming over the horizon
const CLOUD_DRIFT = 6;       // m/s of cloud drift downwind
const RAIN_N = 600;          // streaks in the rain volume
const RAIN_R = 45;           // rain volume radius around the camera
const RAIN_H = 34;           // rain volume height
const RAIN_FALL = 22;        // m/s straight down; the wind slants it

const wrap = (v, size) => ((v % size) + size) % size;

export class SkyFx {
  constructor(scene) {
    this.scene = scene;

    // ---- the clouds: puff clusters on a shared, tintable material ----
    this.cloudMat = new THREE.MeshPhongMaterial({
      color: 0xf2f5f7, flatShading: true, transparent: true, opacity: 0.88,
    });
    this.clouds = [];
    for (let i = 0; i < CLOUD_N; i++) {
      const c = new THREE.Group();
      const blobs = 3 + Math.floor(unit2(i * 7.3, 11.1) * 3);
      for (let b = 0; b < blobs; b++) {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), this.cloudMat);
        m.position.set(
          (unit2(i * 3.1, b * 5.7 + 1) - 0.5) * 70,
          (unit2(i * 1.7, b * 9.1 + 2) - 0.5) * 10,
          (unit2(i * 9.7, b * 3.3 + 3) - 0.5) * 48);
        const s = 20 + unit2(i * 5.3, b * 7.7 + 4) * 22;
        m.scale.set(s, s * 0.32, s * 0.75);
        c.add(m);
      }
      c.userData = {
        bx: unit2(i * 13.7, 3.1) * CLOUD_R * 2,   // berth in the wrap square
        bz: unit2(i * 3.7, 17.9) * CLOUD_R * 2,
        alt: CLOUD_ALT + (unit2(i * 8.9, 5.3) - 0.5) * 26,
        rank: (i + 0.5) / CLOUD_N,                 // fair weather flies the low ranks only
        show: 0,                                   // eased 0..1 so cover changes don't pop
      };
      c.visible = false;
      scene.add(c);
      this.clouds.push(c);
    }

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

  // px/pz: the ship (clouds anchor to her waters). camPos: the rain rides
  // the lens. state: weather.js state string. gloom 0..1 darkens the fleet;
  // dayness 0..1 keeps night clouds from glowing.
  update(t, dt, px, pz, camPos, windFrom, state, gloom, dayness) {
    const dress = skyDressing(state);

    // clouds drift DOWNWIND (the wind blows FROM windFrom) and wrap around
    // the ship, so the fleet is endless without ever being managed
    const toX = -Math.sin(windFrom), toZ = -Math.cos(windFrom);
    const driftX = toX * CLOUD_DRIFT * t, driftZ = toZ * CLOUD_DRIFT * t;
    const size = CLOUD_R * 2;
    for (const c of this.clouds) {
      const u = c.userData;
      const want = u.rank <= dress.cloud ? 1 : 0;
      u.show += (want - u.show) * Math.min(1, dt * 0.5);
      c.visible = u.show > 0.03;
      if (!c.visible) continue;
      c.position.set(
        px + wrap(u.bx + driftX - px + CLOUD_R, size) - CLOUD_R,
        u.alt,
        pz + wrap(u.bz + driftZ - pz + CLOUD_R, size) - CLOUD_R);
      c.scale.setScalar(u.show);
    }
    // the fleet greys with the gloom and dims with the day: white cumulus at
    // noon, slate scud in a storm, barely-there shapes at night
    const lit = 0.25 + 0.75 * dayness;
    const grey = 1 - 0.62 * gloom;
    this.cloudMat.color.setRGB(0.95 * lit * grey, 0.96 * lit * grey, 0.97 * lit);
    this.cloudMat.opacity = 0.88 * (0.35 + 0.65 * Math.max(dayness, 0.4));

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
