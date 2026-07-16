// Who is at the helm — Moorstead's identity structure, ported. Pure logic
// with the storage injected, so verify-login.mjs can drive it headlessly.
//
// Auth blob shapes (localStorage 'saltstead-auth'), same three as Moorstead:
//   { code, name, acct, room, token }   — invited (claimed on the dash)
//     ... plus warden: true when the code was minted as a warden code —
//     the harbourmaster's own mark (gold hatband, warden hail)
//   { guest: true, name }               — guest, no invite
//   null                                — not signed in
//
// The invite CLAIM is validated server-side (/dash/auth/claim on the EVO,
// once Saltstead's dash exists); the client never checks codes itself.

export const AUTH_KEY = 'saltstead-auth';
export const PID_KEY = 'saltstead-pid';

// per-browser device id, minted once
export function devicePid(storage) {
  let pid = storage.getItem(PID_KEY);
  if (!pid) {
    pid = (globalThis.crypto?.randomUUID?.() ??
      'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10));
    storage.setItem(PID_KEY, pid);
  }
  return pid;
}

// parse + shape-check; a mangled blob is a signed-out player, never a crash
export function loadAuth(storage) {
  try {
    const a = JSON.parse(storage.getItem(AUTH_KEY));
    if (!a || typeof a !== 'object') return null;
    if (a.guest === true) return { guest: true, name: String(a.name || '') };
    if (typeof a.acct === 'string' && typeof a.token === 'string') {
      return {
        code: String(a.code || ''), name: String(a.name || ''),
        acct: a.acct, room: String(a.room || 'brine'), token: a.token,
        warden: a.warden === true,
      };
    }
    return null;
  } catch { return null; }
}

export function saveAuth(storage, auth) {
  if (auth === null) storage.removeItem(AUTH_KEY);
  else storage.setItem(AUTH_KEY, JSON.stringify(auth));
}

// multiplayer pid: invited players ride their account id (the relay treats
// 'a...' pids as invited and demands the token); guests ride the device pid
export function playerId(auth, pid) {
  return (auth && auth.acct ? 'a' + auth.acct : pid).slice(0, 40);
}

export function displayName(auth) {
  return (auth && auth.name) ? auth.name : 'Sea Rover';
}

// the warden — the harbourmaster's own standing, granted by the dash at claim
export function isWarden(auth) {
  return !!(auth && auth.warden === true && auth.token);
}
