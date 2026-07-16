// Merchant hulls in the scene — the THREE half of merchants.js. Streams
// merchants in/out with the player, steps their little lives, carries their
// battle damage (combat.js), sinks the holed ones, floats their salvage,
// and exposes them as contacts for the encounter gait and the boarding check.

import * as THREE from 'three';
import { buildSloop } from './ship.js';
import { waveHeight } from './waves.js';
import {
  cellMerchants, stepMerchant, activeCells, zoneDerelicts, ACTIVE_R, TYPES,
} from './merchants.js';
import { newHullState, applyShot, speedFactor, isSinking, salvageValue, SINK_TIME } from './combat.js';
import { zoneOf } from './legendfx.js';

// tint a freshly built hull for its trade: the navy paints, the dead fade
function tintShip(group, type) {
  if (type !== 'navy' && type !== 'derelict') return;
  group.traverse((o) => {
    if (!o.isMesh || !o.material || !o.material.color) return;
    if (type === 'navy') o.material.color.multiply(new THREE.Color(0.55, 0.62, 0.85));
    else o.material.color.lerp(new THREE.Color(0x6a6f72), 0.55); // weathered grey
  });
}

export class MerchantLayer {
  constructor(scene) {
    this.scene = scene;
    this.live = new Map();     // id -> { m, group, setSail, dmg, sinkT }
    this.looted = new Set();   // ids stripped this session (they stay stripped)
    this.sunk = new Set();     // ids on the bottom (their berths stay empty)
    this.flotsam = [];         // { x, z, gold, mesh } — what floats off a sinking
    this.bermuda = zoneOf('bermuda-triangle');
  }

  spawnable(px, pz) {
    const out = [];
    for (const [cx, cz] of activeCells(px, pz)) out.push(...cellMerchants(cx, cz));
    // the triangle's dead fleet streams like any other ship
    if (this.bermuda
      && Math.hypot(this.bermuda.x - px, this.bermuda.z - pz) < this.bermuda.r + ACTIVE_R) {
      out.push(...zoneDerelicts());
    }
    return out;
  }

  // shoal: the player floats where a warship's keel dare not go (main.js
  // samples the terrain against merchants.js NAVY_SHOAL)
  update(t, dt, px, pz, windFrom, shoal = false) {
    // stream in
    for (const spec of this.spawnable(px, pz)) {
      if (this.live.has(spec.id) || this.sunk.has(spec.id)) continue;
      if (Math.hypot(spec.x - px, spec.z - pz) > ACTIVE_R) continue;
      const m = { ...spec, looted: this.looted.has(spec.id) };
      const sloop = buildSloop();
      sloop.group.scale.setScalar(TYPES[m.type].scale);
      tintShip(sloop.group, m.type);
      this.scene.add(sloop.group);
      this.live.set(spec.id, { m, group: sloop.group, setSail: sloop.setSail, dmg: newHullState(), sinkT: null });
    }
    // step + stream out
    for (const [id, e] of this.live) {
      if (Math.hypot(e.m.x - px, e.m.z - pz) > ACTIVE_R * 1.2) {
        this.scene.remove(e.group);
        this.live.delete(id);
        continue;
      }
      // the sinking: she settles by the stern and goes down where she lies
      if (e.sinkT !== null) {
        e.sinkT += dt;
        const u = Math.min(1, e.sinkT / SINK_TIME);
        const y = waveHeight(e.m.x, e.m.z, t) - 0.45 - u * u * 5;
        e.group.position.set(e.m.x, y, e.m.z);
        e.group.rotation.set(0.5 * u, e.m.yaw, 0.25 * u);
        e.setSail(e.m.yaw, 0, windFrom, 0);
        if (u >= 1) {
          this.scene.remove(e.group);
          this.live.delete(id);
          this.sunk.add(id);
        }
        continue;
      }
      stepMerchant(e.m, px, pz, dt, speedFactor(e.dmg), shoal);
      const y = waveHeight(e.m.x, e.m.z, t) - 0.45;
      e.group.position.set(e.m.x, y, e.m.z);
      e.group.rotation.set(0, e.m.yaw, (1 - e.dmg.hull) * 0.12); // holed, she lists
      const dead = e.m.looted || e.m.type === 'derelict';
      e.setSail(e.m.yaw, dead ? 0 : 0.5, windFrom, dead ? 0 : 0.6 * e.dmg.rig);
    }
    // flotsam bobs where its ship went down
    for (const f of this.flotsam) {
      f.mesh.position.set(f.x, waveHeight(f.x, f.z, t) + 0.1, f.z);
      f.mesh.rotation.y += dt * 0.3;
    }
  }

  contacts() {
    const out = [];
    for (const e of this.live.values()) out.push({ x: e.m.x, z: e.m.z });
    return out;
  }

  // nearest un-stripped, un-sinking ship: { id, dist, m } or null
  nearestPrize(px, pz) {
    let best = null;
    for (const [id, e] of this.live) {
      if (e.m.looted || e.sinkT !== null) continue;
      const dist = Math.hypot(e.m.x - px, e.m.z - pz);
      if (!best || dist < best.dist) best = { id, dist, m: e.m };
    }
    return best;
  }

  // nearest corvette still spoiling for a fight: { id, dist, m } or null
  nearestHostile(px, pz) {
    let best = null;
    for (const [id, e] of this.live) {
      if (e.m.type !== 'navy' || e.m.looted || e.m.routed || e.sinkT !== null) continue;
      const dist = Math.hypot(e.m.x - px, e.m.z - pz);
      if (!best || dist < best.dist) best = { id, dist, m: e.m };
    }
    return best;
  }

  // a broadside lands on her: apply the shot, start the sinking if holed
  // through. Returns { sinking, dmg } or null if she's gone.
  applyShotTo(id, kind) {
    const e = this.live.get(id);
    if (!e || e.sinkT !== null) return null;
    applyShot(e.dmg, kind);
    if (isSinking(e.dmg)) {
      e.sinkT = 0;
      this.looted.add(id); // her berth in the spawn table stays empty
      if (!e.m.looted) {
        // most of the cargo goes down with her; a fraction floats
        const gold = salvageValue(e.m.purse || 100);
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.9, 0.6, 0.9),
          new THREE.MeshPhongMaterial({ color: 0x7a5a34, flatShading: true }));
        this.scene.add(mesh);
        this.flotsam.push({ x: e.m.x, z: e.m.z, gold, mesh });
      }
    }
    return { sinking: e.sinkT !== null, dmg: e.dmg };
  }

  // sail over the wreckage: collect any flotsam within reach, returns gold
  collectFlotsam(px, pz, reach = 16) {
    let gold = 0;
    this.flotsam = this.flotsam.filter((f) => {
      if (Math.hypot(f.x - px, f.z - pz) > reach) return true;
      gold += f.gold;
      this.scene.remove(f.mesh);
      return false;
    });
    return gold;
  }

  strip(id) {
    const e = this.live.get(id);
    if (e) e.m.looted = true;
    this.looted.add(id);
  }

  // a lost boarding: the corvette breaks off and runs
  rout(id) {
    const e = this.live.get(id);
    if (e) e.m.routed = true;
  }

  // hand the hull over (prize capture): remove from the lanes for good and
  // return her pose, or null if she's gone
  take(id) {
    const e = this.live.get(id);
    if (!e || e.sinkT !== null) return null;
    this.scene.remove(e.group);
    this.live.delete(id);
    this.looted.add(id); // her berth in the spawn table stays empty
    return { x: e.m.x, z: e.m.z, yaw: e.m.yaw };
  }

  // pose of a live merchant (for the capture window check)
  poseOf(id) {
    const e = this.live.get(id);
    return e ? { x: e.m.x, z: e.m.z, yaw: e.m.yaw, looted: e.m.looted } : null;
  }
}
