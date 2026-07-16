// The solo voyage save — Moorstead's one-slot IndexedDB structure, ported.
// snapshot/accept are pure (verify-login.mjs guards them, including the
// forward-refuse rule: never load a save from a NEWER client — invariant 3).

export const SAVE_VERSION = 1;
const DB = 'saltstead', STORE = 'meta', KEY = 'game';

import { acceptLog } from './shiplog.js';

// ---- pure ----
// loot: { gold, map, lootSeed, crew, fleet, log, banked, won } — additive
// fields, version stays 1 (older saves simply read as a poor pirate with no
// map, no hands — the sloop sails solo — no prizes, a blank log, nothing in
// Davy Jones' vault and no legends won)
export function snapshotSave(ship, skyT, loot = {}) {
  return {
    version: SAVE_VERSION,
    ship: { x: ship.x, z: ship.z, yaw: ship.yaw, trim: ship.trim },
    skyT,
    gold: loot.gold || 0,
    map: loot.map || null,
    lootSeed: loot.lootSeed || 1,
    crew: loot.crew ?? 0,
    fleet: loot.fleet || 0,
    log: Array.isArray(loot.log) ? loot.log : [],
    banked: loot.banked || 0,           // consigned to the Locker, forever
    won: Array.isArray(loot.won) ? loot.won : [], // one-shot legends claimed
    savedAt: Date.now(),
  };
}

// null unless the meta is a well-formed save THIS client can carry
export function acceptSave(meta) {
  if (!meta || typeof meta !== 'object') return null;
  if (typeof meta.version !== 'number' || meta.version > SAVE_VERSION) return null;
  const s = meta.ship;
  if (!s || ![s.x, s.z, s.yaw, s.trim].every(Number.isFinite)) return null;
  const m = meta.map;
  const mapOK = m && Number.isFinite(m.lat) && Number.isFinite(m.lon) && Number.isFinite(m.seed);
  return {
    version: meta.version,
    ship: { x: s.x, z: s.z, yaw: s.yaw, trim: Math.max(0, Math.min(1, s.trim)) },
    skyT: Number.isFinite(meta.skyT) ? meta.skyT : 0,
    gold: Number.isFinite(meta.gold) && meta.gold >= 0 ? Math.round(meta.gold) : 0,
    map: mapOK ? { seed: m.seed, lat: m.lat, lon: m.lon } : null,
    lootSeed: Number.isFinite(meta.lootSeed) && meta.lootSeed >= 1 ? meta.lootSeed : 1,
    crew: Number.isFinite(meta.crew) && meta.crew >= 0 ? Math.round(meta.crew) : 0,
    fleet: Number.isFinite(meta.fleet) && meta.fleet >= 0 ? Math.min(3, Math.round(meta.fleet)) : 0,
    log: acceptLog(meta.log),
    banked: Number.isFinite(meta.banked) && meta.banked >= 0 ? Math.round(meta.banked) : 0,
    won: Array.isArray(meta.won) ? meta.won.filter((w) => typeof w === 'string').slice(0, 32) : [],
    savedAt: meta.savedAt || 0,
  };
}

// ---- IndexedDB plumbing (browser only) ----
function openDB() {
  return new Promise((res, rej) => {
    const rq = indexedDB.open(DB, 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore(STORE);
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}

export async function saveGame(meta) {
  const db = await openDB();
  await new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(meta, KEY);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  db.close();
}

export async function loadGame() {
  const db = await openDB();
  const meta = await new Promise((res, rej) => {
    const rq = db.transaction(STORE).objectStore(STORE).get(KEY);
    rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
  });
  db.close();
  return acceptSave(meta);
}

export async function hasSave() { return (await loadGame()) !== null; }

export async function clearSave() {
  const db = await openDB();
  await new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  db.close();
}
