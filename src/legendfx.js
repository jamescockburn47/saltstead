// Legend effects — the pure runtime half of src/legends.js, no THREE, no
// DOM. verify-legendfx.mjs guards it. The legends TABLE is append-only data;
// this module is where each row finally DOES something: zone detection, the
// Bermuda compass scramble, the Corryvreckan whirlpool, Davy Jones' dead air
// and vault, the Plate Fleet dives, the El Dorado expedition, and the
// Flying Dutchman's weather gate. The monsters (Kraken, dragon) live in
// monsters.js — this module only says WHERE they wake.

import { LEGENDS } from './legends.js';
import { M_PER_DEG } from './earth.js';
import { unit2 } from './noise.js';

// Gameplay radius per legend id, in GAME metres — the table's `radius` field
// is story-scale (real km); fights and anomalies need sea-room tuned by hand.
// Keyed by id so legends.js itself stays append-only and untouched.
export const ZONE_R = {
  'bermuda-triangle': 3200,
  'corryvreckan': 240,
  'kraken-deep': 900,
  'dragons-wales': 1400,
  'flying-dutchman': 1200,
  'davy-jones': 600,
  'plate-fleet': 320,
  'el-dorado': 900,
};

const ZONED = LEGENDS.filter((l) => ZONE_R[l.id]);

// nearest active legend zone at a position: { legend, dist, r } or null.
// Same flat game-metre measure the havens use (port.js nearestHaven), so a
// zone's reach on the chart is the distance the hull actually sails.
export function legendAt(lat, lon) {
  let best = null;
  for (const l of ZONED) {
    const d = Math.hypot((lat - l.lat) * M_PER_DEG, (lon - l.lon) * M_PER_DEG);
    const r = ZONE_R[l.id];
    if (d <= r && (!best || d - r < best.dist - best.r)) best = { legend: l, dist: d, r };
  }
  return best;
}

export function inZone(lat, lon, id) {
  const l = ZONED.find((z) => z.id === id);
  if (!l) return false;
  return Math.hypot((lat - l.lat) * M_PER_DEG, (lon - l.lon) * M_PER_DEG) <= ZONE_R[id];
}

// a zone's anchor for systems that scatter things inside it:
// { lat, lon, x, z, r } in game coordinates, or null
export function zoneOf(id) {
  const l = ZONED.find((z) => z.id === id);
  if (!l) return null;
  return { lat: l.lat, lon: l.lon, x: l.lon * M_PER_DEG, z: -l.lat * M_PER_DEG, r: ZONE_R[id] };
}

// ---- the Bermuda Triangle: the instruments lie ----
// Deterministic wobble (pure function of time) for the HUD position and the
// chart: deep in the triangle the compass spins and the numbers drift. depth
// [0..1]: 0 at the rim, 1 at the heart — the lies grow toward the middle.
export function triangleDepth(dist, r) {
  return Math.max(0, Math.min(1, 1 - dist / r));
}

export function compassJitter(t, depth) {
  const k = depth * depth; // gentle at the rim, wild at the heart
  return {
    dLat: k * (0.9 * Math.sin(t * 0.31) + 0.5 * Math.sin(t * 1.07)),
    dLon: k * (1.1 * Math.sin(t * 0.23 + 2.1) + 0.4 * Math.sin(t * 0.83)),
    dYaw: k * (0.9 * Math.sin(t * 0.17 + 4.2) + 0.6 * Math.sin(t * 0.71)),
  };
}

export const TRIANGLE_GLOOM = 0.55; // the fog closes in regardless of forecast

// ---- the Corryvreckan whirlpool ----
// Radial field around the legend point. Ride the rim (the outer band) and
// the swirl slings you along; wander into the core and the sea takes the
// helm — and the rigging. Returns accelerations in m/s^2 plus the bands.
export const WHIRL_RIM = 0.55;   // of R: outside this the swirl HELPS
export const WHIRL_CORE = 0.3;   // of R: inside this she's in real trouble
export function whirlpoolPull(dx, dz, r) {
  const d = Math.hypot(dx, dz);
  if (d >= r || d < 1e-6) return { ax: 0, az: 0, rim: false, core: false };
  const u = d / r;
  const tx = dz / d, tz = -dx / d;    // clockwise swirl, as the real one runs
  const ix = -dx / d, iz = -dz / d;   // inward
  const swirl = 16 * (1 - u) * u * 2; // strongest mid-band
  const pull = 10 * (1 - u) * (1 - u);
  return {
    ax: tx * swirl + ix * pull,
    az: tz * swirl + iz * pull,
    rim: u >= WHIRL_RIM,
    core: u <= WHIRL_CORE,
  };
}
export const WHIRL_RIG_RATE = 0.06; // rig shredded per second in the core

// ---- Davy Jones' Locker: the sails hang dead ----
// The deepest water in the world barely floats a ship. Multiplier on the
// wind the sails can use: whole at the rim, near-nothing over the trench.
export function deadAir(dist, r) {
  const u = Math.max(0, Math.min(1, dist / r));
  const s = u * u * (3 - 2 * u);
  return 0.12 + 0.88 * s;
}

// anchored over the trench, treasure sunk here is BANKED forever — the
// endgame vault. Pure ledger: how much of the chest goes down.
export function bankable(gold) {
  return Math.max(0, Math.round(gold));
}

// ---- the 1715 Plate Fleet: dive the wrecks ----
export const DIVE_TIME = 8;          // s the divers are down
export const DIVE_DECAY = 0.65;      // each later dive this visit pays this much of the last
export const DIVE_FLOOR = 40;        // the seabed is never quite picked clean
export function diveRoll(seed, diveN = 0) {
  const base = 140 + unit2(seed * 1.7, 33.3) * 220;
  return Math.max(DIVE_FLOOR, Math.round(base * DIVE_DECAY ** diveN));
}

// ---- El Dorado: the expedition upriver ----
export const EXPEDITION_TIME = 12;   // s of jungle march
export const ELDORADO_GOLD = 2500;   // the gilded city pays once, and pays LIKE a city

// ---- the Flying Dutchman: the weather gate ----
// She rounds the Cape in every storm; on a filthy night she may show too.
export function dutchmanSails(weatherState, nightness) {
  if (weatherState === 'storm') return true;
  return (weatherState === 'rain' || weatherState === 'overcast') && nightness > 0.5;
}
export const DUTCHMAN_SPEED = 6.5;   // m/s — she is FAST; catch her if you can
export function dutchmanCargo(seed) {
  return Math.round(800 + unit2(seed * 2.9, 77.7) * 700);
}

// her ghost-circuit around the Cape zone: a deterministic orbit, always the
// same waters, so two clients in the same storm see the same ship
export function dutchmanPos(t, centerX, centerZ, r) {
  const a = t * (DUTCHMAN_SPEED / (r * 0.7));
  return {
    x: centerX + Math.sin(a) * r * 0.7,
    z: centerZ + Math.cos(a) * r * 0.7,
    yaw: a + Math.PI / 2 + 0.2, // bow along her track
  };
}
