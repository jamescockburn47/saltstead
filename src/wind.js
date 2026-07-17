// The wind field — pure, no THREE, no DOM. verify-wind.mjs guards it.
//
// A deterministic, procedural, latitude-banded wind: the trade-wind system that
// governs age-of-sail routes. Replaces the old live-weather feed (non-
// deterministic, single global value). This is the third leg of routing beside
// the open-sea gait and the currents — a leg you can BEAT costs its VMG, so the
// router prefers the reach, and the historic routes fall out of the cost.
//
// World frame (earth.js): +x = east, +z = south, so worldToLatLon gives
// lat = -z/M_PER_DEG. Yaw convention (shipframe/shipphysics): forward =
// (sin yaw, cos yaw), so yaw 0 = +z = south, yaw +pi/2 = +x = east. `from` is
// the direction the wind blows FROM, as a yaw.

import { worldToLatLon } from './earth.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// Wind as a "blows-TOWARD" vector by |latitude|, world frame (tx = east
// component, tz = south component), speed baked into the magnitude (m/s).
// Interpolating the VECTOR (not the angle) rotates the direction smoothly AND
// drops the magnitude to ~0 through the horse latitudes, where trade and
// westerly limbs oppose — exactly the real calm belts. Northern hemisphere;
// the south mirrors by flipping the north-south (tz) component.
//   NE trades (from NE)  -> toward SW = (tx<0, tz>0)
//   westerlies (from SW) -> toward NE = (tx>0, tz<0)
export const WIND_BANDS = [
  { lat: 0,  tx: -1.5, tz: 0.0 },  // ITCZ / doldrums: light, westward
  { lat: 15, tx: -5.0, tz: 5.0 },  // NE trades  -> toward SW
  { lat: 30, tx: 0.0,  tz: 0.0 },  // horse latitudes: calm
  { lat: 45, tx: 6.5,  tz: -6.5 }, // westerlies -> toward NE (the roaring belt)
  { lat: 65, tx: -3.5, tz: 3.5 },  // polar easterlies -> toward SW
  { lat: 90, tx: -1.5, tz: 1.5 },
];

function towardAt(latAbs) {
  const a = clamp(latAbs, 0, 90);
  for (let i = 1; i < WIND_BANDS.length; i++) {
    if (a <= WIND_BANDS[i].lat) {
      const p = WIND_BANDS[i - 1], q = WIND_BANDS[i];
      const t = (a - p.lat) / (q.lat - p.lat);
      return { tx: p.tx + (q.tx - p.tx) * t, tz: p.tz + (q.tz - p.tz) * t };
    }
  }
  const last = WIND_BANDS[WIND_BANDS.length - 1];
  return { tx: last.tx, tz: last.tz };
}

// wind at a world point -> { from (rad, yaw the wind blows FROM), speed (m/s) }
export function windAt(x, z) {
  const { lat } = worldToLatLon(x, z);
  let { tx, tz } = towardAt(Math.abs(lat));
  if (lat < 0) tz = -tz; // mirror north-south for the southern hemisphere
  const speed = Math.hypot(tx, tz);
  // FROM = the yaw pointing back along the wind (opposite the toward vector);
  // yaw = atan2(xcomp, zcomp), so from = atan2(-tx, -tz).
  const from = Math.atan2(-tx, -tz);
  return { from, speed };
}
