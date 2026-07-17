// Wildlife bodies — the THREE half of wildlife.js. Everything is built once
// at init from primitives (no assets, the procedural-only identity), toggled
// by ambientSpecies, and animated parametrically — no physics, no per-frame
// allocation.

import * as THREE from 'three';
import { waveHeight } from './waves.js';
import { ambientSpecies, porpoiseY, porpoisePitch, circlePos, flapAngle, podStation } from './wildlife.js';

const GREY = new THREE.MeshPhongMaterial({ color: 0x8fa3ad, flatShading: true });
const DARK = new THREE.MeshPhongMaterial({ color: 0x4a5860, flatShading: true });
const WHITE = new THREE.MeshPhongMaterial({ color: 0xe8ecef, flatShading: true });
const BROWN = new THREE.MeshPhongMaterial({ color: 0x6b5a48, flatShading: true });

// a bird: cone body + two hinged wing planes; scale sets gull vs albatross
function buildBird(span, bodyMat, wingMat) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ConeGeometry(span * 0.07, span * 0.45, 5), bodyMat);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const wingGeo = new THREE.PlaneGeometry(span * 0.5, span * 0.16);
  wingGeo.translate(span * 0.25, 0, 0); // hinge at the root
  const wl = new THREE.Mesh(wingGeo, wingMat), wr = new THREE.Mesh(wingGeo, wingMat);
  wl.material.side = THREE.DoubleSide;
  wr.rotation.y = Math.PI;
  g.add(wl, wr);
  return { group: g, wl, wr };
}

// a dolphin: squashed low-poly sphere + dorsal fin
function buildDolphin() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 4), GREY);
  body.scale.set(0.55, 0.5, 1.9);
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 3), DARK);
  fin.position.set(0, 0.32, -0.1);
  g.add(body, fin);
  return g;
}

// a shark: only the fin breaks the surface — the body is a rumour
function buildFin() {
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.75, 3), DARK);
  fin.scale.z = 0.35;
  return fin;
}

const POD = 4, GULLS = 4;

export class WildlifeLayer {
  constructor(scene) {
    this.scene = scene;
    this.gulls = [];
    for (let i = 0; i < GULLS; i++) {
      const b = buildBird(1.0, WHITE, WHITE);
      scene.add(b.group);
      this.gulls.push(b);
    }
    // white body, dark upper wing — how a real albatross reads from the deck
    this.alba = buildBird(3.0, WHITE, BROWN);
    scene.add(this.alba.group);
    this.pod = [];
    for (let i = 0; i < POD; i++) {
      const d = buildDolphin();
      scene.add(d);
      this.pod.push(d);
    }
    this.fin = buildFin();
    scene.add(this.fin);
    this.finDrift = { x: 0, z: 0 };
  }

  // sx/sz: ship; mastTop: world y of the masthead; speed: hull m/s;
  // yaw/scale: the hull's heading and frame scale (shipframe.js) — the pod
  // stations in the ship's own frame so the leaps clear any hull on the ladder
  update(t, dt, sx, sz, mastTop, speed, coastDist, latAbs, yaw = 0, scale = 1) {
    const spec = ambientSpecies(coastDist, latAbs);

    // gulls wheel about the masthead — land is close
    for (let i = 0; i < GULLS; i++) {
      const b = this.gulls[i];
      b.group.visible = spec.gulls;
      if (!spec.gulls) continue;
      const c = circlePos(t, 7 + i * 2.5, 0.5 + i * 0.07, i * 1.9);
      b.group.position.set(sx + c.x, mastTop + 2 + Math.sin(t * 0.7 + i) * 1.5, sz + c.z);
      b.group.rotation.set(0, c.heading, 0);
      const f = flapAngle(t, 9, i);
      b.wl.rotation.z = f; b.wr.rotation.z = -f;
    }

    // the albatross soars a wide slow circle, banked into the turn
    this.alba.group.visible = spec.albatross;
    if (spec.albatross) {
      const c = circlePos(t, 42, 0.09, 3.3);
      this.alba.group.position.set(sx + c.x, 9 + Math.sin(t * 0.23) * 3.5, sz + c.z);
      this.alba.group.rotation.set(0, c.heading, 0);
      this.alba.group.rotateZ(0.35); // the bank
      const f = flapAngle(t, 0.9); // locked wings, the rare unhurried beat
      this.alba.wl.rotation.z = f * 0.3; this.alba.wr.rotation.z = -f * 0.3;
    }

    // dolphins ride the bow wave when you're making way offshore — stationed
    // in the SHIP's frame (podStation, verify-gated) so the leaps stay clear
    // of the planking on every hull, and they face the way she sails
    const podOn = spec.dolphins && speed > 2.5;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    for (let i = 0; i < POD; i++) {
      const d = this.pod[i];
      d.visible = podOn;
      if (!podOn) continue;
      const st = podStation(i, scale);
      const lx = st.x + Math.sin(t * 0.5 + i * 2.1) * 0.5;
      const lz = st.z + Math.sin(t * 0.4 + i) * 1.2;
      const px = sx + lx * cy + lz * sy, pz = sz - lx * sy + lz * cy;
      const phase = t * 2.4 + i * 1.3;
      d.position.set(px, waveHeight(px, pz, t) + porpoiseY(phase), pz);
      d.rotation.set(porpoisePitch(phase), yaw, 0, 'YXZ');
    }

    // the fin circles a slow drift near an idling hull in warm shallows
    const finOn = spec.shark && speed < 2;
    this.fin.visible = finOn;
    if (finOn) {
      this.finDrift.x += (sx - this.finDrift.x) * Math.min(1, dt * 0.1);
      this.finDrift.z += (sz - this.finDrift.z) * Math.min(1, dt * 0.1);
      const c = circlePos(t, 13, 0.16, 1.1);
      const fx = this.finDrift.x + c.x, fz = this.finDrift.z + c.z;
      this.fin.position.set(fx, waveHeight(fx, fz, t) + 0.2, fz);
      this.fin.rotation.y = c.heading;
    }
  }
}
