// Saltstead — the game loop lives here.
// One planet, one sloop (so far), wind, waves, a walkable moving deck, a
// helm, guns, the trade lanes, the legends, and a third-person camera.
// docs/DESIGN.md is the contract; every pure system this file wires together
// is guarded by its own scripts/verify-*.mjs check.

import * as THREE from 'three';
import { Ocean } from './ocean.js';
import { buildShip, buildHand } from './ship.js';
import { buildCaptain } from './captain.js';
import { isWarden, loadAuth, displayName } from './identity.js';
import { FoamLayer } from './foamlayer.js';
import { SkyFx } from './skyfx.js';
import { newShipState, stepShip, shipAttitude, beaches, oarSpeed } from './shipphysics.js';
import { oarMode, oarPosts, oarLength, oarStroke, towOffset } from './oars.js';
import { frameFor, clampToDeck, localToWorld, gunPosts, holdFor, crewPosts } from './shipframe.js';
import { CABLE_DEPTH, canLetGo, snubSpeed, swingToWind } from './anchor.js';
import { helmOrder, helmRoute } from './helmsman.js';
import { route as laneRoute } from './lanes.js';
import { windAt } from './wind.js';
import { currentAt } from './currents.js';
import { decide as helmWatch } from './helmwatch.js';
import { RESCUE_R, GRATITUDE } from './survivors.js';
import { HULLS, hullById, nextHull, prevHull, buyHull } from './shipyard.js';
import { sailPower, wrapAngle, optimalTrim, tackSign, IRONS, crewRudder } from './sailing.js';
import { waveHeight } from './waves.js';
import { TerrainLayer } from './terrain.js';
import { HarbourLayer } from './harbourlayer.js';
import { Sky } from './sky.js';
import { DAY_LENGTH, solarState, lunarState, moonPhase } from './skymath.js';
import { EXPOSURE_BASE, exposureTarget, glitterSource, moonBrightness, bioGlow } from './lightrig.js';
import { decideTier, fpsVerdict, median, SETTLE_S, WINDOW_S } from './gfxprobe.js';
import { MapUI } from './mapui.js';
import { bootTitle } from './title.js';
import { logVisit, logPlay } from './telemetry.js';
import { loadGame, saveGame, snapshotSave } from './save.js';
import { MerchantLayer } from './merchantlayer.js';
import { WildlifeLayer } from './wildlifelayer.js';
import { FleetLayer } from './fleetlayer.js';
import { canTakePrize, START_CREW, PRIZE_CREW, MIN_CREW, FLEET_MAX } from './fleet.js';
import { canBoard, lootRoll, chestRoll } from './plunder.js';
import { findDigSite, digDist, DIG_RADIUS, DIG_TIME } from './treasure.js';
import {
  latLonToWorld, worldToLatLon, coastDistGame, elevation, gaitFactor, COAST_CAP,
  encounterGait, ENCOUNTER_FAR, isLand, wrapX,
} from './earth.js';
import { windProfile, seaStateFor } from './weather.js';
import { setSeaState, RIVER_STATE } from './waves.js';
import { makeEntry, pushEntry, acceptLog, fmtPos } from './shiplog.js';
import { crewPersona, crewContext } from './crewchat.js';
import { talkCrew } from './brainclient.js';
import {
  nearestHaven, inAnchorage, sellFleet, canHire, HAND_COST, fenceRate,
} from './port.js';
import { PortUI } from './portui.js';
import { canSight, takeSight, sightText } from './navigation.js';
import { StarChartUI } from './starchartui.js';
import { LogUI } from './logui.js';
import { TYPES, NAVY_SHOAL, LOOKOUT_R, compassPoint } from './merchants.js';
import { factionOf, canBoardType, signalAnswer, escortBerth, homeAnchorage } from './faction.js';
import { LIVERIES } from './livery.js';
import { collideShips, ramSeverity } from './collide.js';
import {
  GUN_RANGE, reloadTime, beamBearing, inArc, rollHit, newHullState, applyShot,
  speedFactor, isSinking, NAVY_RELOAD, autoBattle, boardingOdds, founderCost,
  wreckSpoils, CRIPPLED_HULL,
  repairCost,
} from './combat.js';
import {
  legendAt, triangleDepth, compassJitter, TRIANGLE_GLOOM, whirlpoolPull,
  WHIRL_RIG_RATE, deadAir, DIVE_TIME, diveRoll, EXPEDITION_TIME, ELDORADO_GOLD,
  dutchmanSails, dutchmanCargo, DUTCHMAN_SPEED, zoneOf,
  WHIRL_ZONES, DEADAIR_ZONES, KRAKEN_ZONES, DRAGON_ZONES, DIVE_ZONES,
  STORM_ZONES, STORM_GLOOM, STORM_WIND_MULT,
  ROC_GOLD, WHALE_RAM_S, WHALE_RAM_HULL, SELKIE_DWELL_S,
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
import { TitleScene } from './titlescene.js';
import { runShowreel, stopShowreel } from './showreel.js';

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
  // save: an acceptSave()-vetted meta or null; auth: the identity blob;
  // newFaction: the side chosen at the title for a FRESH voyage (a continue
  // reads its flag from the save; old saves read as pirates)
  constructor(save = null, auth = null, newFaction = null) {
    this.auth = auth;
    // the flag you sail under (faction.js): the pirate's edge is her own
    // hull — speed and plunder; the navy's is the squadron — the G signal
    this.faction = save?.faction || (newFaction === 'navy' ? 'navy' : 'pirate');
    this.fac = factionOf(this.faction);
    this.assist = new Map();   // corvette id -> raider id (the signal's orders)
    this.assistCool = new Map(); // corvette id -> seconds to her next broadside
    this.signalCool = 0;       // one rocket at a time
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
    this.foam = new FoamLayer(this.scene, 220); // four emitters need the slots
    this.skyfx = new SkyFx(this.scene); // the VISIBLE weather: clouds + rain
    this.terrain = new TerrainLayer(this.scene);
    this.harbours = new HarbourLayer(this.scene);

    // each side weighs anchor in its own home waters (faction.js): the
    // black flag off Port Royal, the King's commission out of Bristol
    this.home = homeAnchorage(this.faction);
    const spawn = latLonToWorld(this.home.lat, this.home.lon);
    this.ship = newShipState(spawn.x, spawn.z);
    this.ship.yaw = this.home.yaw;
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
    this.overLand = false;
    this.oars = false; // sweeps out: the wind-proof crawl (O)
    this.shoalWater = false;
    this.geoClock = 0;
    this.aground = false;
    // other ships at sea ({x, z} world coords) — multiplayer peers and NPC
    // merchants land here; the encounter gait reads it every frame
    this.contacts = [];
    this.merchants = new MerchantLayer(this.scene);
    this.hailed = new Set(); // ships the lookout has already sung out
    this.wildlife = new WildlifeLayer(this.scene);
    this.fleet = new FleetLayer(this.scene);
    this.fleet.restore(this.savedFleet, this.ship.x, this.ship.z, this.ship.yaw);
    this.lastPrizeId = null; // the stripped hull still alongside (capture window)
    this.toast = { text: '', until: 0 };

    // ---- the fighting ship (combat.js) ----
    // YOUR rig and hull — damage rides the save, so a refresh never repairs
    // her (the wreck rule would be toothless otherwise)
    this.hull = newHullState();
    if (save) { this.hull.rig = save.dmgRig; this.hull.hull = save.dmgHull; }
    this.crippled = save?.crippled || false; // foundered once: the next holing WRECKS her
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
    // the hull you sail — a rung of the shipwright's ladder (shipyard.js),
    // remembered by the save; the yard at any port swaps it
    this.hullDef = hullById(save?.hull || 'sloop');
    this.hullId = this.hullDef.id;
    this.spec = this.hullDef.spec;
    this.shipFrame = frameFor(this.spec);
    // saves from before the berth ladder tightened may carry more hands
    // than the hull now sleeps — the surplus went ashore
    this.crew = Math.min(this.crew, this.hullDef.berths);
    // the player's hull wears her SIDE's colours (livery.js) — black and
    // blood-red under the skull, or blue-black and buff under the ensign
    const built = buildShip({ ...this.hullDef, livery: LIVERIES[this.faction] });
    this.shipGroup = built.group;
    this.shipGroup.rotation.order = 'YXZ';
    this.setSail = built.setSail;
    this.setLantern = built.setLantern;
    this.setAnchor = built.setAnchor;
    this.setHelm = built.setHelm;
    this.anchorDown = !!save?.anchorDown; // she rides where you left her
    this.setAnchor(this.anchorDown);
    this.scene.add(this.shipGroup);
    this.riseMastLight();
    this.riseHoldLight(this.hullDef);

    this.warden = isWarden(auth); // the harbourmaster's own standing
    this.captain = buildCaptain(this.warden);
    this.cap = { x: 0, z: -2.2, facing: 0, moving: false };
    this.captain.group.position.set(this.cap.x, this.shipFrame.deck.y, this.cap.z);
    this.shipGroup.add(this.captain.group);

    this.mode = 'walk'; // 'walk' | 'helm' | 'below' | 'ashore'
    this.wind = { from: 2.3, speed: 7 };
    // wind direction + strength now come from the procedural field (wind.js),
    // sampled at the ship each frame; the live Open-Meteo layer was retired for
    // determinism. weatherState stays 'clear' until the storms plan drives it.
    this.weatherState = 'clear';
    this.gloom = 0;
    this.swell = 1;
    this.cam = { yaw: Math.PI * 0.85, pitch: 0.32, dist: 8, targetDist: 8 };

    // the marketing lens (showreel.js): photoCam pins the camera, weatherLock
    // stops live weather overwriting a beat's forced sky
    this.photoCam = null;
    this.weatherLock = false;
    this.showreel = (opts) => runShowreel(this, opts);
    this.showreelStop = () => stopShowreel(this);

    this.keys = new Set();
    addEventListener('keydown', (e) => {
      if (typingInField()) return; // the feedback box eats its own keystrokes
      this.keys.add(e.code);
      if (e.code === 'KeyE') this.onE();
      if (e.code === 'KeyT') this.toggleTiller();
      if (e.code === 'KeyF' && !e.repeat) this.fireGuns();
      if (e.code === 'KeyR' && !e.repeat) this.toggleShot();
      if (e.code === 'KeyQ' && !e.repeat) this.toggleAnchor();
      if (e.code === 'KeyY' && !e.repeat) this.wardenMaterialise();
      if (e.code === 'KeyG' && !e.repeat) this.signalSquadron();
      if (e.code === 'KeyV' && !e.repeat) this.toggleQuality();
      if (e.code === 'KeyC' && !e.repeat) this.belayCourse();
      if (e.code === 'KeyB' && !e.repeat) this.hailCrew();
      if (e.code === 'KeyO' && !e.repeat) this.toggleOars();
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
      // the far stop clears a galleon's truck — the flag must be zoomable-to
      this.cam.targetDist = Math.max(4, Math.min(60, this.cam.targetDist + e.deltaY * 0.01));
    });
    this.setupTouch();
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
      shipname: document.getElementById('shipname'),
    };
    this.hud.shipname.textContent =
      `${this.hullDef.name} \u00b7 ${this.hullDef.guns} gun${this.hullDef.guns > 1 ? 's' : ''} a side \u00b7 ${this.fac.tag}`;

    this.maps = new MapUI();
    // the chart SETS the helmsman's course: click the world chart with a
    // hand aboard and she sails there (helmsman.js) while you work the deck
    this.course = null;
    this.route = null;
    this.routeLeg = 0;
    this.handbackMode = null; // the helm watch's last verdict (helmwatch.js)
    this.handbackReason = '';
    this.maps.onCourse = (lat, lon) => {
      if (this.crew < 1) {
        this.say('No hand aboard to take the helm — sign crew at a port, then set your course', 6);
        return;
      }
      const w = latLonToWorld(lat, lon);
      this.course = { x: w.x, z: w.z };
      this.route = laneRoute(this.ship.x, this.ship.z, w.x, w.z);
      this.routeLeg = 0;
      this.maps.course = { lat, lon };
      const d = Math.hypot(w.x - this.ship.x, w.z - this.ship.z);
      this.say(`COURSE SET — the helmsman lays her for the ${compassPoint(this.ship.x, this.ship.z, w.x, w.z)}, `
        + `${Math.max(1, Math.round(d / 1000))} km by the log (C belays it; the wheel overrides)`, 8);
      this.logEvent('Set a course on the chart — a hand takes the helm');
    };
    this.starchart = new StarChartUI();
    this.logui = new LogUI();
    this.port = null; // { haven, dist } refreshed with the geography
    this.portui = new PortUI(() => this.sellPrizes(), () => this.hireHand(),
      () => this.repairShip(), () => this.buyShip());
    // the crew's voices (crewchat.js + the brain on the EVO): B hails the
    // nearest hand; each berth keeps her own chat log for the session
    this.crewChat = { open: false, hand: 0, waiting: false, logs: new Map() };
    this.crewChatEl = {
      wrap: document.getElementById('crewchat'),
      who: document.getElementById('crewchatwho'),
      log: document.getElementById('crewchatlog'),
      input: document.getElementById('crewchatinput'),
    };
    document.getElementById('crewchatsend').addEventListener('click', () => this.sendCrewChat());
    document.getElementById('crewchatclose').addEventListener('click', () => this.closeCrewChat());
    this.crewChatEl.input.addEventListener('keydown', (e) => {
      if (e.code === 'Enter') this.sendCrewChat();
      if (e.code === 'Escape') this.closeCrewChat();
      e.stopPropagation();
    });
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
        if (this.crewChat.open) this.closeCrewChat();
      }
    });

    // THE GRAPHICS PROBE (gfxprobe.js — the Spire's tier method): open at
    // the tier this machine can honestly carry. Key 'saltstead-gfx2' holds
    // the tri-state (fine / plain chosen by hand, auto-plain remembered by
    // the watchdog); the legacy always-written 'saltstead-gfx' key is
    // ignored — it recorded the old default, not a choice.
    this.gfxWatch = { t: 0, frames: [], span: 0, manual: false, pixelDropped: false };
    const gfxSig = {
      stored: ['fine', 'plain', 'auto-plain'].includes(localStorage['saltstead-gfx2'])
        ? localStorage['saltstead-gfx2'] : null,
      touchPrimary: typeof matchMedia === 'function'
        ? matchMedia('(pointer: coarse)').matches : false,
      webgpu: null,
      rendererStr: (() => {
        try {
          const gl = this.renderer.getContext();
          const ext = gl.getExtension('WEBGL_debug_renderer_info');
          return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
        } catch { return null; }
      })(),
      deviceMemory: navigator.deviceMemory ?? null,
      cores: navigator.hardwareConcurrency ?? null,
    };
    const opening = decideTier(gfxSig);
    this.applyQuality(opening.tier);
    // the WebGPU adapter answers async — refine ONLY the optimistic default
    // (a stored choice or a hard signal already settled it)
    if (opening.why === 'unprobed' && navigator.gpu?.requestAdapter) {
      Promise.race([
        navigator.gpu.requestAdapter(),
        new Promise((r) => setTimeout(() => r(null), 1500)),
      ]).then((adapter) => {
        const v = decideTier({ ...gfxSig, webgpu: !!adapter });
        if (v.tier !== this.gfxQuality) this.applyQuality(v.tier);
      }).catch(() => {});
    }

    this.t = 0;
    this.last = performance.now();
    if (!save) {
      this.logEvent(`Weighed anchor off ${this.home.name} under ${this.fac.tag} \u2014 the voyage begins`);
      // a fresh captain gets the survival doctrine before the sea does
      showBriefingFor(this.hullDef);
      // ...and the doctrine of the flag overhead
      setTimeout(() => this.say(this.faction === 'navy'
        ? 'You sail under the KING\u2019S COLOURS \u2014 hunt the raiders off the lanes; G sends up a rocket and the squadron answers'
        : 'You fly the BLACK FLAG \u2014 faster than your class, richer plunder, and every honest sail is prey. The King hunts you.', 10), 800);
    }
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---- the touch deck (index.html #touchui) ----
  // On a coarse-pointer machine the on-screen pad and cluster appear: HOLD
  // buttons feed the same key set the keyboard does (so WASD keeps its dual
  // walk/helm meaning for free), TAP buttons call the same handlers. One
  // finger on the sea drags the camera; two fingers pinch the zoom.
  setupTouch() {
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    if (!coarse) return;
    document.body.classList.add('touch');
    const hold = (id, code) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        try { el.setPointerCapture(e.pointerId); } catch { /* already captured */ }
        this.keys.add(code);
      });
      const up = () => this.keys.delete(code);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    };
    hold('tkW', 'KeyW'); hold('tkA', 'KeyA'); hold('tkS', 'KeyS'); hold('tkD', 'KeyD');
    const tap = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('pointerdown', (e) => { e.preventDefault(); fn(); });
    };
    tap('tkE', () => this.onE());
    tap('tkT', () => this.toggleTiller());
    tap('tkF', () => this.fireGuns());
    tap('tkQ', () => this.toggleAnchor());
    tap('tkM', () => this.maps.toggleWorld());

    // the camera under fingers: one drags the look, two pinch the distance
    const el = this.renderer.domElement;
    let drag = null, pinch = null;
    el.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        drag = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        pinch = null;
      } else if (e.touches.length === 2) {
        drag = null;
        pinch = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY);
      }
    }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      e.preventDefault(); // the canvas is touch-action:none; no page scroll
      if (e.touches.length === 1 && drag) {
        const t0 = e.touches[0];
        this.cam.yaw -= (t0.clientX - drag.x) * 0.006;
        this.cam.pitch = Math.max(0.08, Math.min(1.25, this.cam.pitch + (t0.clientY - drag.y) * 0.005));
        drag = { x: t0.clientX, y: t0.clientY };
      } else if (e.touches.length === 2 && pinch !== null) {
        const d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY);
        this.cam.targetDist = Math.max(4, Math.min(60, this.cam.targetDist - (d - pinch) * 0.06));
        pinch = d;
      }
    }, { passive: false });
    el.addEventListener('touchend', () => { drag = null; pinch = null; });
  }

  // the one-slot solo save (save.js); fire-and-forget, losses cost seconds
  persist() {
    saveGame(snapshotSave(this.ship, this.t + this.dayStart, {
      gold: this.gold, map: this.treasureMap, lootSeed: this.lootSeed,
      crew: this.crew, fleet: this.fleet.size(), log: this.log,
      banked: this.banked, won: this.won, hull: this.hullId,
      faction: this.faction,
      dmgRig: this.hull.rig, dmgHull: this.hull.hull, crippled: this.crippled,
      anchorDown: this.anchorDown,
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
  refreshPort() {
    this.portui.refresh(this.gold, this.crew, this.fleet.size(), this.hull,
      this.hullId, this.port.haven);
  }

  sellPrizes() {
    const n = this.fleet.size();
    if (!n) return;
    const rate = fenceRate(this.port.haven);
    const sale = sellFleet(n, this.crew, this.hullDef.berths, rate);
    this.gold += sale.gold;
    this.crew = sale.crewBack;
    this.fleet.clear();
    this.say(`${sale.sold} prize${sale.sold > 1 ? 's' : ''} sold \u2014 `
      + `${sale.gold} doubloons${rate < 1 ? ' (the harbourmaster took his cut)' : ''}; `
      + 'the prize crews come back aboard', 7);
    this.logEvent(`Sold ${sale.sold} prize${sale.sold > 1 ? 's' : ''} at `
      + `${this.port.haven.name} for ${sale.gold} doubloons`);
    this.refreshPort();
    this.persist();
  }

  hireHand() {
    if (!canHire(this.gold, this.crew, this.hullDef.berths)) return;
    this.gold -= HAND_COST;
    this.crew++;
    this.say(`A hand signs articles \u2014 ${this.crew} aboard`, 4);
    this.logEvent(`Signed on a hand at ${this.port.haven.name} (${HAND_COST} doubloons)`);
    this.refreshPort();
    this.persist();
  }

  // the yard bills by what's missing (combat.js repairCost)
  repairShip() {
    const cost = repairCost(this.hull);
    if (cost <= 0 || this.gold < cost) return;
    this.gold -= cost;
    this.hull.rig = 1; this.hull.hull = 1;
    this.crippled = false; // whole again — the wreck clock resets
    this.say(`The yard makes her whole again \u2014 ${cost} doubloons`, 5);
    this.logEvent(`Repaired at ${this.port.haven.name} (${cost} doubloons)`);
    this.refreshPort();
    this.persist();
  }

  // the shipwright: the next rung of the ladder, bought with the chest
  buyShip() {
    const deal = buyHull(this.gold, this.hullId);
    if (!deal) return;
    const def = hullById(deal.hull);
    this.gold = deal.gold;
    this.setHull(def);
    this.hull.rig = 1; this.hull.hull = 1; // she comes off the stocks whole
    this.crippled = false;
    this.say(`The yard builds you a ${def.name.toUpperCase()} \u2014 ${deal.paid} doubloons. `
      + 'She smells of fresh oakum and tar.', 8);
    this.logEvent(`The shipwright at ${this.port.haven.name} built a ${def.name} `
      + `(${deal.paid} doubloons)`);
    this.refreshPort();
    this.persist();
    showBriefingFor(def);
  }

  // swap the hull under the captain: spec, frame, and the visible ship
  setHull(def) {
    if (this.mode === 'below') { this.mode = 'walk'; this.cam.targetDist = 8; }
    this.holdFrame = null;
    this.hullDef = def;
    this.hullId = def.id;
    this.spec = def.spec;
    this.shipFrame = frameFor(def.spec);
    this.scene.remove(this.shipGroup);
    const built = buildShip({ ...def, livery: LIVERIES[this.faction] });
    this.shipGroup = built.group;
    this.shipGroup.rotation.order = 'YXZ';
    this.setSail = built.setSail;
    this.setLantern = built.setLantern;
    this.setAnchor = built.setAnchor;
    this.setHelm = built.setHelm;
    this.setAnchor(this.anchorDown); // the cable outlives the hull swap
    this.scene.add(this.shipGroup);
    this.riseMastLight();
    this.riseHoldLight(def);
    if (this.mode !== 'ashore') this.shipGroup.add(this.captain.group);
    const p = clampToDeck(this.cap.x, this.cap.z, 0.2, this.shipFrame.deck);
    this.cap.x = p.x; this.cap.z = p.z;
    this.hud.shipname.textContent =
      `${def.name} \u00b7 ${def.guns} gun${def.guns > 1 ? 's' : ''} a side \u00b7 ${this.fac.tag}`;
    this.applyQuality(this.gfxQuality); // shadows onto the new meshes
  }

  // the muster made VISIBLE: every hired hand stands a station on deck.
  // The first is the HELMSMAN \u2014 he keeps the helm, which is exactly what
  // he does for a living (helmOrder steers only while crew >= 1). The rest
  // take the waist at crewPosts stations. Rebuilt whenever the muster or
  // the hull changes; capped so a galleon's deck reads crewed, not crowded.
  refreshHands() {
    const shown = Math.min(this.crew, 13);
    if (this._handsShown === shown && this._handsHull === this.hullId) return;
    this._handsShown = shown;
    this._handsHull = this.hullId;
    if (this.handGroup) {
      this.shipGroup.remove(this.handGroup);
      this.handGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    this.handGroup = new THREE.Group();
    const F = this.shipFrame;
    const scale = F.scale > 1.6 ? 1.15 : 1;
    if (shown >= 1) {
      const helmsman = buildHand(7);
      helmsman.scale.setScalar(scale);
      helmsman.position.set(F.helm.x, F.deck.y, F.helm.z - 0.55 * F.scale);
      this.handGroup.add(helmsman); // faces the bow, hands to the helm
    }
    for (const [i, p] of crewPosts(F.deck, shown - 1, 3).entries()) {
      const hand = buildHand(11 + i);
      hand.scale.setScalar(scale);
      hand.position.set(p.x, F.deck.y, p.z);
      hand.rotation.y = ((11 + i * 37) % 7) - 3;
      this.handGroup.add(hand);
    }
    this.shipGroup.add(this.handGroup);
  }

  // the VISIBLE sweeps: oars on the rails for the beaching hulls, the
  // longboat ahead on her tow line for the deep ones. Rebuilt when the
  // sweeps ship or stow, the muster changes, or the hull is swapped.
  refreshOarFx() {
    const want = this.oars ? `${this.hullId}:${Math.min(this.crew, 13)}` : '';
    if (this._oarKey === want) return;
    this._oarKey = want;
    if (this.oarFx) {
      this.shipGroup.remove(this.oarFx.group);
      this.oarFx.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      for (const key of ['towBoat', 'towRope']) {
        if (this[key]) {
          this.scene.remove(this[key]);
          this[key].traverse((o) => { if (o.geometry) o.geometry.dispose(); });
          this[key] = null;
        }
      }
      this.oarFx = null;
    }
    if (!this.oars) return;
    if (!this.oarMat) {
      this.oarMat = new THREE.MeshPhongMaterial({ color: 0x6b4a2f, flatShading: true });
    }
    const group = new THREE.Group();
    const pivots = [];
    const mode = oarMode(this.spec);
    if (mode === 'sweeps') {
      const len = oarLength(this.spec);
      for (const p of oarPosts(this.spec, this.crew)) {
        const pivot = new THREE.Group();
        pivot.position.set(p.x, p.y, p.z);
        const shaft = new THREE.Mesh(new THREE.BoxGeometry(len, 0.13, 0.19), this.oarMat);
        shaft.position.x = p.side * len * 0.42;
        const blade = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.06, 0.36), this.oarMat);
        blade.position.x = p.side * len * 0.92;
        pivot.add(shaft, blade);
        pivot.rotation.z = -p.side * 0.3; // blades reach down toward the water
        group.add(pivot);
        pivots.push({ g: pivot, side: p.side, k: p.k });
      }
    } else {
      // the longboat: a REAL open boat — flat bottom, flared sides meeting
      // at a stem, transom aft, thwarts, two rowers. She is a child of the
      // SCENE, not the ship group (which rides sunk by its own draft): the
      // animation block below floats her on the live wave field every frame.
      if (!this.oarMatDark) {
        this.oarMatDark = new THREE.MeshPhongMaterial({ color: 0x4a3520, flatShading: true });
      }
      const boat = new THREE.Group();
      const bottom = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.14, 4.0), this.oarMatDark);
      bottom.position.y = 0.07;
      boat.add(bottom);
      for (const side of [-1, 1]) {
        // flared side strake, canted outward
        const strake = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.62, 3.9), this.oarMat);
        strake.position.set(side * 0.72, 0.38, -0.25);
        strake.rotation.z = -side * 0.18;
        boat.add(strake);
        // bow plank angling in to the stem
        const bowPlank = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.58, 1.5), this.oarMat);
        bowPlank.position.set(side * 0.36, 0.44, 2.28);
        bowPlank.rotation.z = -side * 0.14;
        bowPlank.rotation.y = -side * 0.46;
        boat.add(bowPlank);
      }
      const stem = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.78, 0.16), this.oarMatDark);
      stem.position.set(0, 0.5, 2.92);
      boat.add(stem);
      const transom = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.6, 0.12), this.oarMat);
      transom.position.set(0, 0.4, -2.2);
      boat.add(transom);
      for (const tz of [-0.8, 0.7]) {
        const thwart = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.07, 0.3), this.oarMat);
        thwart.position.set(0, 0.52, tz);
        boat.add(thwart);
        const rower = buildHand(tz > 0 ? 3 : 5);
        rower.scale.setScalar(0.85);
        rower.position.set(0, 0.42, tz - 0.28);
        rower.rotation.y = Math.PI; // rowers face AFT and pull
        boat.add(rower);
        for (const side of [-1, 1]) {
          const pivot = new THREE.Group();
          pivot.position.set(side * 0.74, 0.58, tz);
          const oar = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.07, 0.13), this.oarMat);
          oar.position.x = side * 1.0;
          const blade = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.22), this.oarMat);
          blade.position.x = side * 2.05;
          pivot.add(oar, blade);
          pivot.rotation.z = -side * 0.3;
          boat.add(pivot);
          pivots.push({ g: pivot, side, k: (tz > 0 ? 0 : 1) + (side + 1) / 2 });
        }
      }
      this.scene.add(boat);
      // the tow line, world-space, endpoints refreshed with the boat
      const ropeGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(), new THREE.Vector3(),
      ]);
      const rope = new THREE.Line(ropeGeo, new THREE.LineBasicMaterial({ color: 0x3a2c1c }));
      rope.frustumCulled = false;
      this.scene.add(rope);
      this.towBoat = boat;
      this.towRope = rope;
    }
    this.shipGroup.add(group);
    this.oarFx = { group, pivots, mode };
  }

  // sweeps out / sweeps in: the wind-proof crawl. Works from any state but
  // the anchor — she cannot row against her own cable.
  toggleOars() {
    if (this.mode === 'ashore' || this.mode === 'below') return;
    if (!this.oars && this.anchorDown) { this.say('Weigh anchor first — she cannot row against her own cable', 5); return; }
    this.oars = !this.oars;
    this.say(this.oars
      ? `OUT SWEEPS — ${this.crew > 0 ? 'the hands bend to the oars' : 'you bend to the oars alone'}. Slow, but the wind has no vote`
      : 'Sweeps inboard — she is the wind’s again', 5);
  }

  // ---- the crew's voices ----
  // B hails the nearest hand to wherever the captain stands (at the helm
  // that is the helmsman). Their brains live on the EVO; the context pack
  // (crewchat.js) grounds every answer in the ship's real ledgers.
  hailCrew() {
    if (this.crewChat.open) { this.closeCrewChat(); return; }
    if (this.mode === 'ashore' || this.mode === 'below') return;
    if (this.crew < 1) { this.say('No hands aboard — sign a helmsman at any port', 5); return; }
    let hand = 0;
    if (this.mode !== 'helm' && this.crew > 1) {
      // nearest visible station to the captain's ship-local position
      const F = this.shipFrame;
      const helm = { x: F.helm.x, z: F.helm.z - 0.55 * F.scale };
      const posts = [helm, ...crewPosts(F.deck, Math.min(this.crew, 13) - 1, 3)];
      let best = Infinity;
      posts.forEach((p, i) => {
        const d = Math.hypot(this.cap.x - p.x, this.cap.z - p.z);
        if (d < best) { best = d; hand = i; }
      });
    }
    this.openCrewChat(hand);
  }

  openCrewChat(i) {
    const p = crewPersona(i);
    this.crewChat.open = true;
    this.crewChat.hand = i;
    this.crewChatEl.who.innerHTML = '';
    this.crewChatEl.who.append(p.name.toUpperCase());
    const sub = document.createElement('small');
    sub.textContent = `${p.role} · a ${p.home} ${p.mood === 'a little homesick' ? 'soul' : 'hand'} · ${p.mood}`;
    this.crewChatEl.who.append(sub);
    this.renderCrewChat();
    this.crewChatEl.wrap.style.display = 'flex';
    this.crewChatEl.input.value = '';
    this.crewChatEl.input.focus();
  }

  closeCrewChat() {
    this.crewChat.open = false;
    this.crewChatEl.wrap.style.display = 'none';
    this.crewChatEl.input.blur();
  }

  renderCrewChat() {
    const log = this.crewChat.logs.get(this.crewChat.hand) || [];
    const el = this.crewChatEl.log;
    el.innerHTML = '';
    for (const m of log) {
      const d = document.createElement('div');
      d.className = m.cls;
      d.textContent = m.text;
      el.append(d);
    }
    if (this.crewChat.waiting) {
      const d = document.createElement('div');
      d.className = 'sys';
      d.textContent = '…thinking on it…';
      el.append(d);
    }
    el.scrollTop = el.scrollHeight;
  }

  // everything the brain is TOLD is computed from the game's own ledgers
  // right here — the LLM narrates, the ledgers decide
  buildBrainState() {
    const ll = worldToLatLon(this.ship.x, this.ship.z);
    let nearestPort = null;
    if (this.port) {
      const w = latLonToWorld(this.port.haven.lat, this.port.haven.lon);
      nearestPort = {
        name: this.port.haven.name,
        kind: this.port.haven.kind,
        dist: this.port.dist,
        bearing: compassPoint(this.ship.x, this.ship.z, w.x, w.z),
      };
    }
    return {
      faction: this.faction,
      hullName: this.hullDef.name,
      guns: this.hullDef.guns,
      berths: this.hullDef.berths,
      crew: this.crew,
      gold: this.gold,
      banked: this.banked,
      fleetSize: this.fleet.size(),
      posText: fmtPos(ll.lat, ll.lon),
      speedKn: this.ship.speed * 1.944,
      pointOfSail: this.hud.pos.textContent,
      windMs: this.wind.speed,
      weatherState: this.weatherState,
      gait: this.lastGait || 1,
      overLand: this.overLand,
      coastDist: this.coastDist,
      aground: this.aground,
      anchorDown: this.anchorDown,
      crippled: this.crippled,
      rigPct: this.hull.rig * 100,
      hullPct: this.hull.hull * 100,
      nearestPort,
      zoneName: this.zone ? this.zone.legend.name : null,
      hasTreasureMap: !!this.treasureMap,
      night: !!this.lastNight,
    };
  }

  async sendCrewChat() {
    if (this.crewChat.waiting) return; // single-flight, moorstead-style
    const q = this.crewChatEl.input.value.trim();
    if (!q) return;
    const i = this.crewChat.hand;
    const p = crewPersona(i);
    let log = this.crewChat.logs.get(i);
    if (!log) this.crewChat.logs.set(i, log = []);
    log.push({ cls: 'you', text: q });
    this.crewChatEl.input.value = '';
    this.crewChat.waiting = true;
    this.renderCrewChat();
    try {
      const res = await talkCrew({
        ...p,
        message: q,
        playerName: this.auth?.name || null,
        context: crewContext(this.buildBrainState(), p, q),
      });
      log.push({ cls: 'them', text: res.reply || '…' });
    } catch {
      log.push({ cls: 'sys',
        text: `${p.name} scratches his head — the brain ashore didn’t answer. Try again in a moment.` });
    }
    this.crewChat.waiting = false;
    if (this.crewChat.open && this.crewChat.hand === i) this.renderCrewChat();
  }

  // the flagship's masthead throws real light on her own deck and sails —
  // one PointLight, player only (the NPC lanterns are emissive dots; twenty
  // point lights would sink a laptop). Re-hung whenever the hull is rebuilt.
  riseMastLight() {
    const F = this.shipFrame;
    this.mastLight = new THREE.PointLight(0xffc978, 0, 30 * F.scale, 1.6);
    this.mastLight.position.set(0, F.deck.y + 7.4 * F.scale, 1.2 * F.scale);
    this.shipGroup.add(this.mastLight);
  }

  // the hold's lantern — one warm PointLight by the companionway, lit only
  // while the captain is actually below (the hold is windowless; without it
  // the room is a coal cellar). Player's own hull only, like the mast light.
  riseHoldLight(def) {
    this.holdLight = null;
    if (!def.below) return;
    const H = holdFor(def.spec), sc = this.shipFrame.scale;
    this.holdLight = new THREE.Group();
    // one lamp at the companionway, one forward, and one aft over the
    // great cabin on castle hulls — a galleon's hold is a warehouse, and a
    // single lantern reads as a coal cellar
    const lampZ = [H.hatch.z, (H.maxZ + H.hatch.z) / 2];
    if (def.castle) lampZ.push(H.minZ + 1.2 * sc);
    for (const z of lampZ) {
      const lamp = new THREE.PointLight(0xffc070, 0, 16 * sc, 1.2);
      lamp.position.set(0.5 * sc, this.shipFrame.deck.y - 0.5 * sc, z);
      this.holdLight.add(lamp);
    }
    this.shipGroup.add(this.holdLight);
  }

  // the hold lamps light as one (goBelow/goUp); intensity carries the scale
  setHoldLight(on) {
    if (!this.holdLight) return;
    const glow = on ? 4 + 3.5 * this.shipFrame.scale : 0;
    for (const lamp of this.holdLight.children) lamp.intensity = glow;
  }

  putIn() {
    this.portui.show(this.port.haven);
    this.refreshPort();
    this.logEvent(`Put in at ${this.port.haven.name}`);
  }

  // the two-stage rule (combat.js): foundering is the warning, a second
  // holing while crippled is the wreck. Every way of holing the hull —
  // broadside, ram, monster — lands here.
  sufferHoling(cause) {
    if (this.crippled) {
      this.wreckShip(cause);
    } else {
      this.crippled = true;
      const lost = founderCost(this.gold);
      this.gold -= lost;
      this.hull.hull = CRIPPLED_HULL;
      this.say(`SHE\u2019S FOUNDERING \u2014 the crew heaves ${lost} doubloons of cargo over the side to keep her afloat. `
        + 'She\u2019s CRIPPLED: one more holing and the sea takes her. Make for a port and repair!', 10);
      this.logEvent(`Nearly sunk by ${cause} \u2014 ${lost} doubloons jettisoned to stay afloat`);
    }
  }

  // ---- the wreck (combat.js two-stage rule, stage two) ----
  // Holed through while already crippled: the sea takes her. Everyone lives —
  // the longboat carries the crew, a tithe of the chest, the map and the log
  // to the nearest port — but the hull, the prizes astern and the rest of the
  // gold go down. The wreck drops you a rung on the shipwright's ladder;
  // gold banked in the Locker is untouched (that is the point of the Locker).
  wreckShip(cause) {
    const ll = worldToLatLon(this.ship.x, this.ship.z);
    const port = (this.port || nearestHaven(ll.lat, ll.lon)).haven;
    const sank = this.hullDef.name;
    const spoils = wreckSpoils(this.gold);
    const prizeHands = this.fleet.size() * PRIZE_CREW; // they row clear too
    this.fleet.clear();
    this.gold = spoils.kept;
    const down = prevHull(this.hullId);
    this.setHull(down);
    this.crew = Math.min(down.berths, this.crew + prizeHands);
    // the harbour's patched stake: she sails, but the yard will want coin
    this.hull.rig = 0.75; this.hull.hull = 0.75;
    this.crippled = false;
    // the longboat makes the nearest port; she lies to anchor just offshore
    const w = latLonToWorld(port.lat, port.lon);
    const spot = this.findAnchorage(w.x, w.z) || w;
    this.ship.x = spot.x; this.ship.z = spot.z;
    this.ship.speed = 0; this.ship.rudder = 0;
    if (this.mode === 'ashore') this.boardShip();
    this.navyCool.clear();
    this.lastPrizeId = null;
    this.geoClock = 0; // resample the geography at the new anchorage now
    this.say(`SHE\u2019S GONE \u2014 ${cause} sends the ${sank} down. The longboat pulls for `
      + `${port.name} with every soul aboard and ${spoils.kept} doubloons saved from the chest. `
      + `The harbour stakes you a patched ${down.name.toLowerCase()}. The sea keeps the rest.`, 14);
    this.logEvent(`WRECKED \u2014 ${cause} sank the ${sank}; ${spoils.lost} doubloons and the fleet `
      + `went down. The longboat made ${port.name}; a patched ${down.name} from the harbour`);
    this.persist();
  }

  // nearest honest water to a point — where the wreck's longboat leaves you
  findAnchorage(cx, cz) {
    const ll0 = worldToLatLon(cx, cz);
    if (elevation(ll0.lat, ll0.lon) < -1.2) return { x: cx, z: cz };
    for (let r = 60; r <= 1800; r += 60) {
      for (let a = 0; a < 16; a++) {
        const ang = (a / 16) * Math.PI * 2;
        const x = cx + Math.sin(ang) * r, z = cz + Math.cos(ang) * r;
        const ll = worldToLatLon(x, z);
        if (elevation(ll.lat, ll.lon) < -1.2) return { x, z };
      }
    }
    return null;
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
    // NOTE: applyQuality never persists — the old always-write here is what
    // turned a default into a false "choice". Only the V key (a real choice)
    // and the watchdog (auto-plain) write saltstead-gfx2.
  }

  // V — the player's own hand on the graphics: toggles fine/plain, stores
  // the choice, and stands the tier watchdog down (a chosen tier is never
  // second-guessed; the pixel-shed stays armed either way)
  toggleQuality() {
    const next = this.gfxQuality === 'fine' ? 'plain' : 'fine';
    this.applyQuality(next);
    this.gfxWatch.manual = true;
    this.gfxWatch.frames.length = 0; this.gfxWatch.span = 0;
    try { localStorage['saltstead-gfx2'] = next; } catch { /* private mode */ }
    this.say(`Graphics: ${next.toUpperCase()} — your choice, remembered (V to change back)`, 5);
  }

  // the fps watchdog (gfxprobe.js): after the opening settle, judge each
  // window's median frame rate and ease DOWN if the timbers can't carry it —
  // to plain first (remembered as auto-plain), then to fewer pixels. Never
  // up: upgrades are the player's (V).
  watchFrame(rawDt) {
    const gw = this.gfxWatch;
    gw.t += rawDt;
    if (gw.t < SETTLE_S || this.photoCam || rawDt <= 0 || rawDt > 0.5) return;
    gw.frames.push(1 / rawDt);
    gw.span += rawDt;
    if (gw.span < WINDOW_S) return;
    const verdict = fpsVerdict(this.gfxQuality, median(gw.frames));
    gw.frames.length = 0; gw.span = 0;
    if (verdict === 'drop-plain' && !gw.manual) {
      this.applyQuality('plain');
      try { localStorage['saltstead-gfx2'] = 'auto-plain'; } catch { /* private mode */ }
      this.say('The sea eases off for this ship’s timbers — graphics dropped to PLAIN (V to override)', 8);
      this.logEvent('Graphics eased to plain — the frame could not hold');
    } else if (verdict === 'drop-pixels' && !gw.pixelDropped) {
      gw.pixelDropped = true;
      // a DPR-1 screen has no ratio to shed — go to three-quarters instead
      const cur = this.renderer.getPixelRatio();
      this.renderer.setPixelRatio(cur > 1 ? 1 : 0.75);
      this.say('Fewer pixels, truer wind — resolution eased for smooth sailing', 6);
    }
  }

  // T is the tiller, from anywhere on deck — the captain runs aft. T again
  // hands it back. It also slams the port panel shut: T ALWAYS means "sail" —
  // even from the hold: he takes the ladder at a run.
  toggleTiller() {
    if (this.portui.open) this.portui.hide();
    if (this.mode === 'helm') { this.mode = 'walk'; this.cam.targetDist = 8; return; }
    if (this.mode === 'below') this.goUp();
    if (this.mode !== 'walk') return; // ashore: the tiller is back on the ship
    this.mode = 'helm';
    this.cap.x = this.shipFrame.helm.x; this.cap.z = this.shipFrame.helm.z + 0.6;
    this.cap.facing = 0; // face the bow
    // a longer hull needs a longer look — and the look must clear the main
    // truck: the flag overhead is the point of the whole livery
    this.cam.targetDist = 15 + this.spec.length * 1.3;
  }

  // E is the DOING key — board, capture, dig, dive, bank, step ashore, put
  // in at port. The tiller lives on T alone, so E can never trap you off it.
  onE() {
    if (this.portui.open) { this.portui.hide(); return; }
    if (this.mode === 'below') { this.goUp(); return; } // the hold has one door
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
    if (this.rescueReady && this.rescueReady.length) { this.rescueSurvivors(); return; }
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
    if (this.fountainReady) { this.drinkFountain(); return; }
    if (this.bankReady) { this.bankTreasure(); return; }
    if (this.port && inAnchorage(this.port.dist, this.ship.speed)) { this.putIn(); return; }
    if (this.canGoBelow()) { this.goBelow(); return; }
    if (this.canStepAshore()) { this.goAshore(); return; }
  }

  // ---- below decks (shipframe.js holdFor, ship.js buildBelowDecks) ----
  // standing on the hatch grating, on a hull that HAS a hold
  canGoBelow() {
    if (this.mode !== 'walk' || !this.hullDef.below) return false;
    const H = holdFor(this.spec);
    return Math.hypot(this.cap.x - H.hatch.x, this.cap.z - H.hatch.z)
      <= 1.3 * this.shipFrame.scale;
  }

  goBelow() {
    this.holdFrame = holdFor(this.spec);
    this.mode = 'below';
    this.cap.x = this.holdFrame.hatch.x;
    this.cap.z = this.holdFrame.hatch.z;
    this.cam.targetDist = 3.4;
    this.setHoldLight(true);
    this.say('Down the companionway \u2014 the hold smells of tar, salt beef and powder', 4);
  }

  goUp() {
    const H = this.holdFrame || holdFor(this.spec);
    this.mode = 'walk';
    this.cap.x = H.hatch.x;
    this.cap.z = H.hatch.z;
    this.cam.targetDist = 8;
    this.setHoldLight(false);
  }

  // ---- the warden's writ (identity.js isWarden) ----
  // The harbourmaster materialises any class of ship under his own boots —
  // Y walks the whole ladder, top rung wraps to the sloop. Warden only;
  // for everyone else the key does nothing at all.
  wardenMaterialise() {
    if (!this.warden || this.portui.open) return;
    if (this.mode === 'ashore') { this.say('Come back aboard first, Warden', 3); return; }
    const i = HULLS.findIndex((h) => h.id === this.hullId);
    const def = HULLS[(i + 1) % HULLS.length];
    this.setHull(def);
    this.hull.rig = 1; this.hull.hull = 1;
    this.crippled = false;
    this.say(`THE WARDEN\u2019S WRIT \u2014 a ${def.name.toUpperCase()} materialises beneath you `
      + `(${def.guns} gun${def.guns > 1 ? 's' : ''} a side, ${def.berths} berths)`, 6);
    this.logEvent(`The warden's writ raised a ${def.name} from the sea`);
    this.persist();
  }

  // C — belay the set course: the helm is lashed, the captain has the ship
  belayCourse() {
    if (!this.course) return;
    this.course = null;
    this.route = null;
    this.routeLeg = 0;
    this.maps.course = null;
    this.say('BELAY THAT — the course is struck; the helm is lashed on the last heading', 5);
  }

  // ---- the signal rocket (faction.js) — the NAVY's institutional edge ----
  // G, with a raider in sight: corvettes within signalRange are given her
  // as their quarry and converge; if fewer than signalMax answer, the
  // Admiralty sends one over the horizon (merchantlayer.spawnEscort). The
  // pirate has no rocket — nobody comes when the black flag whistles.
  signalSquadron() {
    if (this.faction !== 'navy') return; // the key does nothing for a pirate
    if (this.t < this.signalCool) { this.say('The signal locker is bare — give the rocket a minute', 3); return; }
    const raider = this.merchants.nearestHostile(this.ship.x, this.ship.z, 'raider');
    if (!raider || raider.dist > LOOKOUT_R) {
      this.say('No pirate in sight to signal about — the rocket keeps for a real chase', 4);
      return;
    }
    this.signalCool = this.t + 45;
    const plan = signalAnswer(this.merchants.sails(), this.ship.x, this.ship.z,
      this.fac.signalRange, this.fac.signalMax);
    for (const id of plan.converge) this.assist.set(id, raider.id);
    let answered = plan.converge.length;
    if (plan.spawn) {
      const b = escortBerth(this.ship.x, this.ship.z, this.lootSeed + this.shotSeed);
      const id = this.merchants.spawnEscort(b.x, b.z,
        Math.atan2(raider.m.x - b.x, raider.m.z - b.z));
      this.assist.set(id, raider.id);
      answered++;
    }
    this.say(`THE ROCKET GOES UP — ${answered} of the squadron answer${answered === 1 ? 's' : ''}, `
      + `converging on the pirate to the ${compassPoint(this.ship.x, this.ship.z, raider.m.x, raider.m.z)}`, 7);
    this.logEvent(`Signalled the squadron — ${answered} sail answered against a raider`);
  }

  // ---- the ground tackle (anchor.js) ----
  // Q lets go or weighs. The cable needs bottom it can find (CABLE_DEPTH)
  // and not too much way on her; riding to it she stops dead over the
  // ground and swings head to wind. The one honest way to PARK at sea.
  toggleAnchor() {
    if (this.mode === 'ashore' || this.portui.open) return;
    if (this.anchorDown) {
      this.anchorDown = false;
      this.setAnchor(false);
      this.say('ANCHOR\u2019S AWEIGH \u2014 the hands walk the capstan and she\u2019s free', 4);
      this.persist();
      return;
    }
    const ll = worldToLatLon(this.ship.x, this.ship.z);
    const depth = -elevation(ll.lat, ll.lon);
    const call = canLetGo(depth, this.ship.speed);
    if (!call.ok) {
      this.say(call.why === 'deep'
        ? `NO BOTTOM \u2014 the lead finds nothing here (the cable is good to ${CABLE_DEPTH} m; work into soundings near a coast)`
        : 'Too much way on her \u2014 luff up and slow below ~8 knots before you let go', 5);
      return;
    }
    this.anchorDown = true;
    this.setAnchor(true);
    this.say('LET GO! The cable roars out the hawse \u2014 she snubs round and rides to her anchor', 5);
    this.logEvent('Let go the anchor');
    this.persist();
  }

  // ---- the guns (combat.js) ----
  toggleShot() {
    this.shotKind = this.shotKind === 'round' ? 'chain' : 'round';
    this.say(this.shotKind === 'round'
      ? 'ROUND SHOT loaded \u2014 hole her hull, send her down'
      : 'CHAIN SHOT loaded \u2014 tear her rig, slow her', 4);
  }

  // world position of the firing side's rail, for the theatre; slot spaces
  // the guns down the rail on hulls that mount more than one a side
  muzzlePos(side, slot = 0) {
    const D = this.shipFrame.deck;
    const posts = gunPosts(D, this.shipFrame.scale, this.hullDef.guns);
    const m = localToWorld(this.ship, side * (D.maxX + 0.35 * this.shipFrame.scale), 0,
      posts[Math.min(slot, posts.length - 1)]);
    return { x: m.x, y: this.shipGroup.position.y + D.y + 0.36 * this.shipFrame.scale, z: m.z };
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
          if (w.fled && this.dragonZone === 'roc') {
            // no crag hoard for the Roc: driven off, she drops what her
            // talons tore from the last ship that fought back
            this.gold += ROC_GOLD;
            this.won.push('roc');
            this.say(`A TELLING HIT \u2014 THE ROC screams and drops her plunder: ${ROC_GOLD} doubloons rain into the sea beside you!`, 8);
            this.logEvent(`Drove off the Roc \u2014 ${ROC_GOLD} doubloons of dropped plunder`);
            this.persist();
          } else {
            this.say(w.fled
              ? 'A TELLING HIT \u2014 she shrieks and breaks for her crag in Snowdonia!'
              : `A hit! The ${this.dragonZone === 'roc' ? 'Roc' : 'dragon'} staggers in the air (${this.dragon.hp} more will do it)`, 5);
            if (w.fled) this.logEvent('Wounded Y Ddraig Goch \u2014 she fled to her crag');
          }
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
    if (target.ghost) {
      this.shotSeed++;
      this.combatFx.fire(this.muzzlePos(b.side),
        { x: this.ship.x + target.dx, z: this.ship.z + target.dz }, true);
      this.say('The broadside passes CLEAN THROUGH her \u2014 iron means nothing to the dead. Board her.', 6);
      return;
    }
    // the whole broadside goes at once: every gun on the bearing side rolls
    // its own ball (the shipwright's ladder is felt right here)
    let hits = 0, sank = false, lastDmg = null;
    for (let g = 0; g < this.hullDef.guns && !sank; g++) {
      this.shotSeed++;
      const hit = rollHit(this.shotSeed, target.dist);
      const aim = {
        x: target.e.m.x + (hit ? 0 : (this.shotSeed % 2 ? 18 : -14)),
        z: target.e.m.z + (hit ? 0 : (this.shotSeed % 3 ? 12 : -16)),
      };
      this.combatFx.fire(this.muzzlePos(b.side, g), aim, !hit);
      if (!hit) continue;
      const r = this.merchants.applyShotTo(target.id, this.shotKind);
      if (!r) break;
      hits++;
      lastDmg = r.dmg;
      if (r.sinking) sank = true;
    }
    if (sank) {
      this.say(target.e.m.looted
        ? 'She goes down by the stern \u2014 an empty hull for the fishes'
        : 'HOLED THROUGH \u2014 she\u2019s going down! Most of her cargo goes with her\u2026', 6);
      this.logEvent('Sank her with round shot');
    } else if (!hits) {
      this.say(this.hullDef.guns > 1 ? 'Short \u2014 the sea takes every ball' : 'Short \u2014 the sea takes the ball', 3);
    } else if (this.shotKind === 'chain') {
      this.say(`Chain tears through her rig \u2014 sails in ribbons (rig ${(lastDmg.rig * 100).toFixed(0)}%)`
        + (hits > 1 ? ` \u2014 ${hits} balls told` : ''), 4);
    } else {
      this.say(`A hit on the waterline (hull ${(lastDmg.hull * 100).toFixed(0)}%)`
        + (hits > 1 ? ` \u2014 ${hits} balls told` : ''), 4);
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
        const crew = prize.m.type === 'raider' ? 'her cut-throats' : 'her marines';
        this.say(battle.losses > 0
          ? `REPELLED \u2014 ${crew} hold the rail; ${battle.losses} of your hands lost. She breaks off.`
          : `REPELLED \u2014 ${crew} hold the rail. She breaks off the fight.`, 7);
        this.logEvent(`Boarded ${prize.m.type === 'raider' ? 'a pirate raider' : 'a navy corvette'} and was repelled`);
        this.persist();
        return;
      }
      this.say(battle.losses > 0
        ? `Her deck is YOURS \u2014 it cost ${battle.losses} hand${battle.losses > 1 ? 's' : ''}\u2026`
        : 'Her deck is YOURS \u2014 the marines throw down their arms!', 5);
    }

    this.merchants.strip(prize.id);
    this.lastPrizeId = prize.id; // the capture window opens
    // the pirate's edge: a lawless crew strips a prize to her bones
    const roll = lootRoll(this.lootSeed, type.goldMult);
    roll.gold = Math.round(roll.gold * this.fac.plunderMult);
    this.gold += roll.gold;
    const name = {
      trader: 'a merchantman', indiaman: 'an INDIAMAN', navy: 'a navy corvette',
      raider: 'a PIRATE RAIDER', derelict: 'a derelict',
    }[prize.m.type] || 'a merchantman';
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

  // haul the swimmers out of the water (survivors.js): each soul made up
  // their own mind about your flag in the water — joiners sign articles on
  // the spot (berths allowing); the rest press a grateful purse on you and
  // work their passage to the next port
  rescueSurvivors() {
    const souls = this.merchants.rescue(this.rescueReady);
    this.rescueReady = [];
    if (!souls.length) return;
    let joined = 0, grateful = 0;
    for (const s of souls) {
      if (s.join && this.crew < this.hullDef.berths) { this.crew++; joined++; } else { grateful++; }
    }
    const purse = grateful * GRATITUDE;
    this.gold += purse;
    let msg = `${souls.length} soul${souls.length > 1 ? 's' : ''} hauled from the water`;
    if (joined) msg += ` — ${joined} sign${joined === 1 ? 's' : ''} articles on the spot`;
    if (grateful) msg += `${joined ? ';' : ' —'} ${grateful} press${grateful === 1 ? 'es' : ''} a grateful ${purse} doubloons on you and ask${grateful === 1 ? 's' : ''} for the next port`;
    this.say(msg, 8);
    this.logEvent(msg);
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

  // the Fountain of Youth: the sweet water mends hull, rig, and the
  // crippled flag — once a visit; the fountain remembers greedy captains
  drinkFountain() {
    this.hull.rig = 1;
    this.hull.hull = 1;
    this.crippled = false;
    this.fountainUsed = true;
    this.say('The crew hauls casks of the SWEET WATER aboard — seams close, canvas mends, the ship is YOUNG again', 9);
    this.logEvent('Drank of the Fountain of Youth at Bimini — the ship made whole');
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
      'maelstrom': 'THE MAELSTROM \u2014 the one the word comes from. Ride the rim; the core takes rigs',
      'charybdis': 'CHARYBDIS \u2014 she swallowed six of Odysseus\u2019s men. The rim is the fastest water in the Mediterranean',
      'sirens': 'THE SIRENS\u2019 water \u2014 the wind itself forgets to blow. Keep way on her if you can',
      'umibozu': 'The UMIB\u014cZU\u2019s sea \u2014 say nothing, touch nothing, sail through. The wind dies where it watches',
      'roc': 'The Roc\u2019s sky, north of Madagascar \u2014 a wingspan that shadows the DECK. Watch above',
      'leviathan': 'The Red Sea. Scripture wrote a monster here and the scripture was RIGHT',
      'white-whale': 'Mocha Island \u2014 the White Whale\u2019s water. She RAMS trespassers. You are trespassing',
      'mary-celeste': 'The GHOST FLEET \u2014 sails set, cargo whole, crews gone. The salvage nobody dares',
      'fountain-of-youth': 'Bimini \u2014 the sweet water. Heave to over the spring and E mends the ship',
      'selkie-skerries': 'The SELKIE SKERRIES \u2014 ride to anchor through a night; one may sign your articles',
      'cape-horn': 'CAPE HORN \u2014 no myth, which is the horror of it. The williwaws never stop',
      'ryugu': 'RY\u016aG\u016a-J\u014c \u2014 the Dragon Palace under the sea. Heave to and E dives for the tribute',
      'plate-fleet': 'The 1715 PLATE FLEET \u2014 Spanish silver on the seabed below. Heave to and E sends the divers down',
      'el-dorado': 'The Amazon\u2026 upriver, they say, a city of GOLD. Anchor and E mounts the expedition',
    };
    const line = lines[legend.id];
    if (line) this.say(line, 9);
    this.logEvent(`Entered the waters of ${legend.name}`);
  }

  frame() {
    const now = performance.now();
    const rawDt = (now - this.last) / 1000; // unclamped — the watchdog's truth
    const dt = Math.min(0.05, rawDt);
    this.last = now;
    this.watchFrame(rawDt);
    this.t += dt;
    const t = this.t, k = this.keys;
    const skyT = t + this.dayStart;
    const sol = solarState(skyT); // the sky rules the Dutchman and the sights
    this.lastNight = sol.nightness > 0.5; // the crew's brains know the hour

    // dusk to dawn, every living ship hangs a lantern at the masthead —
    // yours throws real light on the sails, the rest burn as far-off points
    // (fog-proof, so a sail at night is FOUND by her light)
    const lanternsUp = sol.dayness < 0.42;
    this.setLantern(lanternsUp);
    this.mastLight.intensity += ((lanternsUp ? 14 : 0) - this.mastLight.intensity)
      * Math.min(1, dt * 2);

    // a living wind: direction breathes AROUND the base bearing (bounded, so
    // it can never spin onto the bow and stall the game), strength gusts.
    // The base itself is REAL weather when open-meteo answers (geo block
    // below), and the wind BUILDS offshore: sheltered inshore, near double
    // in blue water — stacked with the gait, a crossing genuinely flies.
    // the wind field (wind.js): trades, westerlies, doldrums by latitude,
    // breathing a little around the bearing so it never sits dead on the bow
    const wf = windAt(this.ship.x, this.ship.z);
    this.wind.from = wf.from + 0.3 * Math.sin(t * 0.011) + 0.12 * Math.sin(t * 0.037);
    const gusts = 0.3 * Math.sin(t * 0.07) + 0.15 * Math.sin(t * 0.21);
    // over land the ship is on a river: sheltered inshore wind, not the
    // blue-water build the raw sea-coast distance would claim
    this.wind.speed = windProfile(this.overLand ? 0 : this.coastDist, wf.speed * (1 + gusts));
    // the Horn: the williwaws never stop — whatever the forecast says
    if (this.zone && STORM_ZONES.includes(this.zone.legend.id)) {
      this.wind.speed *= STORM_WIND_MULT;
    }

    // the sea takes the wind's shape, eased so the swell never pops. Over
    // land the water is a RIVER: sheltered to near-flat whatever the wind,
    // and it settles quickly — a mouth crossed at gait should calm in a few
    // boat-lengths, not half the estuary
    const swellWant = this.overLand ? RIVER_STATE : seaStateFor(this.wind.speed);
    this.swell += (swellWant - this.swell) * Math.min(1, dt * (this.overLand ? 0.35 : 0.05));
    setSeaState(this.swell);

    if (this.mode === 'helm') {
      const rt = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
      this.ship.rudder += (rt - this.ship.rudder) * Math.min(1, dt * 5);
      if (k.has('KeyW')) this.ship.trim = Math.max(0, this.ship.trim - dt * 0.45);
      if (k.has('KeyS')) this.ship.trim = Math.min(1, this.ship.trim + dt * 0.45);
    } else if (this.course && this.route && this.crew >= 1 && !this.anchorDown && !this.aground) {
      // THE HELMSMAN (helmsman.js + lanes.js, verify-gated): a hand steers the
      // ROUTE laid from the chart — through the fast water and WITH the wind,
      // rudder for the mark, trim for the point of sail, tacking upwind — while
      // the captain walks the deck, works the guns, or goes below. The captain
      // at the wheel (T) always overrides; the anchor and the sand always win.
      // the hand at the wheel is only as good as the watch you can muster: a
      // lone hand pinches, a full crew sails near-optimal (helmsman.js skill)
      const helmSkill = Math.max(0.6, Math.min(1, 0.55 + 0.06 * this.crew));
      const order = helmRoute({ yaw: this.ship.yaw, x: this.ship.x, z: this.ship.z },
        this.route, this.routeLeg, this.wind.from, t, helmSkill);
      this.routeLeg = order.next;
      if (order.arrived) {
        this.say('THE MARK IS MADE — the helmsman heaves to and hands you the ship', 7);
        this.logEvent('The helmsman made the set course');
        this.course = null;
        this.route = null;
        this.maps.course = null;
        this.ship.trim = 0;
      } else {
        this.ship.rudder += (order.rudder - this.ship.rudder) * Math.min(1, dt * 4);
        this.ship.trim += (order.trim - this.ship.trim) * Math.min(1, dt * 0.8);
      }
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
      // inside the coastline polygons the ship is river-sailing, however far
      // the SEA coast is: no blue-water gait up the Amazon, and the ground
      // is always live under her keel
      this.overLand = isLand(ll.lat, ll.lon);
      this.port = nearestHaven(ll.lat, ll.lon);
      // the sloop's bolt-hole: water too thin for a warship's keel — a
      // hunting corvette breaks off rather than follow you over the shoal
      this.shoalWater = elevation(ll.lat, ll.lon) > NAVY_SHOAL;
      // the legends layer wakes by geography: which zone are we inside?
      const wasZone = this.zone && this.zone.legend.id;
      this.zone = legendAt(ll.lat, ll.lon);
      if (this.zone && this.zone.legend.id !== wasZone) this.enterZone(this.zone.legend);
      if (!this.zone && this.diveN > 0) this.diveN = 0; // a fresh visit, fresh wrecks
    }
    // the trade lanes live: merchants stream, sail, flee, and count as
    // contacts — each sail reading the player's FLAG (faction.js), and any
    // corvette under signal orders hunting her handed quarry instead
    this.merchants.update(t, dt, this.ship.x, this.ship.z, this.wind.from,
      this.shoalWater, lanternsUp, this.faction,
      /* latAbs for the swimmers' clock rides after quarryOf */ (id) => {
        const rid = this.assist.get(id);
        if (!rid) return null;
        const target = this.merchants.live.get(rid);
        if (!target || target.sinkT !== null || target.m.routed || target.m.looted) {
          this.assist.delete(id); // the chase is over, resume the patrol
          return null;
        }
        return { x: target.m.x, z: target.m.z };
      }, Math.abs(worldToLatLon(this.ship.x, this.ship.z).lat));

    // the sea keeps its account of the ignored: swimmers the fins found
    {
      const taken = this.merchants.consumeTaken();
      if (taken > 0) {
        const warm = Math.abs(worldToLatLon(this.ship.x, this.ship.z).lat) < 42;
        this.say(warm
          ? `The fins closed in — ${taken > 1 ? 'the swimmers are' : 'the swimmer is'} gone`
          : 'The cold sea took the swimmers', 6);
        this.logEvent(warm ? 'The sharks took the swimmers' : 'The sea took the swimmers');
      }
    }

    // the squadron works its guns: an assisting corvette in range of her
    // raider throws real broadsides (the same dice the corvette rolls at a
    // pirate player) — the navy's edge is OTHER SHIPS fighting your fight
    for (const [aid, rid] of this.assist) {
      const cor = this.merchants.live.get(aid);
      const rdr = this.merchants.live.get(rid);
      if (!cor || cor.sinkT !== null) { this.assist.delete(aid); continue; }
      if (!rdr || rdr.sinkT !== null) { this.assist.delete(aid); continue; }
      const d = Math.hypot(cor.m.x - rdr.m.x, cor.m.z - rdr.m.z);
      this.assistCool.set(aid, (this.assistCool.get(aid) ?? 2) - dt);
      if (d < GUN_RANGE && (this.assistCool.get(aid) ?? 0) <= 0) {
        this.assistCool.set(aid, NAVY_RELOAD);
        this.shotSeed++;
        const hit = rollHit(this.shotSeed, d);
        const from = { x: cor.m.x, y: this.shipGroup.position.y + 1.6, z: cor.m.z };
        const aim = hit ? { x: rdr.m.x, z: rdr.m.z }
          : { x: rdr.m.x + (this.shotSeed % 2 ? 18 : -15), z: rdr.m.z + (this.shotSeed % 3 ? -12 : 16) };
        this.combatFx.fire(from, aim, !hit);
        if (hit) {
          const r = this.merchants.applyShotTo(rid, unit2(this.shotSeed * 1.3, 7.7) < 0.5 ? 'chain' : 'round');
          if (r && r.sinking) {
            this.say('The squadron’s guns tell — the raider is GOING DOWN', 6);
            this.logEvent('A signalled corvette sank a raider');
          }
        }
      }
    }

    // the lookout sings out each sail ONCE as she comes in view from the
    // tops (LOOKOUT_R reaches far past the deck fog — that's the tops'
    // whole job), one hail at a time so a busy sea doesn't shout you down
    if (this.t > (this.hailCool || 0)) {
      for (const s of this.merchants.sails()) {
        if (this.hailed.has(s.id) || s.looted) continue;
        if (Math.hypot(s.x - this.ship.x, s.z - this.ship.z) > LOOKOUT_R) continue;
        this.hailed.add(s.id);
        this.hailCool = this.t + 8;
        const what = {
          trader: 'merchant sail', indiaman: 'an INDIAMAN, deep-laden',
          navy: 'a NAVY corvette', raider: 'a PIRATE \u2014 she flies the black',
          derelict: 'a dead ship adrift',
        }[s.type] || 'a sail';
        const hunter = this.fac.hostileType;
        const tail = s.type === hunter ? ' \u2014 mind her guns'
          : s.type === 'raider' && this.faction === 'navy' ? '' // covered by the hunter line
            : s.type === 'derelict' ? ' \u2014 salvage for the taking'
              : (s.type === 'trader' || s.type === 'indiaman') && this.faction === 'navy'
                ? ' \u2014 she dips her colours to the King' : '';
        this.say(`SAIL HO! ${what} to the `
          + `${compassPoint(this.ship.x, this.ship.z, s.x, s.z)}${tail}`, 6);
        break;
      }
    }

    // your side's hunter works her guns: the King's corvettes at a pirate,
    // the raiders at a King's ship — whoever she is, she shoots FIRST
    {
      const hostile = this.merchants.nearestHostile(this.ship.x, this.ship.z, this.fac.hostileType);
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
            const her = this.fac.hostileType === 'raider' ? 'a raider' : 'a corvette';
            if (isSinking(this.hull)) {
              this.sufferHoling(`${her}\u2019s broadside`);
            } else {
              this.say(kind === 'chain'
                ? `CHAIN SHOT rips your rig (${(this.hull.rig * 100).toFixed(0)}%) \u2014 R for chain, F to answer her`
                : `A ball strikes your hull (${(this.hull.hull * 100).toFixed(0)}%) \u2014 she means to SINK you`, 5);
            }
          }
        }
      }
    }

    // hull meets hull (collide.js): capsule contact with every live ship
    // nearby — hulls shoulder apart, the way comes off both, and a hard ram
    // wounds through the same damage states a broadside uses
    {
      const me = { x: this.ship.x, z: this.ship.z, yaw: this.ship.yaw, speed: this.ship.speed };
      for (const [id, e] of this.merchants.live) {
        if (e.sinkT !== null) continue;
        if (Math.abs(e.m.x - me.x) > 60 || Math.abs(e.m.z - me.z) > 60) continue;
        const hit = collideShips(me, this.spec, e.m, e.spec);
        if (!hit) continue;
        const push = hit.depth * 0.55;
        this.ship.x += hit.nx * push; this.ship.z += hit.nz * push;
        e.m.x -= hit.nx * push; e.m.z -= hit.nz * push;
        this.ship.speed *= 0.72; e.m.speed *= 0.72;
        const sev = ramSeverity(hit.closing);
        if (sev > 0 && this.t > (this.ramCool || 0)) {
          this.ramCool = this.t + 1.2;
          // both bows pay, the lighter hull pays more — mass by length
          const share = e.spec.length / (this.spec.length + e.spec.length);
          this.hull.hull = Math.max(0, this.hull.hull - 0.55 * sev * share);
          const r = this.merchants.ram(id, sev * (1 - share) * 1.6);
          this.logEvent('Collision at sea \u2014 the carpenter is not pleased');
          if (isSinking(this.hull)) {
            this.sufferHoling('a collision at sea');
          } else if (r && r.sinking) {
            this.say('COLLISION \u2014 your bow stove her side clean in. She\u2019s going down!', 6);
          } else {
            this.say(`COLLISION \u2014 the hulls grind apart (your hull ${(this.hull.hull * 100).toFixed(0)}%)`, 5);
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

    // the ghost of the Cape: a filthy night raises her (dutchmanSails) — and with
    // procedural storms deferred to a later plan, she also haunts her own Cape
    // waters after dark, so the legend stays reachable until storms drive the sky
    const inCape = this.zone && this.zone.legend.id === 'flying-dutchman';
    const dutchOn = !this.dutchmanTaken
      && (dutchmanSails(this.weatherState, sol.nightness) || (inCape && sol.nightness > 0.4));
    this.legendFx.update(t, this.ship.x, this.ship.z, dutchOn);

    // wildlife reads the waters: gulls inshore, dolphins offshore, the
    // albatross in blue water, a fin in the warm shallows
    {
      const wll = worldToLatLon(this.ship.x, this.ship.z);
      this.wildlife.update(t, dt, this.ship.x, this.ship.z,
        this.shipGroup.position.y + 11, this.ship.speed, this.coastDist, Math.abs(wll.lat),
        this.ship.yaw, this.shipFrame.scale, this.merchants.wrecks(),
        !!(this.zone && this.zone.legend.id === 'white-whale'));
    }
    const allContacts = this.contacts.concat(this.merchants.contacts())
      .concat(this.legendFx.contacts());

    // meeting another ship kills the fair current — you slow to hailing speed
    let contactDist = Infinity;
    for (const c of allContacts) {
      contactDist = Math.min(contactDist, Math.hypot(c.x - this.ship.x, c.z - this.ship.z));
    }
    // river-sailing is inshore sailing wherever the sea coast is: over land
    // the fair current dies and she moves at human scale
    let gait = encounterGait(gaitFactor(this.overLand ? 0 : this.coastDist), contactDist);
    this.shipSighted = contactDist < ENCOUNTER_FAR;
    this.lastGait = gait; // the crew's brains tell the truth about the current

    // THE HELM WATCH (helmwatch.js): while a hand sails the set course, hail on a
    // contact (SOFT — she keeps sailing) and heave to for a hazard (HARD — she
    // hands you the ship). Only acts on a change, so it never spams.
    if (this.course && this.route && this.crew >= 1) {
      const hb = helmWatch({
        kraken: !!this.kraken,
        inTriangle: !!(this.zone && this.zone.legend.id === 'bermuda-triangle'),
        aground: this.aground,
        overLand: this.overLand,
        coastDist: this.coastDist,
        nearPort: !!(this.port && this.port.dist < 3000),
        shoal: this.shoalWater,
        contactDist,
      });
      if (hb.mode !== this.handbackMode || hb.reason !== this.handbackReason) {
        this.handbackMode = hb.mode; this.handbackReason = hb.reason;
        if (hb.mode === 'hard') {
          this.say(`THE HELMSMAN HEAVES TO — ${hb.reason}. Take the helm (T).`, 8);
          this.logEvent(`The helmsman handed back the ship: ${hb.reason}`);
          this.course = null; this.route = null; this.maps.course = null; this.ship.trim = 0;
        } else if (hb.mode === 'soft') {
          this.say(hb.reason, 6);
        }
      }
    } else {
      this.handbackMode = null; this.handbackReason = '';
    }

    // ---- the monsters wake (monsters.js) ----
    const zoneId = this.zone && this.zone.legend.id;
    if (KRAKEN_ZONES.includes(zoneId) && !this.kraken && !this.krakenDone && this.coastDist > 600) {
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
    if (DRAGON_ZONES.includes(zoneId) && !this.dragon && !this.won.includes(zoneId)) {
      this.dragon = newDragon();
      this.dragonZone = zoneId; // which sky-boss this is (wales dragon / the Roc)
      this.say(zoneId === 'roc'
        ? 'A shadow the size of a MAINSAIL crosses the deck \u2014 THE ROC is over you! F when she stoops \u2014 and mind your rig!'
        : 'A shadow crosses the deck \u2014 Y DDRAIG GOCH circles above! She\u2019s only in gunshot when she STOOPS \u2014 F when she dives!', 9);
      this.logEvent(zoneId === 'roc'
        ? 'The Roc rose off Madagascar and circled the masthead'
        : 'A dragon rose from Snowdonia and circled the masthead');
    }
    if (this.dragon && !dragonGone(this.dragon)) {
      if (!DRAGON_ZONES.includes(zoneId)) {
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
      this.ship.speed * gait, this.wind.from, lanternsUp);

    // the rescue window: souls in the water within reach, way nearly off —
    // hauling swimmers out ranks above every other use of E (their clock runs)
    this.rescueReady = this.ship.speed < 2.5
      ? this.merchants.survivorsNear(this.ship.x, this.ship.z, RESCUE_R) : [];

    // boarding window: alongside a prize with speed matched — the boarding
    // law is your flag's (faction.js): the navy never plunders the trade
    const prize = this.merchants.nearestPrize(this.ship.x, this.ship.z,
      (type) => canBoardType(type, this.faction));
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
    this.diveReady = DIVE_ZONES.includes(zoneId) && heaveTo;
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
    // the Fountain of Youth: heave to over the spring and the sea mends her
    // — once a visit (the flag resets when you leave the zone)
    if (zoneId !== this.lastZoneId) { this.fountainUsed = false; this.lastZoneId = zoneId; }
    this.fountainReady = zoneId === 'fountain-of-youth' && heaveTo && !this.fountainUsed
      && (this.hull.rig < 1 || this.hull.hull < 1 || this.crippled);
    // the Selkie Skerries: ride to anchor through the night and one comes
    if (zoneId === 'selkie-skerries' && this.anchorDown && sol.nightness > 0.5
      && !this.selkieJoined && this.crew < this.hullDef.berths) {
      this.selkieDwell = (this.selkieDwell || 0) + dt;
      if (this.selkieDwell > SELKIE_DWELL_S) {
        this.selkieJoined = true;
        this.crew++;
        this.say('A dark head watches from the skerries… a SELKIE sheds her sealskin and signs your articles — the finest hand on any water', 10);
        this.logEvent('A selkie of the Orkney skerries signed articles by night');
        this.persist();
      }
    } else {
      this.selkieDwell = 0;
    }
    // the White Whale: trespass in her water and she charges on her clock
    if (zoneId === 'white-whale') {
      this.whaleRamT = (this.whaleRamT || 0) + dt;
      if (this.whaleRamT > WHALE_RAM_S && this.coastDist > 200) {
        this.whaleRamT = 0;
        this.hull.hull = Math.max(0, this.hull.hull - WHALE_RAM_HULL);
        this.ship.speed *= 0.5;
        if (isSinking(this.hull)) {
          this.sufferHoling('the White Whale’s ram');
        } else {
          this.say(`THE WHITE WHALE — she STOVE the bow! (hull ${(this.hull.hull * 100).toFixed(0)}%) — leave her water or feed her more planking`, 8);
          this.logEvent('The White Whale rammed the ship off Mocha Island');
        }
      }
    } else {
      this.whaleRamT = 0;
    }
    // the dragon's crag: she fled there wounded; step ashore under Snowdon
    this.hoardReady = false;
    if (this.mode === 'ashore' && this.dragon && dragonGone(this.dragon)
      && !this.won.includes('dragons-wales')) {
      const crag = zoneOf('dragons-wales');
      this.hoardReady = Math.hypot(this.shore.x - crag.x, this.shore.z - crag.z) < HOARD_REACH;
    }

    const px = this.ship.x, pz = this.ship.z;
    // the port panel furls the sails (so she doesn't sail off mid-trade),
    // and so does riding to an anchor — the hands hand the canvas the
    // moment the cable takes her weight
    const furled = this.portui.open || this.anchorDown;

    // what the hull can actually DO this frame: battle damage caps her,
    // the Kraken's grip drags her, and over the trench the wind itself dies.
    // The black flag's individual edge rides here too (faction.js): a
    // lawless hull sails faster than her rated class.
    let hullFactor = speedFactor(this.hull) * this.fac.speedMult;
    if (this.kraken) hullFactor *= krakenDrag(this.kraken);
    let windEff = this.wind;
    if (DEADAIR_ZONES.includes(zoneId)) {
      // the trench, the sirens' song, the umibōzu's dread — three waters,
      // one becalming: the sails hang dead toward the heart of the zone
      windEff = { from: this.wind.from, speed: this.wind.speed * deadAir(this.zone.dist, this.zone.r) };
    }
    const specEff = hullFactor === 1
      ? this.spec
      : { ...this.spec, maxSpeed: this.spec.maxSpeed * hullFactor };
    // the fair current sets her while she sails the open sea (currents.js) — not
    // while furled at anchor or in port, aground, or river-sailing inshore
    const setDrift = (furled || this.aground || this.overLand)
      ? { vx: 0, vz: 0 } : currentAt(this.ship.x, this.ship.z);
    stepShip(this.ship, windEff, dt, specEff, gait, furled,
      this.oars && !this.anchorDown ? oarSpeed(this.spec, this.crew) : 0, setDrift);
    // the world wraps east-west: fold the ship back over the seam so her lon
    // stays in range (geography periodic) and she can sail clean round the globe
    this.ship.x = wrapX(this.ship.x);

    // riding to her anchor (anchor.js): the cable holds her over the
    // ground, snubs her way dead, and weathercocks the bow into the wind
    if (this.anchorDown) {
      this.ship.x = px; this.ship.z = pz;
      this.ship.speed = snubSpeed(this.ship.speed, dt);
      this.ship.yaw = swingToWind(this.ship.yaw, this.wind.from, dt);
    }

    // the whirl zones take the helm: rim slings, core swallows and shreds —
    // Corryvreckan, the original Maelstrom, Charybdis: one field, three seas
    if (WHIRL_ZONES.includes(zoneId)) {
      const wz = zoneOf(zoneId);
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
    if (this.coastDist < 400 || this.overLand) {
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
    this.harbours.update(this.ship.x, this.ship.z);
    this.refreshHands(); // the muster stands its stations (cheap when unchanged)
    this.refreshOarFx(); // sweeps ship and stow with the O key
    // inshore the hull rides the sea floor where it shoals past the keel
    const att = shipAttitude(this.ship, t, this.spec,
      (this.coastDist < 400 || this.overLand) ? groundAt : null);
    const rel = wrapAngle(this.ship.yaw - this.wind.from);
    const power = sailPower(this.ship.yaw, this.wind.from, this.ship.trim);
    // wind heel: lean away from the wind in proportion to drive — visual only
    const heel = -tackSign(this.ship.yaw, this.wind.from) * power * 0.14;
    this.shipGroup.position.set(this.ship.x, att.y, this.ship.z);
    this.shipGroup.rotation.set(att.pitch, this.ship.yaw, att.roll + heel);
    this.setSail(this.ship.yaw, this.ship.trim, this.wind.from, power);
    this.setHelm(this.ship.rudder); // the wheel spins / the tiller sweeps

    // the sweeps pull: stroke the banks while she rows, rest them at the
    // catch when she is held (anchored, or hard aground)
    if (this.oarFx) {
      const rowing = this.oars && !this.anchorDown && this.ship.speed > 0.05;
      for (const p of this.oarFx.pivots) {
        const a = oarStroke(rowing ? t : 0, p.k);
        p.g.rotation.y = a.sweep * p.side;
        p.g.rotation.z = -p.side * (0.3 + a.dip);
      }
      // the longboat floats on HER OWN water: world position ahead of the
      // stem, height and trim sampled from the live wave field each frame
      if (this.towBoat) {
        const sy = Math.sin(this.ship.yaw), cy = Math.cos(this.ship.yaw);
        const bx = this.ship.x + sy * towOffset(this.spec);
        const bz = this.ship.z + cy * towOffset(this.spec);
        const hBow = waveHeight(bx + sy * 2.0, bz + cy * 2.0, t);
        const hStern = waveHeight(bx - sy * 2.0, bz - cy * 2.0, t);
        const hPort = waveHeight(bx - cy * 0.7, bz + sy * 0.7, t);
        const hStar = waveHeight(bx + cy * 0.7, bz - sy * 0.7, t);
        this.towBoat.position.set(bx, (hBow + hStern) / 2 - 0.08, bz);
        this.towBoat.rotation.set(
          Math.atan2(hStern - hBow, 4.0), this.ship.yaw,
          Math.atan2(hPort - hStar, 1.4), 'YXZ');
        // the tow line follows both ends
        const bowW = localToWorld(this.ship, 0, 0, this.shipFrame.deck.maxZ + 0.3);
        const rp = this.towRope.geometry.attributes.position;
        rp.setXYZ(0, bowW.x, this.shipGroup.position.y + this.shipFrame.deck.y * 0.75, bowW.z);
        rp.setXYZ(1, bx - sy * 2.1, this.towBoat.position.y + 0.45, bz - cy * 2.1);
        rp.needsUpdate = true;
      }
    }

    // wake astern + bow foam + the Kelvin arms, world-anchored so the ship
    // leaves them behind. Everything scales with SPEED: a drifting hull
    // barely stirs the water, a hull at full press drags a broad churned
    // road. The two shoulder emitters lay angled feather-streaks that read
    // as the V-wave the bow really throws.
    const sp = this.ship.speed;
    const stern = localToWorld(this.ship, 0, 0, this.shipFrame.deck.minZ - 0.5);
    const bow = localToWorld(this.ship, 0, 0, this.shipFrame.deck.maxZ + 0.9);
    const shoulderL = localToWorld(this.ship, -this.spec.beam * 0.45, 0, this.shipFrame.deck.maxZ * 0.7);
    const shoulderR = localToWorld(this.ship, this.spec.beam * 0.45, 0, this.shipFrame.deck.maxZ * 0.7);
    this.foam.update(t, dt, this.ship.x, this.ship.z,
      sp * Math.min(this.lastGait || 1, 3), // gait tightens the drop cadence
      [{ x: stern.x, z: stern.z, size: 1.0 + 0.3 * sp, yaw: this.ship.yaw, stretch: 2.0 + 0.14 * sp },
        { x: bow.x, z: bow.z, size: 0.45 + 0.12 * sp, yaw: this.ship.yaw, stretch: 1.2 },
        { x: shoulderL.x, z: shoulderL.z, size: 0.4 + 0.11 * sp, yaw: this.ship.yaw - 1.15, stretch: 3.2 },
        { x: shoulderR.x, z: shoulderR.z, size: 0.4 + 0.11 * sp, yaw: this.ship.yaw + 1.15, stretch: 3.2 }]);

    // the fighting layers breathe
    this.gunCool = Math.max(0, this.gunCool - dt);
    this.combatFx.update(t, dt);
    this.monsterFx.updateKraken(this.kraken, t, this.ship.x, this.ship.z, this.spec.length);
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
    if ((this.mode === 'walk' || this.mode === 'below') && (ix || iz)) {
      const fwd = new THREE.Vector3();
      this.camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
      const dir = new THREE.Vector3().addScaledVector(fwd, iz).addScaledVector(right, ix).normalize();
      // world direction -> ship-local (yaw only)
      const s = Math.sin(this.ship.yaw), c = Math.cos(this.ship.yaw);
      const lx = dir.x * c - dir.z * s, lz = dir.x * s + dir.z * c;
      // below, the walls of the HOLD are the walls of the world
      const bounds = this.mode === 'below' ? this.holdFrame : this.shipFrame.deck;
      const p = clampToDeck(this.cap.x + lx * 2.6 * dt, this.cap.z + lz * 2.6 * dt,
        this.mode === 'below' ? 0.35 : 0.2, bounds);
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
      const floorY = this.mode === 'below' ? this.holdFrame.y : this.shipFrame.deck.y;
      this.captain.group.position.set(this.cap.x, floorY, this.cap.z);
      this.captain.group.rotation.y = this.cap.facing;
    }
    this.captain.animate(dt, this.cap.moving);

    // third-person orbit camera, on-foot close / captain's view at the helm
    this.cam.dist += (this.cam.targetDist - this.cam.dist) * Math.min(1, dt * 4);
    const target = new THREE.Vector3();
    if (this.mode === 'helm') {
      target.set(this.ship.x, att.y + this.shipFrame.deck.y + 1.35, this.ship.z);
    } else {
      this.captain.group.getWorldPosition(target); target.y += 1.0;
    }
    const cp = this.cam.pitch, cd = this.cam.dist;
    this.camera.position.set(
      target.x + Math.sin(this.cam.yaw) * Math.cos(cp) * cd,
      target.y + Math.sin(cp) * cd,
      target.z + Math.cos(this.cam.yaw) * Math.cos(cp) * cd);
    // never let the lens dip under the swell — unless we're BELOW DECKS,
    // where the lens instead stays inside the hold's walls (ship-local
    // clamp through the live hull transform, so pitch and roll carry it)
    const wy = waveHeight(this.camera.position.x, this.camera.position.z, t);
    if (this.mode === 'below' && this.holdFrame) {
      const H = this.holdFrame;
      this.shipGroup.updateMatrixWorld();
      const lp = this.shipGroup.worldToLocal(this.camera.position.clone());
      lp.x = Math.max(H.minX + 0.3, Math.min(H.maxX - 0.3, lp.x));
      lp.z = Math.max(H.minZ + 0.3, Math.min(H.maxZ - 0.3, lp.z));
      lp.y = Math.max(H.y + 0.5, Math.min(this.shipFrame.deck.y - 0.35, lp.y));
      this.camera.position.copy(this.shipGroup.localToWorld(lp));
    } else if (this.camera.position.y < wy + 0.6) {
      this.camera.position.y = wy + 0.6;
    }
    this.camera.lookAt(target);

    // the showreel's pinned lens (showreel.js): while a reel runs, the photo
    // camera owns the frame — orbit maths and drag input both yield
    if (this.photoCam) {
      const pc = this.photoCam;
      this.camera.position.set(pc.x, Math.max(pc.y, wy + 0.6), pc.z);
      this.camera.lookAt(pc.lookAt.x, pc.lookAt.y, pc.lookAt.z);
    }

    // light dynamics: sun/moon glitter corridor, adaptive exposure, lit foam
    const lun = lunarState(skyT);
    const glit = glitterSource(sol, lun, moonBrightness(moonPhase(skyT)));
    const skyLL = worldToLatLon(this.ship.x, this.ship.z);
    // in the Triangle the fog closes in whatever the forecast says
    const gloomEff = zoneId === 'bermuda-triangle'
      ? Math.max(this.gloom, TRIANGLE_GLOOM)
      : STORM_ZONES.includes(zoneId)
        ? Math.max(this.gloom, STORM_GLOOM) // the Horn is never kind
        : this.gloom;
    this.sky.update(skyT, skyLL.lat, this.camera.position, gloomEff);
    // the weather made visible: cumulus drifting downwind, rain on the lens
    this.skyfx.update(t, dt, this.ship.x, this.ship.z, this.camera.position,
      this.wind.from, this.weatherState, gloomEff, sol.dayness);
    this.ocean.update(t, this.ship.x, this.ship.z, this.camera.position, glit,
      this.sky.domeUniforms.uHor.value, this.swell);
    // bioluminescence: on a dark warm-water night the wake burns green
    this.foam.setGlow(bioGlow(sol.nightness, Math.abs(skyLL.lat),
      moonBrightness(moonPhase(skyT)), lun.alt, gloomEff));
    this.foam.setLight(Math.min(1, sol.dayness
      + 0.5 * sol.nightness * moonBrightness(moonPhase(skyT)) * Math.max(0, lun.alt)));
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
    this.hud.pos.textContent = (this.oars && !this.anchorDown)
      ? 'Under sweeps' : POS_NAMES.find(([a]) => Math.abs(rel) <= a)[1];
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
    // other sails ink onto the charts, so the lookout's hail can be FOLLOWED
    const sailMarks = this.merchants.sails().map((s) => {
      const ll = worldToLatLon(s.x, s.z);
      return { lat: ll.lat, lon: ll.lon, yaw: s.yaw, type: s.type };
    });
    this.maps.update(showLat, showLon, showYaw, this.treasureMap, sailMarks);
    this.hud.gold.textContent = this.banked > 0
      ? `${this.gold} \u00b7 vault ${this.banked}` : this.gold;
    this.hud.weather.textContent = this.weatherState;
    this.hud.crew.textContent = this.crew;
    // the guns and the ship's hurts
    this.hud.guns.textContent = this.gunCool > 0
      ? `reloading\u2026 ${this.gunCool.toFixed(0)}s`
      : `READY \u2014 ${this.shotKind} shot`;
    const hurt = this.hull.rig < 0.999 || this.hull.hull < 0.999 || this.crippled;
    this.hud.damage.style.display = hurt ? 'block' : 'none';
    if (hurt) {
      this.hud.damage.textContent =
        `RIG ${(this.hull.rig * 100).toFixed(0)}% \u00b7 HULL ${(this.hull.hull * 100).toFixed(0)}%`
        + (this.crippled ? ' \u00b7 CRIPPLED \u2014 one more holing sinks her' : '');
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
    // the hint speaks the hull's own helm: 'tiller' below the brig, 'wheel'
    // from the brig up \u2014 one substitution beats threading it through thirty
    // string literals
    const hintText = this.mode === 'below'
      ? 'THE HOLD \u2014 WASD to walk her \u00b7 E \u2014 up the ladder \u00b7 T \u2014 straight to the tiller'
      : this.mode === 'ashore'
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
      : this.rescueReady && this.rescueReady.length
        ? `E \u2014 HAUL ${this.rescueReady.length > 1 ? 'THE SURVIVORS' : 'THE SURVIVOR'} FROM THE WATER`
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
          : this.fountainReady
            ? 'E \u2014 haul casks of the SWEET WATER: the fountain mends hull and rig'
          : this.bankReady
            ? `E \u2014 consign ${this.gold} doubloons to the Locker (banked FOREVER)`
            : this.mode === 'helm'
              ? (this.anchorDown
                ? 'RIDING TO HER ANCHOR \u2014 Q \u2014 weigh anchor \u00b7 she won\u2019t answer the helm till it\u2019s up'
                : anchored
                ? `ANCHORAGE \u2014 T to leave the tiller, E to put in at ${this.port.haven.name}`
                : this.aground
                ? (beaches(this.spec)
                  ? 'BEACHED \u2014 T to leave the tiller, E to step ashore \u00b7 steer A/D to swing her off'
                  : 'ANCHORED OFF \u2014 she draws too much to beach \u00b7 T, then E to send the longboat ashore')
                : 'A/D — steer · W/S — sheet · F — fire · R — shot · Q — anchor · T — leave the tiller · M — chart')
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
                    : this.canGoBelow()
                      ? 'E \u2014 go below \u00b7 T \u2014 take the tiller \u00b7 WASD \u2014 walk the deck'
                    : this.anchorDown
                      ? 'AT ANCHOR \u2014 Q \u2014 weigh anchor \u00b7 T \u2014 the tiller \u00b7 WASD \u2014 walk the deck'
                    : 'T — take the tiller · WASD — walk the deck · F — fire · Q — anchor · M — chart · B — the crew · N — stars · L — log';
    this.hud.hint.textContent = this.hullDef.wheel
      ? hintText.replace(/tiller/g, 'wheel') : hintText;
    // below decks the hold is windowless: the sea and its foam would only
    // ever render as leaks through the planking seams — douse them outright
    // (self-healing every frame, so any path out of 'below' restores them)
    const topside = this.mode !== 'below';
    this.ocean.mesh.visible = topside;
    this.foam.wakeMesh.visible = topside;
    this.foam.fleckMesh.visible = topside;
    if (!topside) this.skyfx.rain.visible = false; // rain wraps the lens — not in here

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

// the captain's briefing — the survival doctrine for the hull you sail
// (shipyard.js copy). Pops on a fresh voyage and on every new hull; the help
// book carries a button to read it again.
const briefWrap = document.getElementById('briefing');
const briefOpen = () => briefWrap.style.display === 'flex';
function showBriefingFor(def) {
  document.getElementById('briefingsub').textContent =
    `${def.name.toUpperCase()} \u2014 ${def.pitch}`;
  const list = document.getElementById('briefingpoints');
  list.innerHTML = '';
  for (const p of def.briefing) {
    const li = document.createElement('li');
    li.textContent = p;
    list.appendChild(li);
  }
  briefWrap.style.display = 'flex';
}
document.getElementById('briefingclose').addEventListener('click', () => {
  briefWrap.style.display = 'none';
});
document.getElementById('helpbriefing').addEventListener('click', () => {
  showHelp(false);
  const g = window.saltstead;
  showBriefingFor(g ? g.hullDef : hullById('sloop'));
});

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
  if (e.code === 'KeyH' && !fbOpen() && !briefOpen()) showHelp(!helpOpen());
  if (e.code === 'Escape') {
    if (fbOpen()) showFeedback(false);
    else if (briefOpen()) briefWrap.style.display = 'none';
    else if (helpOpen()) showHelp(false);
  }
});

// title first, Moorstead-style: the game only boots when the title hands off.
// Behind the login box a live diorama sails (titlescene.js); if WebGL won't
// start, the vignette goes solid and the title carries on flat.
let titleScene = null;
document.body.classList.add('titleup'); // the HUD stays below decks till we sail
try {
  titleScene = new TitleScene(document.getElementById('app'));
} catch (e) {
  console.warn('[title] diorama unavailable:', e);
  document.getElementById('titlescreen').classList.add('solid');
}
logVisit(); // the muster book: one visitor beacon per page-load
bootTitle({
  onStart: async (mode, auth, side = null) => {
    logPlay(); // …and one play-start per session, whatever door they came through
    if (titleScene) { titleScene.stop(); titleScene = null; }
    document.body.classList.remove('titleup');
    const save = mode === 'continue' ? await loadGame() : null;
    window.saltstead = new Game(save, auth, side); // the live handle, moorstead-style
  },
});
