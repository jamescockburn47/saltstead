// Feedback & bug reports to the harbourmaster's ledger (POST /dash/feedback) —
// Moorstead's feedback.js, ported. gatherContext and reportQuiet are headless-safe
// (verify-feedback.mjs drives them under node with no DOM); only submitFeedback
// assumes a live browser.

import { devicePid } from './identity.js';
import { worldToLatLon } from './earth.js';

let _ephemeralPid = null;
const _mintFallback = () =>
  (globalThis.crypto?.randomUUID?.() ??
    'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10));

export function feedbackPid() {
  try {
    return devicePid(localStorage);
  } catch {
    // storage blocked (private mode / cookies off) — stable per-session fallback
    return (_ephemeralPid ||= _mintFallback());
  }
}

/** Snapshot useful context for triage — page, browser, optional in-game state. */
export function gatherContext(game = null, page = 'title') {
  const ctx = {
    page,
    url: typeof location !== 'undefined' ? location.href : '',
    ua: typeof navigator !== 'undefined' ? String(navigator.userAgent).slice(0, 240) : '',
  };
  if (game?.ship) {
    ctx.state = game.mode || '';
    ctx.day = Math.floor(((game.t || 0) + (game.dayStart || 0)) / 86400);
    ctx.gold = Math.round(game.gold || 0);
    ctx.pos = { x: Math.round(game.ship.x), z: Math.round(game.ship.z) };
    try {
      const ll = worldToLatLon(game.ship.x, game.ship.z);
      ctx.loc = `${ll.lat.toFixed(2)},${ll.lon.toFixed(2)}`;
    } catch { /* off the projection — the raw pos still tells the tale */ }
  }
  return ctx;
}

// Quiet telemetry for swallowed catch blocks: fire-and-forget, capped per session,
// and it must NEVER throw or change the caller's behaviour — it only makes silent
// failures visible on the harbourmaster's ledger. Returns true if a report was
// attempted, false if capped/impossible (the return is for the verify script;
// callers should ignore it).
const QUIET_MAX = 5;
let _quietSent = 0;
export function reportQuiet(tag, err) {
  try {
    if (_quietSent >= QUIET_MAX) return false;
    _quietSent++;
    let msg = 'unknown';
    try { msg = String((err && err.message) || err).slice(0, 300); } catch { /* poisoned error object */ }
    let context = { tag: String(tag || 'untagged') };
    try {
      const game = (typeof window !== 'undefined' && (window.saltstead || null)) || null;
      context = gatherContext(game, 'quiet');
      context.tag = String(tag || 'untagged');
    } catch { /* headless / half-booted — the tag alone still tells the tale */ }
    if (typeof fetch === 'function') {
      // kind 'bug': the ledger only files 'bug' | 'feedback' — the [quiet:tag]
      // prefix marks these for triage
      fetch('/dash/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pid: feedbackPid(), kind: 'bug', message: `[quiet:${context.tag}] ${msg}`, email: '', name: '', context }),
      }).catch(() => { /* ledger unreachable — it was only ever best-effort */ });
    }
    return true;
  } catch {
    return false; // telemetry must never make owt worse
  }
}

export async function submitFeedback({ kind, message, email = '', name = '', context = {}, pid = feedbackPid() }) {
  const res = await fetch('/dash/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pid, kind, message, email, name, context }),
  });
  return res.json();
}
