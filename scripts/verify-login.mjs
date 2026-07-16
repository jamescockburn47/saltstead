// verify-login: the identity + solo-save structure (ported from Moorstead).
// Device pid persists, auth blobs round-trip and mangle to signed-out (never
// a crash), the multiplayer pid derivation matches the relay's expectations
// ('a'+acct = invited), and saves forward-refuse newer versions (invariant 3).
import {
  devicePid, loadAuth, saveAuth, playerId, displayName, AUTH_KEY,
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
  const meta = snapshotSave(ship, 1234.5);
  const back = acceptSave(meta);
  ok(back !== null, 'own snapshot is accepted');
  ok(back.ship.x === ship.x && back.ship.yaw === ship.yaw && back.skyT === 1234.5,
    'position, heading and sky survive the round-trip');
  ok(!('speed' in back.ship), 'speed is not persisted (you resume becalmed)');

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
