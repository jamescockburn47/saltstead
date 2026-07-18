// The handlines — pure, no THREE, no DOM. verify-fishing.mjs guards it.
//
// P puts the lines out below FISH_SPEED (docs/PASSAGE.md); a bite comes on
// its own deterministic clock, and E strikes inside the window or loses the
// bait. The catch is keyed to REAL waters — cod on the Grand Banks, herring
// in the North Sea, bluefin in the Med, dorado in the tropics, toothfish in
// the Southern Ocean — geography by stealth, the wildlife rule again: the
// water itself tells you where you are. Fish accumulate aboard and sell
// themselves at the next port call: income at sea, the economy rule kept.

import { unit2 } from './noise.js';

export const FISH_SPEED = 2.5; // m/s — handlines want slow way or an anchor
export const STRIKE_S = 4;     // seconds to strike once something takes the line

// a bite comes after this many seconds — long enough to walk away from,
// short enough to be worth waiting on
export function biteAfter(seed) {
  return 12 + unit2(seed * 3.3, 9.1) * 28; // 12..40 s
}

// the named grounds, tried in order, then the latitude bands. Real waters:
// a sailor who learns where the cod bite has learned the Grand Banks.
const GROUNDS = [
  { name: 'a great Banks cod', lo: 14, hi: 24,
    ok: (lat, lon) => lat > 42 && lat < 52 && lon > -60 && lon < -42 },
  { name: 'a shining North Sea herring', lo: 8, hi: 14,
    ok: (lat, lon) => lat > 51 && lat < 61 && lon > -4 && lon < 9 },
  { name: 'a Mediterranean bluefin', lo: 16, hi: 28,
    ok: (lat, lon) => lat > 30 && lat < 46 && lon > -6 && lon < 36 },
  { name: 'a Southern Ocean toothfish', lo: 14, hi: 22,
    ok: (lat) => lat < -45 },
  { name: 'a bull dorado', lo: 10, hi: 18,
    ok: (lat) => Math.abs(lat) < 23 },
  { name: 'a fat mackerel', lo: 5, hi: 10, ok: () => true },
];

// -> { name, value } — deterministic in (seed, waters)
export function catchFor(seed, lat, lon) {
  const g = GROUNDS.find((f) => f.ok(lat, lon));
  return {
    name: g.name,
    value: g.lo + Math.round(unit2(seed * 7.9, 3.7) * (g.hi - g.lo)),
  };
}
