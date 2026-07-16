// The title diorama — a live golden-hour sea behind the login box, so the
// first thing a new sailor sees is the game itself, not a gradient. Own
// renderer, own scene, own clock: the Game boots fresh when the title hands
// off, and stop() disposes every GL resource this screen touched.
//
// Deliberately worldless: no terrain, no NPCs, no HUD — one sloop running
// before the wind at sunset, foam astern, the real sky machinery overhead.
// Cheap enough for any laptop; if WebGL itself fails the caller catches and
// the title stays legible on its vignette alone.

import * as THREE from 'three';
import { Sky } from './sky.js';
import { Ocean } from './ocean.js';
import { FoamLayer } from './foamlayer.js';
import { buildSloop } from './ship.js';
import { newShipState, shipAttitude, SLOOP } from './shipphysics.js';
import { DAY_LENGTH, solarState, lunarState, moonPhase } from './skymath.js';
import { glitterSource, moonBrightness, EXPOSURE_BASE } from './lightrig.js';

// sunset's golden band: sun low in the west on the way down (skymath's golden
// curve), still enough dayness to light the sails
const TITLE_FRAC = 0.742;
const SHIP_SPEED = 4.2;          // m/s — enough way for a living wake
const CAM_DIST = 20, CAM_HEIGHT = 5.2;

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

    this.ship = newShipState(0, 0);
    this.ship.speed = SHIP_SPEED;
    const built = buildSloop();
    this.shipGroup = built.group;
    this.setSail = built.setSail;
    this.scene.add(this.shipGroup);
    // running before a quartering breeze: boom out, sail full
    this.setSail(0, 0.85, 0 - 2.4, 0.9);

    this.t = 0;
    this.last = performance.now();
    this.raf = 0;
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

    // the sloop runs due north for ever; the sea is endless, nobody grounds
    this.ship.z += SHIP_SPEED * dt;
    const att = shipAttitude(this.ship, t, SLOOP);
    this.shipGroup.position.set(this.ship.x, att.y, this.ship.z);
    this.shipGroup.rotation.set(att.pitch, 0, att.roll + 0.06);

    this.foam.update(t, dt, this.ship.x, this.ship.z, SHIP_SPEED, [
      { x: this.ship.x, z: this.ship.z - 5.5, size: 1.7 },
      { x: this.ship.x, z: this.ship.z + 5.5, size: 0.8 },
    ]);

    // camera east of the hull, gazing WEST into the setting sun (skymath puts
    // it at -x): the sloop rides in silhouette against the gold, and a slow
    // drift keeps the shot alive without ever swinging off the sunset
    const az = 1.4 + 0.35 * Math.sin(t * 0.05);
    this.camera.position.set(
      this.ship.x + Math.sin(az) * CAM_DIST,
      att.y + CAM_HEIGHT + 0.5 * Math.sin(t * 0.031),
      this.ship.z + Math.cos(az) * CAM_DIST);
    // gaze a few metres to the camera's right of the hull, so the sloop rides
    // the LEFT third of the frame instead of hiding behind the login box
    const rx = Math.cos(az), rz = -Math.sin(az);
    this.camera.lookAt(this.ship.x + rx * 5, att.y + 2.6, this.ship.z + rz * 5);

    // the sky holds golden hour; the sea still moves under it
    const skyT = TITLE_FRAC * DAY_LENGTH;
    const sol = solarState(skyT);
    const lun = lunarState(skyT);
    const glit = glitterSource(sol, lun, moonBrightness(moonPhase(skyT)));
    this.sky.update(skyT, 18, this.camera.position, 0);
    this.ocean.update(t, this.ship.x, this.ship.z, this.camera.position, glit,
      this.sky.domeUniforms.uHor.value, 1);
    this.foam.setLight(sol.dayness);

    this.renderer.render(this.scene, this.camera);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    removeEventListener('resize', this.onResize);
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
