// The title diorama — the first thing a new sailor sees is the game at its
// most dramatic: a running BATTLE in dirty weather. A black-flagged galleon
// and her raider consort trade broadsides with two King's corvettes on a
// heavy sea, the lines WEAVING and heeling through each other's wakes,
// crews visible at the rails, muzzle flashes leaving the actual gun posts,
// lightning throwing the fight into silhouette. Own renderer, own scene,
// own clock; stop() disposes every GL resource this screen touched.
//
// Still deliberately worldless — no terrain, no HUD; the four hulls, the
// sea, and the weather ARE the pitch. The canvas stays hidden for the
// first few frames: the ocean/sky uniforms need one pass before they are
// honest, and the half-initialised first frame read as an inverted-colour
// flash on slower machines.

import * as THREE from 'three';
import { Sky } from './sky.js';
import { Ocean } from './ocean.js';
import { FoamLayer } from './foamlayer.js';
import { CombatLayer } from './combatlayer.js';
import { buildShip, buildHand } from './ship.js';
import { newShipState, shipAttitude, SPECS } from './shipphysics.js';
import { frameFor, gunPosts, crewPosts } from './shipframe.js';
import { setSeaState } from './waves.js';
import { DAY_LENGTH, solarState, lunarState, moonPhase } from './skymath.js';
import { glitterSource, moonBrightness, EXPOSURE_BASE } from './lightrig.js';
import { LIVERIES } from './livery.js';

const TITLE_FRAC = 0.695; // the sun low and gold; the storm eats half of it
const GLOOM = 0.22;
const SEA_STATE = 1.9;
const FLEET_SPEED = 4.6;
const CAM_DIST = 82, CAM_HEIGHT = 14;
const BROADSIDE_EVERY = 1.3;
const WIND_FROM = 2.1;

// the two battle lines: the pirates to windward, the King's ships to
// leeward. Each ship carries its own WEAVE (period/phase/amplitude) so the
// lines breathe together and apart — courses CROSS, nobody sails a ruler.
const LINE = [
  { def: { spec: SPECS.GALLEON, masts: 3, square: true, guns: 6, castle: true, livery: LIVERIES.pirate }, x: -16, z: 0, weave: { T: 17, p: 0.0, a: 0.34 }, hands: 5 },
  { def: { spec: SPECS.CORVETTE, masts: 2, guns: 3, livery: LIVERIES.pirate }, x: -26, z: 36, weave: { T: 13, p: 2.1, a: 0.42 }, hands: 4 },
  { def: { spec: SPECS.CORVETTE, masts: 2, square: true, guns: 3, livery: LIVERIES.navy }, x: 20, z: 14, weave: { T: 15, p: 4.0, a: 0.4 }, hands: 4 },
  { def: { spec: SPECS.CORVETTE, masts: 2, square: true, guns: 3, livery: LIVERIES.navy }, x: 30, z: -26, weave: { T: 19, p: 1.2, a: 0.36 }, hands: 4 },
];

export class TitleScene {
  constructor(mount) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = EXPOSURE_BASE;
    // hidden until the uniforms have had a frame to settle (the inverted-
    // colour flash on load was the half-initialised first frame)
    this.renderer.domElement.style.opacity = '0';
    this.renderer.domElement.style.transition = 'opacity 0.5s';
    mount.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x8fc3e8, 120, 620);
    this.scene.background = new THREE.Color(0x8fc3e8);
    this.camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 1200);

    this.sky = new Sky(this.scene);
    this.ocean = new Ocean(this.scene);
    this.ocean.uniforms.uFresnel.value = 0.45;
    this.foam = new FoamLayer(this.scene);
    this.combat = new CombatLayer(this.scene);
    setSeaState(SEA_STATE);

    // the lightning: a cold stroke that lives two frames
    this.bolt = new THREE.DirectionalLight(0xcfe0ff, 0);
    this.scene.add(this.bolt, this.bolt.target);
    this.boltT = -3;

    // the four combatants, crews at the rails
    this.fleet = [];
    for (const row of LINE) {
      const built = buildShip(row.def);
      const F = frameFor(row.def.spec);
      for (const [i, p] of crewPosts(F.deck, row.hands, row.x).entries()) {
        const hand = buildHand(row.x + i * 7);
        hand.scale.setScalar(F.scale > 1.6 ? 1.15 : 1);
        hand.position.set(p.x, F.deck.y, p.z);
        hand.rotation.y = ((row.x + i * 37) % 7) - 3;
        built.group.add(hand);
      }
      this.scene.add(built.group);
      const state = newShipState(row.x, row.z);
      state.speed = FLEET_SPEED;
      this.fleet.push({ row, built, state, F, yaw: 0 });
    }

    this.t = 0;
    this.last = performance.now();
    this.raf = 0;
    this.gunT = 1.2;
    this.gunN = 0;
    this.onResize = () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    };
    addEventListener('resize', this.onResize);

    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.frame();
    };
    loop();
  }

  frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    const t = this.t;
    // the settle: reveal once the shaders have rendered honest frames
    if (t > 0.15 && this.renderer.domElement.style.opacity === '0') {
      this.renderer.domElement.style.opacity = '1';
    }

    // the battle runs north, every hull WEAVING her own course — yaw is
    // integrated honestly so the wakes curve and the lines cross
    const emitters = [];
    for (const f of this.fleet) {
      const w = f.row.weave;
      f.yaw = Math.sin((t / w.T) * Math.PI * 2 + w.p) * w.a;
      const yawRate = Math.cos((t / w.T) * Math.PI * 2 + w.p) * w.a * (Math.PI * 2 / w.T);
      f.state.x += Math.sin(f.yaw) * FLEET_SPEED * dt;
      f.state.z += Math.cos(f.yaw) * FLEET_SPEED * dt;
      f.state.yaw = f.yaw;
      const att = shipAttitude(f.state, t, f.row.def.spec);
      f.built.group.position.set(f.state.x, att.y, f.state.z);
      // the HEEL: wind pressure lays her over on the beam, and the turn
      // adds its own lean — the drama the ruler-straight lines never had
      const windHeel = 0.09 * Math.cos(f.yaw - WIND_FROM);
      const turnHeel = yawRate * 1.6;
      f.built.group.rotation.set(att.pitch, f.yaw, att.roll + windHeel + turnHeel);
      f.built.setSail(f.yaw, 0.6, WIND_FROM, 0.75);
      f.built.setHelm(yawRate * 3);
      emitters.push({
        x: f.state.x - Math.sin(f.yaw) * f.row.def.spec.length * 0.55,
        z: f.state.z - Math.cos(f.yaw) * f.row.def.spec.length * 0.55,
        size: 1.6,
      });
    }

    // the guns: another ship in the line fires on the nearest hull of the
    // other flag — and the flash leaves the ACTUAL gun post on the engaged
    // beam, not the middle of the ship
    this.gunT -= dt;
    if (this.gunT <= 0) {
      this.gunT = BROADSIDE_EVERY * (0.7 + 0.6 * Math.abs(Math.sin(t * 0.37)));
      const s = this.fleet[this.gunN++ % this.fleet.length];
      const foes = this.fleet.filter((o) => o.row.def.livery !== s.row.def.livery);
      const foe = foes[this.gunN % foes.length];
      const miss = (this.gunN % 3) === 0;
      const D = s.F.deck, sc = s.F.scale;
      // which beam bears on the foe (ship-local x sign)
      const dx = foe.state.x - s.state.x, dz = foe.state.z - s.state.z;
      const side = Math.sign(dx * Math.cos(s.yaw) - dz * Math.sin(s.yaw)) || 1;
      const posts = gunPosts(D, sc, s.row.def.guns);
      const post = posts[this.gunN % posts.length];
      // gun-post local -> world through the ship's yaw
      const lx = side * (D.maxX + 0.35 * sc), lz = post;
      const gx = s.state.x + lx * Math.cos(s.yaw) + lz * Math.sin(s.yaw);
      const gz = s.state.z - lx * Math.sin(s.yaw) + lz * Math.cos(s.yaw);
      const gy = s.built.group.position.y + D.y + 0.36 * sc;
      this.combat.fire(
        { x: gx, y: gy, z: gz },
        {
          x: foe.state.x + (miss ? (this.gunN % 2 ? 14 : -11) : 0),
          z: foe.state.z + (miss ? -8 : 0),
        },
        miss);
    }
    this.combat.update(t, dt);

    // the lightning: a stroke every 6–11 s, two frames of cold daylight
    this.boltT += dt;
    const strokeAt = 6 + 5 * Math.abs(Math.sin(this.gunN * 2.7));
    if (this.boltT > strokeAt) this.boltT = -0.12;
    if (this.boltT < 0) {
      this.bolt.intensity = 2.6 * (1 - Math.abs(this.boltT) / 0.12);
      this.bolt.position.set(this.fleet[0].state.x - 120, 140, this.fleet[0].state.z + 80);
      this.bolt.target.position.set(this.fleet[0].state.x, 0, this.fleet[0].state.z);
    } else {
      this.bolt.intensity = 0;
    }

    this.foam.update(t, dt, this.fleet[0].state.x, this.fleet[0].state.z, FLEET_SPEED, emitters);

    // the camera stands off the fight, high enough to read both lines; the
    // battle rides the LEFT third, clear of the login box
    const mid = {
      x: (this.fleet[0].state.x + this.fleet[2].state.x) / 2,
      z: (this.fleet[0].state.z + this.fleet[2].state.z) / 2,
    };
    const az = 2.35 + 0.22 * Math.sin(t * 0.037);
    this.camera.position.set(
      mid.x + Math.sin(az) * CAM_DIST,
      CAM_HEIGHT + 1.2 * Math.sin(t * 0.03),
      mid.z + Math.cos(az) * CAM_DIST);
    const rx = Math.cos(az), rz = -Math.sin(az);
    this.camera.lookAt(mid.x + rx * 34, 4, mid.z + rz * 34);

    // storm light over a golden hour; the sea still moves under it
    const skyT = TITLE_FRAC * DAY_LENGTH;
    const sol = solarState(skyT);
    const lun = lunarState(skyT);
    const glit = glitterSource(sol, lun, moonBrightness(moonPhase(skyT)));
    this.sky.update(skyT, 32, this.camera.position, GLOOM);
    this.ocean.update(t, this.fleet[0].state.x, this.fleet[0].state.z, this.camera.position, glit,
      this.sky.domeUniforms.uHor.value, SEA_STATE);
    this.foam.setLight(sol.dayness * (1 - GLOOM * 0.5));

    this.renderer.render(this.scene, this.camera);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    removeEventListener('resize', this.onResize);
    setSeaState(1); // hand the wave field back calm; the Game re-drives it
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const m = o.material;
      if (m) for (const mm of Array.isArray(m) ? m : [m]) {
        if (mm.map) mm.map.dispose();
        mm.dispose();
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
