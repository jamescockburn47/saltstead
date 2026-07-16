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
import { sailPower, wrapAngle, optimalTrim, tackSign, IRONS, crewRudder } from './sailing.js';
import { waveHeight } from './waves.js';
import { TerrainLayer } from './terrain.js';
import { Sky } from './sky.js';
import { DAY_LENGTH, solarState, lunarState, moonPhase } from './skymath.js';
import { EXPOSURE_BASE, exposureTarget, glitterSource, moonBrightness } from './lightrig.js';
import { MapUI } from './mapui.js';
import { bootTitle } from './title.js';
import { loadGame, saveGame, snapshotSave } from './save.js';
import { MerchantLayer } from './merchantlayer.js';
import { WildlifeLayer } from './wildlifelayer.js';
import { FleetLayer } from './fleetlayer.js';
import { canTakePrize, START_CREW, PRIZE_CREW, MIN_CREW, FLEET_MAX } from './fleet.js';
import { canBoard, lootRoll, chestRoll } from './plunder.js';
import { findDigSite, digDist, DIG_RADIUS, DIG_TIME } from './treasure.js';
import {
  latLonToWorld, worldToLatLon, coastDistGame, elevation, gaitFactor, COAST_CAP,
  encounterGait, ENCOUNTER_FAR,
} from './earth.js';
import { windProfile, seaStateFor, LiveWeather } from './weather.js';
import { setSeaState } from './waves.js';
import { makeEntry, pushEntry, acceptLog } from './shiplog.js';
import {
  nearestHaven, inAnchorage, sellFleet, canHire, HAND_COST, PORT_RADIUS,
} from './port.js';
import { PortUI } from './portui.js';
import { canSight, takeSight, sightText } from './navigation.js';
import { StarChartUI } from './starchartui.js';
import { LogUI } from './logui.js';

const POS_NAMES = [
  [IRONS, 'In irons'],
  [0.87, 'Close-hauled'],
  [1.9, 'Beam reach'],
  [2.7, 'Broad reach'],
  [Math.PI + 0.01, 'Running'],
];

class Game {
  // save: an acceptSave()-vetted meta or null; auth: the identity blob
  constructor(save = null, auth = null) {
    this.auth = auth;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    document.getElementById('app').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8fc3e8);
    this.scene.fog = new THREE.Fog(0x8fc3e8, 120, 620);

    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1200);

    this.sky = new Sky(this.scene);
    this.dayStart = DAY_LENGTH * 0.35; // spawn mid-morning

    this.ocean = new Ocean(this.scene);
    this.foam = new FoamLayer(this.scene);
    this.terrain = new TerrainLayer(this.scene);

    // spawn in the Caribbean, off Port Royal — the Phase 1 haven
    const spawn = latLonToWorld(17.85, -76.9);
    this.ship = newShipState(spawn.x, spawn.z);
    this.ship.yaw = 0.5; // bow toward the Jamaican coast
    this.ship.trim = 0.5;
    this.gold = 0;
    this.treasureMap = null;   // { seed, lat, lon } — the X on the charts
    this.digTimer = 0;
    this.lootSeed = 1;         // rolls forward with every prize taken
    this.crew = START_CREW;    // hands aboard — the currency of capture
    this.savedFleet = 0;       // prizes to restore once the scene exists
    this.log = [];             // the ship's log — the voyage writes itself
    if (save) {
      this.ship.x = save.ship.x; this.ship.z = save.ship.z;
      this.ship.yaw = save.ship.yaw; this.ship.trim = save.ship.trim;
      this.dayStart = save.skyT; // the voyage resumes under the same sky
      this.gold = save.gold;
      this.treasureMap = save.map;
      this.lootSeed = save.lootSeed;
      this.crew = save.crew;
      this.savedFleet = save.fleet;
      this.log = acceptLog(save.log);
    }
    this.saveClock = 12; // first autosave soon after boarding
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.persist();
    });
    this.coastDist = COAST_CAP;
    this.geoClock = 0;
    this.aground = false;
    // other ships at sea ({x, z} world coords) — multiplayer peers and NPC
    // merchants land here; the encounter gait reads it every frame
    this.contacts = [];
    this.merchants = new MerchantLayer(this.scene);
    this.wildlife = new WildlifeLayer(this.scene);
    this.fleet = new FleetLayer(this.scene);
    this.fleet.restore(this.savedFleet, this.ship.x, this.ship.z, this.ship.yaw);
    this.lastPrizeId = null; // the stripped hull still alongside (capture window)
    this.toast = { text: '', until: 0 };
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
    // the procedural wind machine's base; real weather (open-meteo at the
    // ship's REAL lat/lon) eases these when it lands — a layer, never a
    // dependency (the Moorstead weather-live rule)
    this.windBase = { from: 2.3, speed: 7 };
    this.weather = new LiveWeather();
    this.weatherState = 'clear';
    this.gloom = 0;
    this.swell = 1;
    this.cam = { yaw: Math.PI * 0.85, pitch: 0.32, dist: 8, targetDist: 8 };

    this.keys = new Set();
    addEventListener('keydown', (e) => { this.keys.add(e.code); if (e.code === 'KeyE') this.onE(); });
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
      gold: document.getElementById('gold'),
      toast: document.getElementById('toast'),
      weather: document.getElementById('weather'),
      crew: document.getElementById('crewn'),
      fleet: document.getElementById('fleetn'),
    };

    this.maps = new MapUI();
    this.starchart = new StarChartUI();
    this.logui = new LogUI();
    this.port = null; // { haven, dist } refreshed with the geography
    this.portui = new PortUI(() => this.sellPrizes(), () => this.hireHand());
    // the weather-turn and landfall log entries fire on TRANSITIONS
    this.loggedWeather = this.weatherState;
    this.atSea = null; // null until first geography sample settles it
    this.wasAground = false;
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'KeyL') this.logui.toggle(this.log);
      if (e.code === 'KeyN') this.toggleStars();
      if (e.code === 'Escape') {
        if (this.starchart.open) this.starchart.toggle();
        if (this.logui.open) this.logui.toggle(this.log);
        if (this.portui.open) this.portui.hide();
      }
    });

    this.applyQuality(localStorage['saltstead-gfx'] === 'plain' ? 'plain' : 'fine');

    this.t = 0;
    this.last = performance.now();
    if (!save) this.logEvent('Weighed anchor off Port Royal \u2014 the voyage begins');
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // the one-slot solo save (save.js); fire-and-forget, losses cost seconds
  persist() {
    saveGame(snapshotSave(this.ship, this.t + this.dayStart, {
      gold: this.gold, map: this.treasureMap, lootSeed: this.lootSeed,
      crew: this.crew, fleet: this.fleet.size(), log: this.log,
    })).catch(() => {});
  }

  say(text, secs = 5) { this.toast = { text, until: this.t + secs }; }

  // one page line in the ship's log, stamped with watch + position
  logEvent(text) {
    const ll = worldToLatLon(this.ship.x, this.ship.z);
    pushEntry(this.log, makeEntry(this.t + this.dayStart, ll.lat, ll.lon, text));
    if (this.logui.open) this.logui.render(this.log);
  }

  // ---- port transactions (the plunder economy's first sink) ----
  sellPrizes() {
    const n = this.fleet.size();
    if (!n) return;
    const sale = sellFleet(n, this.crew);
    this.gold += sale.gold;
    this.crew = sale.crewBack;
    this.fleet.clear();
    this.say(`${sale.sold} prize${sale.sold > 1 ? 's' : ''} sold \u2014 `
      + `${sale.gold} doubloons; the prize crews come back aboard`, 7);
    this.logEvent(`Sold ${sale.sold} prize${sale.sold > 1 ? 's' : ''} at `
      + `${this.port.haven.name} for ${sale.gold} doubloons`);
    this.portui.refresh(this.gold, this.crew, 0);
    this.persist();
  }

  hireHand() {
    if (!canHire(this.gold, this.crew)) return;
    this.gold -= HAND_COST;
    this.crew++;
    this.say(`A hand signs articles \u2014 ${this.crew} aboard`, 4);
    this.logEvent(`Signed on a hand at ${this.port.haven.name} (${HAND_COST} doubloons)`);
    this.portui.refresh(this.gold, this.crew, this.fleet.size());
    this.persist();
  }

  putIn() {
    this.portui.show(this.port.haven);
    this.portui.refresh(this.gold, this.crew, this.fleet.size());
    this.logEvent(`Put in at ${this.port.haven.name}`);
  }

  // N: the planisphere — and on a clear night, the navigator takes a sight
  toggleStars() {
    this.starchart.toggle();
    if (!this.starchart.open) return;
    const sol = solarState(this.t + this.dayStart);
    const vis = canSight(sol.nightness, this.gloom);
    if (vis.ok) {
      const ll = worldToLatLon(this.ship.x, this.ship.z);
      const sight = takeSight(this.t + this.dayStart, ll.lat);
      const text = sightText(sight, ll.lat);
      this.starchart.setCaption(text + ' \u00b7 N or Esc closes the chart');
      this.logEvent(`Star sight \u2014 ${text}`);
    } else {
      this.starchart.setCaption(vis.reason === 'daylight'
        ? 'The stars are up there, but the sun owns the sky \u2014 a sight needs the dark'
        : 'Overcast \u2014 no stars tonight; the sky must clear before the navigator can shoot');
    }
  }

  // Moorstead's two-tier rig (invariant 5): Fine = ACES + PCFSoft shadows +
  // water glitter/fresnel; Plain = library defaults, amps parked at 0.
  applyQuality(q) {
    this.gfxQuality = q;
    const fine = q === 'fine';
    const r = this.renderer;
    r.toneMapping = fine ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    r.toneMappingExposure = fine ? EXPOSURE_BASE : 1;
    r.shadowMap.enabled = fine;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    const sun = this.sky.sun;
    sun.castShadow = fine;
    if (fine) {
      // one tight ortho frustum tracking the ship (the Moorstead rig)
      const s = sun.shadow;
      s.mapSize.set(2048, 2048);
      s.camera.left = -60; s.camera.right = 60; s.camera.top = 60; s.camera.bottom = -60;
      s.camera.near = 0.5; s.camera.far = 400;
      s.bias = -0.0004; s.normalBias = 0.5;
      s.camera.updateProjectionMatrix();
      if (s.map) { s.map.dispose(); s.map = null; }
    }
    this.ocean.glitterScale = fine ? 1 : 0;
    this.ocean.uniforms.uFresnel.value = fine ? 0.45 : 0;
    this.ocean.mesh.receiveShadow = fine; // the ship's shadow rides the sea
    this.terrain.setShadows(fine);
    this.shipGroup.traverse((o) => {
      if (o.isMesh) { o.castShadow = fine; o.receiveShadow = fine; }
    });
    this.scene.traverse((o) => {
      const m = o.material;
      if (!m) return;
      for (const mm of Array.isArray(m) ? m : [m]) mm.needsUpdate = true;
    });
    try { localStorage['saltstead-gfx'] = q; } catch { /* private mode */ }
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

  // E is contextual: (ashore: dig > re-board) / prize alongside > dig >
  // step ashore > the helm
  onE() {
    if (this.portui.open) { this.portui.hide(); return; }
    if (this.mode === 'ashore') {
      if (this.digReady && this.digTimer <= 0) {
        this.digTimer = DIG_TIME;
        this.say('You drive the spade into the sand\u2026');
        return;
      }
      this.boardShip(); // the longboat ferries you back from any beach
      return;
    }
    if (this.boardable) { this.boardPrize(); return; }
    if (this.captureable) { this.takePrize(); return; }
    if (this.digReady && this.digTimer <= 0) {
      this.digTimer = DIG_TIME;
      this.say('The longboat pulls for the shore\u2026');
      return;
    }
    // a haven's anchorage outranks the beach — but the helm is left first
    if (this.mode !== 'helm' && this.port
      && inAnchorage(this.port.dist, this.ship.speed)) { this.putIn(); return; }
    // the helm wins when you're standing at it; the shore wins elsewhere
    if (this.mode === 'walk' && nearHelm(this.cap.x, this.cap.z)) { this.toggleHelm(); return; }
    if (this.canStepAshore()) { this.goAshore(); return; }
    this.toggleHelm();
  }

  // ---- shore leave ----
  canStepAshore() {
    return this.mode === 'walk' && this.ship.speed < 1
      && (this.aground || this.coastDist < 300);
  }

  // nearest dry ground within longboat reach of a point
  findLanding(cx, cz) {
    for (let r = 5; r <= 380; r += 8) {
      for (let a = 0; a < 16; a++) {
        const ang = (a / 16) * Math.PI * 2;
        const x = cx + Math.sin(ang) * r, z = cz + Math.cos(ang) * r;
        const ll = worldToLatLon(x, z);
        if (elevation(ll.lat, ll.lon) > 0.15) return { x, z };
      }
    }
    return null;
  }

  goAshore() {
    // with a treasure map in hand and the X in reach, the longboat rows for
    // the X's own beach — no swimming lagoons to reach your own dig
    let cx = this.ship.x, cz = this.ship.z;
    if (this.treasureMap && digDist(this.ship.x, this.ship.z, this.treasureMap) < DIG_RADIUS) {
      const w = latLonToWorld(this.treasureMap.lat, this.treasureMap.lon);
      cx = w.x; cz = w.z;
    }
    const land = this.findLanding(cx, cz);
    if (!land) { this.say('No safe landing here \u2014 find a beach.'); return; }
    this.mode = 'ashore';
    this.shore = { x: land.x, z: land.z, facing: 0 };
    this.scene.add(this.captain.group); // reparent out of the ship
    this.cam.targetDist = 8;
    this.say('The longboat puts you ashore. The crew holds the ship.', 5);
    this.logEvent('The captain went ashore by longboat; the crew holds the ship');
  }

  boardShip() {
    this.mode = 'walk';
    this.shipGroup.add(this.captain.group);
    this.cap.x = 0; this.cap.z = -2.2; this.cap.facing = 0;
    this.cam.targetDist = 8;
    this.say('The longboat brings you back aboard.', 4);
  }

  boardPrize() {
    const prize = this.boardable;
    this.merchants.strip(prize.id);
    this.lastPrizeId = prize.id; // the capture window opens
    const roll = lootRoll(this.lootSeed);
    this.gold += roll.gold;
    let msg = `Boarded! ${roll.gold} doubloons in her hold`;
    if (roll.hands) {
      this.crew++;
      msg += ' \u2014 a sailor signs articles';
    }
    if (roll.map && !this.treasureMap) {
      const ll = worldToLatLon(this.ship.x, this.ship.z);
      const site = findDigSite(this.lootSeed, ll.lat, ll.lon);
      if (site) {
        this.treasureMap = { seed: this.lootSeed, lat: site.lat, lon: site.lon };
        msg += ' \u2014 and a TREASURE MAP in the master\u2019s cabin (M for the chart)';
      }
    }
    this.lootSeed++;
    this.say(msg, 7);
    this.logEvent(msg.replace('Boarded! ', 'Boarded a merchantman \u2014 '));
    this.persist();
  }

  takePrize() {
    const pose = this.merchants.take(this.lastPrizeId);
    this.lastPrizeId = null;
    if (!pose) return;
    this.crew -= PRIZE_CREW;
    this.fleet.add(pose.x, pose.z, pose.yaw);
    this.say(`A prize crew of ${PRIZE_CREW} takes her \u2014 she falls in astern. `
      + `(${this.crew} hands left aboard)`, 7);
    this.logEvent(`Took her as a prize \u2014 a crew of ${PRIZE_CREW} put aboard, she falls in astern`);
    this.persist();
  }

  frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    const t = this.t, k = this.keys;

    // a living wind: direction breathes AROUND the base bearing (bounded, so
    // it can never spin onto the bow and stall the game), strength gusts.
    // The base itself is REAL weather when open-meteo answers (geo block
    // below), and the wind BUILDS offshore: sheltered inshore, near double
    // in blue water — stacked with the gait, a crossing genuinely flies.
    this.wind.from = this.windBase.from + 0.3 * Math.sin(t * 0.011) + 0.12 * Math.sin(t * 0.037);
    const gusts = 0.3 * Math.sin(t * 0.07) + 0.15 * Math.sin(t * 0.21);
    this.wind.speed = windProfile(this.coastDist, this.windBase.speed * (1 + gusts));

    // the sea takes the wind's shape, eased so the swell never pops
    this.swell += (seaStateFor(this.wind.speed) - this.swell) * Math.min(1, dt * 0.05);
    setSeaState(this.swell);

    if (this.mode === 'helm') {
      const rt = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
      this.ship.rudder += (rt - this.ship.rudder) * Math.min(1, dt * 5);
      if (k.has('KeyW')) this.ship.trim = Math.max(0, this.ship.trim - dt * 0.45);
      if (k.has('KeyS')) this.ship.trim = Math.min(1, this.ship.trim + dt * 0.45);
    } else if (this.port && this.port.dist <= PORT_RADIUS) {
      // inside an anchorage with the captain off the helm, the crew hands
      // the sails and lets her run off her way — that's how you arrive
      this.ship.rudder *= 1 - Math.min(1, dt * 2);
    } else {
      // captain off the tiller: the crew holds her — if the wind's breathing
      // walks the bow into irons, they bear away until the sail draws again
      const relNow = wrapAngle(this.ship.yaw - this.wind.from);
      this.ship.rudder += (crewRudder(relNow) - this.ship.rudder) * Math.min(1, dt * 2);
    }
    // with the captain ashore the crew heaves to and HOLDS her
    if (this.mode === 'ashore') this.ship.speed = 0;

    // autosave the voyage every 20 s
    this.saveClock -= dt;
    if (this.saveClock <= 0) { this.saveClock = 20; this.persist(); }

    // geography, throttled: coast distance drives the gait and the checks
    this.geoClock -= dt;
    if (this.geoClock <= 0) {
      this.geoClock = 0.25;
      const ll = worldToLatLon(this.ship.x, this.ship.z);
      this.coastDist = coastDistGame(ll.lat, ll.lon);
      this.port = nearestHaven(ll.lat, ll.lon);
      // real weather at the ship's real coordinates — the Azores get Azores
      // wind. Eased in over ~20 s so a fresh sample never snaps the sails.
      const live = this.weather.poll(ll.lat, ll.lon);
      if (live) {
        this.weatherState = live.state;
        this.gloom = live.gloom;
        // floor at 5 m/s: a genuinely becalmed day is true to the Atlantic
        // but false to the game (pillar: the sea must not be boring)
        this.windBase.speed += (Math.max(5, live.windMs) - this.windBase.speed) * 0.012;
        const dFrom = wrapAngle(live.windFromRad - this.windBase.from);
        this.windBase.from += dFrom * 0.012;
      }
    }
    // the trade lanes live: merchants stream, sail, flee, and count as contacts
    this.merchants.update(t, dt, this.ship.x, this.ship.z, this.wind.from);

    // wildlife reads the waters: gulls inshore, dolphins offshore, the
    // albatross in blue water, a fin in the warm shallows
    {
      const wll = worldToLatLon(this.ship.x, this.ship.z);
      this.wildlife.update(t, dt, this.ship.x, this.ship.z,
        this.shipGroup.position.y + 11, this.ship.speed, this.coastDist, Math.abs(wll.lat));
    }
    const allContacts = this.contacts.concat(this.merchants.contacts());

    // meeting another ship kills the fair current — you slow to hailing speed
    let contactDist = Infinity;
    for (const c of allContacts) {
      contactDist = Math.min(contactDist, Math.hypot(c.x - this.ship.x, c.z - this.ship.z));
    }
    const gait = encounterGait(gaitFactor(this.coastDist), contactDist);
    this.shipSighted = contactDist < ENCOUNTER_FAR;

    // your own prizes sail in your wake, sharing your current
    this.fleet.update(t, dt, this.ship.x, this.ship.z, this.ship.yaw,
      this.ship.speed * gait, this.wind.from);

    // boarding window: alongside a prize with speed matched
    const prize = this.merchants.nearestPrize(this.ship.x, this.ship.z);
    this.boardable = (prize && canBoard(prize.dist, this.ship.speed * gait - prize.m.speed))
      ? prize : null;

    // the capture window: a freshly stripped hull still alongside + spare hands
    this.captureable = false;
    if (this.lastPrizeId) {
      const pose = this.merchants.poseOf(this.lastPrizeId);
      if (!pose) {
        this.lastPrizeId = null;
      } else {
        const d = Math.hypot(pose.x - this.ship.x, pose.z - this.ship.z);
        if (d > 60) this.lastPrizeId = null; // you sailed off — the window closes
        else this.captureable = canTakePrize(this.crew, this.fleet.size());
      }
    }

    // the dig: from the deck the crew rows in and does the shovel work; on
    // foot you stand on the X yourself and dig
    this.digReady = false;
    if (this.treasureMap) {
      if (this.mode === 'ashore') {
        this.digReady = digDist(this.shore.x, this.shore.z, this.treasureMap) < 30;
      } else {
        const dd = digDist(this.ship.x, this.ship.z, this.treasureMap);
        this.digReady = dd < DIG_RADIUS && this.ship.speed < 1;
      }
      if (this.digTimer > 0) {
        this.digTimer -= dt;
        if (this.digTimer <= 0) {
          const pay = chestRoll(this.treasureMap.seed);
          this.gold += pay;
          this.treasureMap = null;
          this.say(this.mode === 'ashore'
            ? `The spade strikes wood \u2014 a chest of ${pay} doubloons!`
            : `The crew strikes wood \u2014 a chest of ${pay} doubloons!`, 8);
          this.logEvent(`Dug at the X \u2014 a chest of ${pay} doubloons raised`);
          this.persist();
        }
      }
    }

    const px = this.ship.x, pz = this.ship.z;
    const furled = (this.mode !== 'helm' && this.port && this.port.dist <= PORT_RADIUS)
      || this.portui.open;
    stepShip(this.ship, this.wind, dt, SLOOP, gait, furled);

    // grounding: inshore, the sea floor is real — checked at the BOW, so the
    // hull stops when the stem touches, not once the mast is in the dunes
    const groundAt = (x, z) => { const g = worldToLatLon(x, z); return elevation(g.lat, g.lon); };
    if (this.coastDist < 400) {
      const bowX = this.ship.x + Math.sin(this.ship.yaw) * SLOOP.length * 0.5;
      const bowZ = this.ship.z + Math.cos(this.ship.yaw) * SLOOP.length * 0.5;
      if (groundAt(bowX, bowZ) > -0.9 || groundAt(this.ship.x, this.ship.z) > -0.9) {
        this.ship.x = px; this.ship.z = pz;
        this.ship.speed = 0;
        this.aground = true;
      } else this.aground = false;
    } else this.aground = false;

    this.terrain.update(this.ship.x, this.ship.z);
    // inshore the hull rides the sea floor where it shoals past the keel
    const att = shipAttitude(this.ship, t, SLOOP, this.coastDist < 400 ? groundAt : null);
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

    // captain: walk the deck (ship-local) or the shore (world terrain)
    this.cap.moving = false;
    const ix = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const iz = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    if (this.mode === 'walk' && (ix || iz)) {
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
    if (this.mode === 'ashore') {
      if (ix || iz) {
        const fwd = new THREE.Vector3();
        this.camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
        const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
        const dir = new THREE.Vector3().addScaledVector(fwd, iz).addScaledVector(right, ix).normalize();
        const nx = this.shore.x + dir.x * 3.4 * dt, nz = this.shore.z + dir.z * 3.4 * dt;
        const nll = worldToLatLon(nx, nz);
        if (elevation(nll.lat, nll.lon) > -0.6) { // wade to the chest, no deeper
          this.shore.x = nx; this.shore.z = nz;
          this.shore.facing = Math.atan2(dir.x, dir.z);
          this.cap.moving = true;
        }
      }
      const sll = worldToLatLon(this.shore.x, this.shore.z);
      this.captain.group.position.set(
        this.shore.x, Math.max(elevation(sll.lat, sll.lon), -0.3), this.shore.z);
      this.captain.group.rotation.y = this.shore.facing;
    } else {
      this.captain.group.position.set(this.cap.x, DECK.y, this.cap.z);
      this.captain.group.rotation.y = this.cap.facing;
    }
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

    // light dynamics: sun/moon glitter corridor, adaptive exposure, lit foam
    const skyT = t + this.dayStart;
    const sol = solarState(skyT);
    const lun = lunarState(skyT);
    const glit = glitterSource(sol, lun, moonBrightness(moonPhase(skyT)));
    const skyLL = worldToLatLon(this.ship.x, this.ship.z);
    this.sky.update(skyT, skyLL.lat, this.camera.position, this.gloom);
    this.ocean.update(t, this.ship.x, this.ship.z, this.camera.position, glit,
      this.sky.domeUniforms.uHor.value, this.swell);
    this.foam.setLight(Math.min(1, sol.dayness
      + 0.3 * sol.nightness * moonBrightness(moonPhase(skyT)) * Math.max(0, lun.alt)));
    if (this.gfxQuality === 'fine') {
      this.renderer.toneMappingExposure +=
        (exposureTarget(sol.dayness) - this.renderer.toneMappingExposure) * Math.min(1, dt * 0.4);
    }

    // the planisphere tracks the live sky while it's open
    if (this.starchart.open) {
      this.starchart.update(skyT, skyLL.lat,
        Math.max(0, sol.nightness - 0.25) * 1.33 * (1 - this.gloom));
    }

    // the log writes itself: weather turns, landfall/open sea, groundings
    if (this.weatherState !== this.loggedWeather) {
      this.loggedWeather = this.weatherState;
      const phrase = {
        clear: 'The sky clears', overcast: 'The sky greys over',
        rain: 'Rain sets in', fog: 'Fog closes in', storm: 'A storm is upon us',
      }[this.weatherState];
      if (phrase) this.logEvent(phrase);
    }
    {
      // hysteresis so a ragged coastline doesn't fill the book
      let sea = this.atSea;
      if (sea === null) sea = this.coastDist > 3000;
      else if (sea && this.coastDist < 2000) sea = false;
      else if (!sea && this.coastDist > 5000) sea = true;
      if (this.atSea !== null && sea !== this.atSea) {
        this.logEvent(sea
          ? 'The land drops astern \u2014 open sea'
          : 'Land ho \u2014 the coast rises on the horizon');
      }
      this.atSea = sea;
    }
    if (this.aground !== this.wasAground) {
      this.wasAground = this.aground;
      if (this.aground) this.logEvent('Ran her aground \u2014 the keel takes the ground');
    }

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
    this.hud.gait.style.display = (gait > 1.3 || this.shipSighted) ? 'block' : 'none';
    if (this.shipSighted) {
      this.hud.gait.textContent = gait > 1.3
        ? `SAIL HO \u2014 current slackens \u00d7${gait.toFixed(1)}`
        : 'SAIL HO \u2014 hailing speed';
    } else if (gait > 1.3) {
      this.hud.gait.textContent = `OPEN SEA \u2014 fair current \u00d7${gait.toFixed(1)}`;
    }
    this.maps.update(ll.lat, ll.lon, this.ship.yaw, this.treasureMap);
    this.hud.gold.textContent = this.gold;
    this.hud.weather.textContent = this.weatherState;
    this.hud.crew.textContent = this.crew;
    this.hud.fleet.textContent = this.fleet.size()
      ? ` \u00b7 ${this.fleet.size()} prize${this.fleet.size() > 1 ? 's' : ''} astern` : '';
    const anchored = this.port && inAnchorage(this.port.dist, this.ship.speed);
    this.hud.hint.textContent = this.mode === 'ashore'
      ? (this.digTimer > 0
        ? 'Digging\u2026'
        : this.digReady
          ? 'E \u2014 dig for the treasure'
          : 'WASD \u2014 explore ashore \u00b7 E \u2014 back to the ship')
      : this.boardable
        ? 'E \u2014 BOARD HER!'
        : this.captureable
          ? `E \u2014 put a prize crew aboard (${PRIZE_CREW} hands) \u00b7 she joins your fleet`
          : this.digTimer > 0
          ? 'The crew is digging\u2026'
          : this.digReady
            ? 'E \u2014 send the longboat to dig'
            : this.mode === 'helm'
              ? (anchored
                ? `ANCHORAGE \u2014 E to leave the helm, then put in at ${this.port.haven.name}`
                : this.aground
                ? 'AGROUND \u2014 E to leave the helm, then step ashore'
                : 'A/D — steer · W/S — sheet · E — leave the helm · M — chart · N — stars · L — log')
              : nearHelm(this.cap.x, this.cap.z)
                ? 'E — take the helm'
                : anchored
                  ? `E \u2014 put in at ${this.port.haven.name}`
                  : this.canStepAshore()
                  ? 'E \u2014 step ashore'
                  : this.aground
                    ? 'AGROUND \u2014 steer for deeper water'
                    : 'WASD — walk the deck · drag — look · M — chart · N — stars · L — log';
    this.hud.toast.style.display = t < this.toast.until ? 'block' : 'none';
    if (t < this.toast.until) this.hud.toast.textContent = this.toast.text;
    // a nudge toward good trim, teaching by whisper not tutorial
    const err = Math.abs(this.ship.trim - optimalTrim(rel));
    this.hud.trim.style.background = err < 0.12 ? '#7fd48a' : err < 0.3 ? '#e8c46a' : '#d47a6a';

    this.renderer.render(this.scene, this.camera);
  }
}

// title first, Moorstead-style: the game only boots when the title hands off
bootTitle({
  onStart: async (mode, auth) => {
    const save = mode === 'continue' ? await loadGame() : null;
    window.saltstead = new Game(save, auth); // the live handle, moorstead-style
  },
});
