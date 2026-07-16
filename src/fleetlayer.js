// Prize hulls in the scene — the THREE half of fleet.js. Each captured ship
// sails in line astern of the flagship, riding the same waves.

import { buildSloop } from './ship.js';
import { waveHeight } from './waves.js';
import { stationPoint, followStep } from './fleet.js';

export class FleetLayer {
  constructor(scene) {
    this.scene = scene;
    this.prizes = []; // { f: {x, z, yaw, speed}, group, setSail }
  }

  size() { return this.prizes.length; }

  // spawn a prize at a world position (capture) or at station (save restore)
  add(x, z, yaw) {
    const sloop = buildSloop();
    sloop.group.scale.setScalar(1.12); // she keeps her merchant beam
    this.scene.add(sloop.group);
    this.prizes.push({ f: { x, z, yaw, speed: 0 }, group: sloop.group, setSail: sloop.setSail });
  }

  // restore n prizes straight onto their stations astern of the flagship
  restore(n, flagX, flagZ, flagYaw) {
    for (let i = 0; i < n; i++) {
      const s = stationPoint(flagX, flagZ, flagYaw, i);
      this.add(s.x, s.z, flagYaw);
    }
  }

  // flagPace: the flagship's ground speed (hull speed * gait)
  update(t, dt, flagX, flagZ, flagYaw, flagPace, windFrom) {
    for (let i = 0; i < this.prizes.length; i++) {
      const p = this.prizes[i];
      const s = stationPoint(flagX, flagZ, flagYaw, i);
      followStep(p.f, s, flagYaw, flagPace, dt);
      p.group.position.set(p.f.x, waveHeight(p.f.x, p.f.z, t) - 0.45, p.f.z);
      p.group.rotation.y = p.f.yaw;
      p.setSail(p.f.yaw, 0.5, windFrom, Math.min(1, p.f.speed / 6));
    }
  }
}
