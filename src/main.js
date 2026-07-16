// Saltstead — the game loop lives here.
// One planet, one sloop (so far), wind, waves, a walkable moving deck, a
// helm, guns, the trade lanes, the legends, and a third-person camera.
// docs/DESIGN.md is the contract; every pure system this file wires together
// is guarded by its own scripts/verify-*.mjs check.

import * as THREE from 'three';
import { Ocean } from './ocean.js';
import { buildSloop } from './ship.js';
import { buildCaptain } from './captain.js';
import { isWarden, loadAuth, displayName } from './identity.js';
import { FoamLayer } from './foamlayer.js';
import { newShipState, stepShip, shipAttitude, beaches, SLOOP } from './shipphysics.js';
import { DECK, HELM, clampToDeck, localToWorld } from './shipframe.js';
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
  nearestHaven, inAnchorage, sellFleet, canHire, HAND_COST,
} from './port.js';
import { PortUI } from './portui.js';
import { canSight, takeSight, sightText } from './navigation.js';
import { StarChartUI } from './starchartui.js';
import { LogUI } from './logui.js';
import { TYPES } from './merchants.js';
import {
  GUN_RANGE, reloadTime, beamBearing, inArc, rollHit, newHullState, applyShot,
  speedFactor, isSinking, NAVY_RELOAD, autoBattle, boardingOdds, founderCost,
  repairCost,
} from './combat.js';
import {
  legendAt, triangleDepth, compassJitter, TRIANGLE_GLOOM, whirlpoolPull,
  WHIRL_RIG_RATE, deadAir, DIVE_TIME, diveRoll, EXPEDITION_TIME, ELDORADO_GOLD,
  dutchmanSails, dutchmanCargo, DUTCHMAN_SPEED, zoneOf,
} from './legendfx.js';
import {
  newKraken, stepKraken, shootKrakenArm, krakenDrag, krakenOver, KRAKEN_LOOT,
  newDragon, stepDragon, dragonVulnerable, woundDragon, dragonGone, DRAGON_RAKE,
  DRAGON_HIT, HOARD_GOLD, HOARD_REACH,
} from './monsters.js';
import { CombatLayer } from './combatlayer.js';
import { MonsterLayer } from './monsterlayer.js';
import { LegendLayer } from './legendlayer.js';
import { unit2 } from './noise.js';
import { installKiosk } from './kiosk.js';
import { gatherContext, submitFeedback } from './feedback.js';

// swallow the browser's own chrome gestures + auto-fullscreen on first touch
installKiosk();

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
    this.crew = START_CREW;    // hands aboard (0 at first — the sloop sails solo)
    this.savedFleet = 0;       // prizes to restore once the scene exists
    this.log = [];             // the ship's log — the voyage writes itself
    this.banked = 0;           // consigned to Davy Jones' vault, forever
    this.won = [];             // one-shot legends already claimed (save-persistent)
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
      this.banked = save.banked || 0;
      this.won = save.won || [];
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

    // ---- the fighting ship (combat.js) ----
    this.hull = newHullState(); // YOUR rig and hull — damage is a session scar
    this.shotKind = 'round';    // R swaps round (sink her) / chain (slow her)
    this.gunCool = 0;
    this.shotSeed = this.lootSeed * 977 + 1; // deterministic, like every roll
    this.navyCool = new Map();  // corvette id -> seconds to her next broadside
    this.combatFx = new CombatLayer(this.scene);

    // ---- the legends, live (legendfx.js / monsters.js) ----
    this.zone = null;           // the legend zone the ship is inside, if any
    this.kraken = null;
    this.krakenDone = false;    // it strikes once a session, win or flee
    this.dragon = null;
    this.dutchmanTaken = false; // her cargo is once a session too
    this.dutchmanBoardable = false;
    this.diveN = 0;             // dives this visit to the Plate Fleet
    this.diveTimer = 0;
    this.expTimer = 0;          // the El Dorado expedition clock
    this.monsterFx = new MonsterLayer(this.scene);
    this.legendFx = new LegendLayer(this.scene);
    this.spec = SLOOP; // the hull you sail — the shipwright will swap this
    const sloop = buildSloop();
    this.shipGroup = sloop.group;
    this.shipGroup.rotation.order = 'YXZ';
    this.setSail = sloop.setSail;
    this.scene.add(this.shipGroup);

    this.captain = buildCaptain(isWarden(auth));
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
    addEventListener('keydown', (e) => {
      if (typingInField()) return; // the feedback box eats its own keystrokes
      this.keys.add(e.code);
      if (e.code === 'KeyE') this.onE();
      if (e.code === 'KeyT') this.toggleTiller();
      if (e.code === 'KeyF' && !e.repeat) this.fireGuns();
      if (e.code === 'KeyR' && !e.repeat) this.toggleShot();
    });
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
      legend: document.getElementById('legendbadge'),
      gold: document.getElementById('gold'),
      toast: document.getElementById('toast'),
      weather: document.getElementById('weather'),
      crew: document.getElementById('crewn'),
      fleet: document.getElementById('fleetn'),
      guns: document.getElementById('guns'),
      damage: document.getElementById('shipdamage'),
    };

    this.maps = new MapUI();
    this.starchart = new StarChartUI();
    this.logui = new LogUI();
    this.port = null; // { haven, dist } refreshed with the geography
    this.portui = new PortUI(() => this.sellPrizes(), () => this.hireHand(),
      () => this.repairShip());
    // the weather-turn and landfall log entries fire on TRANSITIONS
    this.loggedWeather = this.weatherState;
    this.atSea = null; // null until first geography sample settles it
    this.wasAground = false;
    addEventListener('keydown', (e) => {
      if (e.repeat || typingInField()) return;
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
      banked: this.banked, won: this.won,
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
    this.portui.refresh(this.gold, this.crew, 0, this.hull);
    this.persist();
  }

  hireHand() {
    if (!canHire(this.gold, this.crew)) return;
    this.gold -= HAND_COST;
    this.crew++;
    this.say(`A hand signs articles \u2014 ${this.crew} aboard`, 4);
    this.logEvent(`Signed on a hand at ${this.port.haven.name} (${HAND_COST} doubloons)`);
    this.portui.refresh(this.gold, this.crew, this.fleet.size(), this.hull);
    this.persist();
  }

  // the yard bills by what's missing (combat.js repairCost)
  repairShip() {
    const cost = repairCost(this.hull);
    if (cost <= 0 || this.gold < cost) return;
    this.gold -= cost;
    this.hull.rig = 1; this.hull.hull = 1;
    this.say(`The yard makes her whole again \u2014 ${cost} doubloons`, 5);
    this.logEvent(`Repaired at ${this.port.haven.name} (${cost} doubloons)`);
    this.portui.refresh(this.gold, this.crew, this.fleet.size(), this.hull);
    this.persist();
  }

  putIn() {
    this.portui.show(this.port.haven);
    this.portui.refresh(this.gold, this.crew, this.fleet.size(), this.hull);
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

  // T is the tiller, from anywhere on deck — the captain runs aft. T again
  // hands it back. It also slams the port panel shut: T ALWAYS means "sail".
  toggleTiller() {
    if (this.portui.open) this.portui.hide();
    if (this.mode === 'helm') { this.mode = 'walk'; this.cam.targetDist = 8; return; }
    if (this.mode !== 'walk') return; // ashore: the tiller is back on the ship
    this.mode = 'helm';
    this.cap.x = HELM.x; this.cap.z = HELM.z + 0.6;
    this.cap.facing = 0; // face the bow
    this.cam.targetDist = 19;
  }

  // E is the DOING key — board, capture, dig, dive, bank, step ashore, put
  // in at port. The tiller lives on T alone, so E can never trap you off it.
  onE() {
    if (this.portui.open) { this.portui.hide(); return; }
    if (this.mode === 'ashore') {
      if (this.hoardReady) { this.lootHoard(); return; }
      if (this.digReady && this.digTimer <= 0) {
        this.digTimer = DIG_TIME;
        this.say('You drive the spade into the sand\u2026');
        return;
      }
      this.boardShip(); // the longboat ferries you back from any beach
      return;
    }
    if (this.dutchmanBoardable) { this.boardDutchman(); return; }
    if (this.boardable) { this.boardPrize(); return; }
    if (this.captureable) { this.takePrize(); return; }
    if (this.digReady && this.digTimer <= 0) {
      this.digTimer = DIG_TIME;
      this.say('The longboat pulls for the shore\u2026');
      return;
    }
    if (this.diveReady && this.diveTimer <= 0) {
      this.diveTimer = DIVE_TIME;
      this.say('The divers go over the side\u2026');
      return;
    }
    if (this.expReady && this.expTimer <= 0) {
      this.expTimer = EXPEDITION_TIME;
      this.say('The expedition hacks into the jungle, upriver\u2026');
      return;
    }
    if (this.bankReady) { this.bankTreasure(); return; }
    if (this.port && inAnchorage(this.port.dist, this.ship.speed)) { this.putIn(); return; }
    if (this.canStepAshore()) { this.goAshore(); return; }
  }

  // ---- the guns (combat.js) ----
  toggleShot() {
    this.shotKind = this.shotKind === 'round' ? 'chain' : 'round';
    this.say(this.shotKind === 'round'
      ? 'ROUND SHOT loaded \u2014 hole her hull, send her down'
      : 'CHAIN SHOT loaded \u2014 tear her rig, slow her', 4);
  }

  // world position of the firing side's rail, for the theatre
  muzzlePos(side) {
    const m = localToWorld(this.ship, side * 1.5, 0, 0.5);
    return { x: m.x, y: this.shipGroup.position.y + 1.4, z: m.z };
  }

  fireGuns() {
    if (this.mode === 'ashore' || this.portui.open) return;
    if (this.gunCool > 0) return; // the crew is still at the reload dance

    // the Kraken's arms are ON the hull — every gun bears
    if (this.kraken && this.kraken.state === 'gripping') {
      const s = shootKrakenArm(this.kraken);
      if (!s.hit) return;
      this.gunCool = reloadTime(this.crew);
      const arm = this.muzzlePos(this.shotSeed % 2 ? 1 : -1);
      this.combatFx.fire(arm, { x: arm.x + (this.shotSeed % 2 ? 12 : -12), z: arm.z }, true);
      this.shotSeed++;
      if (s.slain) return; // the frame loop pays the loot out
      this.say(`A tentacle blown clean off \u2014 ${this.kraken.arms} still grip her!`, 4);
      return;
    }

    // the dragon is a gun target only in her stoop
    const dp = this.monsterFx.dragonPos();
    if (this.dragon && dragonVulnerable(this.dragon) && dp) {
      const dist = Math.hypot(dp.x - this.ship.x, dp.z - this.ship.z);
      if (dist < GUN_RANGE && dp.alt < 30) {
        this.gunCool = reloadTime(this.crew);
        const hit = unit2(this.shotSeed * 1.51, 88.3) < DRAGON_HIT;
        const b = beamBearing(this.ship.yaw, dp.x - this.ship.x, dp.z - this.ship.z);
        this.combatFx.fire(this.muzzlePos(b.side), { x: dp.x, z: dp.z }, !hit);
        this.shotSeed++;
        if (hit) {
          const w = woundDragon(this.dragon);
          this.say(w.fled
            ? 'A TELLING HIT \u2014 she shrieks and breaks for her crag in Snowdonia!'
            : `A hit! The dragon staggers in the air (${this.dragon.hp} more will do it)`, 5);
          if (w.fled) this.logEvent('Wounded Y Ddraig Goch \u2014 she fled to her crag');
        } else {
          this.say('The ball sails past her wing', 3);
        }
        return;
      }
    }

    // a ship of the lanes: nearest hull in range and in the broadside arc
    let target = null;
    for (const [id, e] of this.merchants.live) {
      if (e.sinkT !== null) continue;
      const dx = e.m.x - this.ship.x, dz = e.m.z - this.ship.z;
      const dist = Math.hypot(dx, dz);
      if (dist > GUN_RANGE) continue;
      if (!target || dist < target.dist) target = { id, e, dist, dx, dz };
    }
    if (this.legendFx.dutchman) {
      const dx = this.legendFx.dutchman.x - this.ship.x;
      const dz = this.legendFx.dutchman.z - this.ship.z;
      const dist = Math.hypot(dx, dz);
      // iron passes clean through her — but let the player LEARN that
      if (dist < GUN_RANGE && (!target || dist < target.dist)) {
        target = { ghost: true, dist, dx, dz };
      }
    }
    if (!target) { this.say('No sail in range of the guns', 3); return; }
    const b = beamBearing(this.ship.yaw, target.dx, target.dz);
    if (!inArc(b.off)) {
      this.say(`She doesn't bear \u2014 turn the ship (guns fire off the ${b.side > 0 ? 'starboard' : 'port'} beam)`, 4);
      return;
    }
    this.gunCool = reloadTime(this.crew);
    this.shotSeed++;
    if (target.ghost) {
      this.combatFx.fire(this.muzzlePos(b.side),
        { x: this.ship.x + target.dx, z: this.ship.z + target.dz }, true);
      this.say('The broadside passes CLEAN THROUGH her \u2014 iron means nothing to the dead. Board her.', 6);
      return;
    }
    const hit = rollHit(this.shotSeed, target.dist);
    const aim = {
      x: target.e.m.x + (hit ? 0 : (this.shotSeed % 2 ? 18 : -14)),
      z: target.e.m.z + (hit ? 0 : (this.shotSeed % 3 ? 12 : -16)),
    };
    this.combatFx.fire(this.muzzlePos(b.side), aim, !hit);
    if (!hit) { this.say('Short \u2014 the sea takes the ball', 3); return; }
    const r = this.merchants.applyShotTo(target.id, this.shotKind);
    if (!r) return;
    if (r.sinking) {
      this.say(target.e.m.looted
        ? 'She goes down by the stern \u2014 an empty hull for the fishes'
        : 'HOLED THROUGH \u2014 she\u2019s going down! Most of her cargo goes with her\u2026', 6);
      this.logEvent('Sank her with round shot');
    } else if (this.shotKind === 'chain') {
      this.say(`Chain tears through her rig \u2014 sails in ribbons (rig ${(r.dmg.rig * 100).toFixed(0)}%)`, 4);
    } else {
      this.say(`A hit on the waterline (hull ${(r.dmg.hull * 100).toFixed(0)}%)`, 4);
    }
  }

  // ---- shore leave ----
  canStepAshore() {
    return this.mode === 'walk' && this.ship.speed < 1
      && (this.aground || this.coastDist < 300);
  }

  // nearest dry ground within longboat reach of a point — the reach is long
  // enough for a deep hull anchored off the shoal, not just a beached sloop
  findLanding(cx, cz) {
    for (let r = 5; r <= 700; r += 8) {
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
    this.say(this.crew > 0
      ? 'The longboat puts you ashore. The crew holds the ship.'
      : 'You row yourself ashore. She lies to her anchor.', 5);
    this.logEvent(this.crew > 0
      ? 'The captain went ashore by longboat; the crew holds the ship'
      : 'The captain rowed ashore; she lies to her anchor');
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
    const type = TYPES[prize.m.type] || TYPES.trader;

    // an armed ship doesn't strike her colours — the crews fight it out
    // (combat.js autoBattle): the player's job was DELIVERING the boarding
    if (type.armed && !prize.m.routed) {
      const battle = autoBattle(this.lootSeed, this.crew, type.crew);
      this.lootSeed++;
      if (battle.losses > 0) this.crew -= battle.losses;
      if (!battle.won) {
        this.merchants.rout(prize.id);
        this.say(battle.losses > 0
          ? `REPELLED \u2014 her marines hold the rail; ${battle.losses} of your hands lost. She breaks off.`
          : 'REPELLED \u2014 her marines hold the rail. She breaks off the fight.', 7);
        this.logEvent('Boarded a navy corvette and was repelled');
        this.persist();
        return;
      }
      this.say(battle.losses > 0
        ? `Her deck is YOURS \u2014 it cost ${battle.losses} hand${battle.losses > 1 ? 's' : ''}\u2026`
        : 'Her deck is YOURS \u2014 the marines throw down their arms!', 5);
    }

    this.merchants.strip(prize.id);
    this.lastPrizeId = prize.id; // the capture window opens
    const roll = lootRoll(this.lootSeed, type.goldMult);
    this.gold += roll.gold;
    const name = { trader: 'a merchantman', indiaman: 'an INDIAMAN', navy: 'a navy corvette', derelict: 'a derelict' }[prize.m.type] || 'a merchantman';
    let msg = `Boarded ${name}! ${roll.gold} doubloons in her hold`;
    if (roll.hands && prize.m.type !== 'derelict') {
      this.crew++;
      msg += ' \u2014 a sailor signs articles';
    }
    if (prize.m.type === 'derelict') {
      msg += ' \u2014 her crew\u2026 nowhere. The galley fires were still warm.';
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
    this.logEvent(msg.replace('Boarded ', 'Boarded ').replace('! ', ' \u2014 '));
    this.persist();
  }

  // the Flying Dutchman struck no colours in three hundred years — but on a
  // matched course in a screaming storm, a bold crew can step across
  boardDutchman() {
    const pay = dutchmanCargo(this.lootSeed);
    this.lootSeed++;
    this.gold += pay;
    this.dutchmanTaken = true;
    this.say(`You board the FLYING DUTCHMAN \u2014 her cursed cargo is yours: ${pay} doubloons. `
      + 'She fades like fog off a glass\u2026', 9);
    this.logEvent(`Boarded the Flying Dutchman in the storm \u2014 ${pay} doubloons of cursed cargo`);
    this.persist();
  }

  // Davy Jones' Locker: treasure sunk over the trench is banked FOREVER
  bankTreasure() {
    if (this.gold <= 0) return;
    const sum = this.gold;
    this.banked += sum;
    this.gold = 0;
    this.say(`${sum} doubloons go down into the dark \u2014 BANKED in the Locker, forever. `
      + `(Vault: ${this.banked})`, 8);
    this.logEvent(`Consigned ${sum} doubloons to Davy Jones' Locker \u2014 the vault holds ${this.banked}`);
    this.persist();
  }

  // the dragon's crag: follow her ashore and the hoard is yours
  lootHoard() {
    this.won.push('dragons-wales');
    this.gold += HOARD_GOLD;
    this.hoardReady = false;
    this.say(`THE HOARD \u2014 ${HOARD_GOLD} doubloons of sea-plunder, piled in her crag!`, 8);
    this.logEvent(`Looted the dragon's hoard in Snowdonia \u2014 ${HOARD_GOLD} doubloons`);
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

  // the toast that marks crossing INTO a legend's waters — discovery is the
  // reward; the chart only ever promised a name
  enterZone(legend) {
    const lines = {
      'bermuda-triangle': 'The BERMUDA TRIANGLE \u2014 the compass swims, the fog thickens\u2026 trust nothing the instruments say',
      'corryvreckan': 'The CORRYVRECKAN \u2014 the great whirlpool. Ride the rim for the slingshot; the core dismasts',
      'kraken-deep': 'The Norwegian deeps. Old charts write here: HIC SUNT MONSTRA',
      'dragons-wales': 'The Irish Sea, under Snowdonia \u2014 keep a man watching the SKY',
      'flying-dutchman': 'The Cape of Good Hope \u2014 in every storm, they say, SHE rounds it still',
      'davy-jones': 'DAVY JONES\u2019 LOCKER \u2014 the deepest water on earth. The sails hang dead\u2026 treasure sunk here is banked forever (E to consign)',
      'plate-fleet': 'The 1715 PLATE FLEET \u2014 Spanish silver on the seabed below. Heave to and E sends the divers down',
      'el-dorado': 'The Amazon\u2026 upriver, they say, a city of GOLD. Anchor and E mounts the expedition',
    };
    const line = lines[legend.id];
    if (line) this.say(line, 9);
    this.logEvent(`Entered the waters of ${legend.name}`);
  }

  frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    const t = this.t, k = this.keys;
    const skyT = t + this.dayStart;
    const sol = solarState(skyT); // the sky rules the Dutchman and the sights

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
    } else if (this.aground) {
      // beached with nobody at the tiller: she STAYS beached — no lashed
      // tiller quietly walking her off the sand while the captain's forward
      this.ship.rudder *= 1 - Math.min(1, dt * 2);
    } else {
      // off the tiller it's lashed: hold the course, but if the wind's
      // breathing walks the bow into irons, bear away until the sail draws
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
      // the legends layer wakes by geography: which zone are we inside?
      const wasZone = this.zone && this.zone.legend.id;
      this.zone = legendAt(ll.lat, ll.lon);
      if (this.zone && this.zone.legend.id !== wasZone) this.enterZone(this.zone.legend);
      if (!this.zone && this.diveN > 0) this.diveN = 0; // a fresh visit, fresh wrecks
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

    // corvettes in range work their guns: the King's navy shoots FIRST
    {
      const hostile = this.merchants.nearestHostile(this.ship.x, this.ship.z);
      for (const [id, cool] of this.navyCool) {
        this.navyCool.set(id, cool - dt);
      }
      if (hostile && hostile.dist < GUN_RANGE) {
        if (!this.navyCool.has(hostile.id)) this.navyCool.set(hostile.id, 2.5); // she runs out her guns first
        const cool = this.navyCool.get(hostile.id);
        if (cool <= 0) {
          this.navyCool.set(hostile.id, NAVY_RELOAD);
          this.shotSeed++;
          const hit = rollHit(this.shotSeed, hostile.dist);
          const kind = unit2(this.shotSeed * 1.7, 5.3) < 0.5 ? 'chain' : 'round';
          const from = { x: hostile.m.x, y: this.shipGroup.position.y + 1.6, z: hostile.m.z };
          const aim = hit
            ? { x: this.ship.x, z: this.ship.z }
            : { x: this.ship.x + (this.shotSeed % 2 ? 20 : -16), z: this.ship.z + (this.shotSeed % 3 ? -14 : 18) };
          this.combatFx.fire(from, aim, !hit);
          if (hit) {
            applyShot(this.hull, kind);
            if (isSinking(this.hull)) {
              // no death in Saltstead — expensive humiliation: cargo over the
              // side keeps her afloat, crippled until a yard makes her whole
              const lost = founderCost(this.gold);
              this.gold -= lost;
              this.hull.hull = 0.3;
              this.say(`SHE\u2019S FOUNDERING \u2014 the crew heaves ${lost} doubloons of cargo over the side to keep her afloat. Make for a haven and repair!`, 10);
              this.logEvent(`Nearly sunk by a corvette \u2014 ${lost} doubloons jettisoned to stay afloat`);
            } else {
              this.say(kind === 'chain'
                ? `CHAIN SHOT rips your rig (${(this.hull.rig * 100).toFixed(0)}%) \u2014 R for chain, F to answer her`
                : `A ball strikes your hull (${(this.hull.hull * 100).toFixed(0)}%) \u2014 she means to SINK you`, 5);
            }
          }
        }
      }
    }

    // sail through the wreckage: floating cargo comes aboard by boathook
    {
      const got = this.merchants.collectFlotsam(this.ship.x, this.ship.z);
      if (got > 0) {
        this.gold += got;
        this.say(`Flotsam hooked aboard \u2014 ${got} doubloons of floating cargo`, 5);
        this.logEvent(`Salvaged ${got} doubloons of flotsam from a sinking`);
      }
    }

    // the ghost of the Cape: the weather decides whether she sails tonight
    const dutchOn = !this.dutchmanTaken && dutchmanSails(this.weatherState, sol.nightness);
    this.legendFx.update(t, this.ship.x, this.ship.z, dutchOn);

    // wildlife reads the waters: gulls inshore, dolphins offshore, the
    // albatross in blue water, a fin in the warm shallows
    {
      const wll = worldToLatLon(this.ship.x, this.ship.z);
      this.wildlife.update(t, dt, this.ship.x, this.ship.z,
        this.shipGroup.position.y + 11, this.ship.speed, this.coastDist, Math.abs(wll.lat));
    }
    const allContacts = this.contacts.concat(this.merchants.contacts())
      .concat(this.legendFx.contacts());

    // meeting another ship kills the fair current — you slow to hailing speed
    let contactDist = Infinity;
    for (const c of allContacts) {
      contactDist = Math.min(contactDist, Math.hypot(c.x - this.ship.x, c.z - this.ship.z));
    }
    let gait = encounterGait(gaitFactor(this.coastDist), contactDist);
    this.shipSighted = contactDist < ENCOUNTER_FAR;

    // ---- the monsters wake (monsters.js) ----
    const zoneId = this.zone && this.zone.legend.id;
    if (zoneId === 'kraken-deep' && !this.kraken && !this.krakenDone && this.coastDist > 600) {
      this.kraken = newKraken();
      this.say('The sea begins to BOIL around the hull\u2026', 6);
    }
    if (this.kraken) {
      const ev = stepKraken(this.kraken, dt, this.crew, this.coastDist);
      if (ev.grabbed) {
        this.say('THE KRAKEN \u2014 tentacles come over the rail! The crew takes up axes \u2014 F fires into the arms \u2014 or run her for SHALLOW WATER!', 10);
        this.logEvent('The Kraken took hold of the ship in the Norwegian deeps');
      }
      if (ev.slain || (this.kraken.state === 'slain' && !this.krakenDone)) {
        this.gold += KRAKEN_LOOT;
        this.krakenDone = true;
        this.say(`THE KRAKEN IS SLAIN \u2014 the deeps give up ${KRAKEN_LOOT} doubloons of swallowed treasure!`, 9);
        this.logEvent(`Slew the Kraken \u2014 ${KRAKEN_LOOT} doubloons of swallowed treasure recovered`);
        this.persist();
      }
      if (ev.released) {
        this.krakenDone = true;
        this.say(this.coastDist < 600
          ? 'The arms slide off the hull \u2014 it cannot follow into the shallows. You LIVE.'
          : 'The Kraken tires and sinks away into the dark. You live \u2014 this time.', 8);
        this.logEvent('Escaped the Kraken\u2019s grip');
      }
      if (this.kraken.state === 'gripping') gait = 1; // no current saves you
      else if (krakenOver(this.kraken)) this.kraken = null; // the fight is done
    }
    if (zoneId === 'dragons-wales' && !this.dragon && !this.won.includes('dragons-wales')) {
      this.dragon = newDragon();
      this.say('A shadow crosses the deck \u2014 Y DDRAIG GOCH circles above! She\u2019s only in gunshot when she STOOPS \u2014 F when she dives!', 9);
      this.logEvent('A dragon rose from Snowdonia and circled the masthead');
    }
    if (this.dragon && !dragonGone(this.dragon)) {
      if (zoneId !== 'dragons-wales') {
        this.dragon = null; // she loses interest at her borders
      } else {
        const ev = stepDragon(this.dragon, dt);
        if (ev.rake) {
          this.hull.rig = Math.max(0, this.hull.rig - DRAGON_RAKE); // claws take rig, not planks
          this.say(`Her claws RAKE the rig \u2014 sails in ribbons (${(this.hull.rig * 100).toFixed(0)}%)`, 5);
        }
      }
    }

    // your own prizes sail in your wake, sharing your current
    this.fleet.update(t, dt, this.ship.x, this.ship.z, this.ship.yaw,
      this.ship.speed * gait, this.wind.from);

    // boarding window: alongside a prize with speed matched
    const prize = this.merchants.nearestPrize(this.ship.x, this.ship.z);
    this.boardable = (prize && canBoard(prize.dist, this.ship.speed * gait - prize.m.speed))
      ? prize : null;

    // the Dutchman's window: alongside a ghost at a ghost's pace, mid-tempest
    this.dutchmanBoardable = false;
    if (this.legendFx.dutchman && !this.dutchmanTaken) {
      const g = this.legendFx.dutchman;
      const gd = Math.hypot(g.x - this.ship.x, g.z - this.ship.z);
      if (canBoard(gd, this.ship.speed * gait - DUTCHMAN_SPEED)) this.dutchmanBoardable = true;
    }

    // the capture window: a freshly stripped hull still alongside + spare hands
    this.captureable = false;
    this.prizeShorthanded = false; // hull alongside but not enough hands to man her
    if (this.lastPrizeId) {
      const pose = this.merchants.poseOf(this.lastPrizeId);
      if (!pose) {
        this.lastPrizeId = null;
      } else {
        const d = Math.hypot(pose.x - this.ship.x, pose.z - this.ship.z);
        if (d > 60) this.lastPrizeId = null; // you sailed off — the window closes
        else if (canTakePrize(this.crew, this.fleet.size())) this.captureable = true;
        else this.prizeShorthanded = this.fleet.size() < FLEET_MAX;
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
          this.say(this.mode === 'ashore' || this.crew === 0
            ? `The spade strikes wood \u2014 a chest of ${pay} doubloons!`
            : `The crew strikes wood \u2014 a chest of ${pay} doubloons!`, 8);
          this.logEvent(`Dug at the X \u2014 a chest of ${pay} doubloons raised`);
          this.persist();
        }
      }
    }

    // ---- the legends' own E-verbs: dive, expedition, the vault, the hoard ----
    const heaveTo = this.ship.speed < 1 && this.mode !== 'ashore';
    this.diveReady = zoneId === 'plate-fleet' && heaveTo;
    if (this.diveTimer > 0) {
      this.diveTimer -= dt;
      if (this.diveTimer <= 0) {
        const pay = diveRoll(this.lootSeed, this.diveN);
        this.lootSeed++;
        this.diveN++;
        this.gold += pay;
        this.say(this.diveN > 1
          ? `The divers surface with ${pay} doubloons of silver \u2014 the easy pickings are thinning`
          : `SPANISH SILVER \u2014 the divers bring up ${pay} doubloons\u2019 worth!`, 7);
        this.logEvent(`Dived the 1715 Plate Fleet \u2014 ${pay} doubloons of silver raised`);
        this.persist();
      }
    }
    this.expReady = zoneId === 'el-dorado' && heaveTo && !this.won.includes('el-dorado');
    if (this.expTimer > 0) {
      this.expTimer -= dt;
      if (this.expTimer <= 0) {
        this.won.push('el-dorado');
        this.gold += ELDORADO_GOLD;
        this.say(`EL DORADO \u2014 the expedition returns bent double under gold: ${ELDORADO_GOLD} doubloons! The gilded city is REAL.`, 10);
        this.logEvent(`Found El Dorado up the Amazon \u2014 ${ELDORADO_GOLD} doubloons`);
        this.persist();
      }
    }
    this.bankReady = zoneId === 'davy-jones' && heaveTo && this.gold > 0;
    // the dragon's crag: she fled there wounded; step ashore under Snowdon
    this.hoardReady = false;
    if (this.mode === 'ashore' && this.dragon && dragonGone(this.dragon)
      && !this.won.includes('dragons-wales')) {
      const crag = zoneOf('dragons-wales');
      this.hoardReady = Math.hypot(this.shore.x - crag.x, this.shore.z - crag.z) < HOARD_REACH;
    }

    const px = this.ship.x, pz = this.ship.z;
    // only the port panel furls the sails (so she doesn't sail off mid-trade);
    // everywhere else you stop the intuitive way — run her up the beach
    const furled = this.portui.open;

    // what the hull can actually DO this frame: battle damage caps her,
    // the Kraken's grip drags her, and over the trench the wind itself dies
    let hullFactor = speedFactor(this.hull);
    if (this.kraken) hullFactor *= krakenDrag(this.kraken);
    let windEff = this.wind;
    if (zoneId === 'davy-jones') {
      windEff = { from: this.wind.from, speed: this.wind.speed * deadAir(this.zone.dist, this.zone.r) };
    }
    const specEff = hullFactor < 0.999
      ? { ...this.spec, maxSpeed: this.spec.maxSpeed * hullFactor }
      : this.spec;
    stepShip(this.ship, windEff, dt, specEff, gait, furled);

    // the Corryvreckan takes the helm: rim slings, core swallows and shreds
    if (zoneId === 'corryvreckan') {
      const wz = zoneOf('corryvreckan');
      const pull = whirlpoolPull(this.ship.x - wz.x, this.ship.z - wz.z, wz.r);
      this.ship.x += pull.ax * dt;
      this.ship.z += pull.az * dt;
      if (pull.core) {
        this.hull.rig = Math.max(0, this.hull.rig - WHIRL_RIG_RATE * dt);
        if (!this.whirlWarned) {
          this.whirlWarned = true;
          this.say('THE CORE HAS HER \u2014 the rig is shredding! Sheet in and CLAW OUT!', 6);
          this.logEvent('Drawn into the Corryvreckan\u2019s core');
        }
      } else if (pull.rim && this.whirlWarned) this.whirlWarned = false;
    }

    // grounding is per-hull (spec.groundLine): a shallow-draft sloop PULLS
    // RIGHT UP onto the sand; a deep hull fetches up on the shoal offshore
    // and the boats go in. shipAttitude rides the ground either way.
    const groundAt = (x, z) => { const g = worldToLatLon(x, z); return elevation(g.lat, g.lon); };
    if (this.coastDist < 400) {
      const gl = this.spec.groundLine;
      const bowX = this.ship.x + Math.sin(this.ship.yaw) * this.spec.length * 0.5;
      const bowZ = this.ship.z + Math.cos(this.ship.yaw) * this.spec.length * 0.5;
      if (groundAt(bowX, bowZ) > gl || groundAt(this.ship.x, this.ship.z) > gl) {
        this.ship.x = px; this.ship.z = pz;
        this.ship.speed = 0;
        this.aground = true;
        // beached, the rudder alone barely bites — the captain poles her
        // round off the sand, so swinging her back to sea takes seconds
        if (this.mode === 'helm') this.ship.yaw += this.ship.rudder * 0.45 * dt;
      } else this.aground = false;
    } else this.aground = false;
    // the moment she fetches up, say OUT LOUD how you get ashore from here
    if (this.aground && !this.wasAgroundSay) {
      this.say(beaches(this.spec)
        ? 'The bow takes the sand \u2014 E steps you ashore'
        : 'She draws too much to beach \u2014 the boats must go in. E sends the longboat ashore', 8);
    }
    this.wasAgroundSay = this.aground;

    this.terrain.update(this.ship.x, this.ship.z);
    // inshore the hull rides the sea floor where it shoals past the keel
    const att = shipAttitude(this.ship, t, this.spec, this.coastDist < 400 ? groundAt : null);
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

    // the fighting layers breathe
    this.gunCool = Math.max(0, this.gunCool - dt);
    this.combatFx.update(t, dt);
    this.monsterFx.updateKraken(this.kraken, t, this.ship.x, this.ship.z);
    this.monsterFx.updateDragon(this.dragon, t, dt, this.ship.x, this.ship.z);

    // speed widens the lens a touch — subliminal but it sells the pace
    const fovTarget = 62 + 7 * Math.min(1, this.ship.speed / this.spec.maxSpeed);
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
    const lun = lunarState(skyT);
    const glit = glitterSource(sol, lun, moonBrightness(moonPhase(skyT)));
    const skyLL = worldToLatLon(this.ship.x, this.ship.z);
    // in the Triangle the fog closes in whatever the forecast says
    const gloomEff = zoneId === 'bermuda-triangle'
      ? Math.max(this.gloom, TRIANGLE_GLOOM) : this.gloom;
    this.sky.update(skyT, skyLL.lat, this.camera.position, gloomEff);
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
        Math.max(0, sol.nightness - 0.25) * 1.33 * (1 - gloomEff));
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
      if (this.aground) {
        this.logEvent(beaches(this.spec)
          ? 'Beached her \u2014 the bow takes the sand'
          : 'Brought up on the shoal \u2014 anchored off the shore');
      }
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
    // in the Bermuda Triangle the INSTRUMENTS lie: the numbers drift, the
    // charts put the ship where she is not, the heading arrow swims
    let showLat = ll.lat, showLon = ll.lon, showYaw = this.ship.yaw;
    if (zoneId === 'bermuda-triangle') {
      const j = compassJitter(t, triangleDepth(this.zone.dist, this.zone.r));
      showLat += j.dLat; showLon += j.dLon; showYaw += j.dYaw;
    }
    this.hud.latlon.textContent =
      `${Math.abs(showLat).toFixed(2)}\u00b0${showLat >= 0 ? 'N' : 'S'} `
      + `${Math.abs(showLon).toFixed(2)}\u00b0${showLon >= 0 ? 'E' : 'W'}`;
    this.hud.gait.style.display = (gait > 1.3 || this.shipSighted) ? 'block' : 'none';
    if (this.shipSighted) {
      this.hud.gait.textContent = gait > 1.3
        ? `SAIL HO \u2014 current slackens \u00d7${gait.toFixed(1)}`
        : 'SAIL HO \u2014 hailing speed';
    } else if (gait > 1.3) {
      this.hud.gait.textContent = `OPEN SEA \u2014 fair current \u00d7${gait.toFixed(1)}`;
    }
    this.hud.legend.style.display = this.zone ? 'block' : 'none';
    if (this.zone) this.hud.legend.textContent = this.zone.legend.name.toUpperCase();
    this.maps.update(showLat, showLon, showYaw, this.treasureMap);
    this.hud.gold.textContent = this.banked > 0
      ? `${this.gold} \u00b7 vault ${this.banked}` : this.gold;
    this.hud.weather.textContent = this.weatherState;
    this.hud.crew.textContent = this.crew;
    // the guns and the ship's hurts
    this.hud.guns.textContent = this.gunCool > 0
      ? `reloading\u2026 ${this.gunCool.toFixed(0)}s`
      : `READY \u2014 ${this.shotKind} shot`;
    const hurt = this.hull.rig < 0.999 || this.hull.hull < 0.999;
    this.hud.damage.style.display = hurt ? 'block' : 'none';
    if (hurt) {
      this.hud.damage.textContent =
        `RIG ${(this.hull.rig * 100).toFixed(0)}% \u00b7 HULL ${(this.hull.hull * 100).toFixed(0)}%`;
    }
    this.hud.fleet.textContent = this.fleet.size()
      ? ` \u00b7 ${this.fleet.size()} prize${this.fleet.size() > 1 ? 's' : ''} astern` : '';
    const anchored = this.port && inAnchorage(this.port.dist, this.ship.speed);
    const boardHint = () => {
      if (!this.boardable) return null;
      const bt = TYPES[this.boardable.m.type] || TYPES.trader;
      if (bt.armed && !this.boardable.m.routed) {
        const odds = Math.round(boardingOdds(this.crew, bt.crew) * 100);
        return `E \u2014 BOARD HER \u2014 her marines WILL fight (${odds}% with ${this.crew} hands)`;
      }
      if (this.boardable.m.type === 'derelict') return 'E \u2014 board the derelict\u2026';
      return 'E \u2014 BOARD HER!';
    };
    this.hud.hint.textContent = this.mode === 'ashore'
      ? (this.hoardReady
        ? 'E \u2014 THE DRAGON\u2019S HOARD'
        : this.digTimer > 0
        ? 'Digging\u2026'
        : this.digReady
          ? 'E \u2014 dig for the treasure'
          : 'WASD \u2014 explore ashore \u00b7 E \u2014 back to the ship')
      : this.kraken && this.kraken.state === 'gripping'
        ? `THE KRAKEN \u2014 F blast an arm (${this.kraken.arms} grip her) \u00b7 the crew hacks \u00b7 or run for SHALLOWS`
      : this.dragon && !dragonGone(this.dragon)
        ? (dragonVulnerable(this.dragon)
          ? 'SHE STOOPS \u2014 F \u2014 FIRE!'
          : `Y DDRAIG GOCH circles above \u2014 F only tells when she STOOPS (${this.dragon.hp} wounds will do it)`)
      : this.dutchmanBoardable
        ? 'E \u2014 BOARD THE FLYING DUTCHMAN!'
      : boardHint()
        ? boardHint()
        : this.captureable
          ? `E \u2014 put a prize crew aboard (${PRIZE_CREW} hands) \u00b7 she joins your fleet`
          : this.prizeShorthanded
          ? `Her hull is yours for the taking \u2014 but a prize crew is ${PRIZE_CREW} hands `
            + `(${this.crew} aboard). Sign hands on at a haven.`
          : this.digTimer > 0
          ? (this.crew > 0 ? 'The crew is digging\u2026' : 'Digging\u2026')
          : this.digReady
            ? (this.crew > 0 ? 'E \u2014 send the longboat to dig' : 'E \u2014 row in and dig')
          : this.diveTimer > 0
          ? 'The divers are down\u2026'
          : this.diveReady
            ? 'E \u2014 send the divers down to the Plate Fleet'
          : this.expTimer > 0
          ? 'The expedition is upriver\u2026'
          : this.expReady
            ? 'E \u2014 mount the expedition to El Dorado'
          : this.bankReady
            ? `E \u2014 consign ${this.gold} doubloons to the Locker (banked FOREVER)`
            : this.mode === 'helm'
              ? (anchored
                ? `ANCHORAGE \u2014 T to leave the tiller, E to put in at ${this.port.haven.name}`
                : this.aground
                ? (beaches(this.spec)
                  ? 'BEACHED \u2014 T to leave the tiller, E to step ashore \u00b7 steer A/D to swing her off'
                  : 'ANCHORED OFF \u2014 she draws too much to beach \u00b7 T, then E to send the longboat ashore')
                : 'A/D — steer · W/S — sheet · F — fire · R — shot type · T — leave the tiller · M — chart')
              : anchored
                ? `E \u2014 put in at ${this.port.haven.name} \u00b7 T \u2014 take the tiller`
                : this.canStepAshore()
                  ? (beaches(this.spec)
                    ? 'E \u2014 step ashore \u00b7 T \u2014 take the tiller'
                    : 'E \u2014 send the longboat ashore \u00b7 T \u2014 take the tiller')
                  : this.aground
                    ? (beaches(this.spec)
                      ? 'BEACHED \u2014 E to step ashore \u00b7 T to take the tiller'
                      : 'ANCHORED OFF \u2014 E sends the longboat ashore \u00b7 T to take the tiller')
                    : 'T — take the tiller · WASD — walk the deck · F — fire · M — chart · N — stars · L — log';
    this.hud.toast.style.display = t < this.toast.until ? 'block' : 'none';
    if (t < this.toast.until) this.hud.toast.textContent = this.toast.text;
    // a nudge toward good trim, teaching by whisper not tutorial
    const err = Math.abs(this.ship.trim - optimalTrim(rel));
    this.hud.trim.style.background = err < 0.12 ? '#7fd48a' : err < 0.3 ? '#e8c46a' : '#d47a6a';

    this.renderer.render(this.scene, this.camera);
  }
}

// typing in a form field (invite code, feedback box) must never sail the ship
const typingInField = () =>
  /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '');

// the how-to book — reachable from the title screen and the deck alike
const helpWrap = document.getElementById('help');
const helpOpen = () => helpWrap.style.display === 'flex';
const showHelp = (v) => { helpWrap.style.display = v ? 'flex' : 'none'; };
document.getElementById('btnhow').addEventListener('click', () => showHelp(true));
document.getElementById('helpbtn').addEventListener('click', () => showHelp(true));
document.getElementById('helpclose').addEventListener('click', () => showHelp(false));

// feedback & bugs — the harbourmaster's ledger takes reports from the title
// screen and mid-voyage alike (the help book carries the in-game button)
const fbWrap = document.getElementById('feedback');
const fbOpen = () => fbWrap.style.display === 'flex';
const fbErr = document.getElementById('fberr');
const fbOk = document.getElementById('fbok');
const fbMsg = document.getElementById('fbmsg');
function showFeedback(v) {
  fbWrap.style.display = v ? 'flex' : 'none';
  if (v) { fbErr.textContent = ''; fbOk.style.display = 'none'; fbMsg.focus(); }
}
document.getElementById('btnfeedback').addEventListener('click', () => showFeedback(true));
document.getElementById('helpfeedback').addEventListener('click', () => { showHelp(false); showFeedback(true); });
document.getElementById('fbclose').addEventListener('click', () => showFeedback(false));
document.getElementById('fbsend').addEventListener('click', async () => {
  const message = fbMsg.value.trim();
  const email = document.getElementById('fbemail').value.trim().toLowerCase();
  const kind = fbWrap.querySelector('input[name="fbkind"]:checked')?.value || 'feedback';
  if (message.length < 8) { fbErr.textContent = 'A bit more detail \u2014 at least a sentence.'; return; }
  fbErr.textContent = 'Sending\u2026';
  fbOk.style.display = 'none';
  const game = window.saltstead || null;
  try {
    const d = await submitFeedback({
      kind, message, email,
      name: displayName(loadAuth(localStorage)),
      context: gatherContext(game, game ? 'at-sea' : 'title'),
    });
    if (!d.ok) { fbErr.textContent = d.err || 'That didn\u2019t work \u2014 try again.'; return; }
    fbErr.textContent = '';
    fbMsg.value = '';
    fbOk.textContent = d.msg || 'Noted on the ledger \u2014 thank you.';
    fbOk.style.display = 'block';
  } catch {
    fbErr.textContent = 'The harbourmaster is not answering \u2014 try again later.';
  }
});

addEventListener('keydown', (e) => {
  if (e.repeat || typingInField()) return;
  if (e.code === 'KeyH' && !fbOpen()) showHelp(!helpOpen());
  if (e.code === 'Escape') {
    if (fbOpen()) showFeedback(false);
    else if (helpOpen()) showHelp(false);
  }
});

// title first, Moorstead-style: the game only boots when the title hands off
bootTitle({
  onStart: async (mode, auth) => {
    const save = mode === 'continue' ? await loadGame() : null;
    window.saltstead = new Game(save, auth); // the live handle, moorstead-style
  },
});
