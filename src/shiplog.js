// The ship's log — pure, no THREE, no DOM. verify-shiplog.mjs guards it.
// The game keeps the journal a real master kept: every entry stamped with the
// day of the voyage, the ship's-bell watch, and the position in degrees and
// minutes. Reading your own log teaches the watch system and how sailors
// wrote positions — education by furniture, not tutorial.

import { DAY_LENGTH } from './skymath.js';

export const LOG_CAP = 120; // entries kept; the oldest page falls away

// the traditional watch system: seven watches, the dogs split so the crew
// rotates through the hated Middle watch
const WATCHES = [
  [4, 'Middle watch'],      // 00:00-04:00
  [8, 'Morning watch'],     // 04:00-08:00
  [12, 'Forenoon watch'],   // 08:00-12:00
  [16, 'Afternoon watch'],  // 12:00-16:00
  [18, 'First dog watch'],  // 16:00-18:00
  [20, 'Last dog watch'],   // 18:00-20:00
  [24, 'First watch'],      // 20:00-24:00
];

export function watchName(skyT) {
  const frac = ((skyT / DAY_LENGTH) % 1 + 1) % 1;
  const hour = frac * 24;
  return WATCHES.find(([end]) => hour < end)[1];
}

export function voyageDay(skyT) {
  return Math.floor(skyT / DAY_LENGTH) + 1;
}

// 17.85, -76.9 -> "17°51'N 76°54'W" — the way a position is actually written
export function fmtPos(lat, lon) {
  const one = (v, pos, neg) => {
    const a = Math.abs(v);
    const d = Math.floor(a);
    let m = Math.round((a - d) * 60);
    const dd = d + (m === 60 ? 1 : 0);
    if (m === 60) m = 0;
    return `${dd}\u00b0${String(m).padStart(2, '0')}\u2032${v >= 0 ? pos : neg}`;
  };
  return `${one(lat, 'N', 'S')} ${one(lon, 'E', 'W')}`;
}

// one page line: { d, w, p, x } — day, watch, position, text. Compact keys
// because entries ride in the save (additive field, version stays 1).
export function makeEntry(skyT, lat, lon, text) {
  return { d: voyageDay(skyT), w: watchName(skyT), p: fmtPos(lat, lon), x: String(text) };
}

// append, keeping the book to LOG_CAP pages. Mutates and returns log.
export function pushEntry(log, entry) {
  log.push(entry);
  if (log.length > LOG_CAP) log.splice(0, log.length - LOG_CAP);
  return log;
}

export function logLine(e) {
  return `Day ${e.d}, ${e.w} \u2014 ${e.p} \u2014 ${e.x}`;
}

// a vetted copy of a saved log: well-formed entries only, capped
export function acceptLog(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue;
    if (!Number.isFinite(e.d) || typeof e.w !== 'string'
      || typeof e.p !== 'string' || typeof e.x !== 'string') continue;
    out.push({ d: Math.round(e.d), w: e.w, p: e.p, x: e.x });
  }
  return out.slice(-LOG_CAP);
}
