// Monster bodies — the THREE half of monsters.js. Everything is primitives
// built once at init (no assets), toggled and animated parametrically.
// The Kraken earned its billing (NEXT.md block B): eight-jointed arms
// riding the pure tentacleSpine curve, churn where they pierce the sea, a
// surfacing EYE when it tires, and an ink bloom when it lets go. The
// dragon is the buildBird idea at nightmare scale: red, horned, and
// coming down at you.

import * as THREE from 'three';
import { waveHeight } from './waves.js';
import {
  KRAKEN_ARMS, ARM_SEGS, tentacleSpine, slamPhase,
  dragonAlt, DRAGON_STOOP, wingBeat, circleFire,
} from './monsters.js';

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
  const segLen = 2.2; // ~17 m of arm: it must TOWER over a galleon's rail
  let carrier = g;
  for (let s = 0; s < ARM_SEGS; s++) {
    const u = s / (ARM_SEGS - 1);
    const rBot = 0.85 * (1 - 0.86 * u) + 0.06;
    const rTop = 0.85 * (1 - 0.86 * Math.min(1, u + 1 / (ARM_SEGS - 1))) + 0.06;
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

// one wing membrane panel: a tapered quad hinged at x=0, spreading to +x —
// mirrored for the port wing by the pivot's rotation
function wingPanel(len, rootChord, tipChord) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, rootChord * 0.35, len, 0, tipChord * 0.3, len, 0, tipChord * 0.3 - tipChord,
    0, 0, rootChord * 0.35, len, 0, tipChord * 0.3 - tipChord, 0, 0, rootChord * 0.35 - rootChord,
  ], 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, DRAGON_WING);
}

function buildDragon() {
  const g = new THREE.Group();
  // the body: a deep chest and a tapering belly — mass, not a traffic cone
  const chest = new THREE.Mesh(new THREE.SphereGeometry(1.1, 7, 5), DRAGON_HIDE);
  chest.scale.set(1, 1.15, 1.8);
  chest.position.set(0, 0, 1.0);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.8, 7, 5), DRAGON_HIDE);
  belly.scale.set(0.8, 0.8, 2.3);
  belly.position.set(0, -0.1, -1.8);
  g.add(chest, belly);
  // the neck rides its own pivot (it bobs with the beat) up to a proper
  // head: skull, jaw, and the swept horns
  const neck = new THREE.Group();
  neck.position.set(0, 0.5, 2.6);
  const nseg = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.55, 2.4, 6), DRAGON_HIDE);
  nseg.rotation.x = Math.PI / 2 - 0.4;
  nseg.position.set(0, 0.45, 1.0);
  neck.add(nseg);
  const head = new THREE.Group();
  head.position.set(0, 0.95, 2.1);
  const skull = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.7, 6), DRAGON_HIDE);
  skull.rotation.x = Math.PI / 2;
  skull.position.z = 0.6;
  head.add(skull);
  const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.2, 5), KRAKEN_UNDER);
  jaw.rotation.x = Math.PI / 2 + 0.28;
  jaw.position.set(0, -0.28, 0.5);
  head.add(jaw);
  for (const side of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.11, 1.0, 4), KRAKEN_UNDER);
    horn.position.set(side * 0.3, 0.42, -0.15);
    horn.rotation.set(-0.7, 0, -side * 0.35);
    head.add(horn);
  }
  neck.add(head);
  g.add(neck);
  // THE WINGS — two hinged panels a side: inner arm, outer hand with finger
  // spars through the membrane. The outer hinge is what makes the flap read.
  const wings = [];
  for (const side of [-1, 1]) {
    const inner = new THREE.Group();
    inner.position.set(side * 0.8, 0.55, 0.9);
    const innerPanel = wingPanel(4.2, 3.0, 2.2);
    inner.add(innerPanel);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 4.2, 5), DRAGON_HIDE);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(2.1, 0.02, 0.9);
    inner.add(arm);
    const outer = new THREE.Group();
    outer.position.set(4.2, 0, 0);
    outer.add(wingPanel(5.4, 2.2, 0.5));
    // finger spars through the membrane — the silhouette that says BAT, not kite
    for (let f = 0; f < 3; f++) {
      const spar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 5.2, 4), DRAGON_HIDE);
      spar.rotation.z = Math.PI / 2;
      spar.rotation.y = -0.12 - f * 0.24;
      spar.position.set(2.5, 0.01, 0.5 - f * 0.5);
      outer.add(spar);
    }
    inner.add(outer);
    if (side < 0) inner.scale.x = -1; // mirror the port wing
    g.add(inner);
    wings.push({ inner, outer, side });
  }
  // the tail: three chained segments and a fin — it SWAYS
  const tailSegs = [];
  let carrier = g;
  for (let s = 0; s < 3; s++) {
    const pivot = new THREE.Group();
    pivot.position.z = s === 0 ? -3.4 : -2.0;
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32 - s * 0.09, 0.42 - s * 0.1, 2.2, 5), DRAGON_HIDE);
    seg.rotation.x = Math.PI / 2;
    seg.position.z = -1.0;
    pivot.add(seg);
    carrier.add(pivot);
    tailSegs.push(pivot);
    carrier = pivot;
  }
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.3, 4), DRAGON_WING);
  fin.rotation.x = -Math.PI / 2;
  fin.position.z = -2.4;
  tailSegs[2].add(fin);
  // the talons, tucked for flight
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.2, 5), DRAGON_HIDE);
    leg.position.set(side * 0.55, -0.85, 0.4);
    leg.rotation.x = 0.9;
    g.add(leg);
  }
  // THE FIRE: a cone of flame from the JAWS — two nested cones (white-hot
  // core inside orange) and a real light. She rakes the deck with it in the
  // stoop and breathes short bursts even circling (monsters.js circleFire),
  // so the flame is never long off camera.
  const fire = new THREE.Group();
  const fireOuter = new THREE.Mesh(new THREE.ConeGeometry(1.1, 7, 7),
    new THREE.MeshBasicMaterial({ color: 0xff7a26, transparent: true, opacity: 0.75, fog: false, depthWrite: false }));
  const fireCore = new THREE.Mesh(new THREE.ConeGeometry(0.5, 5.4, 6),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9, fog: false, depthWrite: false }));
  fireOuter.rotation.x = Math.PI / 2; fireCore.rotation.x = Math.PI / 2; // along +z, out of the mouth
  fireOuter.position.z = 3.5; fireCore.position.z = 2.8;
  fire.add(fireOuter, fireCore);
  const fireLight = new THREE.PointLight(0xff8a30, 0, 60, 1.8);
  fire.add(fireLight);
  fire.position.set(0, 1.1, 4.6); // from the jaws, angled at the prey below
  fire.rotation.x = 0.5;
  fire.visible = false;
  g.add(fire);
  // the whole animal at NIGHTMARE scale — she must dwarf the masts she rakes
  g.scale.setScalar(1.8);
  return { group: g, wings, neck, tailSegs, fire, fireLight, fireOuter, fireCore };
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
      arm.group.position.set(ax, wy - 2.9 + rise * 0.8, az);
      arm.group.rotation.set(0, ang, 0);
      // the living curve (monsters.js tentacleSpine, verify-gated): the
      // grip's curl gathers toward the tip, a wave travels down the arm —
      // and on the slam clock an arm REARS off the hull and whips down
      const slam = slamPhase(t, i);
      const spine = tentacleSpine(t, i, grip, slam);
      for (let s = 0; s < ARM_SEGS; s++) arm.segs[s].rotation.x = spine[s];
      // a slow whole-arm sway keeps even the gripping arms alive
      arm.group.rotation.z = Math.sin(t * 0.7 + i * 2.6) * 0.08;
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

    // THE ARTICULATED BEAT (monsters.js wingBeat, verify-gated): the outer
    // panels lag and over-swing the inner — the whip that reads as FLIGHT.
    // The port wing is built mirrored (scale.x = -1), so one sign serves.
    const wb = wingBeat(t, dragon.state === 'stoop');
    for (const w of this.dragon.wings) {
      w.inner.rotation.z = w.side * -wb.inner;
      w.outer.rotation.z = -wb.outer; // in the mirrored frame the sign carries
    }
    // the tail sways down its chain; the neck rides the beat
    for (let s = 0; s < this.dragon.tailSegs.length; s++) {
      this.dragon.tailSegs[s].rotation.y = Math.sin(t * 1.1 - s * 0.55) * (0.2 - s * 0.03);
    }
    this.dragon.neck.rotation.x = wb.neck;

    // THE FIRE: she rakes the deck through the heart of the stoop, and
    // breathes short bursts even circling — flickering the whole way
    const stoopU = dragon.state === 'stoop' ? Math.min(1, dragon.t / DRAGON_STOOP) : 0;
    const stoopFire = stoopU > 0.25 && stoopU < 0.75 ? 1 : 0;
    const burst = dragon.state === 'stoop' ? 0 : circleFire(t);
    const fireK = Math.max(stoopFire, burst > 0.15 ? burst : 0);
    this.dragon.fire.visible = fireK > 0;
    if (fireK > 0) {
      const flick = (0.8 + 0.2 * Math.sin(t * 31) * Math.sin(t * 17)) * fireK;
      this.dragon.fireOuter.material.opacity = 0.75 * flick;
      this.dragon.fireCore.material.opacity = 0.9 * flick;
      this.dragon.fireOuter.scale.set(Math.max(0.2, flick), Math.max(0.3, 1 + 0.2 * Math.sin(t * 23)) * fireK, Math.max(0.2, flick));
      this.dragon.fireLight.intensity = 90 * flick;
    } else {
      this.dragon.fireLight.intensity = 0;
    }
  }

  // where the dragon is for gunnery: {x, z, alt} or null
  dragonPos() {
    if (!this.dragon.group.visible) return null;
    const p = this.dragon.group.position;
    return { x: p.x, z: p.z, alt: p.y };
  }
}
