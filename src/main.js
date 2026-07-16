// Saltstead Phase 0 — the sailing prototype.
// One ocean, one sloop, wind, waves, a walkable moving deck, a helm, and a
// third-person camera. The kill/go gate: this has to FEEL good before the
// planet gets built. docs/DESIGN.md is the contract.

import * as THREE from 'three';
import { Ocean } from './ocean.js';
import { buildSloop } from './ship.js';
import { buildCaptain } from './captain.js';
import { FoamLayer } from './foamlayer.js';
import { newShipState, stepShip, shipAttitude, SLOOP } from './shipphysics.js';
import { DECK, HELM, clampToDeck, nearHelm, localToWorld } from './shipframe.js';
import { sailPower, wrapAngle, optimalTrim, tackSign, IRONS } from './sailing.js';
import { waveHeight } from './waves.js';
import { TerrainLayer } from './terrain.js';
import {
  latLonToWorld, worldToLatLon, coastDistGame, elevation, gaitFactor, COAST_CAP,
} from './earth.js';

const POS_NAMES = [
  [IRONS, 'In irons'],
  [0.87, 'Close-hauled'],
  [1.9, 'Beam reach'],
  [2.7, 'Broad reach'],
  [Math.PI + 0.01, 'Running'],
];

class Game {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    document.getElementById('app').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8fc3e8);
    this.scene.fog = new THREE.Fog(0x8fc3e8, 120, 620);

    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1200);

    const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x1a3a50, 0.85);
    const sun = new THREE.DirectionalLight(0xfff2d8, 1.5);
    sun.position.set(120, 160, -80);
    this.scene.add(hemi, sun);

    this.ocean = new Ocean(this.scene);
    this.foam = new FoamLayer(this.scene);
    this.terrain = new TerrainLayer(this.scene);

    // spawn in the Caribbean, off Port Royal — the Phase 1 haven
    const spawn = latLonToWorld(17.85, -76.9);
    this.ship = newShipState(spawn.x, spawn.z);
    this.ship.yaw = 0.5; // bow toward the Jamaican coast
    this.ship.trim = 0.5;
    this.coastDist = COAST_CAP;
    this.geoClock = 0;
    this.aground = false;
    const sloop = buildSloop();
    this.shipGroup = sloop.group;
    this.shipGroup.rotation.order = 'YXZ';
    this.setSail = sloop.setSail;
    this.scene.add(this.shipGroup);

    this.captain = buildCaptain();
    this.cap = { x: 0, z: -2.2, facing: 0, moving: false };
    this.captain.group.position.set(this.cap.x, DECK.y, this.cap.z);
    this.shipGroup.add(this.captain.group);

    this.mode = 'walk'; // 'walk' | 'helm'
    this.wind = { from: 2.3, speed: 7 };
    this.cam = { yaw: Math.PI * 0.85, pitch: 0.32, dist: 8, targetDist: 8 };

    this.keys = new Set();
    addEventListener('keydown', (e) => { this.keys.add(e.code); if (e.code === 'KeyE') this.toggleHelm(); });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    this.dragging = false;
    const el = this.renderer.domElement;
    el.addEventListener('mousedown', () => { this.dragging = true; });
    addEventListener('mouseup', () => { this.dragging = false; });
    addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      this.cam.yaw -= e.movementX * 0.005;
      this.cam.pitch = Math.max(0.08, Math.min(1.25, this.cam.pitch + e.movementY * 0.004));
    });
    addEventListener('wheel', (e) => {
      this.cam.targetDist = Math.max(4, Math.min(30, this.cam.targetDist + e.deltaY * 0.01));
    });
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });

    this.hud = {
      speed: document.getElementById('speed'),
      pos: document.getElementById('pointofsail'),
      trim: document.getElementById('trimfill'),
      windArrow: document.getElementById('windarrow'),
      windSpeed: document.getElementById('windspeed'),
      hint: document.getElementById('hint'),
      latlon: document.getElementById('latlon'),
      gait: document.getElementById('gaitbadge'),
    };

    this.t = 0;
    this.last = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  toggleHelm() {
    if (this.mode === 'helm') { this.mode = 'walk'; this.cam.targetDist = 8; return; }
    if (nearHelm(this.cap.x, this.cap.z)) {
      this.mode = 'helm';
      this.cap.x = HELM.x; this.cap.z = HELM.z + 0.6;
      this.cap.facing = 0; // face the bow
      this.cam.targetDist = 19;
    }
  }

  frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    const t = this.t, k = this.keys;

    // a living wind: direction breathes AROUND a base bearing (bounded, so it
    // can never spin onto the bow and stall the game), strength gusts
    this.wind.from = 2.3 + 0.3 * Math.sin(t * 0.011) + 0.12 * Math.sin(t * 0.037);
    this.wind.speed = 7 + 2.2 * Math.sin(t * 0.07) + 1.1 * Math.sin(t * 0.21);

    if (this.mode === 'helm') {
      const rt = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
      this.ship.rudder += (rt - this.ship.rudder) * Math.min(1, dt * 5);
      if (k.has('KeyW')) this.ship.trim = Math.max(0, this.ship.trim - dt * 0.45);
      if (k.has('KeyS')) this.ship.trim = Math.min(1, this.ship.trim + dt * 0.45);
    } else {
      this.ship.rudder *= 1 - Math.min(1, dt * 2);
    }

    // geography, throttled: coast distance drives the gait and the checks
    this.geoClock -= dt;
    if (this.geoClock <= 0) {
      this.geoClock = 0.25;
      const ll = worldToLatLon(this.ship.x, this.ship.z);
      this.coastDist = coastDistGame(ll.lat, ll.lon);
    }
    const gait = gaitFactor(this.coastDist);

    const px = this.ship.x, pz = this.ship.z;
    stepShip(this.ship, this.wind, dt, SLOOP, gait);

    // grounding: inshore, the sea floor is real
    if (this.coastDist < 400) {
      const ll = worldToLatLon(this.ship.x, this.ship.z);
      if (elevation(ll.lat, ll.lon) > -0.9) {
        this.ship.x = px; this.ship.z = pz;
        this.ship.speed = 0;
        this.aground = true;
      } else this.aground = false;
    } else this.aground = false;

    this.terrain.update(this.ship.x, this.ship.z);
    const att = shipAttitude(this.ship, t);
    const rel = wrapAngle(this.ship.yaw - this.wind.from);
    const power = sailPower(this.ship.yaw, this.wind.from, this.ship.trim);
    // wind heel: lean away from the wind in proportion to drive — visual only
    const heel = -tackSign(this.ship.yaw, this.wind.from) * power * 0.14;
    this.shipGroup.position.set(this.ship.x, att.y, this.ship.z);
    this.shipGroup.rotation.set(att.pitch, this.ship.yaw, att.roll + heel);
    this.setSail(this.ship.yaw, this.ship.trim, this.wind.from, power);

    // wake astern + bow-wave foam, world-anchored so the ship leaves them behind
    const stern = localToWorld(this.ship, 0, 0, DECK.minZ - 0.5);
    const bow = localToWorld(this.ship, 0, 0, DECK.maxZ + 0.9);
    this.foam.update(t, dt, this.ship.x, this.ship.z, this.ship.speed,
      [{ x: stern.x, z: stern.z, size: 1.7 }, { x: bow.x, z: bow.z, size: 0.8 }]);

    // speed widens the lens a touch — subliminal but it sells the pace
    const fovTarget = 62 + 7 * Math.min(1, this.ship.speed / SLOOP.maxSpeed);
    if (Math.abs(this.camera.fov - fovTarget) > 0.05) {
      this.camera.fov += (fovTarget - this.camera.fov) * Math.min(1, dt * 3);
      this.camera.updateProjectionMatrix();
    }

    // captain: walk the deck (camera-relative input, ship-local position)
    this.cap.moving = false;
    if (this.mode === 'walk') {
      const ix = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
      const iz = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
      if (ix || iz) {
        const fwd = new THREE.Vector3();
        this.camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
        const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
        const dir = new THREE.Vector3().addScaledVector(fwd, iz).addScaledVector(right, ix).normalize();
        // world direction -> ship-local (yaw only)
        const s = Math.sin(this.ship.yaw), c = Math.cos(this.ship.yaw);
        const lx = dir.x * c - dir.z * s, lz = dir.x * s + dir.z * c;
        const p = clampToDeck(this.cap.x + lx * 2.6 * dt, this.cap.z + lz * 2.6 * dt);
        this.cap.x = p.x; this.cap.z = p.z;
        this.cap.facing = Math.atan2(lx, lz);
        this.cap.moving = true;
      }
    }
    this.captain.group.position.set(this.cap.x, DECK.y, this.cap.z);
    this.captain.group.rotation.y = this.cap.facing;
    this.captain.animate(dt, this.cap.moving);

    // third-person orbit camera, on-foot close / captain's view at the helm
    this.cam.dist += (this.cam.targetDist - this.cam.dist) * Math.min(1, dt * 4);
    const target = new THREE.Vector3();
    if (this.mode === 'helm') {
      target.set(this.ship.x, att.y + 2.5, this.ship.z);
    } else {
      this.captain.group.getWorldPosition(target); target.y += 1.0;
    }
    const cp = this.cam.pitch, cd = this.cam.dist;
    this.camera.position.set(
      target.x + Math.sin(this.cam.yaw) * Math.cos(cp) * cd,
      target.y + Math.sin(cp) * cd,
      target.z + Math.cos(this.cam.yaw) * Math.cos(cp) * cd);
    // never let the lens dip under the swell
    const wy = waveHeight(this.camera.position.x, this.camera.position.z, t);
    if (this.camera.position.y < wy + 0.6) this.camera.position.y = wy + 0.6;
    this.camera.lookAt(target);

    this.ocean.update(t, this.ship.x, this.ship.z);

    // HUD
    this.hud.speed.textContent = (this.ship.speed * 1.944).toFixed(1) + ' kn';
    this.hud.pos.textContent = POS_NAMES.find(([a]) => Math.abs(rel) <= a)[1];
    this.hud.trim.style.width = (this.ship.trim * 100).toFixed(0) + '%';
    const camYaw = Math.atan2(
      this.camera.position.x - target.x, this.camera.position.z - target.z);
    const windTo = this.wind.from + Math.PI;
    this.hud.windArrow.style.transform =
      `rotate(${(-(windTo - camYaw) * 180 / Math.PI).toFixed(1)}deg)`;
    this.hud.windSpeed.textContent = this.wind.speed.toFixed(0);
    const ll = worldToLatLon(this.ship.x, this.ship.z);
    this.hud.latlon.textContent =
      `${Math.abs(ll.lat).toFixed(2)}\u00b0${ll.lat >= 0 ? 'N' : 'S'} `
      + `${Math.abs(ll.lon).toFixed(2)}\u00b0${ll.lon >= 0 ? 'E' : 'W'}`;
    this.hud.gait.style.display = gait > 1.3 ? 'block' : 'none';
    if (gait > 1.3) this.hud.gait.textContent = `OPEN SEA \u2014 fair current \u00d7${gait.toFixed(1)}`;
    this.hud.hint.textContent = this.aground
      ? 'AGROUND \u2014 steer for deeper water'
      : this.mode === 'helm'
        ? 'A/D — steer · W/S — sheet in / ease · E — leave the helm'
        : nearHelm(this.cap.x, this.cap.z)
          ? 'E — take the helm'
          : 'WASD — walk the deck · drag — look · wheel — zoom';
    // a nudge toward good trim, teaching by whisper not tutorial
    const err = Math.abs(this.ship.trim - optimalTrim(rel));
    this.hud.trim.style.background = err < 0.12 ? '#7fd48a' : err < 0.3 ? '#e8c46a' : '#d47a6a';

    this.renderer.render(this.scene, this.camera);
  }
}

const game = new Game();
window.saltstead = game; // the live handle, moorstead-style
