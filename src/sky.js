// The sky scene layer — Moorstead's day/night machinery on a planetary frame.
// Owns: sun + moon lights and discs, the gradient dome, the star field
// (tilted to the observer's LATITUDE — sail south and watch Polaris sink to
// the horizon and the Southern Cross rise; the sky is a navigation
// instrument), fog and background colour.

import * as THREE from 'three';
import {
  solarState, lunarState, moonPhase, celestialAngles,
  STAR_CATALOGUE, raDecToEq, starField,
} from './skymath.js';
import { moonBrightness, moonlitNight } from './lightrig.js';
import { unit2 } from './noise.js';

const DOME_R = 560, STAR_R = 480;

const DAY_ZENITH = new THREE.Color(0x3f7ac2), DAY_HORIZON = new THREE.Color(0x9ecbea);
const NIGHT_ZENITH = new THREE.Color(0x060a18), NIGHT_HORIZON = new THREE.Color(0x101a2e);
// what a bright moon lifts the night dome toward: slate, not grey
const MOONLIT_ZENITH = new THREE.Color(0x14203a), MOONLIT_HORIZON = new THREE.Color(0x283a54);
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

    // gradient dome with PER-PIXEL clouds — the family verdict from
    // Marsstead's sky stands here too: no blimps, no instanced puff fleets.
    // Cumulus is an fbm coverage field projected on the cloudbase plane,
    // sun-shaded by a coverage sample taken a step toward the light; cirrus
    // is the Mars port verbatim — thin streaks, high and stretched downwind.
    this.domeUniforms = {
      uZen: { value: new THREE.Color() },
      uHor: { value: new THREE.Color() },
      uT: { value: 0 },                       // drift clock (wrapped)
      uCloud: { value: 0 },                   // skyDressing cover 0..1
      uGloom: { value: 0 },
      uDayC: { value: 1 },                    // cloud brightness: day + moonlit lift
      uWindTo: { value: new THREE.Vector2(0, -1) },
      uSunDirW: { value: new THREE.Vector3(0, 1, 0) },
      uSunCol: { value: new THREE.Color(0xfff2d8) },
    };
    const domeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: this.domeUniforms,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position);'
        + ' gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */`
precision highp float;
uniform vec3 uZen, uHor, uSunDirW, uSunCol;
uniform vec2 uWindTo;
uniform float uT, uCloud, uGloom, uDayC;
varying vec3 vDir;
float sH21(vec2 p){ p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23); return fract(p.x * p.y); }
float sVnoise(vec2 p){ vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(sH21(i), sH21(i + vec2(1,0)), f.x),
             mix(sH21(i + vec2(0,1)), sH21(i + vec2(1,1)), f.x), f.y); }
float sFbm(vec2 p){ float a = .5, s = 0.;
  for (int i = 0; i < 4; i++){ s += a * sVnoise(p); p *= 2.03; a *= .5; }
  return s; }
void main() {
  vec3 d = normalize(vDir);
  vec3 sky = mix(uHor, uZen, smoothstep(0.0, 0.45, max(d.y, 0.0)));
  // cumulus: coverage field on the cloudbase plane, drifting downwind
  if (uCloud > 0.01 && d.y > 0.012) {
    vec2 sheet = d.xz / (d.y + 0.18) * 0.34;
    vec2 drift = uWindTo * uT * 0.008;
    float cov = sFbm(sheet + drift + 7.0);
    // the plane projection flattens to a constant at the zenith — give the
    // cap its own variation so overcast can CLOSE overhead
    cov += (sFbm(d.xz * 2.2 + drift + 41.0) - 0.5) * 0.55 * smoothstep(0.35, 0.8, d.y);
    float edge = sFbm(sheet * 2.7 + drift * 1.4 + 31.0);
    float th = 0.96 - uCloud * 0.72;
    float cu = smoothstep(th, th + 0.22, cov + (edge - 0.5) * 0.4);
    // sun-side shading: the coverage sampled a step toward the light —
    // bright tops on the sun side, slate bases in their own shadow
    vec2 toSun = normalize(uSunDirW.xz + vec2(1e-5, 0.0)) * 0.05;
    float shade = clamp((sFbm(sheet + drift + 7.0 + toSun) - cov) * 6.0, -1.0, 1.0);
    float hFade = smoothstep(0.012, 0.06, d.y); // melt into the horizon haze
    vec3 lit = mix(vec3(1.02, 1.00, 0.97), vec3(0.52, 0.55, 0.60), uGloom);
    vec3 base = mix(vec3(0.50, 0.55, 0.63), vec3(0.22, 0.25, 0.30), uGloom);
    vec3 cCol = mix(lit, base, clamp(0.5 + shade * 0.5 + uGloom * 0.25, 0.0, 1.0));
    cCol *= (0.10 + 0.90 * uDayC) * mix(vec3(1.0), uSunCol, 0.35);
    sky = mix(sky, cCol, cu * hFade * 0.94);
  }
  // cirrus: thin ice streaks, high and stretched downwind — fair skies own
  // them; heavy cover buries them (the Mars port, water world palette)
  if (uCloud > 0.01 && uCloud < 0.6 && d.y > 0.03) {
    vec2 sheet = vec2(d.x / (d.y + 0.22), d.z / (d.y + 0.22));
    vec2 wAxis = vec2(uWindTo.y, -uWindTo.x); // across the wind
    vec2 sc = vec2(dot(sheet, uWindTo) * 0.5 + uT * 0.004, dot(sheet, wAxis) * 2.6);
    float streak = sFbm(sc + 13.0);
    float mask = smoothstep(0.04, 0.16, d.y) * smoothstep(0.75, 0.35, d.y);
    float cir = pow(max(0.0, streak - 0.52) * 2.1, 1.6) * mask * (1.0 - uCloud);
    sky += uSunCol * cir * 0.5 * (0.15 + 0.85 * uDayC);
  }
  gl_FragColor = vec4(sky, 1.0);
}`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(DOME_R, 24, 12), domeMat);
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    // sun + moon — SPRITES with drawn faces, the Moorstead idiom (sky.js
    // there): the flat grey circles read as punched holes (James's eye,
    // 2026-07-24). The sun is a blinding core inside a long warm skirt; the
    // moon is PHASE-AWARE — lit limb + terminator ellipse redrawn as the
    // month turns, seeded maria clipped to the lit shape, a whisper of
    // earthshine so the new moon reads as a dark presence, not a hole.
    const sc = document.createElement('canvas');
    sc.width = sc.height = 128;
    {
      const x = sc.getContext('2d');
      const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0.0, 'rgba(255,252,240,1)');    // the blinding core
      g.addColorStop(0.16, 'rgba(255,246,214,1)');
      g.addColorStop(0.24, 'rgba(255,236,180,0.55)'); // the corona shoulder
      g.addColorStop(0.5, 'rgba(255,220,150,0.16)');  // the long warm skirt
      g.addColorStop(1.0, 'rgba(255,210,140,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, 128, 128);
    }
    this.sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(sc), fog: false, transparent: true, depthWrite: false,
    }));
    this.sunDisc.scale.set(88, 88, 1); // the skirt is most of the sprite
    this._moonCanvas = document.createElement('canvas');
    this._moonCanvas.width = this._moonCanvas.height = 64;
    this._moonTex = new THREE.CanvasTexture(this._moonCanvas);
    this.moonDisc = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._moonTex, fog: false, transparent: true, depthWrite: false,
    }));
    this.moonDisc.scale.set(26, 26, 1);
    this._moonPhaseDrawn = -1;
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
  // gloom [0..1]: real weather's overcast/rain/storm weight;
  // cloud [0..1]: skyDressing cover; windFrom: wind bearing (rad) — the
  // dome's per-pixel clouds drift downwind on driftT (defaults to t)
  update(t, latDeg, center, gloom = 0, cloud = 0, windFrom = 0, driftT = null) {
    const sol = solarState(t);
    const lun = lunarState(t);
    this.domeUniforms.uCloud.value = cloud;
    this.domeUniforms.uGloom.value = gloom;
    this.domeUniforms.uT.value = (driftT === null ? t : driftT) % 4096;
    this.domeUniforms.uWindTo.value.set(-Math.sin(windFrom), -Math.cos(windFrom));
    this.domeUniforms.uSunDirW.value.set(sol.dir[0], sol.dir[1], sol.dir[2]);

    // lights (targets track the camera so direction holds anywhere on Earth)
    this.sun.position.set(sol.dir[0] * 100, sol.dir[1] * 100, sol.dir[2] * 100).add(center);
    this.sun.target.position.copy(center);
    this.sun.intensity = 1.5 * sol.dayness * (1 - 0.6 * gloom);
    this.moonLight.position.set(lun.dir[0] * 100, Math.abs(lun.dir[1]) * 100, lun.dir[2] * 100).add(center);
    this.moonLight.target.position.copy(center);
    // full moon lights the sea; new moon leaves it black. moonlitNight
    // (lightrig.js, verify-gated) sets how far the moon lifts the dark —
    // gloom mutes it: cloud stands between the deck and the moon too.
    const ml = moonlitNight(sol.nightness, lun.alt, moonBrightness(moonPhase(t)));
    this.moonLight.intensity = ml.moonInt * (1 - 0.7 * gloom);
    this.hemi.intensity = (0.2 + 0.7 * sol.dayness) * (1 - 0.3 * gloom)
      + ml.hemiLift * (1 - 0.7 * gloom);

    // golden hour warms the sun — the clouds take the same light
    this.sun.color.setHex(0xfff2d8).lerp(GOLD, sol.golden * 0.7);
    this.domeUniforms.uSunCol.value.copy(this.sun.color);

    // dome + fog + background; gloom greys the day (scaled by dayness so a
    // stormy NIGHT stays black, not grey)
    const domeLift = ml.domeLift * (1 - gloom);
    // cloud brightness: full day, or the moon's lift by night — a moonlit
    // scud is faintly there, a new-moon night swallows the sky whole
    this.domeUniforms.uDayC.value = Math.min(1, sol.dayness + ml.domeLift * 0.45);
    this.domeUniforms.uZen.value.copy(NIGHT_ZENITH).lerp(MOONLIT_ZENITH, domeLift)
      .lerp(DAY_ZENITH, sol.dayness)
      .lerp(GLOOM_ZENITH, gloom * sol.dayness);
    this.domeUniforms.uHor.value.copy(NIGHT_HORIZON).lerp(MOONLIT_HORIZON, domeLift)
      .lerp(DAY_HORIZON, sol.dayness)
      .lerp(GOLD, sol.golden * 0.5)
      .lerp(GLOOM_HORIZON, gloom * sol.dayness);
    this._bg.copy(this.domeUniforms.uHor.value);
    this.scene.fog.color.copy(this._bg);
    this.scene.background = this._bg;

    // the discs ride the arcs, parked around the camera (sprites: no lookAt)
    this.sunDisc.position.set(
      center.x + sol.dir[0] * (DOME_R - 30),
      center.y + sol.dir[1] * (DOME_R - 30),
      center.z + sol.dir[2] * (DOME_R - 30));
    this.sunDisc.visible = sol.sunAlt > -0.1;
    // golden hour warms the disc itself; gloom stands cloud before it
    this.sunDisc.material.color.setHex(0xffffff).lerp(GOLD, sol.golden * 0.55);
    this.sunDisc.material.opacity = 1 - 0.75 * gloom;
    const phase = moonPhase(t);
    if (Math.abs(phase - this._moonPhaseDrawn) > 0.004) this._drawMoonPhase(phase);
    this.moonDisc.position.set(
      center.x + lun.dir[0] * (DOME_R - 40),
      center.y + lun.dir[1] * (DOME_R - 40),
      center.z + lun.dir[2] * (DOME_R - 40));
    this.moonDisc.visible = lun.alt > -0.1;
    this.moonDisc.material.opacity = (0.35 + 0.65 * sol.nightness) * (1 - 0.6 * gloom);

    // the star wheel: spin about the celestial pole, then tilt the pole to
    // the observer's latitude — the whole navigation trick in two rotations.
    // celestialAngles is SHARED with navigation.js: the planisphere and the
    // heavens can never disagree (and the pole leans NORTH, wheel runs west)
    const cel = celestialAngles(t, latDeg);
    this._q1.setFromAxisAngle(this._axisY, cel.wheel);
    this._q2.setFromAxisAngle(this._axisX, cel.tilt);
    this.stars.quaternion.copy(this._q2).multiply(this._q1);
    this.stars.position.copy(center);
    this.starMat.opacity = Math.max(0, sol.nightness - 0.25) * 1.33 * (1 - gloom);

    this.dome.position.copy(center);
  }

  // the phase-aware face (Moorstead sky.js _drawMoonPhase, ported): lit
  // limb semicircle + terminator half-ellipse, seeded maria clipped to the
  // lit shape so they wax and wane with it, earthshine under everything.
  // phase: skymath moonPhase — 0 new, 0.5 full, 1 new again.
  _drawMoonPhase(phase) {
    this._moonPhaseDrawn = phase;
    const x = this._moonCanvas.getContext('2d');
    x.clearRect(0, 0, 64, 64);
    const k = Math.cos(phase * Math.PI * 2); // +1 new … -1 full
    const waxing = phase < 0.5;
    // earthshine: the unlit moon is a dark presence, never a hole
    x.fillStyle = 'rgba(150,160,175,0.12)';
    x.beginPath(); x.arc(32, 32, 26, 0, Math.PI * 2); x.fill();
    x.beginPath();
    if (waxing) {
      x.arc(32, 32, 26, -Math.PI / 2, Math.PI / 2, false);
      x.ellipse(32, 32, 26 * Math.abs(k), 26, 0, Math.PI / 2, -Math.PI / 2, k > 0);
    } else {
      x.arc(32, 32, 26, Math.PI / 2, -Math.PI / 2, false);
      x.ellipse(32, 32, 26 * Math.abs(k), 26, 0, -Math.PI / 2, Math.PI / 2, k > 0);
    }
    x.closePath();
    x.save(); x.clip();
    x.fillStyle = '#dde5ee';
    x.fillRect(0, 0, 64, 64);
    // seeded maria, well inboard of the limb (a mare at the edge reads as a
    // bite out of the moon — Moorstead's lesson), soft grey, deterministic
    x.fillStyle = 'rgba(146,156,176,0.34)';
    for (let i = 0; i < 5; i++) {
      const a = unit2(i * 7.3, 11.7) * Math.PI * 2;
      const d = unit2(i * 3.9, 5.1) * 9;
      const r = 3 + unit2(i * 5.7, 9.3) * 4.5;
      x.beginPath();
      x.arc(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, r, 0, Math.PI * 2);
      x.fill();
    }
    x.restore();
    this._moonTex.needsUpdate = true;
  }
}
