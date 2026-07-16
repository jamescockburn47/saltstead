// Terrain scene layer: streams low-poly land chunks around the ship.
// One shared material; chunk geometries are disposed when out of range
// (invariant 7). Deep-water chunks are never built at all.

import * as THREE from 'three';
import { CHUNK, buildChunkData, chunkWorthBuilding } from './terraingen.js';

const RADIUS = 7;          // chunks kept loaded around the ship
const BUILDS_PER_FRAME = 2;

export class TerrainLayer {
  constructor(scene) {
    this.scene = scene;
    this.mat = new THREE.MeshPhongMaterial({
      vertexColors: true, flatShading: true, shininess: 2,
    });
    this.chunks = new Map();  // key -> { mesh } | { empty: true }
    this.queue = [];
  }

  key(cx, cz) { return `${cx},${cz}`; }

  update(wx, wz) {
    const ccx = Math.floor(wx / CHUNK), ccz = Math.floor(wz / CHUNK);

    // enqueue missing chunks, nearest first
    for (let r = 0; r <= RADIUS; r++) {
      for (let cz = ccz - r; cz <= ccz + r; cz++) {
        for (let cx = ccx - r; cx <= ccx + r; cx++) {
          if (Math.max(Math.abs(cx - ccx), Math.abs(cz - ccz)) !== r) continue;
          const k = this.key(cx, cz);
          if (!this.chunks.has(k) && !this.queue.some((q) => q.k === k)) {
            this.queue.push({ k, cx, cz, d: r });
          }
        }
      }
    }
    this.queue.sort((a, b) => a.d - b.d);

    // build a couple per frame
    for (let b = 0; b < BUILDS_PER_FRAME && this.queue.length; b++) {
      const { k, cx, cz } = this.queue.shift();
      if (this.chunks.has(k)) continue;
      if (!chunkWorthBuilding(cx, cz)) { this.chunks.set(k, { empty: true }); continue; }
      const { pos, col, idx } = buildChunkData(cx, cz);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, this.mat);
      this.scene.add(mesh);
      this.chunks.set(k, { mesh });
    }

    // drop chunks far out of range (hysteresis of 2 to avoid thrash)
    for (const [k, c] of this.chunks) {
      const [cx, cz] = k.split(',').map(Number);
      if (Math.max(Math.abs(cx - ccx), Math.abs(cz - ccz)) > RADIUS + 2) {
        if (c.mesh) {
          this.scene.remove(c.mesh);
          c.mesh.geometry.dispose();
        }
        this.chunks.delete(k);
      }
    }
  }
}
