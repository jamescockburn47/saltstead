// Harbour scene layer: builds each port's waterfront (harbour.js layout)
// when the ship sails near, disposes it when she stands away — the same
// stream-in/stream-out discipline as terrain.js (invariant 7). All geometry
// procedural boxes and cylinders; shared materials.

import * as THREE from 'three';
import { harbourLayout, HARBOURED } from './harbour.js';
import { latLonToWorld } from './earth.js';

const BUILD_R = 2800;   // build the waterfront inside this range
const DROP_R = 3600;    // dispose beyond this (hysteresis, no thrash)

export class HarbourLayer {
  constructor(scene) {
    this.scene = scene;
    this.anchors = HARBOURED.map((p) => ({ p, w: latLonToWorld(p.lat, p.lon) }));
    this.built = new Map();  // port id -> { group } | { skip: true }
    const phong = (color) => new THREE.MeshPhongMaterial({ color, flatShading: true, shininess: 4 });
    this.stone = phong(0x8b8377);
    this.stoneDark = phong(0x6f695f);
    this.timber = phong(0x5f4630);
    this.walls = [0xb7a98a, 0x9c8a6e, 0xa78f78].map(phong);
    this.roof = phong(0x7d4034);
    this.lamp = new THREE.MeshBasicMaterial({ color: 0xffd890 });
  }

  update(x, z) {
    for (const { p, w } of this.anchors) {
      const d = Math.hypot(w.x - x, w.z - z);
      const have = this.built.get(p.id);
      if (d < BUILD_R && !have) {
        this.built.set(p.id, this.buildOne(p));
      } else if (d > DROP_R && have && have.group) {
        this.scene.remove(have.group);
        have.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
        this.built.delete(p.id);
      }
    }
  }

  buildOne(p) {
    const lay = harbourLayout(p);
    if (!lay.ok) return { skip: true };
    const g = new THREE.Group();
    const box = (w, h, d, mat, x, y, z, yaw) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.rotation.y = yaw;
      g.add(m);
      return m;
    };
    const D = lay.dir, L = { x: D.z, z: -D.x };

    // the stone quay: a block from below the water to its cap, darker lip
    box(lay.quay.w, 6, lay.quay.d, this.stone,
      lay.quay.x, lay.quay.top - 3, lay.quay.z, lay.yaw);
    box(lay.quay.w, 0.5, lay.quay.d + 0.8, this.stoneDark,
      lay.quay.x, lay.quay.top + 0.25, lay.quay.z, lay.yaw);

    // the timber jetty: deck on piles, running out into the water
    box(lay.jetty.w, 0.45, lay.jetty.len, this.timber,
      lay.jetty.x, lay.jetty.top, lay.jetty.z, lay.yaw);
    const nPiles = Math.max(2, Math.floor(lay.jetty.len / 8));
    for (let i = 0; i <= nPiles; i++) {
      const t = (i / nPiles - 0.5) * lay.jetty.len;
      for (const s of [-1, 1]) {
        const px = lay.jetty.x + D.x * t + L.x * s * (lay.jetty.w / 2 - 0.35);
        const pz = lay.jetty.z + D.z * t + L.z * s * (lay.jetty.w / 2 - 0.35);
        box(0.55, 4.4, 0.55, this.timber, px, lay.jetty.top - 2.0, pz, lay.yaw);
      }
    }

    // warehouses: gabled blocks — a box body and a 45-degree ridge roof
    lay.buildings.forEach((b, i) => {
      const baseY = b.onQuay ? b.y : b.y - 0.6;
      box(b.w, b.h, b.d, this.walls[i % this.walls.length],
        b.x, baseY + b.h / 2, b.z, b.yaw);
      const ridge = new THREE.BoxGeometry(b.w * 0.98, b.d * 0.62, b.d * 0.62);
      ridge.rotateX(Math.PI / 4);
      const roof = new THREE.Mesh(ridge, this.roof);
      roof.position.set(b.x, baseY + b.h + b.d * 0.12, b.z);
      roof.rotation.y = b.yaw;
      g.add(roof);
    });

    // bollards along the quay lip
    for (const bl of lay.bollards) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 1.1, 6), this.stoneDark);
      m.position.set(bl.x, lay.quay.top + 0.55, bl.z);
      g.add(m);
    }

    // the harbour light at the jetty head — a small stone tower, lit lantern
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.4, lay.beacon.h, 6), this.stone);
    tower.position.set(lay.beacon.x, lay.beacon.h / 2 - 1, lay.beacon.z);
    g.add(tower);
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), this.lamp);
    lantern.position.set(lay.beacon.x, lay.beacon.h - 0.6, lay.beacon.z);
    g.add(lantern);

    this.scene.add(g);
    return { group: g };
  }
}
