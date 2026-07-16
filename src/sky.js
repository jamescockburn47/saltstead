// The sky scene layer — Moorstead's day/night machinery on a planetary frame.
// Owns: sun + moon lights and discs, the gradient dome, the star field
// (tilted to the observer's LATITUDE — sail south and watch Polaris sink to
// the horizon and the Southern Cross rise; the sky is a navigation
// instrument), fog and background colour.

import * as THREE from 'three';
import {
  solarState, lunarState, starWheelAngle, moonPhase,
  STAR_CATALOGUE, raDecToEq, starField,
} from './skymath.js';

const DOME_R = 560, STAR_R = 480;

const DAY_ZENITH = new THREE.Color(0x3f7ac2), DAY_HORIZON = new THREE.Color(0x9ecbea);
const NIGHT_ZENITH = new THREE.Color(0x060a18), NIGHT_HORIZON = new THREE.Color(0x101a2e);
const GOLD = new THREE.Color(0xf2a45c);
// real weather's grey: overcast/rain/storm pull the dome toward these
const GLOOM_ZENITH = new THREE.Color(0x5a6672), GLOOM_HORIZON = new THREE.Color(0x8a939c);

export class Sky {
  constructor(scene) {
    this.scene = scene;

    this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x1a3a50, 0.85);
    this.sun = new THREE.DirectionalLight(0xfff2d8, 1.5);
    this.moonLight = new THREE.DirectionalLight(0xbfd0e8, 0);
    scene.add(this.hemi, this.sun, this.sun.target, this.moonLight, this.moonLight.target);

    // gradient dome: two colours lerped by view height, fog band at horizon
    this.domeUniforms = {
      uZen: { value: new THREE.Color() },
      uHor: { value: new THREE.Color() },
    };
    const domeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: this.domeUniforms,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position);'
        + ' gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 uZen; uniform vec3 uHor; varying vec3 vDir;'
        + ' void main(){ float t = smoothstep(0.0, 0.45, max(vDir.y, 0.0));'
        + ' gl_FragColor = vec4(mix(uHor, uZen, t), 1.0); }',
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(DOME_R, 24, 12), domeMat);
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    // sun + moon discs
    this.sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(16, 20),
      new THREE.MeshBasicMaterial({ color: 0xfff4cc, fog: false }));
    this.moonDisc = new THREE.Mesh(
      new THREE.CircleGeometry(11, 20),
      new THREE.MeshBasicMaterial({ color: 0xdde4f0, fog: false, transparent: true }));
    scene.add(this.sunDisc, this.moonDisc);

    // stars: catalogue first, then the seeded background — one Points object
    // in the EQUATORIAL frame, wheeled + tilted per frame by a quaternion
    const bg = starField();
    const n = STAR_CATALOGUE.length + bg.length;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const put = (i, dir, mag, warmth) => {
      pos[i * 3] = dir[0] * STAR_R; pos[i * 3 + 1] = dir[1] * STAR_R; pos[i * 3 + 2] = dir[2] * STAR_R;
      const b = Math.max(0.15, Math.min(1, 1.35 - mag * 0.22));
      col[i * 3] = b * (0.75 + 0.25 * warmth);
      col[i * 3 + 1] = b * (0.8 + 0.08 * warmth);
      col[i * 3 + 2] = b * (1 - 0.35 * warmth);
    };
    STAR_CATALOGUE.forEach(([, ra, dec, mag, warmth], i) => put(i, raDecToEq(ra, dec), mag, warmth));
    bg.forEach((s, i) => put(STAR_CATALOGUE.length + i, s.dir, s.mag, s.warmth));
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.starMat = new THREE.PointsMaterial({
      size: 1.6, vertexColors: true, transparent: true, opacity: 0,
      fog: false, sizeAttenuation: false, depthWrite: false,
    });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    this._bg = new THREE.Color(); // persistent — no per-frame allocation
    this._q1 = new THREE.Quaternion();
    this._q2 = new THREE.Quaternion();
    this._axisX = new THREE.Vector3(1, 0, 0);
    this._axisY = new THREE.Vector3(0, 1, 0);
  }

  // t: world seconds; latDeg: observer latitude; center: camera position;
  // gloom [0..1]: real weather's overcast/rain/storm weight
  update(t, latDeg, center, gloom = 0) {
    const sol = solarState(t);
    const lun = lunarState(t);

    // lights (targets track the camera so direction holds anywhere on Earth)
    this.sun.position.set(sol.dir[0] * 100, sol.dir[1] * 100, sol.dir[2] * 100).add(center);
    this.sun.target.position.copy(center);
    this.sun.intensity = 1.5 * sol.dayness * (1 - 0.6 * gloom);
    this.moonLight.position.set(lun.dir[0] * 100, Math.abs(lun.dir[1]) * 100, lun.dir[2] * 100).add(center);
    this.moonLight.target.position.copy(center);
    // full moon lights the sea; new moon leaves it black
    const moonUp = Math.max(0, lun.alt);
    this.moonLight.intensity = 0.22 * sol.nightness * moonUp
      * (0.15 + 0.85 * (1 - Math.abs(moonPhase(t) - 0.5) * 2));
    this.hemi.intensity = (0.2 + 0.7 * sol.dayness) * (1 - 0.3 * gloom);

    // golden hour warms the sun
    this.sun.color.setHex(0xfff2d8).lerp(GOLD, sol.golden * 0.7);

    // dome + fog + background; gloom greys the day (scaled by dayness so a
    // stormy NIGHT stays black, not grey)
    this.domeUniforms.uZen.value.copy(NIGHT_ZENITH).lerp(DAY_ZENITH, sol.dayness)
      .lerp(GLOOM_ZENITH, gloom * sol.dayness);
    this.domeUniforms.uHor.value.copy(NIGHT_HORIZON).lerp(DAY_HORIZON, sol.dayness)
      .lerp(GOLD, sol.golden * 0.5)
      .lerp(GLOOM_HORIZON, gloom * sol.dayness);
    this._bg.copy(this.domeUniforms.uHor.value);
    this.scene.fog.color.copy(this._bg);
    this.scene.background = this._bg;

    // discs ride the arcs, parked around the camera
    this.sunDisc.position.set(
      center.x + sol.dir[0] * (DOME_R - 30),
      center.y + sol.dir[1] * (DOME_R - 30),
      center.z + sol.dir[2] * (DOME_R - 30));
    this.sunDisc.lookAt(center);
    this.sunDisc.visible = sol.sunAlt > -0.1;
    this.moonDisc.position.set(
      center.x + lun.dir[0] * (DOME_R - 40),
      center.y + lun.dir[1] * (DOME_R - 40),
      center.z + lun.dir[2] * (DOME_R - 40));
    this.moonDisc.lookAt(center);
    this.moonDisc.visible = lun.alt > -0.1;
    this.moonDisc.material.opacity = 0.35 + 0.65 * sol.nightness;

    // the star wheel: spin about the celestial pole, then tilt the pole to
    // the observer's latitude — the whole navigation trick in two rotations
    this._q1.setFromAxisAngle(this._axisY, starWheelAngle(t));
    this._q2.setFromAxisAngle(this._axisX, (90 - latDeg) * (Math.PI / 180));
    this.stars.quaternion.copy(this._q2).multiply(this._q1);
    this.stars.position.copy(center);
    this.starMat.opacity = Math.max(0, sol.nightness - 0.25) * 1.33 * (1 - gloom);

    this.dome.position.copy(center);
  }
}
