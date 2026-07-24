// Shore decoration scene layer — the bodies for shoredecor.js.
// Every PLANT is grown unique by flora.js (the Spire roof garden lesson:
// a tree is a skeleton, not a cone on a stick — and uniqueness costs
// nothing when the cell is merged into one BufferGeometry anyway). The
// 1700s buildings stay stamped from templates. One draw call per cell,
// flat-shaded with vertex colours like every solid thing in the game;
// cells stream on the terrain pattern and dispose whole (invariant 7).
// None of it is walkable: the shore is scenery the ship sails past.
//
// WIND (the Spire laws, classic-GLSL edition): every vertex carries a flex
// weight (flora.js w; 0 on buildings), each instance a phase. The material
// leans the canopy downwind ∝ strength², rocks it at a per-instance natural
// frequency (constant in time — gusts drive AMPLITUDE only), and a slow
// traveling front decorrelates the grove. Buildings stand still.

import * as THREE from 'three';
import { DECOR_CELL, decorForCell } from './shoredecor.js';
import { buildPlant, FLORA_KINDS } from './flora.js';

const RADIUS = 3;           // cells kept around the ship (fog eats the rest)
const BUILDS_PER_FRAME = 1; // a cell is a few hundred geo queries — amortize

// bake a primitive into flat arrays with one colour, local transform applied
function bake(geo, color, tx = 0, ty = 0, tz = 0, rz = 0) {
  if (rz) geo.rotateZ(rz);
  geo.translate(tx, ty, tz);
  const g = geo.toNonIndexed();
  const p = g.getAttribute('position').array.slice();
  const n = g.getAttribute('normal').array.slice();
  const c = new Float32Array(p.length);
  for (let i = 0; i < c.length; i += 3) {
    c[i] = color[0]; c[i + 1] = color[1]; c[i + 2] = color[2];
  }
  geo.dispose(); g.dispose();
  return { p, n, c, w: new Float32Array(p.length / 3) }; // buildings: flex 0
}

function concat(parts) {
  const len = parts.reduce((s, q) => s + q.p.length, 0);
  const p = new Float32Array(len), n = new Float32Array(len), c = new Float32Array(len);
  const w = new Float32Array(len / 3);
  let o = 0;
  for (const q of parts) {
    p.set(q.p, o); n.set(q.n, o); c.set(q.c, o);
    w.set(q.w, o / 3);
    o += q.p.length;
  }
  return { p, n, c, w };
}

// the 1700s building kit — stamped, not grown
function buildTemplates() {
  return {
    // the hot-belt hut: one room under a deep hip of thatch
    hut: concat([
      bake(new THREE.BoxGeometry(3.4, 2.0, 2.8), [0.92, 0.88, 0.8], 0, 1.0, 0),
      bake(new THREE.ConeGeometry(2.6, 1.5, 4).rotateY(Math.PI / 4), [0.5, 0.34, 0.24], 0, 2.75, 0),
    ]),
    // the temperate 1700s cottage: long roof-tree, gable ends, a chimney
    cottage: concat([
      bake(new THREE.BoxGeometry(4.4, 2.3, 3.0), [0.9, 0.85, 0.75], 0, 1.15, 0),
      bake(new THREE.ConeGeometry(2.7, 1.7, 4).rotateY(Math.PI / 4).scale(1.35, 1, 0.92),
        [0.42, 0.3, 0.22], 0, 3.1, 0),
      bake(new THREE.BoxGeometry(0.55, 1.4, 0.55), [0.6, 0.55, 0.5], 1.5, 3.4, 0),
    ]),
    // the village church: nave, tower at the west end, a slate spire
    church: concat([
      bake(new THREE.BoxGeometry(5.2, 3.4, 3.4), [0.82, 0.79, 0.72], 0.7, 1.7, 0),
      bake(new THREE.ConeGeometry(2.9, 1.9, 4).rotateY(Math.PI / 4).scale(1.35, 1, 0.85),
        [0.38, 0.3, 0.26], 0.7, 4.3, 0),
      bake(new THREE.BoxGeometry(1.9, 5.6, 1.9), [0.78, 0.75, 0.68], -2.6, 2.8, 0),
      bake(new THREE.ConeGeometry(1.45, 2.6, 4).rotateY(Math.PI / 4), [0.34, 0.32, 0.34], -2.6, 6.9, 0),
    ]),
  };
}

export class ShoreDecorLayer {
  constructor(scene) {
    this.scene = scene;
    this.templates = buildTemplates();
    this.uniforms = {
      uDecorTime: { value: 0 },
      uWindDir: { value: new THREE.Vector2(1, 0) },
      uWindStr: { value: 0.3 },
    };
    this.mat = new THREE.MeshPhongMaterial({
      vertexColors: true, flatShading: true, shininess: 4,
    });
    this.mat.onBeforeCompile = (sh) => {
      for (const k of Object.keys(this.uniforms)) sh.uniforms[k] = this.uniforms[k];
      sh.vertexShader = 'uniform float uDecorTime;\nuniform vec2 uWindDir;\nuniform float uWindStr;\n'
        + 'attribute vec2 aSway;\n'
        + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  // the Spire wind laws: lean downwind by strength squared, rock at a
  // per-plant natural frequency (gusts scale amplitude, never tempo), a
  // slow traveling front decorrelates the grove. aSway = (flex, phase).
  {
    float wG = 0.55 + 0.45 * sin(dot(transformed.xz, uWindDir) * 0.012
      - uDecorTime * 0.9 + aSway.y * 6.2832);
    float wNat = 1.4 + fract(aSway.y * 7.31) * 1.3;
    float wLean = uWindStr * uWindStr * (0.5 + 0.9 * wG) * 0.55;
    float wSway = sin(uDecorTime * wNat + aSway.y * 6.2832)
      * uWindStr * (0.3 + 0.7 * wG) * 0.34;
    float wAcross = sin(uDecorTime * wNat * 1.31 + aSway.y * 10.7)
      * uWindStr * 0.15;
    float wAmp = aSway.x * (wLean + wSway);
    float wAx = aSway.x * wAcross;
    transformed.x += uWindDir.x * wAmp - uWindDir.y * wAx;
    transformed.z += uWindDir.y * wAmp + uWindDir.x * wAx;
    transformed.y -= (abs(wAmp) + abs(wAx)) * aSway.x * 0.25;
  }`);
    };
    this.mat.customProgramCacheKey = () => 'saltstead-shoredecor-wind';
    this.cells = new Map(); // key -> { mesh } | { empty: true }
    this.queue = [];
    this.shadows = false;
    this.density = 1; // the gfx tier lever
  }

  setShadows(on) {
    this.shadows = on;
    for (const c of this.cells.values()) {
      if (c.mesh) { c.mesh.castShadow = on; c.mesh.receiveShadow = on; }
    }
  }

  setQuality(q) { this.density = q === 'fine' ? 1 : 0.55; }

  // t: seconds; from: direction the wind blows FROM (rad); speed: m/s
  setWind(t, from, speed) {
    this.uniforms.uDecorTime.value = t;
    // blow TOWARD: the vegetation leans away from where the wind comes from
    this.uniforms.uWindDir.value.set(-Math.sin(from), -Math.cos(from));
    this.uniforms.uWindStr.value = Math.max(0, Math.min(1, (speed - 2) / 16));
  }

  key(cx, cz) { return `${cx},${cz}`; }

  buildCell(instances) {
    // grow the plants, stamp the buildings, then merge the lot
    const parts = [];
    for (const it of instances) {
      const T = FLORA_KINDS.includes(it.kind)
        ? buildPlant(it.kind, it.seed ?? 1)
        : this.templates[it.kind];
      if (!T) continue;
      parts.push({ T, it });
    }
    let verts = 0;
    for (const q of parts) verts += q.T.p.length;
    const p = new Float32Array(verts), n = new Float32Array(verts), c = new Float32Array(verts);
    const sway = new Float32Array((verts / 3) * 2);
    let o = 0;
    for (const { T, it } of parts) {
      const cos = Math.cos(it.rot), sin = Math.sin(it.rot);
      const phase = ((it.seed ?? 1) % 1024) / 1024;
      for (let i = 0; i < T.p.length; i += 3) {
        const px = T.p[i] * it.s, py = T.p[i + 1] * it.s, pz = T.p[i + 2] * it.s;
        p[o + i] = px * cos + pz * sin + it.x;
        p[o + i + 1] = py + it.y;
        p[o + i + 2] = -px * sin + pz * cos + it.z;
        const nx = T.n[i], nz = T.n[i + 2];
        n[o + i] = nx * cos + nz * sin;
        n[o + i + 1] = T.n[i + 1];
        n[o + i + 2] = -nx * sin + nz * cos;
        c[o + i] = T.c[i] * it.tint[0];
        c[o + i + 1] = T.c[i + 1] * it.tint[1];
        c[o + i + 2] = T.c[i + 2] * it.tint[2];
        const vi = (o + i) / 3;
        sway[vi * 2] = T.w[i / 3];
        sway[vi * 2 + 1] = phase;
      }
      o += T.p.length;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(n, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
    geo.setAttribute('aSway', new THREE.BufferAttribute(sway, 2));
    geo.computeBoundingSphere();
    // the sway can carry a canopy ~1 m past the static bound
    if (geo.boundingSphere) geo.boundingSphere.radius += 1.5;
    const mesh = new THREE.Mesh(geo, this.mat);
    mesh.castShadow = this.shadows;
    mesh.receiveShadow = this.shadows;
    return mesh;
  }

  update(wx, wz) {
    const ccx = Math.floor(wx / DECOR_CELL), ccz = Math.floor(wz / DECOR_CELL);

    for (let r = 0; r <= RADIUS; r++) {
      for (let cz = ccz - r; cz <= ccz + r; cz++) {
        for (let cx = ccx - r; cx <= ccx + r; cx++) {
          if (Math.max(Math.abs(cx - ccx), Math.abs(cz - ccz)) !== r) continue;
          const k = this.key(cx, cz);
          if (!this.cells.has(k) && !this.queue.some((q) => q.k === k)) {
            this.queue.push({ k, cx, cz, d: r });
          }
        }
      }
    }
    this.queue.sort((a, b) => a.d - b.d);

    for (let b = 0; b < BUILDS_PER_FRAME && this.queue.length; b++) {
      const { k, cx, cz } = this.queue.shift();
      if (this.cells.has(k)) continue;
      const instances = decorForCell(cx, cz, this.density);
      if (!instances.length) { this.cells.set(k, { empty: true }); continue; }
      const mesh = this.buildCell(instances);
      this.scene.add(mesh);
      this.cells.set(k, { mesh });
    }

    for (const [k, c] of this.cells) {
      const [cx, cz] = k.split(',').map(Number);
      if (Math.max(Math.abs(cx - ccx), Math.abs(cz - ccz)) > RADIUS + 2) {
        if (c.mesh) {
          this.scene.remove(c.mesh);
          c.mesh.geometry.dispose();
        }
        this.cells.delete(k);
      }
    }
  }
}
