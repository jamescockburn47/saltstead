// The navigator's craft — pure, no THREE, no DOM. verify-navigation.mjs
// guards it. Everything here reads the SAME celestial frame the 3D sky
// renders (skymath.celestialAngles), so the planisphere and the star sight
// can never disagree with the heavens over the deck.
//
// The one true thing this module teaches: THE POLE STAR'S ALTITUDE IS YOUR
// LATITUDE. Every sailor for a thousand years navigated on that fact.

import { STAR_CATALOGUE, starHorizon, starField } from './skymath.js';

// ---- visibility: the weather gates the instrument ----
// mirrors sky.js star opacity: max(0, nightness - 0.25) * (1 - gloom)
export function canSight(nightness, gloom) {
  if (nightness < 0.45) return { ok: false, reason: 'daylight' };
  if (gloom > 0.45) return { ok: false, reason: 'overcast' };
  return { ok: true };
}

// ---- the star sight ----
// North of the line you shoot Polaris; south of it the Southern Cross points
// to a starless pole (the historical method — there IS no southern pole star,
// which is itself worth learning). Returns degrees.
const POLARIS = STAR_CATALOGUE.find(([n]) => n === 'Polaris');

export function takeSight(t, latDeg) {
  if (latDeg >= 0) {
    const { alt } = starHorizon(POLARIS[1], POLARIS[2], t, latDeg);
    const altDeg = alt * (180 / Math.PI);
    return {
      star: 'Polaris',
      altDeg,
      latDeg: altDeg, // the whole method: read the altitude, that's your latitude
      south: false,
    };
  }
  // the south celestial pole stands exactly |lat| above the south horizon;
  // the Cross's long axis points at it
  return { star: 'the Southern Cross', altDeg: -latDeg, latDeg: -latDeg, south: true };
}

export function sightText(sight, trueLat) {
  const hemi = sight.south ? 'S' : 'N';
  const est = Math.abs(sight.latDeg).toFixed(1);
  const off = Math.abs(Math.abs(sight.latDeg) - Math.abs(trueLat));
  const verdict = off < 1 ? 'a fair sight' : 'rough seas made it a ragged sight';
  return sight.south
    ? `The Cross points the pole: ${est}\u00b0 above the south horizon \u2014 `
      + `we stand near ${est}\u00b0${hemi} (${verdict})`
    : `${sight.star} stands ${est}\u00b0 above the horizon \u2014 `
      + `so we stand near ${est}\u00b0${hemi} (${verdict})`;
}

// ---- the planisphere ----
// Stars above the horizon projected onto a disc: zenith at centre, horizon at
// the rim, NORTH UP (the chart convention; east lands left when you look up,
// right when you look down — we chart the looking-UP view, east LEFT, the way
// every planisphere is printed).
export function chartStars(t, latDeg) {
  const out = [];
  const put = (name, raH, decDeg, mag, warmth) => {
    const { alt, az } = starHorizon(raH, decDeg, t, latDeg);
    if (alt <= 0) return;
    const r = 1 - alt / (Math.PI / 2);      // zenith 0 -> horizon 1
    out.push({
      name,
      x: -Math.sin(az) * r,                 // east to the LEFT (sky convention)
      y: Math.cos(az) * r,                  // north UP (y positive = north rim)
      mag, warmth,
    });
  };
  for (const [name, ra, dec, mag, warmth] of STAR_CATALOGUE) put(name, ra, dec, mag, warmth);
  return out;
}

// the faint background field, same projection (dir is already equatorial)
export function chartBackground(t, latDeg, field = starField()) {
  const out = [];
  for (const s of field) {
    const dec = Math.asin(s.dir[1]) * (180 / Math.PI);
    const ra = (Math.atan2(s.dir[0], s.dir[2]) * (12 / Math.PI) + 24) % 24;
    const { alt, az } = starHorizon(ra, dec, t, latDeg);
    if (alt <= 0) continue;
    const r = 1 - alt / (Math.PI / 2);
    out.push({ x: -Math.sin(az) * r, y: Math.cos(az) * r, mag: s.mag });
  }
  return out;
}

// ---- the constellation figures, as star-name pairs ----
export const CONSTELLATION_LINES = [
  // the Plough: bowl + handle
  ['Dubhe', 'Merak'], ['Merak', 'Phecda'], ['Phecda', 'Megrez'], ['Megrez', 'Dubhe'],
  ['Megrez', 'Alioth'], ['Alioth', 'Mizar'], ['Mizar', 'Alkaid'],
  // Cassiopeia's W
  ['Caph', 'Schedar'], ['Schedar', 'Tsih'], ['Tsih', 'Ruchbah'], ['Ruchbah', 'Segin'],
  // Orion: shoulders, belt, feet
  ['Betelgeuse', 'Bellatrix'], ['Alnitak', 'Alnilam'], ['Alnilam', 'Mintaka'],
  ['Betelgeuse', 'Alnitak'], ['Bellatrix', 'Mintaka'], ['Rigel', 'Saiph'],
  ['Saiph', 'Alnitak'], ['Rigel', 'Mintaka'],
  // the Southern Cross + the Pointers
  ['Acrux', 'Gacrux'], ['Imai', 'Mimosa'], ['Alpha Cen', 'Hadar'],
];

// the finding trick, drawn dotted on the chart: Merak -> Dubhe points at
// Polaris; Gacrux -> Acrux points at the empty southern pole
export const POINTER_LINES = [
  ['Merak', 'Dubhe', 'Polaris'],
  ['Gacrux', 'Acrux', null], // null: extend toward the pole, no star waits there
];
