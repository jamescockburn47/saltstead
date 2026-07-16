// Legend scenery — the THREE half of legendfx.js. The whirlpool's spinning
// sea-scar at Corryvreckan and the Flying Dutchman's glowing hull off the
// Cape. Built once from primitives at init, toggled by proximity — nothing
// here allocates per frame.

import * as THREE from 'three';
import { buildSloop } from './ship.js';
import { waveHeight } from './waves.js';
import { zoneOf, dutchmanPos } from './legendfx.js';

export class LegendLayer {
  constructor(scene) {
    this.scene = scene;

    // the whirlpool: three concentric foam rings that spin at different
    // rates — cheap, readable, and honest about where the bands are
    this.whirl = zoneOf('corryvreckan');
    this.whirlRings = [];
    if (this.whirl) {
      const mats = [0.5, 0.35, 0.25].map((op) => new THREE.MeshBasicMaterial({
        color: 0xdce9f0, transparent: true, opacity: op, depthWrite: false,
        side: THREE.DoubleSide,
      }));
      const radii = [[0.9, 1.0], [0.5, 0.62], [0.18, 0.3]];
      for (let i = 0; i < 3; i++) {
        const [a, b] = radii[i];
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(this.whirl.r * a, this.whirl.r * b, 48, 1),
          mats[i]);
        ring.rotation.x = -Math.PI / 2;
        ring.visible = false;
        scene.add(ring);
        this.whirlRings.push(ring);
      }
    }

    // the Dutchman: the same sloop, drowned green and faintly glowing
    this.cape = zoneOf('flying-dutchman');
    const ghost = buildSloop();
    ghost.group.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      o.material = o.material.clone();
      o.material.transparent = true;
      o.material.opacity = 0.75;
      if (o.material.color) o.material.color.lerp(new THREE.Color(0x8fe8c0), 0.6);
      if (o.material.emissive) o.material.emissive.set(0x1d4a38);
    });
    ghost.group.scale.setScalar(1.3);
    ghost.group.visible = false;
    this.scene.add(ghost.group);
    this.ghost = ghost;
    this.ghostOn = false;
  }

  // px/pz: the ship. dutchmanOn: the weather gate says she sails tonight.
  update(t, px, pz, dutchmanOn) {
    if (this.whirl) {
      const near = Math.hypot(this.whirl.x - px, this.whirl.z - pz) < this.whirl.r + 900;
      for (let i = 0; i < 3; i++) {
        const ring = this.whirlRings[i];
        ring.visible = near;
        if (!near) continue;
        ring.position.set(this.whirl.x,
          waveHeight(this.whirl.x, this.whirl.z, t) + 0.12 - i * 0.35, this.whirl.z);
        ring.rotation.z = t * (0.4 + i * 0.5); // inner bands spin faster
      }
    }
    this.ghostOn = !!(this.cape && dutchmanOn
      && Math.hypot(this.cape.x - px, this.cape.z - pz) < this.cape.r + 1600);
    this.ghost.group.visible = this.ghostOn;
    if (this.ghostOn) {
      const p = dutchmanPos(t, this.cape.x, this.cape.z, this.cape.r);
      this.ghost.group.position.set(p.x, waveHeight(p.x, p.z, t) - 0.3, p.z);
      this.ghost.group.rotation.y = p.yaw;
      this.ghost.setSail(p.yaw, 0.5, p.yaw - 2.4, 0.8); // full press, always drawing
      this.dutchman = { x: p.x, z: p.z, speed: 6.5 };
    } else {
      this.dutchman = null;
    }
  }

  // contact for the encounter gait (so you can actually catch her)
  contacts() {
    return this.dutchman ? [{ x: this.dutchman.x, z: this.dutchman.z }] : [];
  }
}
