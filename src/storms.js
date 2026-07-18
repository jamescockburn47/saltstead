// Storms — pure, deterministic, no THREE/DOM. verify-storms.mjs guards it.
//
// Procedural moving cyclones born in the real hurricane belts, tracking WNW and
// recurving poleward the way real hurricanes do. They drive a vortex wind (calm
// eye, gale at the eyewall), a raised sea, gloom, and a danger disc the helm
// watch heaves-to for. Deterministic in sim-time t (invariant 6): same waters,
// same season, same storms — this is what replaces the retired live weather.

import { unit2 } from './noise.js';
import { latLonToWorld, dxWrap, wrapX } from './earth.js';

const EPOCH = 420;   // seconds a storm generation runs
const LIFE = 560;    // a storm lives ~1.3 epochs, so generations overlap
const PER = 2;       // storms per belt per epoch
const R = 4200;      // storm radius (game m) — a system you sail into
const DRIFT = 7;     // game m/s the eye tracks
export const STORM_DANGER_R = 3000; // inside this of the eye is the dangerous eyewall

// hurricane birth boxes: tropical N Atlantic, NW Pacific, S Indian (hemi sets
// the cyclonic spin: +1 north = CCW, -1 south = CW)
const BELTS = [
  { lat: 14, lon: -50, latR: 7, lonR: 22, hemi: 1 },
  { lat: 16, lon: 135, latR: 7, lonR: 22, hemi: 1 },
  { lat: -14, lon: 70, latR: 7, lonR: 20, hemi: -1 },
];

// storms alive at sim-time t — deterministic in (epoch, belt, slot)
export function stormsAt(t) {
  const out = [];
  const e0 = Math.floor(t / EPOCH);
  for (let e = e0 - 1; e <= e0; e++) {           // this generation + the last one's tail
    for (let bi = 0; bi < BELTS.length; bi++) {
      const belt = BELTS[bi];
      for (let k = 0; k < PER; k++) {
        const s = unit2(e * 31.7 + bi * 7.1 + k * 3.3, e * 5.9 + k * 13.1);
        const s2 = unit2(e * 9.3 + k * 17.7, bi * 11.1 + e * 2.3);
        const birthT = e * EPOCH + s * (EPOCH * 0.6);
        const age = t - birthT;
        if (age < 0 || age > LIFE) continue;
        const b = latLonToWorld(belt.lat + (s - 0.5) * 2 * belt.latR,
          belt.lon + (s2 - 0.5) * 2 * belt.lonR);
        const turn = Math.min(1, age / LIFE);      // real arc: WNW early, NE late
        const dirX = -1 + 2 * turn;                // west -> east
        const dirZ = -belt.hemi;                   // poleward (north = -z)
        const len = Math.hypot(dirX, dirZ) || 1;
        out.push({
          id: `st-${e}-${bi}-${k}`,
          x: wrapX(b.x + (dirX / len) * DRIFT * age),
          z: b.z + (dirZ / len) * DRIFT * age,
          r: R, intensity: Math.sin(Math.PI * turn), spin: belt.hemi,
        });
      }
    }
  }
  return out;
}

// the cyclonic "blows-toward" vector at an offset (dx,dz) from the eye: tangential
// (CCW north / CW south) with a little inflow so it spirals in. Exported for the gate.
export function vortexToward(dx, dz, spin) {
  const d = Math.hypot(dx, dz) || 1;
  const rx = dx / d, rz = dz / d;                  // radial, eye -> point
  const tx = rz * spin, tz = -rx * spin;           // tangential (CCW in the north)
  return { x: tx - rx * 0.25, z: tz - rz * 0.25 }; // + inflow toward the eye
}

// vortex wind if the point is inside a storm, else null. Calm eye, gale eyewall.
export function stormWindAt(x, z, t) {
  let best = null, bestD = Infinity;
  for (const s of stormsAt(t)) {
    const dx = dxWrap(s.x, x), dz = z - s.z;
    const d = Math.hypot(dx, dz);
    if (d < s.r && d < bestD) { bestD = d; best = { s, dx, dz, d }; }
  }
  if (!best) return null;
  const { s, dx, dz, d } = best;
  const w = vortexToward(dx, dz, s.spin);
  const rr = d / s.r;
  const speed = 26 * s.intensity * Math.sin(rr * Math.PI); // 0 at eye and edge, gale at the eyewall
  return { from: Math.atan2(-w.x, -w.z), speed: Math.max(0, speed) };
}

// ---- storm SAILING (docs/PASSAGE.md) — the captain's gamble ----
// The OUTER BAND, between the danger disc and the rim, carries the storm's
// own wind and sea in a ring: ride it and the gait multiplies toward
// BAND_GAIN. The helm watch will never do this for you — it heaves to at
// danger ahead; band riding is wheel work (T), eyes open, rig at stake.
export const BAND_GAIN = 1.35;

export function stormBandAt(x, z, t) {
  let gain = 1;
  for (const s of stormsAt(t)) {
    const d = Math.hypot(dxWrap(s.x, x), z - s.z);
    if (d >= s.r || d <= STORM_DANGER_R) continue;
    // 0 at both edges of the band, full gain mid-band
    const u = (d - STORM_DANGER_R) / (s.r - STORM_DANGER_R);
    const ring = Math.sin(u * Math.PI);
    gain = Math.max(gain, 1 + (BAND_GAIN - 1) * ring * s.intensity);
  }
  return gain;
}

// SHORTEN SAIL OR TEAR CANVAS: above REEF_WIND, sheeted harder than
// REEF_TRIM, the rig pays per second — ramping with both the excess wind
// and the excess sheet. The helmsman reefs himself (main.js clamps his trim
// in a gale); the captain at the wheel may press harder, and pays in rig.
export const REEF_WIND = 19;  // m/s — a whole gale wants shortened sail
export const REEF_TRIM = 0.5; // the deepest honest reef

export function canvasRisk(windSpeed, trim) {
  if (windSpeed <= REEF_WIND || trim <= REEF_TRIM) return 0;
  const overWind = Math.min(1, (windSpeed - REEF_WIND) / 12);
  const overSheet = (trim - REEF_TRIM) / (1 - REEF_TRIM);
  return 0.012 * overWind * overSheet; // rig fraction per second, full press in a hurricane
}

// sea/sky/hazard at a point: 'storm' state inside, a raised sea and gloom near
// the eye, and a danger [0..1] for the eyewall (helm heaves-to; routing avoids)
export function stormFieldAt(x, z, t) {
  let danger = 0, gloom = 0, seaScale = 1, inStorm = false;
  for (const s of stormsAt(t)) {
    const d = Math.hypot(dxWrap(s.x, x), z - s.z);
    if (d >= s.r) continue;
    const near = s.intensity * (1 - d / s.r);
    if (near < 0.06) continue; // a newborn/dying/rim storm doesn't yet grey the sky
    inStorm = true;
    gloom = Math.max(gloom, 0.75 * near);          // rises from ~0 at the rim, no snap
    seaScale = Math.max(seaScale, 1 + 1.4 * near);
    if (d < STORM_DANGER_R) danger = Math.max(danger, s.intensity * (1 - d / STORM_DANGER_R));
  }
  return { weatherState: inStorm ? 'storm' : 'clear', gloom, seaScale, danger };
}
