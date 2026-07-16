// X marks the spot — pure, no THREE, no DOM. verify-treasure.mjs guards it.
//
// A treasure map deterministically picks a REAL stretch of coast: a seeded
// spiral of candidate points around where the map was won, accepted when the
// point is land within longboat reach of the sea. Same seed, same X, every
// client (invariant 6). The dig itself is the CREW's job — you anchor in the
// cove and send the longboat, so the land-earns-nothing rule holds.

import { unit2 } from './noise.js';
import { isLand, coastDistGame, latLonToWorld } from './earth.js';

export const DIG_COAST_MAX = 250;   // the X sits within longboat reach of the shore
export const DIG_RADIUS = 400;      // anchor this close (game m) to send the boat
export const DIG_TIME = 5;          // seconds of shovel work

// seed + the (quantized) waters where the map was won -> { lat, lon } or null.
// Candidates walk outward from ~3° to ~40°, so the voyage is an expedition,
// not an errand — and the search is exhausted only on a truly empty ocean.
export function findDigSite(seed, nearLat, nearLon) {
  const lat0 = Math.round(nearLat), lon0 = Math.round(nearLon);
  for (let i = 0; i < 900; i++) {
    const ang = unit2(seed + i * 7.31, 3.7) * Math.PI * 2;
    const r = 3 + (i / 900) * 37 * unit2(seed + i * 2.17, 8.1);
    const lat = Math.max(-72, Math.min(72, lat0 + Math.sin(ang) * r));
    const lon = ((lon0 + Math.cos(ang) * r + 540) % 360) - 180;
    if (!isLand(lat, lon)) continue;
    if (coastDistGame(lat, lon) > DIG_COAST_MAX) continue;
    return { lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100 };
  }
  return null;
}

// game-metre distance from a world position to the X
export function digDist(x, z, site) {
  const w = latLonToWorld(site.lat, site.lon);
  return Math.hypot(w.x - x, w.z - z);
}
