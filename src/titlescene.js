// The title diorama — the first thing a new sailor sees is the game at its
// most dramatic: a running BATTLE in dirty weather. A black-flagged galleon
// and her raider consort trade broadsides with two King's corvettes on a
// heavy sea under a storm-dark sky, muzzle flashes lighting the gloom and
// lightning throwing the whole fight into silhouette. Own renderer, own
// scene, own clock: the Game boots fresh when the title hands off, and
// stop() disposes every GL resource this screen touched.
//
// Still deliberately worldless — no terrain, no HUD; the four hulls, the
// sea, and the weather ARE the pitch. Cheap enough for any laptop; if
// WebGL itself fails the caller catches and the title stays legible on its
// vignette alone.

import * as THREE from 'three';
import { Sky } from './sky.js';
import { Ocean } from './ocean.js';
import { FoamLayer } from './foamlayer.js';
import { CombatLayer } from './combatlayer.js';
import { buildShip } from './ship.js';
import { newShipState, shipAttitude, SPECS } from './shipphysics.js';
import { setSeaState } from './waves.js';
import { DAY_LENGTH, solarState, lunarState, moonPhase } from './skymath.js';
import { glitterSource, moonBrightness, EXPOSURE_BASE } from './lightrig.js';
import { LIVERIES } from './livery.js';

// late golden hour under storm gloom: enough light to read the fight, dark
// enough that every muzzle flash and lightning stroke OWNS the frame
const TITLE_FRAC = 0.695; // the sun still up, low and gold — the storm eats half of it
const GLOOM = 0.22;
const SEA_STATE = 1.9;      // a heavy, living swell
const FLEET_SPEED = 4.6;    // the whole battle runs north in company
const CAM_DIST = 82, CAM_HEIGHT = 14;
const BROADSIDE_EVERY = 1.4; // seconds between guns somewhere in the line
const WIND_FROM = 2.1;

// the two battle lines, ship-local to the fleet anchor: the pirates to
// windward, the King's ships to leeward, close enough to smell the powder
const LINE = [
  { def: { spec: SPECS.GALLEON, masts: 3, square: true, guns: 6, castle: true, livery: LIVERIES.pirate }, x: -16, z: 0 },
  { def: { spec: SPECS.CORVETTE, masts: 2, guns: 3, livery: LIVERIES.pirate }, x: -24, z: 34 },
  { def: { spec: SPECS.CORVETTE, masts: 2, square: true, guns: 3, livery: LIVERIES.navy }, x: 18, z: 12 },
  { def: { spec: SPECS.CORVETTE, masts: 2, square: true, guns: 3, livery: LIVERIES.navy }, x: 26, z: -26 },
];

export class TitleScene {
  constructor(mount) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = EXPOSURE_BASE;
    mount.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    // Sky.update writes fog + background colours every frame — it must exist
    this.scene.fog = new THREE.Fog(0x8fc3e8, 120, 620);
    this.scene.background = new THREE.Color(0x8fc3e8);
    this.camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 1200);

    this.sky = new Sky(this.scene);
    this.ocean = new Ocean(this.scene);
    this.ocean.uniforms.uFresnel.value = 0.45;
    this.foam = new FoamLayer(this.scene);
    this.combat = new CombatLayer(this.scene);
    setSeaState(SEA_STATE); // the storm sea (Game re-drives this on boot)

    // the lightning: a cold flash that lives two frames — sky.update owns
    // the ambient every frame, so the stroke rides a dedicated light
    this.bolt = new THREE.DirectionalLight(0xcfe0ff, 0);
    this.scene.add(this.bolt, this.bolt.target);
    this.boltT = -3; // first stroke a few seconds in

    // the four combatants, in two lines
    this.fleet = [];
    for (const row of LINE) {
      const built = buildShip(row.def);
      this.scene.add(built.group);
      const state = newShipState(row.x, row.z);
      state.speed = FLEET_SPEED;
      built.setSail(0, 0.6, WIND_FROM, 0.75);
      this.fleet.push({ row, built, state });
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

    // the battle runs north for ever, line abreast of line
    const emitters = [];
    for (const f of this.fleet) {
      f.state.z += FLEET_SPEED * dt;
      // each hull works its own water: a slow weave holds the lines apart
      const wob = Math.sin(t * 0.11 + f.row.x) * 3;
      const att = shipAttitude(f.state, t, f.row.def.spec);
      f.built.group.position.set(f.state.x + wob, att.y, f.state.z);
      f.built.group.rotation.set(att.pitch, Math.sin(t * 0.05 + f.row.z) * 0.06, att.roll);
      emitters.push({ x: f.state.x + wob, z: f.state.z - f.row.def.spec.length * 0.55, size: 1.6 });
    }

    // the guns: every BROADSIDE_EVERY seconds another ship in the line
    // fires on the nearest hull of the other flag — hits and misses both,
    // the misses raising sea-spray between the lines
    this.gunT -= dt;
    if (this.gunT <= 0) {
      this.gunT = BROADSIDE_EVERY * (0.7 + 0.6 * Math.abs(Math.sin(t * 0.37)));
      const s = this.fleet[this.gunN++ % this.fleet.length];
      const foes = this.fleet.filter((o) => o.row.def.livery !== s.row.def.livery);
      const foe = foes[this.gunN % foes.length];
      const miss = (this.gunN % 3) === 0;
      const fx = s.built.group.position, tx = foe.built.group.position;
      this.combat.fire(
        { x: fx.x, y: fx.y + 2.2, z: fx.z },
        {
          x: tx.x + (miss ? (this.gunN % 2 ? 14 : -11) : 0),
          z: tx.z + (miss ? -8 : 0),
        },
        miss);
    }
    this.combat.update(t, dt);

    // the lightning: a stroke every 6–11 s, two frames of cold daylight
    this.boltT += dt;
    const strokeAt = 6 + 5 * Math.abs(Math.sin(this.gunN * 2.7));
    if (this.boltT > strokeAt) this.boltT = -0.12; // the stroke runs while boltT < 0
    if (this.boltT < 0) {
      this.bolt.intensity = 2.6 * (1 - Math.abs(this.boltT) / 0.12);
      this.bolt.position.set(this.fleet[0].state.x - 120, 140, this.fleet[0].state.z + 80);
      this.bolt.target.position.set(this.fleet[0].state.x, 0, this.fleet[0].state.z);
    } else {
      this.bolt.intensity = 0;
    }

    this.foam.update(t, dt, this.fleet[0].state.x, this.fleet[0].state.z, FLEET_SPEED, emitters);

    // the camera stands OFF the fight, high enough to read both lines,
    // drifting slowly — the battle fills the left of the frame, the login
    // box keeps the right
    const anchor = this.fleet[0];
    const mid = {
      x: (this.fleet[0].state.x + this.fleet[2].state.x) / 2,
      z: (this.fleet[0].state.z + this.fleet[2].state.z) / 2,
    };
    const az = 2.35 + 0.22 * Math.sin(t * 0.037);
    this.camera.position.set(
      mid.x + Math.sin(az) * CAM_DIST,
      CAM_HEIGHT + 1.2 * Math.sin(t * 0.03),
      mid.z + Math.cos(az) * CAM_DIST);
    // aim RIGHT of the fleet so the fight rides the LEFT third of the
    // frame, clear of the login box (camera right = (cos az, -sin az))
    const rx = Math.cos(az), rz = -Math.sin(az);
    this.camera.lookAt(mid.x + rx * 34, 4, mid.z + rz * 34);

    // storm light: the golden hour buried under gloom; the sea still moves
    const skyT = TITLE_FRAC * DAY_LENGTH;
    const sol = solarState(skyT);
    const lun = lunarState(skyT);
    const glit = glitterSource(sol, lun, moonBrightness(moonPhase(skyT)));
    this.sky.update(skyT, 32, this.camera.position, GLOOM);
    this.ocean.update(t, anchor.state.x, anchor.state.z, this.camera.position, glit,
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
