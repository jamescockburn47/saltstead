// Flotsam bodies — THREE lives here; the truth lives in flotsam.js.
// A crate is a crate, a bottle glints green, a raft carries its huddled
// souls. Everything bobs on the live wave field and is culled with the
// list: flotsamNear decides WHAT floats, this layer only dresses it.

import * as THREE from 'three';
import { waveHeight } from './waves.js';
import { buildHand } from './ship.js';

export class FlotsamLayer {
  constructor(scene) {
    this.scene = scene;
    this.live = new Map(); // id -> group
    this.wood = new THREE.MeshPhongMaterial({ color: 0x7a5a38, flatShading: true });
    this.woodDark = new THREE.MeshPhongMaterial({ color: 0x4a3520, flatShading: true });
    this.glass = new THREE.MeshPhongMaterial({ color: 0x2e6b4f, flatShading: true, shininess: 90 });
    this.cork = new THREE.MeshPhongMaterial({ color: 0xc9a86a, flatShading: true });
  }

  build(o) {
    const g = new THREE.Group();
    if (o.kind === 'crate') {
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.8, 1.15), this.wood);
      box.position.y = 0.18;
      g.add(box);
      for (const ry of [0, Math.PI / 2]) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.14, 0.16), this.woodDark);
        band.position.y = 0.44;
        band.rotation.y = ry;
        g.add(band);
      }
    } else if (o.kind === 'bottle') {
      // a bottle at sea scale would vanish — she reads as her own glint
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.75, 7), this.glass);
      body.rotation.z = Math.PI / 2 - 0.25; // riding on her side, neck up
      body.position.y = 0.12;
      g.add(body);
      const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.16, 6), this.cork);
      cork.rotation.z = Math.PI / 2 - 0.25;
      cork.position.set(0.42, 0.22, 0);
      g.add(cork);
    } else { // raft
      for (const px of [-0.9, -0.3, 0.3, 0.9]) {
        const plank = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 3.1), this.wood);
        plank.position.set(px, 0.09, 0);
        g.add(plank);
      }
      for (const pz of [-1.3, 1.3]) {
        const cross = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.14, 0.3), this.woodDark);
        cross.position.set(0, 0.24, pz);
        g.add(cross);
      }
      const stub = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.1, 0.16), this.woodDark);
      stub.position.set(0, 0.75, -0.9);
      g.add(stub);
      // the souls: one always, a second on the bigger rafts — huddled low
      const n = 1 + (o.id.split('-').reduce((s, p) => s + p.length, 0) % 2);
      for (let i = 0; i < n; i++) {
        const soul = buildHand(17 + i);
        soul.scale.setScalar(0.85);
        soul.position.set(i === 0 ? 0.35 : -0.45, 0.2, i === 0 ? 0.4 : -0.3);
        soul.rotation.y = i === 0 ? 2.4 : -0.8;
        g.add(soul);
      }
    }
    this.scene.add(g);
    return g;
  }

  // list: flotsamNear's truth for this frame
  update(t, list) {
    const want = new Set();
    for (const o of list) {
      want.add(o.id);
      let g = this.live.get(o.id);
      if (!g) { g = this.build(o); this.live.set(o.id, g); }
      const phase = o.id.length * 1.7;
      g.position.set(o.x, waveHeight(o.x, o.z, t) - 0.06, o.z);
      g.rotation.y = phase + t * 0.03; // a slow drift-spin
      g.rotation.z = 0.05 * Math.sin(t * 0.8 + phase);
      g.rotation.x = 0.04 * Math.sin(t * 0.6 + phase * 2.1);
    }
    for (const [id, g] of this.live) {
      if (want.has(id)) continue;
      this.scene.remove(g);
      g.traverse((m) => { if (m.geometry) m.geometry.dispose(); });
      this.live.delete(id);
    }
  }
}
