// Prize hulls in the scene — the THREE half of fleet.js. Each captured ship
// sails in line astern of the flagship, riding the same waves.

import { buildShip, buildHand } from './ship.js';
import { SCHOONER } from './shipphysics.js';
import { frameFor, crewPosts } from './shipframe.js';
import { waveHeight } from './waves.js';
import { stationPoint, followStep } from './fleet.js';

// a prize is merchant tonnage — a schooner sailed home by YOUR hands
const PRIZE_DEF = { spec: SCHOONER, masts: 2, guns: 0 };

export class FleetLayer {
  constructor(scene) {
    this.scene = scene;
    this.prizes = []; // { f: {x, z, yaw, speed}, group, setSail }
  }

  size() { return this.prizes.length; }

  // spawn a prize at a world position (capture) or at station (save restore)
  add(x, z, yaw) {
    const built = buildShip(PRIZE_DEF);
    // the prize crew, visible at their stations — she's YOURS now, someone
    // has to sail her
    const F = frameFor(PRIZE_DEF.spec);
    for (const [i, p] of crewPosts(F.deck, 2, this.prizes.length).entries()) {
      const hand = buildHand(this.prizes.length * 3 + i);
      hand.position.set(p.x, F.deck.y, p.z);
      built.group.add(hand);
    }
    this.scene.add(built.group);
    this.prizes.push({
      f: { x, z, yaw, speed: 0 },
      group: built.group, setSail: built.setSail, setLantern: built.setLantern,
    });
  }

  // the whole column goes at once (sold in port)
  clear() {
    for (const p of this.prizes) this.scene.remove(p.group);
    this.prizes.length = 0;
  }

  // restore n prizes straight onto their stations astern of the flagship
  restore(n, flagX, flagZ, flagYaw) {
    for (let i = 0; i < n; i++) {
      const s = stationPoint(flagX, flagZ, flagYaw, i);
      this.add(s.x, s.z, flagYaw);
    }
  }

  // flagPace: the flagship's ground speed (hull speed * gait). night: the
  // prize crews hang lanterns like everyone else.
  update(t, dt, flagX, flagZ, flagYaw, flagPace, windFrom, night = false) {
    for (let i = 0; i < this.prizes.length; i++) {
      const p = this.prizes[i];
      const s = stationPoint(flagX, flagZ, flagYaw, i);
      followStep(p.f, s, flagYaw, flagPace, dt);
      p.group.position.set(p.f.x, waveHeight(p.f.x, p.f.z, t) - PRIZE_DEF.spec.draft, p.f.z);
      p.group.rotation.y = p.f.yaw;
      p.setSail(p.f.yaw, 0.5, windFrom, Math.min(1, p.f.speed / 6));
      p.setLantern(night);
    }
  }
}
