// Shore decoration — pure placement logic, no THREE, no DOM.
// verify-shoredecor.mjs guards it; shoredecorlayer.js gives it bodies.
//
// Every shoreline and river line on earth grows a fringe the ship sails
// PAST but never enters (the captain stays aboard — shore leave is retired):
// vegetation picked by LATITUDE (palms in the tropics, broadleaf in the
// temperate belts, conifers in the north, scrub in the noise-broken desert
// belts, nothing over the polar rim or above the snowline) and hamlets of
// huts on the water's edge, dressed to their climate. All of it deterministic
// (invariant 6): the same cell grows the same trees for every client.

import {
  elevation, worldToLatLon, latLonToWorld, coastDistGame, riverDistGame,
} from './earth.js';
import { unit2, fbm2 } from './noise.js';
import { HARBOURED } from './harbour.js';

export const DECOR_CELL = 240;  // metres square per streamed cell
export const DECOR_MAX = 260;   // hard cap on instances per cell
export const DECOR_KINDS = ['conifer', 'broadleaf', 'palm', 'scrub', 'fern', 'hut', 'cottage', 'church'];

const STEP = 12;                // candidate lattice spacing (jittered)
const NPTS = DECOR_CELL / STEP; // 20 candidates per side
const SHORE_BAND = 150;         // m of coast the green fringe hugs
const RIVER_BAND = 110;         // m either side of a river line
const JUNGLE_BAND = 200;        // the tropics press harder on their rivers
const JUNGLE_LAT = 16;          // |lat| under this: river country is jungle

// hamlet walls by climate: timber in the north, thatch-and-frame temperate,
// adobe in the desert belts, palm-thatch in the tropics
export function hutTint(aLat, desert) {
  if (desert) return [0.88, 0.76, 0.55];
  if (aLat > 50) return [0.55, 0.44, 0.33];
  if (aLat < 24) return [0.85, 0.76, 0.55];
  return [0.78, 0.68, 0.52];
}

const desertAt = (lat, lon) => {
  const aLat = Math.abs(lat);
  return aLat > 14 && aLat < 34 && fbm2(lon * 0.6 + 9, lat * 0.6) > 0.42;
};

const sm = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// which species grows here — a WEIGHTED mix whose weights ramp smoothly
// with latitude, so the zones blend into each other instead of ending at a
// wall: palms fade out through 20-30 deg, conifers fade in through 25-42
// and out again toward the polar rim, broadleaf owns the middle. jungle:
// a tropical river corridor, where the canopy closes (the Amazon answer).
export function speciesFor(lat, lon, h, waterD, roll, jungle = false) {
  const aLat = Math.abs(lat);
  if (aLat > 70) return null;                                  // polar rim
  const snowline = Math.max(6, 60 - (aLat - 40) * 1.6);
  if (h > snowline - 2) return roll < 0.12 ? 'scrub' : null;   // above the trees
  if (jungle) {
    return roll < 0.58 ? 'broadleaf' : roll < 0.76 ? 'palm'
      : roll < 0.92 ? 'fern' : 'scrub';
  }
  const desert = desertAt(lat, lon);
  // the weights: each species' share of this latitude, blended at the seams
  let wPalm = (1 - sm(20, 30, aLat)) * (waterD < 60 ? 1.3 : 0.45);
  let wBroad = (0.25 + 0.75 * sm(8, 20, aLat)) * (1 - sm(48, 62, aLat))
    + (1 - sm(14, 22, aLat)) * 0.55;
  let wConifer = sm(25, 42, aLat) * (1 - sm(62, 70, aLat)) * 1.1;
  let wScrub = 0.3;
  let wFern = jungleAdj(aLat) * 0.2;
  if (desert) {
    // the belts thin to scrub and oasis palms — noise already broke the edges
    wBroad *= 0.08; wConifer *= 0.1; wScrub = 0.55;
    wPalm = waterD < 55 ? 0.5 : 0.04;
    if (roll > (wScrub + wPalm) * 0.9) return null;            // bare waste
  }
  const sum = wPalm + wBroad + wConifer + wScrub + wFern;
  let r = roll * sum;
  if ((r -= wPalm) < 0) return 'palm';
  if ((r -= wBroad) < 0) return 'broadleaf';
  if ((r -= wConifer) < 0) return 'conifer';
  if ((r -= wFern) < 0) return 'fern';
  return 'scrub';
}
// ferns creep out of the jungle into the wet subtropics
function jungleAdj(aLat) { return 1 - sm(12, 22, aLat); }

// what the 1700s built here: palm-thatch and adobe huts in the hot belts,
// chimneyed cottages in the temperate and northern ones (the layer gives
// cottages a gable and a chimney, huts a bare hip of thatch). The boundary
// blends: through 20-28 deg a hamlet may build either way on its own dice.
export function buildingKind(aLat, desert, roll = 0.5) {
  if (desert) return 'hut';
  return roll < sm(20, 28, aLat) ? 'cottage' : 'hut';
}

const harbourAnchors = HARBOURED.map((p) => latLonToWorld(p.lat, p.lon));
const nearHarbour = (x, z, r) =>
  harbourAnchors.some((a) => Math.hypot(a.x - x, a.z - z) < r);

// the full decoration list for cell (cx, cz): [{ kind, x, z, y, s, rot,
// tint: [r,g,b] }]. density scales instance count (the gfx tier lever).
export function decorForCell(cx, cz, density = 1) {
  const x0 = cx * DECOR_CELL, z0 = cz * DECOR_CELL;
  const centre = worldToLatLon(x0 + DECOR_CELL / 2, z0 + DECOR_CELL / 2);
  const coastC = coastDistGame(centre.lat, centre.lon);
  const riverC = riverDistGame(centre.lat, centre.lon);
  // a cell nowhere near a waterline grows nothing — open sea and deep
  // inland both bail before any lattice work
  if (coastC > DECOR_CELL * 2.5 && riverC > DECOR_CELL * 2) return [];

  const out = [];
  for (let j = 0; j < NPTS; j++) {
    for (let i = 0; i < NPTS; i++) {
      const gi = cx * NPTS + i, gj = cz * NPTS + j; // absolute lattice indices
      const jx = unit2(gi * 3 + 1, gj * 3 + 2);
      const jz = unit2(gi * 3 + 2, gj * 3 + 1);
      const x = x0 + (i + 0.15 + 0.7 * jx) * STEP;
      const z = z0 + (j + 0.15 + 0.7 * jz) * STEP;
      const ll = worldToLatLon(x, z);
      const h = elevation(ll.lat, ll.lon);
      if (h < 0.6 || h > 55) continue;               // dry land, below the crags
      const coastD = coastDistGame(ll.lat, ll.lon);
      const riverD = riverDistGame(ll.lat, ll.lon);
      const aLat = Math.abs(ll.lat);
      // the Amazon answer: a tropical river corridor is JUNGLE — a wider
      // band, denser clumps, closed canopy
      const jungle = aLat < JUNGLE_LAT && riverD < JUNGLE_BAND;
      if (coastD > SHORE_BAND && riverD > RIVER_BAND && !jungle) continue;
      const waterD = Math.min(coastD, riverD);
      // forests come in clumps, not a uniform dusting, and thin away
      // from the water's edge
      const clump = fbm2(x * 0.013 + 5, z * 0.013);
      if (clump < (jungle ? 0.06 : 0.3)) continue;
      const roll = unit2(gi * 5 + 11, gj * 5 + 7);
      const keep = density * (jungle ? 1 : 1 - 0.55 * Math.min(1, waterD / SHORE_BAND));
      if (unit2(gi * 9 + 2, gj * 9 + 4) > keep) continue;
      const kind = speciesFor(ll.lat, ll.lon, h, waterD, roll, jungle);
      if (!kind) continue;
      const g = 0.85 + 0.3 * unit2(gi * 13 + 1, gj * 13 + 8);
      out.push({
        kind, x, z, y: h,
        // the jungle canopy stands taller than a temperate copse
        s: (0.75 + 0.6 * unit2(gi * 17 + 3, gj * 17 + 9)) * (jungle ? 1.35 : 1),
        rot: unit2(gi * 19 + 4, gj * 19 + 6) * Math.PI * 2,
        tint: [g, g, g],
        // every plant is GROWN unique from this seed (flora.js)
        seed: Math.floor(unit2(gi * 53 + 7, gj * 53 + 13) * 2147483647),
      });
    }
  }

  // ---- the hamlet pass: a settlement on the water's edge, sometimes ----
  // NEVER on a tropical river: the deep jungle has no hamlets — the Amazon
  // is El Dorado's country, and in the 1700s nobody built on that bank
  const sroll = unit2(cx * 7 + 3, cz * 7 + 5);
  const polar = Math.abs(centre.lat) > 70; // nobody wintered past the rim
  const coastHamlet = !polar && coastC < 300 && sroll < 0.28;
  const riverHamlet = !polar && !coastHamlet && riverC < 180 && sroll > 0.6 && sroll < 0.74
    && Math.abs(centre.lat) >= JUNGLE_LAT;
  if (coastHamlet || riverHamlet) {
    // best site: the flat spot nearest the water on a coarse sweep
    let site = null, bestD = Infinity;
    for (let j = 0; j < NPTS; j += 2) {
      for (let i = 0; i < NPTS; i += 2) {
        const x = x0 + (i + 0.5) * STEP, z = z0 + (j + 0.5) * STEP;
        const ll = worldToLatLon(x, z);
        const h = elevation(ll.lat, ll.lon);
        if (h < 1.2 || h > 14) continue;
        const wd = Math.min(coastDistGame(ll.lat, ll.lon), riverDistGame(ll.lat, ll.lon));
        if (wd < bestD) { bestD = wd; site = { x, z }; }
      }
    }
    if (site && bestD < 90 && !nearHarbour(site.x, site.z, 320)) {
      const sll = worldToLatLon(site.x, site.z);
      const aLat = Math.abs(sll.lat);
      const desert = desertAt(sll.lat, sll.lon);
      const tint = hutTint(aLat, desert);
      const kind = buildingKind(aLat, desert, unit2(cx * 47 + 6, cz * 47 + 8));
      const nHuts = 3 + Math.floor(unit2(cx * 23 + 1, cz * 23 + 2) * 4);
      let stood = 0;
      for (let k = 0; k < nHuts; k++) {
        const a = unit2(cx * 29 + k, cz * 29 + k * 3) * Math.PI * 2;
        const r = 9 + unit2(cx * 31 + k * 2, cz * 31 + k) * 20;
        const hx = site.x + Math.sin(a) * r, hz = site.z + Math.cos(a) * r;
        const hll = worldToLatLon(hx, hz);
        const hh = elevation(hll.lat, hll.lon);
        if (hh < 1.0 || hh > 18) continue;
        stood++;
        out.push({
          kind, x: hx, z: hz, y: hh,
          s: 0.85 + 0.35 * unit2(cx * 37 + k, cz * 37 + k * 5),
          rot: unit2(cx * 41 + k * 7, cz * 41 + k) * Math.PI * 2,
          tint,
        });
      }
      // a proper 1700s village raises a church: temperate hamlets of five
      // or more cottages put one at the heart of the cluster
      if (kind === 'cottage' && stood >= 4) {
        const chh = elevation(sll.lat, sll.lon);
        if (chh > 1.0 && chh < 18) {
          out.push({
            kind: 'church', x: site.x, z: site.z, y: chh,
            s: 1, rot: unit2(cx * 43 + 5, cz * 43 + 9) * Math.PI * 2,
            tint: [0.95, 0.95, 0.95],
          });
        }
      }
    }
  }

  // the hamlet always survives the cap — trees thin first — and the ground
  // the village stands on is cleared of trunks through roofs
  const SETTLE = ['hut', 'cottage', 'church'];
  const town = out.filter((i) => SETTLE.includes(i.kind));
  let veg = out.filter((i) => !SETTLE.includes(i.kind));
  if (town.length) {
    veg = veg.filter((v) => !town.some((t) => Math.hypot(t.x - v.x, t.z - v.z) < 12));
  }
  const room = Math.max(0, DECOR_MAX - town.length);
  if (veg.length > room) veg = veg.slice(0, room);
  return veg.concat(town);
}
