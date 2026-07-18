// The watch bill — pure, no THREE, no DOM. verify-watchbill.mjs guards it.
//
// The passage spine (docs/PASSAGE.md): while the helmsman sails a set course
// in open water, a bell strikes every BELL_S and rolls ONE deterministic
// event from (passage seed, bell number, context) — a yarn at the mast, a
// quarrel, a bottle or a raft sung out from the tops, a spectacle worth a
// log page — or, at least a third of the time by construction, nothing at
// all. Quiet is load-bearing: the interruptions only land if there are
// stretches of nothing but sea. The stern-chase roll (chase.js) rides the
// same bell in main.js; later eras swap the station set, not the clock.

import { unit2 } from './noise.js';

export const BELL_S = 90;      // seconds of open-water passage per bell
export const QUIET = 0.38;     // this much of every passage is just the sea

// what each bell may bring, gated by the world's actual state — an event
// the moment can't honestly stage never fires (the weather gates the
// instrument; the muster gates the quarrel)
const KINDS = [
  { kind: 'yarn',    w: 3, ok: (c) => c.crew >= 1 },
  { kind: 'stelmo',  w: 3, ok: (c) => c.storm },
  { kind: 'bottle',  w: 2, ok: () => true },
  { kind: 'breach',  w: 2, ok: (c) => c.clear && !c.night },
  { kind: 'meteor',  w: 2, ok: (c) => c.clear && c.night },
  { kind: 'dispute', w: 2, ok: (c) => c.crew >= 3 },
  { kind: 'raft',    w: 1, ok: () => true },
];

// seed: the passage seed; n: which bell; ctx: { night, clear, storm, crew };
// prevKind: the last bell's kind (never repeated back to back).
// -> { kind } | null
export function bellEvent(seed, n, ctx = {}, prevKind = null) {
  if (unit2(seed * 3.7 + n * 13.1, n * 5.3 + 7.7) < QUIET) return null;
  const open = KINDS.filter((k) => k.ok(ctx) && k.kind !== prevKind);
  if (!open.length) return null;
  const total = open.reduce((s, k) => s + k.w, 0);
  let r = unit2(seed * 7.1 + n * 3.3, n * 11.7 + 2.9) * total;
  for (const k of open) {
    r -= k.w;
    if (r <= 0) return { kind: k.kind };
  }
  return { kind: open[open.length - 1].kind };
}

// the spectacles carry no mechanics and full log presence — the entry IS
// the collectible. Deterministic wording per seed, period voice.
const SPECTACLES = {
  breach: [
    'A whale BREACHES a cable off the bow — the sea explodes white and the hands cheer her',
    'Whales alongside — one sounds with a flourish of flukes that soaks the fo’c’sle',
  ],
  meteor: [
    'Falling stars all through the watch — the sky is scored with silver',
    'A great meteor crosses the masthead, bright enough to read the compass by',
  ],
  stelmo: [
    'ST ELMO’S FIRE — cold blue flame stands on every yardarm; the old hands call it a blessing',
    'The rigging burns blue at every tip — St Elmo walks the yards tonight',
  ],
};

export function spectacleLine(kind, seed = 0) {
  const lines = SPECTACLES[kind];
  if (!lines) return null;
  return lines[Math.floor(unit2(seed * 1.9, 31.7) * lines.length)];
}

// a routed passage this long or better makes the brag sheet
export const RECORD_KM = 20;

// the brag sheet's arithmetic: a routed passage's distance, time, and rate
export function passageStats(km, s) {
  const min = s / 60;
  return {
    km: Math.round(km * 10) / 10,
    min: Math.round(min * 10) / 10,
    kmMin: min > 0 ? Math.round((km / min) * 100) / 100 : 0,
  };
}
