// verify-login: the identity + solo-save structure (ported from Moorstead).
// Device pid persists, auth blobs round-trip and mangle to signed-out (never
// a crash), the multiplayer pid derivation matches the relay's expectations
// ('a'+acct = invited), and saves forward-refuse newer versions (invariant 3).
import {
  devicePid, loadAuth, saveAuth, playerId, displayName, isWarden, AUTH_KEY,
} from '../src/identity.js';
import { SAVE_VERSION, snapshotSave, acceptSave } from '../src/save.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

const fakeStorage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
};

// ---- device pid ----
{
  const st = fakeStorage();
  const a = devicePid(st), b = devicePid(st);
  ok(typeof a === 'string' && a.length >= 8, `pid minted (${a})`);
  ok(a === b, 'pid persists across calls');
  ok(devicePid(fakeStorage()) !== a, 'fresh browser, fresh pid');
}

// ---- auth round-trips ----
{
  const st = fakeStorage();
  ok(loadAuth(st) === null, 'no blob = signed out');

  const invited = { code: 'brine-yow-42', name: 'Jim', acct: '7f3a', room: 'brine', token: 'tok123' };
  saveAuth(st, invited);
  const back = loadAuth(st);
  ok(back && back.acct === '7f3a' && back.token === 'tok123' && back.name === 'Jim',
    'invited auth round-trips');
  ok(playerId(back, 'dev-pid') === 'a7f3a', "invited pid rides the account ('a'+acct)");

  saveAuth(st, { guest: true, name: '' });
  const g = loadAuth(st);
  ok(g && g.guest === true, 'guest auth round-trips');
  ok(playerId(g, 'dev-pid') === 'dev-pid', 'guest pid rides the device');
  ok(displayName(g) === 'Sea Rover', 'nameless guest gets the default hail');

  // warden standing: granted by the dash at claim, carried in the blob
  saveAuth(st, { ...invited, warden: true });
  const w = loadAuth(st);
  ok(w && w.warden === true && isWarden(w), 'warden standing round-trips');
  ok(!isWarden(back), 'a plain invite is no warden');
  ok(!isWarden(g), 'a guest is never a warden');
  st.setItem(AUTH_KEY, JSON.stringify({ guest: true, warden: true, name: 'Sneak' }));
  ok(!isWarden(loadAuth(st)), 'a guest blob claiming warden is refused (no token)');

  saveAuth(st, null);
  ok(loadAuth(st) === null, 'sign-out clears the blob');

  st.setItem(AUTH_KEY, '{not json');
  ok(loadAuth(st) === null, 'mangled blob = signed out, not a crash');
  st.setItem(AUTH_KEY, JSON.stringify({ acct: '7f3a' })); // token missing
  ok(loadAuth(st) === null, 'half an invited blob is no blob');
}

// ---- solo save: snapshot -> accept round-trip ----
{
  const ship = { x: -34121.5, z: -7929.1, yaw: 0.62, trim: 0.55, speed: 6 };
  const loot = { gold: 340, map: { seed: 3, lat: 18.05, lon: -76.9 }, lootSeed: 4 };
  const meta = snapshotSave(ship, 1234.5, loot);
  const back = acceptSave(meta);
  ok(back !== null, 'own snapshot is accepted');
  ok(back.ship.x === ship.x && back.ship.yaw === ship.yaw && back.skyT === 1234.5,
    'position, heading and sky survive the round-trip');
  ok(!('speed' in back.ship), 'speed is not persisted (you resume becalmed)');
  ok(back.gold === 340 && back.lootSeed === 4, 'the purse survives the round-trip');
  ok(back.map && back.map.lat === 18.05 && back.map.seed === 3, 'the treasure map survives');
  const crewed = acceptSave(snapshotSave(ship, 0, { crew: 11, fleet: 2 }));
  ok(crewed.crew === 11 && crewed.fleet === 2, 'crew and fleet survive the round-trip');
  const greedy = acceptSave({ ...snapshotSave(ship, 0), fleet: 9, crew: -2 });
  ok(greedy.fleet === 3 && greedy.crew === 0, 'fleet clamped to the cap, bad crew resets to none');
  const bare = acceptSave(snapshotSave(ship, 0));
  ok(bare.gold === 0 && bare.map === null && bare.lootSeed === 1 && bare.crew === 0,
    'a lootless save reads as a poor pirate sailing alone (additive fields, invariant 1)');
  const veteran = acceptSave({ ...snapshotSave(ship, 0), crew: 8 });
  ok(veteran.crew === 8, 'an old 8-hand save keeps its hands');
  ok(Array.isArray(bare.log) && bare.log.length === 0, 'and its log reads as a blank book');
  const badMap = acceptSave({ ...meta, map: { lat: 'x' } });
  ok(badMap && badMap.map === null && badMap.gold === 340, 'a mangled map is dropped, not fatal');
  const badGold = acceptSave({ ...meta, gold: -50 });
  ok(badGold && badGold.gold === 0, 'negative gold refused');
  // the Locker's vault and the won-legends list are additive fields
  const vault = acceptSave(snapshotSave(ship, 0, { banked: 900, won: ['el-dorado', 'dragons-wales'] }));
  ok(vault.banked === 900 && vault.won.length === 2 && vault.won[0] === 'el-dorado',
    'the vault and the won legends survive the round-trip');
  ok(bare.banked === 0 && bare.won.length === 0, 'a fresh pirate has banked nothing, won nothing');
  const cheat = acceptSave({ ...snapshotSave(ship, 0), banked: -50, won: [7, 'el-dorado', {}] });
  ok(cheat.banked === 0 && cheat.won.length === 1, 'a mangled vault empties, mangled legends drop');

  // the hull rides the save; a mangled hull reads as the sloop's string
  const brig = acceptSave(snapshotSave(ship, 0, { hull: 'brig' }));
  ok(brig.hull === 'brig', 'the brig survives the round-trip');
  ok(bare.hull === 'sloop', 'a fresh pirate sails the sloop');
  const badHull = acceptSave({ ...snapshotSave(ship, 0), hull: 42 });
  ok(badHull.hull === 'sloop', 'a mangled hull reads as the sloop');
  const longHull = acceptSave({ ...snapshotSave(ship, 0), hull: 'x'.repeat(400) });
  ok(longHull.hull.length <= 16, 'a bloated hull string is trimmed');

  const page = { d: 2, w: 'First watch', p: '17\u00b051\u2032N 76\u00b054\u2032W', x: 'Boarded a merchantman' };
  const logged = acceptSave(snapshotSave(ship, 0, { log: [page] }));
  ok(logged.log.length === 1 && logged.log[0].x === page.x,
    "the ship's log survives the round-trip");
  const tornBook = acceptSave({ ...snapshotSave(ship, 0), log: [page, { d: 'x' }, 7] });
  ok(tornBook.log.length === 1, 'mangled log pages are torn out, good ones kept');

  ok(acceptSave(null) === null, 'no save = null');
  ok(acceptSave({}) === null, 'junk = null');
  ok(acceptSave({ ...meta, version: SAVE_VERSION + 1 }) === null,
    'forward-refuse: a NEWER save is never loaded (invariant 3)');
  ok(acceptSave({ ...meta, ship: { ...meta.ship, x: NaN } }) === null,
    'NaN position refused');
  const wildTrim = acceptSave({ ...meta, ship: { ...meta.ship, trim: 9 } });
  ok(wildTrim && wildTrim.ship.trim === 1, 'trim clamps into [0,1]');
}

if (failed) { console.error(`verify-login: ${failed} FAILED`); process.exit(1); }
console.log('verify-login: OK — pid persists, auth round-trips, invited pid = a+acct, saves forward-refuse');
