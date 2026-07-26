// Wildlife bodies — the THREE half of wildlife.js. Everything is built once
// at init from primitives (no assets, the procedural-only identity), toggled
// by ambientSpecies, and animated parametrically — no physics, no per-frame
// allocation.

import * as THREE from 'three';
import { waveHeight } from './waves.js';
import { dxWrap } from './earth.js';
import {
  ambientSpecies, porpoiseY, porpoisePitch, circlePos, birdBeat, podStation,
  frenzyPos, FRENZY_FINS, FRENZY_S,
  flockAnchor, flockWander, GULL_TAU, ALBA_TAU, GULL_Y, ALBA_Y,
} from './wildlife.js';
import {
  podsNear, podPose, whalePose, memberStation, memberLen, memberCycle,
  churnGlow, stalkAnchor, whitePod, POD_MAX, WHALE_STREAM_R, BODY_R,
  whaleTopY, submergedFade, WHALE_GONE, WHALE_UP,
} from './whales.js';

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

// ============================== THE WHALES ==============================
// A SPERM WHALE, because this is the whaling age and she is the animal the age
// knew: the great blunt case forward (a third of her), the narrow underslung
// jaw, the knuckled dorsal ridge, small flippers, and the broad notched flukes
// that stand out of the sea when she sounds. Every part is a primitive.
//
// The body is built ONCE at UNIT LENGTH — bow at local z = +0.5, fluke tips at
// -0.5, the house's +z-forward convention — and every animal in every pod
// reuses that one geometry set, scaled by her own length in metres. Five
// bodies in the pool, one set of geometry, nothing allocated when a pod
// streams in (CLAUDE.md resource hygiene). Only the spout and the churn carry
// per-animal materials, because their opacity is the thing that animates.
//
// Her hide is wet slate; in the White Whale's water the same meshes take the
// pale set instead (setPale — a material swap, not a clone). A first pass at
// 0x2c343a rendered her as a black cut-out with no form at all: a wet back is a
// MID grey that gleams, so the hide carries specular.
const HIDE = new THREE.MeshPhongMaterial({
  color: 0x55636b, specular: 0x3a4247, shininess: 26, flatShading: true,
});
const HIDE_PALE = new THREE.MeshPhongMaterial({
  color: 0xd6dad7, specular: 0x556066, shininess: 34, flatShading: true,
});
const BELLY = new THREE.MeshPhongMaterial({ color: 0x7d868b, flatShading: true });
const BELLY_PALE = new THREE.MeshPhongMaterial({ color: 0xeceeea, flatShading: true });
const FLUKE = new THREE.MeshPhongMaterial({
  color: 0x3d474d, specular: 0x2a3134, shininess: 22,
  flatShading: true, side: THREE.DoubleSide,
});
const FLUKE_PALE = new THREE.MeshPhongMaterial({
  color: 0xc7cbc8, flatShading: true, side: THREE.DoubleSide,
});
const SPRAY = { color: 0xe8f3f8, transparent: true, opacity: 0, depthWrite: false };

let _whaleGeo = null;
function whaleGeometry() {
  if (_whaleGeo) return _whaleGeo;
  const R = BODY_R;   // the trunk's radius at the shoulder — whales.js computes
                      // her floating trim from this same number
  const sph = (sx, sy, sz, x, y, z) => {
    const g = new THREE.SphereGeometry(0.5, 7, 5);
    g.scale(sx * 2, sy * 2, sz * 2);
    g.translate(x, y, z);
    return g;
  };
  // the case: a flat-fronted cylinder, a third of her length, BROADER than the
  // trunk and no taller. (Built taller it stood off her back like a conning
  // tower and she read as a submarine — the screenshots caught that too: a
  // sperm whale's forehead is massive sideways and below, not above.)
  const head = new THREE.CylinderGeometry(0.052, R + 0.004, 0.34, 9);
  head.rotateX(Math.PI / 2);                // +y -> +z: the blunt snout forward
  head.scale(1.22, 0.95, 1);
  head.translate(0, 0.004, 0.315);
  // the trunk, tapering the length of her to the tail stock
  const trunk = new THREE.CylinderGeometry(R, 0.02, 0.53, 9);
  trunk.rotateX(Math.PI / 2);
  trunk.scale(1, 0.95, 1);
  trunk.translate(0, 0, -0.12);
  const stock = new THREE.CylinderGeometry(0.022, 0.013, 0.10, 6);
  stock.rotateX(Math.PI / 2);
  stock.translate(0, 0, -0.435);
  // the narrow underslung jaw — the silhouette that says sperm whale
  const jaw = new THREE.CylinderGeometry(0.016, 0.008, 0.30, 5);
  jaw.rotateX(Math.PI / 2 - 0.05);
  jaw.translate(0, -0.052, 0.315);
  // THE FLUKES: two swept triangles about a median notch. The geometry is
  // centred so the MESH can carry the position — live-whales.mjs reads its
  // world height to prove the sounding really lifts them out of the sea.
  const flukes = new THREE.BufferGeometry();
  flukes.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    0, 0, 0.058, -0.150, 0.014, -0.058, 0, 0, -0.016,
    0, 0, 0.058, 0, 0, -0.016, 0.150, 0.014, -0.058,
  ]), 3));
  flukes.computeVertexNormals();
  // one flipper, extending along +x from its root so the mesh can hinge it
  const flipper = new THREE.BoxGeometry(0.085, 0.012, 0.045);
  flipper.translate(0.0425, 0, 0);
  _whaleGeo = {
    head, trunk, stock, jaw, flukes, flipper,
    snout: sph(0.048, 0.058, 0.022, 0, 0.012, 0.487),
    hump: sph(0.024, 0.034, 0.072, 0, 0.052, -0.10),
    knuckles: [-0.19, -0.25, -0.31].map((z, i) => sph(0.013, 0.010 - i * 0.002, 0.030, 0, 0.036 - i * 0.007, z)),
    spoutOuter: (() => {
      const g = new THREE.ConeGeometry(0.030, 0.24, 7);
      g.translate(0, 0.12, 0);
      return g;
    })(),
    spoutCore: (() => {
      const g = new THREE.ConeGeometry(0.013, 0.20, 6);
      g.translate(0, 0.10, 0);
      return g;
    })(),
    // the wash around her: a NARROW oval hugging her length, not a ring. (A
    // ring — the kraken's idiom, where a column pierces the sea — read as a
    // grey plate under a twenty-metre body: the first screenshots caught it.)
    churn: (() => {
      const g = new THREE.RingGeometry(0.34, 0.62, 18);
      g.rotateX(-Math.PI / 2);
      g.scale(0.26, 1, 0.92);
      return g;
    })(),
  };
  return _whaleGeo;
}

// one animal off the shared geometry. Returns her handles: the body group, the
// fluke mesh (the sounding's proof), the spout group and its two materials, and
// the wash that lives in the scene BESIDE her — it must lie flat on the water
// while she pitches nose-down, so it cannot be her child.
function buildWhaleBody(scene) {
  const G = whaleGeometry();
  const g = new THREE.Group();
  const skin = [];
  // HER MATERIALS ARE HER OWN NOW. They used to be four shared singletons, which
  // was right while the only thing that animated was geometry — but the depth
  // fade below is per-animal (every whale in a pod runs her own sounding cycle,
  // so no two are at the same depth), and an opacity written on a shared
  // material would put the shallowest animal's fade on the deepest one. Cloned
  // ONCE at construction, POD_MAX x 4 x 2 of them, nothing allocated per frame.
  const own = new Map();
  const mine = (m) => {
    let c = own.get(m);
    if (!c) { c = m.clone(); own.set(m, c); }
    return c;
  };
  const add = (geo, dark, pale) => {
    const m = new THREE.Mesh(geo, mine(dark));
    skin.push({ m, dark: mine(dark), pale: mine(pale) });
    g.add(m);
    return m;
  };
  add(G.head, HIDE, HIDE_PALE);
  add(G.snout, HIDE, HIDE_PALE);
  add(G.trunk, HIDE, HIDE_PALE);
  add(G.stock, HIDE, HIDE_PALE);
  add(G.hump, HIDE, HIDE_PALE);
  for (const k of G.knuckles) add(k, HIDE, HIDE_PALE);
  add(G.jaw, BELLY, BELLY_PALE);
  for (const side of [1, -1]) {
    const f = add(G.flipper, BELLY, BELLY_PALE);
    f.position.set(side * 0.055, -0.025, 0.10);
    f.rotation.y = side > 0 ? 0.45 : Math.PI - 0.45;   // swept aft, both sides
    f.rotation.z = -side * 0.2;
  }
  const fluke = add(G.flukes, FLUKE, FLUKE_PALE);
  fluke.position.z = -0.445;
  // THE BLOW: a sperm whale's spout leaves the front-LEFT of her case and
  // goes forward and to port — the one detail that names the animal at a mile
  const spout = new THREE.Group();
  const spoutMats = [
    new THREE.MeshBasicMaterial({ ...SPRAY }),
    new THREE.MeshBasicMaterial({ ...SPRAY }),
  ];
  spout.add(new THREE.Mesh(G.spoutOuter, spoutMats[0]));
  spout.add(new THREE.Mesh(G.spoutCore, spoutMats[1]));
  spout.position.set(-0.026, 0.072, 0.435);
  spout.rotation.set(0.5, 0, 0.26);
  spout.visible = false;
  g.add(spout);
  const churnMat = new THREE.MeshBasicMaterial({ ...SPRAY, side: THREE.DoubleSide });
  const churn = new THREE.Mesh(G.churn, churnMat);
  churn.visible = false;
  g.visible = false;
  scene.add(g, churn);
  // the colour the sea closes over her with — ocean.js's own base water hue, so
  // she dissolves INTO the water rather than into a grey fog
  const SEA = new THREE.Color(0x175a7d);
  return {
    group: g, fluke, spout, spoutMats, churn, churnMat, skin,
    pale: false, len: 0, phase: '', blow: 0, surf: 0, fade: 1,
    setPale(on) {
      if (on === this.pale) return;
      this.pale = on;
      for (const s of this.skin) s.m.material = on ? s.pale : s.dark;
      this.fade = -1;                 // the new set has not been faded yet
    },
    // whales.js submergedFade: 1 awash, falling away as she goes down
    setFade(f) {
      if (Math.abs(f - this.fade) < 0.004) return;
      this.fade = f;
      const solid = f > 0.995;
      for (const s of this.skin) {
        const m = s.m.material;
        m.transparent = !solid;
        m.opacity = f;
        // depthWrite off once she is a ghost, or her own far faces punch holes
        // in her near ones through the alpha
        m.depthWrite = f > 0.85;
        // the hue is lerped from a REMEMBERED base, not from m.color — m.color
        // IS the material's colour, so lerping it in place would compound every
        // frame and she would be sea-coloured within a second of going down
        if (!m.userData.baseColor) m.userData.baseColor = m.color.clone();
        m.color.copy(m.userData.baseColor).lerp(SEA, (1 - f) * 0.8);
      }
    },
  };
}

const POD = 4, GULLS = 4;
const V = new THREE.Vector3();   // scratch — the report reads world positions

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
    // the birds' WORLD anchors (wildlife.js flockAnchor) — null while the
    // species is out of its water, so a flock never resumes an old berth
    this.gullAnchor = null;
    this.albaAnchor = null;
    // the frenzy pack: extra fins that only swim when a ship has gone down
    this.frenzy = [];
    for (let i = 0; i < FRENZY_FINS; i++) {
      const f = buildFin();
      f.visible = false;
      scene.add(f);
      this.frenzy.push(f);
    }
    // the whale pool: POD_MAX bodies off one shared geometry set, so a pod
    // streaming in costs a transform each and nothing else
    this.whales = [];
    for (let i = 0; i < POD_MAX; i++) this.whales.push(buildWhaleBody(scene));
    this.whalePod = null;   // the bodied pod's spec (whales.js), or null
    this.whaleAt = null;    // her world pose this frame: { x, z, heading, speed }
    this.whiteAnchor = null;
    this._whiteSpec = null;
    this._podT = 0;
    this._podAt = null;
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

    // GULLS WORK THE SHIP, THEY ARE NOT BOLTED TO HER (wildlife.js flockAnchor).
    // The flock keeps a WORLD anchor that chases the hull with nine seconds of
    // inertia and wanders on its own about that, and each bird flies her own
    // circuit around it in world coordinates at her own altitude over mean sea
    // level. Nothing below reads sx/sz except through the anchor, and nothing
    // reads the ship's yaw at all — put the helm over and the birds hold their
    // course. Land is still what brings them (ambientSpecies).
    if (spec.gulls) {
      if (!this.gullAnchor) this.gullAnchor = { x: sx, z: sz };
      this.gullAnchor = flockAnchor(this.gullAnchor, sx, sz, dt, GULL_TAU);
    } else this.gullAnchor = null;
    const gw = spec.gulls ? flockWander(t, 26, 0.031, 1.3) : null;
    for (let i = 0; i < GULLS; i++) {
      const b = this.gulls[i];
      b.group.visible = spec.gulls;
      if (!spec.gulls) continue;
      const c = circlePos(t, 7 + i * 2.5, 0.5 + i * 0.07, i * 1.9);
      b.group.position.set(this.gullAnchor.x + gw.x + c.x,
        GULL_Y + Math.sin(t * 0.7 + i) * 1.5,
        this.gullAnchor.z + gw.z + c.z);
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
    // ...and the albatross barely notices the ship at all: fifty-five seconds of
    // inertia is four hundred metres of lag behind a hull making way, so she
    // reads as an animal that happens to be going the same way rather than as a
    // kite on a string. Same world anchor idiom, a far longer tau.
    this.alba.group.visible = spec.albatross;
    if (spec.albatross) {
      if (!this.albaAnchor) this.albaAnchor = { x: sx, z: sz };
      this.albaAnchor = flockAnchor(this.albaAnchor, sx, sz, dt, ALBA_TAU);
      const aw = flockWander(t, 90, 0.017, 4.1);
      const c = circlePos(t, 42, 0.09, 3.3);
      this.alba.group.position.set(this.albaAnchor.x + aw.x + c.x,
        ALBA_Y + Math.sin(t * 0.23) * 3.5,
        this.albaAnchor.z + aw.z + c.z);
      this.alba.group.rotation.set(0, c.heading, 0);
      const bb = birdBeat(t, 0, 0.85);
      this.alba.group.rotateZ(0.28 + 0.12 * bb.glide); // the soaring bank
      // locked-out wings: barely any hand droop — the albatross glides FLAT,
      // a plank of a bird riding the wind (the M belongs to the gulls)
      for (const w of this.alba.wings) {
        w.inner.rotation.z = w.side * -bb.angle;
        w.outer.rotation.z = -(bb.angle * 0.5 + 0.08 * bb.glide);
      }
    } else this.albaAnchor = null;

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

    // THE WHALES — the deep's own residents, on courses of their own
    this._stepWhales(t, dt, sx, sz, !!spec.whale, whiteWhale);

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

  // ---- THE WHALES ----
  // World-anchored pods (whales.js): the pod cruises a great slow circuit of
  // its own in WORLD coordinates, and each animal runs her own sounding cycle
  // on the WORLD CLOCK. Nothing below this line reads the ship's position or
  // heading — that was the bug (a ship-relative offset, so the animal rode
  // along with the hull and swung round it on the helm). The ship sails past
  // them, or overtakes them; they never travel with her.
  _stepWhales(t, dt, sx, sz, on, whiteWhale) {
    if (whiteWhale) {
      // in HER water there is one whale and she is hunting: the White Whale
      // closes on the ship, but only by STALKING a lagged anchor (whales.js
      // stalkAnchor) — put the helm hard over and she holds her own course
      if (!this.whiteAnchor) this.whiteAnchor = { x: sx, z: sz };
      this.whiteAnchor = stalkAnchor(this.whiteAnchor, sx, sz, dt);
      this._whiteSpec = whitePod(this.whiteAnchor, this._whiteSpec);
      this.whalePod = this._whiteSpec;
    } else if (!on) {
      this.whalePod = null;
      this.whiteAnchor = null;  // out of her water: she does not keep a berth
    } else {
      this.whiteAnchor = null;
      // stream on a slow poll: the cell walk and its coast samples are far too
      // dear per frame, and a pod at three knots is in no hurry
      this._podT -= dt;
      const moved = !this._podAt
        || Math.hypot(sx - this._podAt.x, sz - this._podAt.z) > WHALE_STREAM_R * 0.3;
      if (this._podT <= 0 || moved) {
        this._podT = 3;
        this._podAt = { x: sx, z: sz };
        const near = podsNear(t, sx, sz);
        this.whalePod = near.length ? near[0].pod : null;
      }
    }
    const pod = this.whalePod;
    this.whaleAt = pod ? podPose(pod, t) : null;
    const p = this.whaleAt;
    let up = false;   // is anything of the pod above water this frame?
    for (let i = 0; i < this.whales.length; i++) {
      const w = this.whales[i];
      if (!pod || i >= pod.n) {
        w.group.visible = false;
        w.churn.visible = false;
        continue;
      }
      const len = memberLen(pod, i);
      w.len = len;
      w.setPale(pod.kind === 'white');
      w.group.scale.setScalar(len);
      // her station in the POD's own frame (+z ahead, ±x abreast — the
      // shipframe convention), drift and all: memberStation is the whole truth
      // and the clearance law is gated on it
      const st = memberStation(pod, i, t);
      const ch = Math.cos(p.heading), sh = Math.sin(p.heading);
      const x = p.x + st.side * ch + st.lag * sh;
      const z = p.z - st.side * sh + st.lag * ch;
      // the sounding cycle, and the swell she rides while she runs it
      const pose = whalePose(memberCycle(pod, i, t), len);
      const surf = waveHeight(x, z, t);
      w.phase = pose.phase;
      w.blow = pose.blow;
      w.surf = surf;
      // SHE GOES UNDER THE WATER, NOT ONTO IT (whales.js submergedFade). The
      // sea is opaque, so a body drawn at full strength two metres down showed
      // only its intersection with the surface — a flat-topped grey slab with a
      // hard waterline. Fading her by depth into the sea's own colour turns that
      // edge into a dissolve, and by ten metres she is simply gone.
      const fade = submergedFade(whaleTopY(pose, len));
      w.group.visible = fade > WHALE_GONE;
      w.setFade(fade);
      if (fade > WHALE_UP) up = true;
      w.group.position.set(x, surf + pose.y, z);
      w.group.rotation.set(pose.pitch, p.heading, pose.roll, 'YXZ');
      // THE BLOW: the column stands with the jet and the spent plume widens
      w.spout.visible = pose.blow > 0.02;
      if (w.spout.visible) {
        w.spoutMats[0].opacity = 0.55 * pose.blow;
        w.spoutMats[1].opacity = 0.8 * pose.blow;
        const wide = 1 + 1.5 * pose.blowAge;
        w.spout.scale.set(wide, 0.35 + 0.9 * pose.blow, wide);
      }
      // and the wash where she breaks the sea — flat on the water, so it lies
      // beside her rather than pitching with her body, and turned onto her
      // course so the oval runs the way she swims
      const glow = churnGlow(pose, len);
      w.churn.visible = glow > 0.05;
      if (w.churn.visible) {
        w.churnMat.opacity = 0.4 * glow;
        w.churn.position.set(x, surf + 0.1, z);
        w.churn.rotation.y = p.heading;
        w.churn.scale.setScalar(len);
      }
    }
    this.whaleUp = up;
  }

  // how far off the bodied pod is (Infinity if the sea is empty). main.js
  // slackens the fair current for whales the way it does for a sail — a pod
  // alongside is an ENCOUNTER, and at blue-water gait it would otherwise flash
  // past in three seconds. Only while something of her SHOWS, though: a third
  // of the sounding cycle is spent at forty-six metres, and crawling past empty
  // water for forty seconds is an encounter with nothing.
  whaleDist(px, pz) {
    if (!this.whaleAt || !this.whaleUp) return Infinity;
    return Math.hypot(dxWrap(px, this.whaleAt.x), this.whaleAt.z - pz);
  }

  // what the whales are doing, for live-whales.mjs: world positions read off
  // the scene graph itself, so the proof is the drawn animal and not the maths
  whaleReport() {
    const pod = this.whalePod;
    if (!pod || !this.whaleAt) return null;
    const out = {
      id: pod.id, kind: pod.kind, n: pod.n,
      pod: { ...this.whaleAt }, members: [],
    };
    for (let i = 0; i < pod.n; i++) {
      const w = this.whales[i];
      w.fluke.getWorldPosition(V);
      out.members.push({
        x: w.group.position.x, y: w.group.position.y, z: w.group.position.z,
        len: w.len, phase: w.phase, blow: w.blow, surf: w.surf,
        visible: w.group.visible, flukeY: V.y, pitch: w.group.rotation.x,
        fade: +w.fade.toFixed(3),
      });
    }
    return out;
  }
}
