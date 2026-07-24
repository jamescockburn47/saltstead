// Terrain scene layer: streams low-poly land chunks around the ship.
// One shared material; chunk geometries are disposed when out of range
// (invariant 7). Deep-water chunks are never built at all.
//
// THE SMOOTH SHORELINE: the material blends per pixel between the analytic
// smooth normal (terraingen nrm) near the waterline and the classic faceted
// derivative normal on the uplands — the land's own version of the smooth-sea
// amendment. Low ground and riverbanks read as one continuous shore; high
// ground keeps the flat-shaded law.

import * as THREE from 'three';
import { CHUNK, RES_SHORE, buildChunkData, chunkWorthBuilding } from './terraingen.js';

const RADIUS = 7;          // chunks kept loaded around the ship
const BUILDS_PER_FRAME = 2; // budget: a fine shore chunk costs both slots

export class TerrainLayer {
  constructor(scene) {
    this.scene = scene;
    this.mat = new THREE.MeshPhongMaterial({
      vertexColors: true, shininess: 2,
    });
    // smooth normals near the waterline, faceted above — one varying, one mix
    this.mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vShoreW;')
        .replace('#include <begin_vertex>',
          '#include <begin_vertex>\nvShoreW = 1.0 - smoothstep(2.5, 8.0, position.y);');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vShoreW;')
        .replace('#include <normal_fragment_begin>',
          '#include <normal_fragment_begin>\n'
          + 'vec3 saltFdx = dFdx( vViewPosition );\n'
          + 'vec3 saltFdy = dFdy( vViewPosition );\n'
          + 'vec3 saltFlatN = normalize( cross( saltFdx, saltFdy ) );\n'
          + 'normal = normalize( mix( saltFlatN, normal, clamp( vShoreW, 0.0, 1.0 ) ) );\n');
    };
    this.mat.customProgramCacheKey = () => 'saltstead-terrain-shore';
    this.chunks = new Map();  // key -> { mesh } | { empty: true }
    this.queue = [];
    this.shadows = false;
  }

  setShadows(on) {
    this.shadows = on;
    for (const c of this.chunks.values()) {
      if (c.mesh) { c.mesh.castShadow = on; c.mesh.receiveShadow = on; }
    }
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

    // build within a per-frame budget: a fine shore chunk is ~4x the verts,
    // so it spends both slots
    for (let b = 0; b < BUILDS_PER_FRAME && this.queue.length;) {
      const { k, cx, cz } = this.queue.shift();
      if (this.chunks.has(k)) continue;
      if (!chunkWorthBuilding(cx, cz)) { this.chunks.set(k, { empty: true }); continue; }
      const { pos, col, nrm, idx, res } = buildChunkData(cx, cz);
      b += res === RES_SHORE ? 2 : 1;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      geo.setIndex(idx);
      const mesh = new THREE.Mesh(geo, this.mat);
      mesh.castShadow = this.shadows;
      mesh.receiveShadow = this.shadows;
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
