// Foam scene layer: renders src/foam.js (pure) — wake quads astern and the
// world-anchored fleck carpet. One geometry + one material per system, both
// dynamic, both single draw calls (invariant 7: pool, share, never per-spawn).

import * as THREE from 'three';
import { flecksAround, newWake, stepWake, wakeAlpha, wakeSize, FLECK_CELL } from './foam.js';
import { waveHeight } from './waves.js';

const MAX_FLECKS = 900;

export class FoamLayer {
  constructor(scene, wakeCap = 96) {
    this.wake = newWake(wakeCap);

    // wake: RGBA vertex colours so each patch fades independently in ONE mesh
    const quads = wakeCap;
    this.wakePos = new Float32Array(quads * 4 * 3);
    this.wakeCol = new Float32Array(quads * 4 * 4);
    const idx = [];
    for (let q = 0; q < quads; q++) {
      const v = q * 4;
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.BufferAttribute(this.wakePos, 3).setUsage(THREE.DynamicDrawUsage));
    wg.setAttribute('color', new THREE.BufferAttribute(this.wakeCol, 4).setUsage(THREE.DynamicDrawUsage));
    wg.setIndex(idx);
    this.wakeMesh = new THREE.Mesh(wg, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false,
      side: THREE.DoubleSide, // quads are wound facing down; seen from above
    }));
    this.wakeMesh.frustumCulled = false;
    scene.add(this.wakeMesh);

    // flecks: one Points cloud, positions refreshed as the ship moves
    this.fleckPos = new Float32Array(MAX_FLECKS * 3);
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(this.fleckPos, 3).setUsage(THREE.DynamicDrawUsage));
    fg.setDrawRange(0, 0);
    this.fleckGeo = fg;
    this.fleckMesh = new THREE.Points(fg, new THREE.PointsMaterial({
      color: 0xe8f4fc, size: 0.22, transparent: true, opacity: 0.5, depthWrite: false,
    }));
    this.fleckMesh.frustumCulled = false;
    scene.add(this.fleckMesh);

    this.flecks = [];
    this.fleckCellX = null;
    this.fleckCellZ = null;
  }

  // foam takes the ambient light: bright noon foam, faint moonlit foam
  setLight(l) {
    this.wakeMesh.material.color.setScalar(0.25 + 0.75 * l);
    this.fleckMesh.material.opacity = 0.5 * (0.2 + 0.8 * l);
  }

  // emitters: [{ x, z, size }] world-space foam sources (stern, bow)
  update(t, dt, cx, cz, speed, emitters) {
    stepWake(this.wake, dt, speed, emitters);
    for (let q = 0; q < this.wake.cap; q++) {
      const s = this.wake.slots[q];
      const a = wakeAlpha(s);
      const half = wakeSize(s) / 2;
      // ride well proud of the surface: the faceted ocean mesh interpolates
      // ABOVE the analytic height between its vertices and would swallow a
      // patch laid flush
      const y = a > 0 ? waveHeight(s.x, s.z, t) + 0.16 : -10;
      const p = q * 12, c = q * 16;
      this.wakePos.set([
        s.x - half, y, s.z - half,
        s.x + half, y, s.z - half,
        s.x + half, y, s.z + half,
        s.x - half, y, s.z + half,
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
      this.fleckPos[i * 3 + 1] = waveHeight(f.x, f.z, t) + 0.04
        + 0.03 * Math.sin(t * 1.7 + f.phase);
      this.fleckPos[i * 3 + 2] = f.z;
    }
    this.fleckGeo.attributes.position.needsUpdate = true;
  }
}
