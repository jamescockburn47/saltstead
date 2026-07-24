// Foam scene layer: renders src/foam.js (pure) — wake quads astern and the
// world-anchored fleck carpet. One geometry + one material per system, both
// dynamic, both single draw calls (invariant 7: pool, share, never per-spawn).

import * as THREE from 'three';
import { flecksAround, newWake, stepWake, wakeAlpha, wakeSize, FLECK_CELL } from './foam.js';
import { waveHeight } from './waves.js';
import { wakeSum } from './wake.js';

const MAX_FLECKS = 900;

// a soft foam sprite, drawn once at runtime (invariant: zero asset files) —
// a radial falloff with a ragged edge so a patch reads as churned water,
// not a stamped square
function foamSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 3, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.88)');
  grad.addColorStop(0.82, 'rgba(255,255,255,0.38)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  // rough the rim: bite deterministic notches out of the disc edge
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 14; i++) {
    const a = i * 2.39996; // golden angle — even but unrepeating
    const r = 24 + 6 * Math.sin(i * 12.9898);
    g.beginPath();
    g.arc(32 + Math.cos(a) * r, 32 + Math.sin(a) * r, 4.5 + 2 * Math.sin(i * 78.233), 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class FoamLayer {
  constructor(scene, wakeCap = 96) {
    this.wake = newWake(wakeCap);
    const sprite = foamSprite();

    // wake: RGBA vertex colours so each patch fades independently in ONE mesh
    const quads = wakeCap;
    this.wakePos = new Float32Array(quads * 4 * 3);
    this.wakeCol = new Float32Array(quads * 4 * 4);
    const uv = new Float32Array(quads * 4 * 2);
    const idx = [];
    for (let q = 0; q < quads; q++) {
      const v = q * 4;
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
      uv.set([0, 0, 1, 0, 1, 1, 0, 1], q * 8);
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.BufferAttribute(this.wakePos, 3).setUsage(THREE.DynamicDrawUsage));
    wg.setAttribute('color', new THREE.BufferAttribute(this.wakeCol, 4).setUsage(THREE.DynamicDrawUsage));
    wg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    wg.setIndex(idx);
    this.wakeMesh = new THREE.Mesh(wg, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, map: sprite,
      side: THREE.DoubleSide, // quads are wound facing down; seen from above
    }));
    this.wakeMesh.frustumCulled = false;
    scene.add(this.wakeMesh);

    // flecks: one Points cloud, positions refreshed as the ship moves —
    // the same soft sprite turns the default square points into foam dots
    this.fleckPos = new Float32Array(MAX_FLECKS * 3);
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(this.fleckPos, 3).setUsage(THREE.DynamicDrawUsage));
    fg.setDrawRange(0, 0);
    this.fleckGeo = fg;
    this.fleckMesh = new THREE.Points(fg, new THREE.PointsMaterial({
      color: 0xe8f4fc, size: 0.3, transparent: true, opacity: 0.5, depthWrite: false,
      map: sprite,
    }));
    this.fleckMesh.frustumCulled = false;
    scene.add(this.fleckMesh);

    this.flecks = [];
    this.fleckCellX = null;
    this.fleckCellZ = null;
  }

  // foam takes the ambient light: bright noon foam, faint moonlit foam.
  // Under bioluminescence (setGlow — lightrig.js bioGlow) the wake stops
  // fading with the dark and BURNS instead: green fire on a black sea.
  setLight(l) {
    const g = this.glow || 0;
    const base = Math.max(0.25 + 0.75 * l, g * 0.9);
    this.wakeMesh.material.color.setRGB(
      base * (1 - 0.65 * g), base, base * (1 - 0.35 * g));
    this.fleckMesh.material.opacity = Math.max(0.5 * (0.2 + 0.8 * l), 0.75 * g);
    this.fleckMesh.material.color.setRGB(1 - 0.4 * g, 1, 1 - 0.1 * g);
  }

  setGlow(g) { this.glow = Math.max(0, Math.min(1, g || 0)); }

  // emitters: [{ x, z, size }] world-space foam sources (stern, bow)
  // wakes: wake.js sources — patches ride the Kelvin humps the water draws
  update(t, dt, cx, cz, speed, emitters, wakes = null) {
    stepWake(this.wake, dt, speed, emitters);
    for (let q = 0; q < this.wake.cap; q++) {
      const s = this.wake.slots[q];
      const a = wakeAlpha(s);
      const half = wakeSize(s) / 2;
      // ride proud of the surface: the ocean mesh interpolates chord-wise
      // between its vertices and would swallow a patch laid flush
      const y = a > 0 ? waveHeight(s.x, s.z, t) + wakeSum(s.x, s.z, wakes) + 0.38 : -10;
      // the patch lies ALONG the course it was dropped on, elongated by its
      // emitter's stretch — the trail reads as churned water, not tiles
      const sw = Math.sin(s.rot), cw = Math.cos(s.rot);
      const lx = sw * half * s.stretch, lz = cw * half * s.stretch;   // along course
      const wx = cw * half, wz = -sw * half;                          // abeam
      const p = q * 12, c = q * 16;
      this.wakePos.set([
        s.x - lx - wx, y, s.z - lz - wz,
        s.x - lx + wx, y, s.z - lz + wz,
        s.x + lx + wx, y, s.z + lz + wz,
        s.x + lx - wx, y, s.z + lz - wz,
      ], p);
      for (let k = 0; k < 4; k++) this.wakeCol.set([1, 1, 1, a], c + k * 4);
    }
    this.wakeMesh.geometry.attributes.position.needsUpdate = true;
    this.wakeMesh.geometry.attributes.color.needsUpdate = true;

    // refresh the fleck list only when the ship crosses into a new grid cell
    const ix = Math.floor(cx / FLECK_CELL), iz = Math.floor(cz / FLECK_CELL);
    if (ix !== this.fleckCellX || iz !== this.fleckCellZ) {
      this.fleckCellX = ix; this.fleckCellZ = iz;
      this.flecks = flecksAround(cx, cz).slice(0, MAX_FLECKS);
      this.fleckGeo.setDrawRange(0, this.flecks.length);
    }
    for (let i = 0; i < this.flecks.length; i++) {
      const f = this.flecks[i];
      this.fleckPos[i * 3] = f.x;
      this.fleckPos[i * 3 + 1] = waveHeight(f.x, f.z, t) + wakeSum(f.x, f.z, wakes)
        + 0.04 + 0.03 * Math.sin(t * 1.7 + f.phase);
      this.fleckPos[i * 3 + 2] = f.z;
    }
    this.fleckGeo.attributes.position.needsUpdate = true;
  }
}
