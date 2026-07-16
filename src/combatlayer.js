// Gun smoke and iron in the air — the THREE half of combat.js. The hit is
// resolved the instant the gun fires (pure combat.js rolls); this layer only
// makes the moment READ: balls arc out from the beam, smoke hangs at the
// muzzle, and a miss raises sea-spray short or over. One pooled geometry and
// material per system (invariant 7: pool, share, never per-spawn).

import * as THREE from 'three';
import { waveHeight } from './waves.js';

const BALLS = 14, PUFFS = 10;
const FLIGHT = 0.9; // s of ball flight, whatever the range — theatre, not physics

export class CombatLayer {
  constructor(scene) {
    this.scene = scene;
    const ballGeo = new THREE.SphereGeometry(0.16, 5, 4);
    const ballMat = new THREE.MeshBasicMaterial({ color: 0x1c1c20 });
    this.balls = [];
    for (let i = 0; i < BALLS; i++) {
      const mesh = new THREE.Mesh(ballGeo, ballMat);
      mesh.visible = false;
      scene.add(mesh);
      this.balls.push({ mesh, t: 0, active: false, from: null, to: null, splash: false });
    }
    const puffGeo = new THREE.SphereGeometry(0.55, 5, 4);
    this.puffMat = new THREE.MeshBasicMaterial({
      color: 0xd8d8d0, transparent: true, opacity: 0.55, depthWrite: false,
    });
    this.puffs = [];
    for (let i = 0; i < PUFFS; i++) {
      const mesh = new THREE.Mesh(puffGeo, this.puffMat.clone());
      mesh.visible = false;
      scene.add(mesh);
      this.puffs.push({ mesh, t: 0, active: false });
    }
  }

  // a broadside leaves the hull: from {x,y,z} toward {x,z}; splash marks a miss
  fire(from, to, splash) {
    const b = this.balls.find((s) => !s.active) || this.balls[0];
    b.active = true; b.t = 0; b.splash = splash;
    b.from = { ...from };
    b.to = { x: to.x, z: to.z };
    const p = this.puffs.find((s) => !s.active) || this.puffs[0];
    p.active = true; p.t = 0;
    p.mesh.position.set(from.x, from.y + 0.3, from.z);
    p.mesh.scale.setScalar(1);
    p.mesh.visible = true;
  }

  update(t, dt) {
    for (const b of this.balls) {
      if (!b.active) continue;
      b.t += dt;
      const u = Math.min(1, b.t / FLIGHT);
      const x = b.from.x + (b.to.x - b.from.x) * u;
      const z = b.from.z + (b.to.z - b.from.z) * u;
      const arc = 3.5 * Math.sin(u * Math.PI); // a lobbed, readable trajectory
      b.mesh.position.set(x, b.from.y + arc - u * 1.5, z);
      b.mesh.visible = true;
      if (u >= 1) {
        b.active = false;
        b.mesh.visible = false;
        if (b.splash) {
          // the sea takes the ball: borrow a puff as spray
          const p = this.puffs.find((s) => !s.active) || this.puffs[0];
          p.active = true; p.t = 0.35; // start half-spent — spray is brief
          p.mesh.material.color.set(0xe8f4fc);
          p.mesh.position.set(x, waveHeight(x, z, t) + 0.4, z);
          p.mesh.scale.setScalar(0.8);
          p.mesh.visible = true;
        }
      }
    }
    for (const p of this.puffs) {
      if (!p.active) continue;
      p.t += dt;
      const u = p.t / 1.4;
      if (u >= 1) {
        p.active = false;
        p.mesh.visible = false;
        p.mesh.material.color.set(0xd8d8d0);
        continue;
      }
      p.mesh.scale.setScalar(1 + u * 2.2);
      p.mesh.material.opacity = 0.55 * (1 - u);
      p.mesh.position.y += dt * 0.8; // smoke rises, spray hangs
    }
  }
}
