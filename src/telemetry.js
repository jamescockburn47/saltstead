// The muster book — visitor and play-start beacons to the harbourmaster's
// ledger (POST /dash/visit). One "visit" per page-load, one "play" per session
// (the first time a captain actually takes a ship to sea). The ledger dedupes
// per browser per day on its side; this module only keeps the beacons honest
// and harmless: fire-and-forget, once-per-session for play, and it must NEVER
// throw or slow the game down. Headless-safe (verify-telemetry.mjs drives it
// under node with no DOM).

import { feedbackPid } from './feedback.js';

export const SITE = 'saltstead';

/** The exact body the ledger files (dash-app.py /visit). */
export function visitPayload(kind, pid = feedbackPid()) {
  return { site: SITE, kind: kind === 'play' ? 'play' : 'visit', pid };
}

function post(body) {
  if (typeof fetch !== 'function') return false;
  try {
    // keepalive: the visit beacon races the page's own lifecycle
    fetch('/dash/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => { /* ledger unreachable — the muster book only ever undercounts */ });
    return true;
  } catch {
    return false;
  }
}

/** Page-load beacon. Call once at boot; extra calls are swallowed. */
let _visitSent = false;
export function logVisit() {
  try {
    if (_visitSent) return false;
    _visitSent = true;
    return post(visitPayload('visit'));
  } catch {
    return false;
  }
}

/** Play-start beacon — the captain pressed Continue / chose colours. Once a session. */
let _playSent = false;
export function logPlay() {
  try {
    if (_playSent) return false;
    _playSent = true;
    return post(visitPayload('play'));
  } catch {
    return false;
  }
}

/** For the verify script only — a fresh session without a fresh process. */
export function _resetForVerify() {
  _visitSent = false;
  _playSent = false;
}
