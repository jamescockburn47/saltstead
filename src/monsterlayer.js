// Monster bodies — the THREE half of monsters.js. Everything is primitives
// built once at init (no assets), toggled and animated parametrically.
// The Kraken earned its billing (NEXT.md block B): eight-jointed arms
// riding the pure tentacleSpine curve, churn where they pierce the sea, a
// surfacing EYE when it tires, and an ink bloom when it lets go. The
// dragon is the buildBird idea at nightmare scale: red, horned, and
// coming down at you.

import * as THREE from 'three';
import { waveHeight } from './waves.js';
import { KRAKEN_ARMS, ARM_SEGS, tentacleSpine, dragonAlt, DRAGON_STOOP } from './monsters.js';

const KRAKEN_SKIN = new THREE.MeshPhongMaterial({ color: 0x4a3a4e, flatShading: true });
const KRAKEN_UNDER = new THREE.MeshPhongMaterial({ color: 0x8a6a72, flatShading: true });
const DRAGON_HIDE = new THREE.MeshPhongMaterial({ color: 0x8c2f22, flatShading: true });
const DRAGON_WING = new THREE.MeshPhongMaterial({
  color: 0xa04a30, flatShading: true, side: THREE.DoubleSide,
});

// one tentacle: ARM_SEGS chained pivots the spine curve poses each frame —
// enough joints that the arm reads as a living CURVE, not a jointed crane
function buildTentacle() {
  const g = new THREE.Group();
  const segs = [];
  const segLen = 1.75; // ~14 m of arm: it must LOOM over a galleon's rail
  let carrier = g;
  for (let s = 0; s < ARM_SEGS; s++) {
    const u = s / (ARM_SEGS - 1);
    const rBot = 0.62 * (1 - 0.86 * u) + 0.05;
    const rTop = 0.62 * (1 - 0.86 * Math.min(1, u + 1 / (ARM_SEGS - 1))) + 0.05;
    const pivot = new THREE.Group();
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(rTop, rBot, segLen, 5),
      s % 2 ? KRAKEN_UNDER : KRAKEN_SKIN); // banded, the way a wet arm catches light
    seg.position.y = segLen / 2;
    pivot.add(seg);
    if (carrier !== g) pivot.position.y = segLen;
    carrier.add(pivot);
    segs.push(pivot);
    carrier = pivot;
  }
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.8, 5), KRAKEN_UNDER);
  tip.position.y = segLen + 0.3;
  segs[ARM_SEGS - 1].add(tip);
  // the churn: a foam ring where the arm pierces the surface
  const churn = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 1.5, 12),
    new THREE.MeshBasicMaterial({
      color: 0xdfeef6, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
    }));
  churn.rotation.x = -Math.PI / 2;
  return { group: g, segs, churn };
}

// the head that surfaces when it TIRES: mantle and one huge eye — the
// "cut it loose arm by arm" fight finally gets a face to beat
function buildKrakenHead() {
  const g = new THREE.Group();
  const mantle = new THREE.Mesh(new THREE.SphereGeometry(2.4, 8, 6), KRAKEN_SKIN);
  mantle.scale.set(1.15, 0.8, 1.4);
  g.add(mantle);
  const white = new THREE.Mesh(new THREE.SphereGeometry(0.62, 8, 6),
    new THREE.MeshPhongMaterial({ color: 0xd8d2b8, flatShading: true }));
  white.position.set(0.9, 0.9, 1.9);
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 5),
    new THREE.MeshPhongMaterial({ color: 0x0a0a10, flatShading: true }));
  pupil.position.set(1.05, 1.0, 2.35);
  g.add(white, pupil);
  return g;
}

function buildDragon() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ConeGeometry(1.1, 7, 6), DRAGON_HIDE);
  body.rotation.x = Math.PI / 2; // nose along +z
  g.add(body);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.8, 5), DRAGON_HIDE);
  head.rotation.x = Math.PI / 2;
  head.position.set(0, 0.3, 4.2);
  g.add(head);
  for (const side of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.9, 4), KRAKEN_UNDER);
    horn.position.set(side * 0.35, 0.8, 3.9);
    horn.rotation.z = -side * 0.4;
    g.add(horn);
  }
  const wingGeo = new THREE.PlaneGeometry(6, 2.6);
  wingGeo.translate(3, 0, 0); // hinge at the root
  const wl = new THREE.Mesh(wingGeo, DRAGON_WING);
  const wr = new THREE.Mesh(wingGeo, DRAGON_WING);
  wr.rotation.y = Math.PI;
  g.add(wl, wr);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.4, 5, 5), DRAGON_HIDE);
  tail.rotation.x = -Math.PI / 2;
  tail.position.z = -5.2;
  g.add(tail);
  return { group: g, wl, wr };
}

export class MonsterLayer {
  constructor(scene) {
    this.scene = scene;
    this.tentacles = [];
    for (let i = 0; i < KRAKEN_ARMS; i++) {
      const t = buildTentacle();
      t.group.visible = false;
      t.churn.visible = false;
      scene.add(t.group, t.churn);
      this.tentacles.push(t);
    }
    this.krakenHead = buildKrakenHead();
    this.krakenHead.visible = false;
    scene.add(this.krakenHead);
    // the ink: a dark bloom on the water where it let go — beaten or fled,
    // the exit READS instead of popping
    this.ink = null;
    this.inkMesh = new THREE.Mesh(
      new THREE.CircleGeometry(1, 20),
      new THREE.MeshBasicMaterial({
        color: 0x0c0a12, transparent: true, opacity: 0, depthWrite: false,
      }));
    this.inkMesh.rotation.x = -Math.PI / 2;
    this.inkMesh.visible = false;
    scene.add(this.inkMesh);
    this._prevKraken = 'gone';
    this.dragon = buildDragon();
    this.dragon.group.visible = false;
    scene.add(this.dragon.group);
  }

  // kraken: the sea BOILS through the warning, then eight-jointed arms ride
  // the spine curve up around the hull (dead arms sink away), the eye
  // surfaces when it tires, and the ink blooms when it lets go.
  // hullLen scales the arm ring: the grip must ring the PLANKING, not rise
  // through a galleon's deck (the sloop's 6.5 m ring was inside her hull).
  updateKraken(kraken, t, sx, sz, hullLen = 9) {
    const state = kraken ? kraken.state : 'gone';
    // it let go (beaten, fled, or slain): the ink blooms where it was
    if (this._prevKraken === 'gripping' && state !== 'gripping') {
      this.ink = { x: sx, z: sz, t0: t };
    }
    this._prevKraken = state;

    const active = state === 'gripping';
    const rising = state === 'rising';
    const grip = active && kraken ? Math.max(0.3, kraken.arms / KRAKEN_ARMS) : 0;
    for (let i = 0; i < KRAKEN_ARMS; i++) {
      const arm = this.tentacles[i];
      const alive = active && i < kraken.arms;
      arm.group.visible = alive;
      const ang = (i / KRAKEN_ARMS) * Math.PI * 2 + 0.4;
      const ringR = Math.max(6.5, hullLen * 0.48);
      const r = ringR + Math.sin(t * 0.7 + i * 2.1) * 0.8;
      const ax = sx + Math.sin(ang) * r, az = sz + Math.cos(ang) * r;
      const wy = waveHeight(ax, az, t);
      // the churn works BOTH acts: boiling rings through the warning, foam
      // where each living arm pierces the sea through the grip
      const churnOn = rising || alive;
      arm.churn.visible = churnOn;
      if (churnOn) {
        const boil = rising ? 0.55 + 0.25 * Math.sin(t * 6 + i * 2.3)
          : 0.35 + 0.2 * Math.sin(t * 4 + i * 1.7);
        arm.churn.position.set(ax, wy + 0.14, az);
        arm.churn.material.opacity = boil;
        const cs = rising ? 1 + 0.5 * Math.sin(t * 3.1 + i) : 1.2;
        arm.churn.scale.set(cs, cs, 1);
      }
      if (!alive) continue;
      const rise = Math.sin(t * 1.1 + i * 1.7);
      arm.group.position.set(ax, wy - 2.6 + rise * 0.6, az);
      arm.group.rotation.set(0, ang, 0);
      // the living curve (monsters.js tentacleSpine, verify-gated): the
      // grip's curl gathers toward the tip, a wave travels down the arm
      const spine = tentacleSpine(t, i, grip);
      for (let s = 0; s < ARM_SEGS; s++) arm.segs[s].rotation.x = spine[s];
      // lean the whole arm in over the rail
      const lean = Math.atan2(sx - ax, sz - az) - ang;
      arm.group.rotateOnAxis(new THREE.Vector3(Math.cos(lean), 0, -Math.sin(lean)), 0.3);
    }

    // the eye: two arms left and it MUST look at what is beating it
    const eyeOn = active && kraken.arms <= 2;
    this.krakenHead.visible = eyeOn;
    if (eyeOn) {
      const ha = t * 0.15;
      const headR = Math.max(13, hullLen * 0.75);
      const hx = sx + Math.sin(ha) * headR, hz = sz + Math.cos(ha) * headR;
      this.krakenHead.position.set(hx, waveHeight(hx, hz, t) - 1.1 + Math.sin(t * 0.9) * 0.3, hz);
      this.krakenHead.rotation.y = Math.atan2(sx - hx, sz - hz); // the eye holds YOU
    }

    // the ink: spreads for seven seconds and fades — then the sea forgets
    if (this.ink) {
      const age = t - this.ink.t0;
      if (age > 7) { this.ink = null; this.inkMesh.visible = false; } else {
        this.inkMesh.visible = true;
        const s = 4 + age * 6;
        this.inkMesh.position.set(this.ink.x,
          waveHeight(this.ink.x, this.ink.z, t) + 0.1, this.ink.z);
        this.inkMesh.scale.set(s, s, 1);
        this.inkMesh.material.opacity = 0.75 * (1 - age / 7);
      }
    }
  }

  // dragon: she wheels the zone sky, stoops THROUGH the masthead, climbs out
  updateDragon(dragon, t, dt, sx, sz) {
    const on = dragon && dragon.state !== 'fled';
    this.dragon.group.visible = !!on;
    if (!on) return;
    const alt = dragonAlt(dragon);
    let x, z, heading;
    if (dragon.state === 'stoop') {
      // a straight pass over the ship: in from one quarter, out the other
      const u = Math.min(1, dragon.t / DRAGON_STOOP);
      const dir = Math.floor(t / 60) % 2 ? 1 : -1; // vary the approach
      x = sx + dir * (1 - u * 2) * 55;
      z = sz + (1 - u * 2) * 25;
      heading = Math.atan2(sx - x || dir, sz - z || 1);
      if (u > 0.5) heading += Math.PI; // through and away
    } else {
      const a = t * 0.25;
      x = sx + Math.sin(a) * 70;
      z = sz + Math.cos(a) * 70;
      heading = a + Math.PI / 2;
    }
    this.dragon.group.position.set(x, alt, z);
    this.dragon.group.rotation.set(dragon.state === 'stoop' ? 0.35 : 0, heading, 0);
    const flap = dragon.state === 'stoop' ? 0.1 : Math.sin(t * 2.6) * 0.5;
    this.dragon.wl.rotation.z = flap;
    this.dragon.wr.rotation.z = -flap;
  }

  // where the dragon is for gunnery: {x, z, alt} or null
  dragonPos() {
    if (!this.dragon.group.visible) return null;
    const p = this.dragon.group.position;
    return { x: p.x, z: p.z, alt: p.y };
  }
}
