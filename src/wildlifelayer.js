// Wildlife bodies — the THREE half of wildlife.js. Everything is built once
// at init from primitives (no assets, the procedural-only identity), toggled
// by ambientSpecies, and animated parametrically — no physics, no per-frame
// allocation.

import * as THREE from 'three';
import { waveHeight } from './waves.js';
import {
  ambientSpecies, porpoiseY, porpoisePitch, circlePos, birdBeat, podStation,
  frenzyPos, FRENZY_FINS, FRENZY_S, whaleState, WHALE_PERIOD,
} from './wildlife.js';

const GREY = new THREE.MeshPhongMaterial({ color: 0x8fa3ad, flatShading: true });
const DARK = new THREE.MeshPhongMaterial({ color: 0x4a5860, flatShading: true });
const WHITE = new THREE.MeshPhongMaterial({ color: 0xe8ecef, flatShading: true, side: THREE.DoubleSide });
const BROWN = new THREE.MeshPhongMaterial({ color: 0x6b5a48, flatShading: true, side: THREE.DoubleSide });
const BEAK = new THREE.MeshPhongMaterial({ color: 0xd9a13b, flatShading: true });

// one tapered wing membrane: x out along the span, z the chord, a touch of
// sweep pulling the tip aft — the dragon's wingPanel idea at bird scale
function birdPanel(len, rootC, tipC, sweep, mat) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    0, 0, rootC * 0.45,
    len, 0, tipC * 0.45 - sweep,
    len, 0, -tipC * 0.55 - sweep,
    0, 0, -rootC * 0.55,
  ]), 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

// a bird with a BODY: slim fuselage, head and beak, fan tail, and the
// dragon's articulated two-panel wings (inner arm + outer hand) shrunk to
// bird scale — the outer hinge is what makes both the beat and the gliding
// gull's M-silhouette read. slim stretches the wing for the albatross.
function buildBird(span, bodyMat, wingMat, slim = 1) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 5), bodyMat);
  body.scale.set(span * 0.13, span * 0.12, span * 0.42);
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 5, 4), bodyMat);
  head.scale.setScalar(span * 0.1);
  head.position.set(0, span * 0.05, span * 0.24);
  g.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(span * 0.022, span * 0.11, 4), BEAK);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, span * 0.045, span * 0.31);
  g.add(beak);
  const tailGeo = new THREE.PlaneGeometry(span * 0.13, span * 0.17);
  tailGeo.rotateX(-Math.PI / 2);
  tailGeo.translate(0, span * 0.02, -span * 0.3);
  g.add(new THREE.Mesh(tailGeo, bodyMat));
  // the wings: chord narrows and span stretches as slim rises (an albatross
  // is all span and no chord — that IS the silhouette)
  const innerLen = span * 0.2 * slim, outerLen = span * 0.3 * slim;
  const rootC = (span * 0.17) / slim, midC = (span * 0.12) / slim, tipC = span * 0.02;
  const wings = [];
  for (const side of [1, -1]) {
    const inner = new THREE.Group();
    inner.position.set(side * span * 0.05, span * 0.04, span * 0.05);
    inner.add(birdPanel(innerLen, rootC, midC, innerLen * 0.08, wingMat));
    const outer = new THREE.Group();
    outer.position.x = innerLen;
    outer.add(birdPanel(outerLen, midC, tipC, outerLen * 0.3, wingMat));
    inner.add(outer);
    if (side < 0) inner.scale.x = -1; // mirror the port wing
    g.add(inner);
    wings.push({ inner, outer, side });
  }
  return { group: g, wings };
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

// the whale: a dark rolling back, a fluke for the dive, a spout column.
// Most of the animal stays a shadow under the surface — like the shark,
// what breaks the water IS the whale.
function buildWhale() {
  const g = new THREE.Group();
  // her own hide (not the shared DARK): the White Whale zone tints it pale
  const hide = DARK.clone();
  const back = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), hide);
  back.scale.set(2.2, 1.3, 6.5);
  g.add(back);
  const fluke = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.3), hide.clone());
  fluke.material.side = THREE.DoubleSide;
  fluke.rotation.x = -Math.PI / 2;
  fluke.position.set(0, 0.4, -7.2);
  g.add(fluke);
  const spout = new THREE.Mesh(
    new THREE.ConeGeometry(0.5, 3.4, 6),
    new THREE.MeshBasicMaterial({ color: 0xdfeef6, transparent: true, opacity: 0 }));
  spout.position.set(0, 3.2, 4.2);
  g.add(spout);
  return { group: g, spout, hide, flukeMat: fluke.material };
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
    // white body, dark upper wing, all span and no chord — how a real
    // albatross reads from the deck (slim stretches the two-panel wing)
    this.alba = buildBird(3.0, WHITE, BROWN, 1.5);
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
    // the frenzy pack: extra fins that only swim when a ship has gone down
    this.frenzy = [];
    for (let i = 0; i < FRENZY_FINS; i++) {
      const f = buildFin();
      f.visible = false;
      scene.add(f);
      this.frenzy.push(f);
    }
    this.whale = buildWhale();
    this.whale.group.visible = false;
    scene.add(this.whale.group);
  }

  // sx/sz: ship; mastTop: world y of the masthead; speed: hull m/s;
  // yaw/scale: the hull's heading and frame scale (shipframe.js) — the pod
  // stations in the ship's own frame so the leaps clear any hull on the
  // ladder; wrecks: fresh sinkings ([{x, z, age}], merchantlayer) — the
  // frenzy gathers at the nearest one in sight
  // whiteWhale: the ship is trespassing in HER water (legendfx white-whale
  // zone) — the whale surfaces regardless of coast distance, pale and vast
  update(t, dt, sx, sz, mastTop, speed, coastDist, latAbs, yaw = 0, scale = 1,
    wrecks = null, whiteWhale = false) {
    const spec = ambientSpecies(coastDist, latAbs);

    // THE FRENZY: sharks converge on a fresh wreck and tighten on it —
    // a sinking becomes an event the sea attends
    let feast = null;
    if (wrecks) {
      for (const w of wrecks) {
        if (w.age > FRENZY_S) continue;
        if (Math.hypot(w.x - sx, w.z - sz) > 900) continue;
        if (!feast || w.age > feast.age) feast = w; // the freshest close wreck
      }
    }
    for (let i = 0; i < this.frenzy.length; i++) {
      const f = this.frenzy[i];
      f.visible = !!feast;
      if (!feast) continue;
      const p = frenzyPos(feast.age, i);
      const fx = feast.x + p.x, fz = feast.z + p.z;
      f.position.set(fx, waveHeight(fx, fz, t) + 0.2, fz);
      f.rotation.y = p.heading;
    }

    // gulls wheel about the masthead — land is close. Bouts of beating,
    // stretches of soaring on flared wings (wildlife.js birdBeat), and each
    // bird banks INTO her circle, harder while she glides — the flare-and-
    // soar that makes a wheeling bird read as flight, not clockwork
    for (let i = 0; i < GULLS; i++) {
      const b = this.gulls[i];
      b.group.visible = spec.gulls;
      if (!spec.gulls) continue;
      const c = circlePos(t, 7 + i * 2.5, 0.5 + i * 0.07, i * 1.9);
      b.group.position.set(sx + c.x, mastTop + 2 + Math.sin(t * 0.7 + i) * 1.5, sz + c.z);
      b.group.rotation.set(0, c.heading, 0);
      const bb = birdBeat(t, i);
      b.group.rotateZ(0.18 + 0.2 * bb.glide); // the bank into the wheel
      // the articulated beat (the dragon's sign convention): the hand
      // over-swings the arm on the downstroke and folds DOWN in the glide —
      // the gliding gull's M-silhouette
      for (const w of b.wings) {
        w.inner.rotation.z = w.side * -bb.angle;
        w.outer.rotation.z = -(bb.angle * 0.6 + 0.38 * bb.glide);
      }
    }

    // the albatross lives at the soaring end of the same rhythm: locked
    // wings for long minutes, the rare unhurried bout
    this.alba.group.visible = spec.albatross;
    if (spec.albatross) {
      const c = circlePos(t, 42, 0.09, 3.3);
      this.alba.group.position.set(sx + c.x, 9 + Math.sin(t * 0.23) * 3.5, sz + c.z);
      this.alba.group.rotation.set(0, c.heading, 0);
      const bb = birdBeat(t, 0, 0.85);
      this.alba.group.rotateZ(0.28 + 0.12 * bb.glide); // the soaring bank
      // locked-out wings: barely any hand droop — the albatross glides FLAT,
      // a plank of a bird riding the wind (the M belongs to the gulls)
      for (const w of this.alba.wings) {
        w.inner.rotation.z = w.side * -bb.angle;
        w.outer.rotation.z = -(bb.angle * 0.5 + 0.08 * bb.glide);
      }
    }

    // dolphins ride the bow wave when you're making way offshore — stationed
    // in the SHIP's frame (podStation, verify-gated) so the leaps stay clear
    // of the planking on every hull, and they face the way she sails.
    // They leave the water to the sharks while a frenzy runs.
    const podOn = spec.dolphins && speed > 2.5 && !feast;
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

    // THE WHALE: the abyss's resident — a long deep cruise, then a minute
    // at the surface off the beam: the blow, the rolling back, the fluke.
    // Deterministic in t, parked ~170 m abeam so it reads as ENCOUNTERED,
    // never as following.
    this.whale.group.visible = !!spec.whale || whiteWhale;
    if (this.whale.group.visible) {
      // in HER water she is the White Whale: pale, half again the size,
      // and she works in CLOSE — the ram reads before it lands
      this.whale.hide.color.setHex(whiteWhale ? 0xdfe3e2 : 0x4a5860);
      this.whale.flukeMat.color.copy(this.whale.hide.color);
      this.whale.group.scale.setScalar(whiteWhale ? 2.3 : 1);
      const range = whiteWhale ? 110 : 170;
      const u = (t % WHALE_PERIOD) / WHALE_PERIOD;
      const ws = whaleState(u);
      const wAng = Math.floor(t / WHALE_PERIOD) * 2.4; // a new bearing each cycle
      const wx = sx + Math.sin(yaw + 1.9 + wAng) * range;
      const wz = sz + Math.cos(yaw + 1.9 + wAng) * range;
      this.whale.group.position.set(wx, waveHeight(wx, wz, t) + ws.y * (whiteWhale ? 2.3 : 1), wz);
      this.whale.group.rotation.set(ws.pitch, wAng, 0);
      this.whale.spout.material.opacity = ws.blow * 0.75;
      this.whale.spout.scale.y = 0.4 + ws.blow;
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
