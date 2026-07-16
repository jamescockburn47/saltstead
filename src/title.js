// The title screen — Moorstead's login structure, ported. The screen has two
// states gated by setLoggedIn: the login box (claim an invite on the dash, or
// board as a guest) and the play box (continue / new voyage / sign out).
//
// The invite claim POSTs to /dash/auth/claim — the dashboard on the EVO owns
// codes, accounts, rooms and tokens; this client never validates codes. Until
// Saltstead's dash is live the claim fails soft and the guest door stays open.

import { devicePid, loadAuth, saveAuth, displayName } from './identity.js';
import { hasSave, clearSave } from './save.js';

export function bootTitle({ onStart }) {
  const $ = (id) => document.getElementById(id);
  const screen = $('titlescreen'), loginBox = $('loginbox'), playBox = $('playbox');
  const msg = $('loginmsg');
  let auth = loadAuth(localStorage);

  function setLoggedIn(a) {
    auth = a;
    loginBox.style.display = a ? 'none' : 'flex';
    playBox.style.display = a ? 'flex' : 'none';
    if (a) {
      $('welcome').textContent = `Welcome aboard, ${displayName(a)}`
        + (a.guest ? ' (guest)' : '');
      $('btncontinue').disabled = true;
      hasSave().then((h) => { $('btncontinue').disabled = !h; });
    }
  }

  $('btnclaim').addEventListener('click', async () => {
    const code = $('invitecode').value.trim().toLowerCase();
    const name = $('invitename').value.trim();
    if (!code || !name) { msg.textContent = 'Code and name, sailor.'; return; }
    msg.textContent = 'Hailing the harbourmaster\u2026';
    try {
      const r = await fetch('/dash/auth/claim', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, name, pid: devicePid(localStorage) }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || 'refused');
      const a = { code, name: d.name || name, acct: d.acct, room: d.room || 'brine', token: d.token };
      saveAuth(localStorage, a);
      msg.textContent = '';
      setLoggedIn(a);
    } catch {
      msg.textContent = 'The harbourmaster is not answering \u2014 invites open '
        + 'with multiplayer. Board as a guest for now.';
    }
  });

  $('btnguest').addEventListener('click', () => {
    const a = { guest: true, name: $('invitename').value.trim() };
    saveAuth(localStorage, a);
    setLoggedIn(a);
  });

  $('btnlogout').addEventListener('click', () => {
    saveAuth(localStorage, null);
    setLoggedIn(null);
  });

  $('btnnew').addEventListener('click', async () => {
    await clearSave();
    screen.style.display = 'none';
    onStart(null, auth);
  });

  $('btncontinue').addEventListener('click', () => {
    screen.style.display = 'none';
    onStart('continue', auth);
  });

  setLoggedIn(auth);
}
