// kiosk.js — Moorstead's kiosk guard, ported: keep a stray two-finger swipe (or a
// small child) from accidentally leaving the game. We swallow the BROWSER's own
// chrome gestures — back/forward navigation, the right-click/long-press menu,
// text-selection + image drag — and take the page fullscreen on first interaction.
// None of this touches the game's own input (drag-to-look, the keys); it only
// stops the browser from navigating away or popping its menus. Pairs with the
// `overscroll-behavior: none` + `touch-action: none` rules in index.html (those
// kill swipe-to-go-back / pull-to-refresh at the CSS layer; the history trap
// below is the belt-and-braces catch for browsers that still fire it).

function goFullscreen() {
  if (document.fullscreenElement || document.webkitFullscreenElement) return;
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
  if (!req) return;
  try { const p = req.call(el); if (p && p.catch) p.catch(() => {}); } catch { /* denied — never mind */ }
}

export function installKiosk() {
  // 1) Trap browser back/forward — the two-finger swipe that loses the game. Seed a
  //    history entry, then re-seed on every popstate so a back/swipe never actually
  //    navigates away. The game has no internal routing, so there's nothing
  //    legitimate to "go back" to anyway.
  try {
    history.pushState(null, '', location.href);
    window.addEventListener('popstate', () => history.pushState(null, '', location.href));
  } catch { /* sandboxed / file:// — skip the trap */ }

  // 2) No browser context menu (right-click / long-press) anywhere.
  window.addEventListener('contextmenu', e => e.preventDefault());

  // 3) No accidental text-selection or image drag from a stray swipe — but leave
  //    selection alone inside form fields (the feedback box needs it).
  const inField = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
  document.addEventListener('selectstart', e => { if (!inField(e.target)) e.preventDefault(); });
  document.addEventListener('dragstart', e => e.preventDefault());

  // 4) Auto-fullscreen. Browsers forbid it on page load (needs a user gesture), so we
  //    go fullscreen on the FIRST interaction (any tap/click/key) — and RE-ARM whenever
  //    fullscreen is left, so it stays put. `armed` guards against stacking listeners
  //    on rapid fullscreen toggles.
  let armed = false;
  const arm = () => {
    if (armed) return; armed = true;
    const go = () => {
      armed = false;
      window.removeEventListener('pointerdown', go);
      window.removeEventListener('keydown', go);
      goFullscreen();
    };
    window.addEventListener('pointerdown', go, { passive: true });
    window.addEventListener('keydown', go);
  };
  arm();
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) arm(); });
}
