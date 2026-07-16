// Merchant hulls in the scene — the THREE half of merchants.js. Streams
// merchants in/out with the player, steps their little lives, and exposes
// them as contacts for the encounter gait and the boarding check.

import { buildSloop } from './ship.js';
import { waveHeight } from './waves.js';
import { cellMerchants, stepMerchant, activeCells, ACTIVE_R, CELL } from './merchants.js';

export class MerchantLayer {
  constructor(scene) {
    this.scene = scene;
    this.live = new Map();     // id -> { m, group, setSail }
    this.looted = new Set();   // ids stripped this session (they stay stripped)
  }

  update(t, dt, px, pz, windFrom) {
    // stream in
    for (const [cx, cz] of activeCells(px, pz)) {
      for (const spec of cellMerchants(cx, cz)) {
        if (this.live.has(spec.id)) continue;
        if (Math.hypot(spec.x - px, spec.z - pz) > ACTIVE_R) continue;
        const m = { ...spec, looted: this.looted.has(spec.id) };
        const sloop = buildSloop();
        sloop.group.scale.setScalar(1.12); // a touch beamier than the pirate
        this.scene.add(sloop.group);
        this.live.set(spec.id, { m, group: sloop.group, setSail: sloop.setSail });
      }
    }
    // step + stream out
    for (const [id, e] of this.live) {
      if (Math.hypot(e.m.x - px, e.m.z - pz) > ACTIVE_R * 1.2) {
        this.scene.remove(e.group);
        this.live.delete(id);
        continue;
      }
      stepMerchant(e.m, px, pz, dt);
      const y = waveHeight(e.m.x, e.m.z, t) - 0.45;
      e.group.position.set(e.m.x, y, e.m.z);
      e.group.rotation.y = e.m.yaw;
      e.setSail(e.m.yaw, e.m.looted ? 0 : 0.5, windFrom, e.m.looted ? 0 : 0.6);
    }
  }

  contacts() {
    const out = [];
    for (const e of this.live.values()) out.push({ x: e.m.x, z: e.m.z });
    return out;
  }

  // nearest un-stripped merchant: { id, dist, m } or null
  nearestPrize(px, pz) {
    let best = null;
    for (const [id, e] of this.live) {
      if (e.m.looted) continue;
      const dist = Math.hypot(e.m.x - px, e.m.z - pz);
      if (!best || dist < best.dist) best = { id, dist, m: e.m };
    }
    return best;
  }

  strip(id) {
    const e = this.live.get(id);
    if (e) e.m.looted = true;
    this.looted.add(id);
  }
}
