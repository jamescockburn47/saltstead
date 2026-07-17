// Merchant hulls in the scene — the THREE half of merchants.js. Streams
// merchants in/out with the player, steps their little lives, carries their
// battle damage (combat.js), sinks the holed ones, floats their salvage,
// and exposes them as contacts for the encounter gait and the boarding check.

import * as THREE from 'three';
import { buildShip, buildHand } from './ship.js';
import { waveHeight } from './waves.js';
import { SCHOONER, CORVETTE, FRIGATE } from './shipphysics.js';
import { frameFor, crewPosts } from './shipframe.js';
import {
  cellMerchants, stepMerchant, activeCells, zoneDerelicts, ACTIVE_R, TYPES,
} from './merchants.js';
import { newHullState, applyShot, speedFactor, isSinking, salvageValue, SINK_TIME } from './combat.js';
import { zoneOf, DERELICT_ZONES } from './legendfx.js';
import { nearestLanePoint } from './lanes.js';
import { dxWrap } from './earth.js';
import { attitude } from './faction.js';
import { LIVERIES } from './livery.js';
import { spawnSurvivors, stepSurvivor, survivorFate } from './survivors.js';

// what each trade SAILS — real rungs of the same ladder the player climbs,
// so a lane full of ships is a lane full of different silhouettes, and the
// two SERVICES wear their colours (livery.js): the navy blue-black and buff
// under the ensign, the raider tarred black under the skull. Honest trade
// stays honest wood — the liveries read against it.
//   trader    a schooner, quick and unarmed
//   indiaman  a three-masted square-rigger with a castle — the payday LOOKS it
//   navy      a corvette with a visible broadside — the threat LOOKS it
//   raider    a fore-and-aft brigantine, black to the waterline — fast and lawless
//   derelict  a schooner gone grey, sails struck
const NPC_HULLS = {
  trader:   { spec: SCHOONER, masts: 2, guns: 0 },
  indiaman: { spec: FRIGATE, masts: 3, square: true, guns: 2, castle: true, wheel: true },
  navy:     { spec: CORVETTE, masts: 2, square: true, guns: 3, wheel: true, livery: LIVERIES.navy },
  raider:   { spec: CORVETTE, masts: 2, guns: 3, wheel: true, livery: LIVERIES.pirate },
  derelict: { spec: SCHOONER, masts: 2, guns: 0 },
};
// hands visible about her deck (the derelict's whole point is nobody's home)
const NPC_HANDS = { trader: 2, indiaman: 4, navy: 5, raider: 5, derelict: 0 };

// the dead fade to weathered grey (the liveried services paint at BUILD time)
function tintShip(group, type) {
  if (type !== 'derelict') return;
  group.traverse((o) => {
    if (!o.isMesh || !o.material || !o.material.color) return;
    if (o.material.isMeshBasicMaterial) return; // the lantern keeps her flame
    o.material.color.lerp(new THREE.Color(0x6a6f72), 0.55); // weathered grey
  });
}

// a deterministic per-id number for crew scatter
function idHash(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997;
  return h;
}

export class MerchantLayer {
  constructor(scene) {
    this.scene = scene;
    this.live = new Map();     // id -> { m, group, setSail, dmg, sinkT }
    this.looted = new Set();   // ids stripped this session (they stay stripped)
    this.sunk = new Set();     // ids on the bottom (their berths stay empty)
    this.flotsam = [];         // { x, z, gold, mesh } — what floats off a sinking
    this.escortN = 0;          // signal-rocket corvettes minted this session
    this.swimmers = [];        // { s, group, arm } — souls in the water (survivors.js)
    this.takenCount = 0;       // swimmers the sea took since last asked (main toasts)
    // every dead water carries its own drifting fleet (bermuda, ghost fleet…)
    this.deadWaters = DERELICT_ZONES
      .map((id) => ({ id, zone: zoneOf(id) }))
      .filter((d) => d.zone);
  }

  // a soul in the water: a head, shoulders awash, one arm waving for the sail
  buildSwimmer() {
    const g = new THREE.Group();
    const skin = new THREE.MeshPhongMaterial({ color: 0xd9a56f, flatShading: true });
    const shirt = new THREE.MeshPhongMaterial({ color: 0x4a5a6b, flatShading: true });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), skin);
    head.position.y = 0.28;
    const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.24), shirt);
    shoulders.position.y = 0.06;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.5, 0.09), skin);
    arm.geometry.translate(0, 0.25, 0); // hinge at the shoulder
    arm.position.set(0.2, 0.12, 0);
    g.add(head, shoulders, arm);
    return { group: g, arm };
  }

  spawnable(px, pz) {
    const out = [];
    for (const [cx, cz] of activeCells(px, pz)) out.push(...cellMerchants(cx, cz));
    // the dead waters' fleets stream like any other ship
    for (const d of this.deadWaters) {
      if (Math.hypot(d.zone.x - px, d.zone.z - pz) < d.zone.r + ACTIVE_R) {
        out.push(...zoneDerelicts(d.id));
      }
    }
    return out;
  }

  // shoal: the player floats where a warship's keel dare not go (main.js
  // samples the terrain against merchants.js NAVY_SHOAL). night: living
  // crews hang masthead lanterns after dark (derelicts stay dark — nobody's
  // aboard to light one, which is its own warning). factionId: the player's
  // flag — each sail's ATTITUDE to the player follows from it (faction.js).
  // quarryOf(id): main.js hands an assisting corvette her target — returns
  // { x, z } to hunt instead of the player, or null.
  update(t, dt, px, pz, windFrom, shoal = false, night = false,
    factionId = 'pirate', quarryOf = null, latAbs = 30) {
    this.latAbs = latAbs;
    // stream in
    for (const spec of this.spawnable(px, pz)) {
      if (this.live.has(spec.id) || this.sunk.has(spec.id)) continue;
      if (Math.hypot(dxWrap(px, spec.x), spec.z - pz) > ACTIVE_R) continue;
      const m = { ...spec, looted: this.looted.has(spec.id) };
      const def = NPC_HULLS[m.type] || NPC_HULLS.trader;
      const built = buildShip(def);
      tintShip(built.group, m.type);
      // hands about her deck — tinted AFTER, so the shared shirt materials
      // never take the navy's paint
      const seed = idHash(m.id);
      const F = frameFor(def.spec);
      for (const [i, p] of crewPosts(F.deck, NPC_HANDS[m.type] || 0, seed).entries()) {
        const hand = buildHand(seed + i);
        hand.scale.setScalar(F.scale > 1.6 ? 1.15 : 1); // big decks, honest-size people
        hand.position.set(p.x, F.deck.y, p.z);
        hand.rotation.y = ((seed + i * 37) % 7) - 3;
        built.group.add(hand);
      }
      this.scene.add(built.group);
      this.live.set(spec.id, {
        m, group: built.group, setSail: built.setSail,
        setLantern: built.setLantern, dmg: newHullState(), sinkT: null,
        draft: def.spec.draft, spec: def.spec,
      });
    }
    // step + stream out
    for (const [id, e] of this.live) {
      if (Math.hypot(dxWrap(px, e.m.x), e.m.z - pz) > ACTIVE_R * 1.2) {
        this.scene.remove(e.group);
        this.live.delete(id);
        continue;
      }
      // the sinking: she settles by the stern and goes down where she lies
      if (e.sinkT !== null) {
        e.sinkT += dt;
        const u = Math.min(1, e.sinkT / SINK_TIME);
        const y = waveHeight(e.m.x, e.m.z, t) - e.draft - u * u * 7;
        e.group.position.set(e.m.x, y, e.m.z);
        e.group.rotation.set(0.5 * u, e.m.yaw, 0.25 * u);
        e.setSail(e.m.yaw, 0, windFrom, 0);
        e.setLantern(false); // the sea puts her light out
        if (u >= 1) {
          this.scene.remove(e.group);
          this.live.delete(id);
          this.sunk.add(id);
        }
        continue;
      }
      // an assisting corvette is handed her quarry; everyone else minds the
      // player, with the attitude their type owes the player's flag
      const q = quarryOf ? quarryOf(e.m.id) : null;
      if (q) stepMerchant(e.m, q.x, q.z, dt, speedFactor(e.dmg), false, 'hunt');
      else {
        // idle traffic travels the nearest lane it is IN (lanes.js): honest sail
        // and patrols stream the corridors, so the player on a lane meets them
        const lp = (e.m.role === 'traffic' || e.m.role === 'patrol') ? nearestLanePoint(e.m.x, e.m.z) : null;
        const laneYaw = lp && lp.dist < lp.width ? lp.tangent : null;
        stepMerchant(e.m, px, pz, dt, speedFactor(e.dmg), shoal, attitude(e.m.type, factionId), laneYaw);
      }
      const y = waveHeight(e.m.x, e.m.z, t) - e.draft;
      e.group.position.set(e.m.x, y, e.m.z);
      e.group.rotation.set(0, e.m.yaw, (1 - e.dmg.hull) * 0.12); // holed, she lists
      const dead = e.m.looted || e.m.type === 'derelict';
      e.setSail(e.m.yaw, dead ? 0 : 0.5, windFrom, dead ? 0 : 0.6 * e.dmg.rig);
      e.setLantern(night && !dead);
    }
    // the sea remembers a sinking for a while (the frenzy), then forgets
    const wrecks = this.wrecks();
    for (const w of wrecks) w.age += dt;
    if (wrecks.length && wrecks[0].age > 240) wrecks.shift();

    // the souls in the water: bob, wave, strike out for your sail — and the
    // sea's clock runs on the ignored (survivors.js survivorFate; the warm
    // latitudes' sharks find them first). latAbs arrives from main.js.
    this.swimmers = this.swimmers.filter((w) => {
      if (w.sinkT !== undefined) { // being taken: a second under, then gone
        w.sinkT += dt;
        w.group.position.y -= dt * 1.6;
        if (w.sinkT > 1.2) { this.scene.remove(w.group); return false; }
        return true;
      }
      stepSurvivor(w.s, px, pz, dt);
      if (survivorFate(w.s.age, this.latAbs ?? 30) === 'taken') {
        w.sinkT = 0; // the fin was quicker
        this.takenCount++;
        return true;
      }
      const y = waveHeight(w.s.x, w.s.z, t);
      w.group.position.set(w.s.x, y - 0.12 + Math.sin(t * 1.8 + w.s.phase) * 0.08, w.s.z);
      w.group.rotation.y = Math.atan2(px - w.s.x, pz - w.s.z); // face the sail
      w.arm.rotation.z = 0.6 + Math.sin(t * 5 + w.s.phase) * 0.7; // the wave for help
      return true;
    });

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

  // swimmers within reach of the rail (not already being taken)
  survivorsNear(px, pz, r) {
    return this.swimmers.filter((w) => w.sinkT === undefined
      && Math.hypot(w.s.x - px, w.s.z - pz) <= r);
  }

  // haul them out: remove the bodies, hand back the souls (main.js decides
  // who signs articles and who pays the grateful purse)
  rescue(list) {
    const souls = [];
    for (const w of list) {
      this.scene.remove(w.group);
      this.swimmers = this.swimmers.filter((x) => x !== w);
      souls.push(w.s);
    }
    return souls;
  }

  // how many the sea took since last asked (main.js toasts the news)
  consumeTaken() {
    const n = this.takenCount;
    this.takenCount = 0;
    return n;
  }

  // every live hull with her papers — the lookout and the charts read this
  sails() {
    const out = [];
    for (const e of this.live.values()) {
      if (e.sinkT !== null) continue;
      out.push({ id: e.m.id, type: e.m.type, x: e.m.x, z: e.m.z, yaw: e.m.yaw, looted: e.m.looted });
    }
    return out;
  }

  // nearest un-stripped, un-sinking ship the player MAY board (the boarding
  // law is faction.js canBoardType, passed as a filter): { id, dist, m } or null
  nearestPrize(px, pz, mayBoard = null) {
    let best = null;
    for (const [id, e] of this.live) {
      if (e.m.looted || e.sinkT !== null) continue;
      if (mayBoard && !mayBoard(e.m.type)) continue;
      const dist = Math.hypot(dxWrap(px, e.m.x), e.m.z - pz);
      if (!best || dist < best.dist) best = { id, dist, m: e.m };
    }
    return best;
  }

  // nearest hull of the given type still spoiling for a fight — the
  // corvette hunting a pirate player, the raider hunting a King's ship
  // (faction.js hostileType): { id, dist, m } or null
  nearestHostile(px, pz, type = 'navy') {
    let best = null;
    for (const [id, e] of this.live) {
      if (e.m.type !== type || e.m.looted || e.m.routed || e.sinkT !== null) continue;
      const dist = Math.hypot(dxWrap(px, e.m.x), e.m.z - pz);
      if (!best || dist < best.dist) best = { id, dist, m: e.m };
    }
    return best;
  }

  // the Admiralty answers a signal from an empty sea: a corvette joins the
  // lanes at (x, z) — session-local, like any battle outcome; the spawn
  // table's world trade is untouched. Returns her id.
  spawnEscort(x, z, yaw = 0) {
    const id = `esc-${++this.escortN}`;
    const def = NPC_HULLS.navy;
    const built = buildShip(def);
    const seed = idHash(id);
    const F = frameFor(def.spec);
    for (const [i, p] of crewPosts(F.deck, NPC_HANDS.navy, seed).entries()) {
      const hand = buildHand(seed + i);
      hand.position.set(p.x, F.deck.y, p.z);
      built.group.add(hand);
    }
    this.scene.add(built.group);
    this.live.set(id, {
      m: {
        id, type: 'navy', x, z, yaw, speed: TYPES.navy.cruise,
        looted: false, routed: false, purse: 0,
      },
      group: built.group, setSail: built.setSail, setLantern: built.setLantern,
      dmg: newHullState(), sinkT: null, draft: def.spec.draft, spec: def.spec,
    });
    return id;
  }

  // fresh wrecks — where ships went down this session: [{ x, z, age }].
  // The wildlife reads this (sharks GATHER at a sinking); ages tick in
  // update and the sea forgets after FRENZY_S seconds (wildlife.js).
  wrecks() { return this._wrecks || (this._wrecks = []); }

  // she's holed through: the sinking starts, salvage floats off — and a
  // CREWED ship spills her people into the water (survivors.js; a derelict
  // has nobody left to swim)
  startSinking(id, e) {
    e.sinkT = 0;
    this.wrecks().push({ x: e.m.x, z: e.m.z, age: 0 });
    if (e.m.type !== 'derelict') {
      for (const s of spawnSurvivors(idHash(id), e.m.x, e.m.z)) {
        const body = this.buildSwimmer();
        this.scene.add(body.group);
        this.swimmers.push({ s, group: body.group, arm: body.arm });
      }
    }
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

  // a broadside lands on her: apply the shot, start the sinking if holed
  // through. Returns { sinking, dmg } or null if she's gone.
  applyShotTo(id, kind) {
    const e = this.live.get(id);
    if (!e || e.sinkT !== null) return null;
    applyShot(e.dmg, kind);
    if (isSinking(e.dmg)) this.startSinking(id, e);
    return { sinking: e.sinkT !== null, dmg: e.dmg };
  }

  // a ram lands on her: severity 0..1 (collide.js ramSeverity) chews the
  // hull state the same way round shot does — a ram is a very rude broadside
  ram(id, severity) {
    const e = this.live.get(id);
    if (!e || e.sinkT !== null) return null;
    e.dmg.hull = Math.max(0, e.dmg.hull - 0.35 * severity);
    if (isSinking(e.dmg)) this.startSinking(id, e);
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
