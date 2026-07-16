// Monster bodies — the THREE half of monsters.js. Everything is primitives
// built once at init (no assets), toggled and animated parametrically.
// The Kraken is arms only: what you see of it IS the fight — six tapered
// tentacles heaving out of the water around the hull. The dragon is the
// buildBird idea at nightmare scale: red, horned, and coming down at you.

import * as THREE from 'three';
import { waveHeight } from './waves.js';
import { KRAKEN_ARMS, dragonAlt, DRAGON_STOOP } from './monsters.js';

const KRAKEN_SKIN = new THREE.MeshPhongMaterial({ color: 0x4a3a4e, flatShading: true });
const KRAKEN_UNDER = new THREE.MeshPhongMaterial({ color: 0x8a6a72, flatShading: true });
const DRAGON_HIDE = new THREE.MeshPhongMaterial({ color: 0x8c2f22, flatShading: true });
const DRAGON_WING = new THREE.MeshPhongMaterial({
  color: 0xa04a30, flatShading: true, side: THREE.DoubleSide,
});

// one tentacle: three tapering segments so it can curl
function buildTentacle() {
  const g = new THREE.Group();
  const segs = [];
  const dims = [[0.5, 0.62, 3.4], [0.32, 0.5, 3.0], [0.14, 0.32, 2.6]];
  let carrier = g;
  for (const [top, bottom, len] of dims) {
    const pivot = new THREE.Group();
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, len, 5), KRAKEN_SKIN);
    seg.position.y = len / 2;
    pivot.add(seg);
    if (carrier !== g) pivot.position.y = carrier.userData.len;
    pivot.userData.len = len;
    carrier.add(pivot);
    segs.push(pivot);
    carrier = pivot;
  }
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 5), KRAKEN_UNDER);
  tip.position.y = dims[2][2] + 0.4;
  segs[2].add(tip);
  return { group: g, segs };
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
      scene.add(t.group);
      this.tentacles.push(t);
    }
    this.dragon = buildDragon();
    this.dragon.group.visible = false;
    scene.add(this.dragon.group);
  }

  // kraken: arms ring the hull, curling over the rail; dead arms sink away
  updateKraken(kraken, t, sx, sz) {
    const active = kraken && kraken.state === 'gripping';
    for (let i = 0; i < KRAKEN_ARMS; i++) {
      const arm = this.tentacles[i];
      const alive = active && i < kraken.arms;
      arm.group.visible = alive;
      if (!alive) continue;
      const ang = (i / KRAKEN_ARMS) * Math.PI * 2 + 0.4;
      const r = 6.5 + Math.sin(t * 0.7 + i * 2.1) * 0.8;
      const ax = sx + Math.sin(ang) * r, az = sz + Math.cos(ang) * r;
      const rise = Math.sin(t * 1.1 + i * 1.7);
      arm.group.position.set(ax, waveHeight(ax, az, t) - 2.5 + rise * 0.6, az);
      arm.group.rotation.y = ang;
      // curl toward the ship: each segment leans a little further inboard
      const curl = 0.45 + 0.2 * Math.sin(t * 1.3 + i);
      arm.group.rotation.z = 0;
      arm.segs[0].rotation.x = -0.25 - curl * 0.3;
      arm.segs[1].rotation.x = -curl * 0.7;
      arm.segs[2].rotation.x = -curl * 0.9;
      // lean the whole arm toward the hull
      const lean = Math.atan2(sx - ax, sz - az) - ang;
      arm.group.rotateOnAxis(new THREE.Vector3(Math.cos(lean), 0, -Math.sin(lean)), 0.3);
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
