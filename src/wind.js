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
//
// ---- THE MAGNITUDES ARE REAL m/s (rebuilt 2026-07-26) ----
// The first table was sized like a light breeze EVERYWHERE: measured global
// maximum 9.19 m/s, at lat 45, and under 3 m/s over a THIRD of the sailable
// world (34.4% of lat -70..70). weather.js then floored the wind at 10 m/s, so
// the floor sat ABOVE the field's own ceiling and won almost everywhere: harbour wind read exactly
// 10.00 at every latitude on earth and blue water read 10.00 at fourteen of
// nineteen sample latitudes. The whole trade-wind system — the one thing this
// module exists to carry — was invisible, and because seaBandsFor takes the
// wind, so was every difference in the sea (swell band 1.54 and significant
// height 2.88 m from the doldrums to the Southern Ocean).
//
// These are surface-wind climatology, not invention: trades 7-9 m/s, the
// westerlies 12 m/s in the forties and ~15 in the fifties (the windiest water
// on earth), doldrums and horse latitudes genuinely light — the calm belts are
// the interesting part, and they are what makes the trades and the westerlies
// feel like something. The floor is now a light breeze (weather.js
// WIND_FLOOR), so the belts read AS the floor and everything else reads its
// own latitude.
//
// Three mechanical notes on the placement. The zero-crossings are where a calm
// belt lands, so they go where the real ones are (measured: 32.54 deg, and the
// polar transition pushed out to 74.35 where nothing sails) — the old table put
// one at 58.00, which flatly becalmed the screaming fifties (2.12 m/s at 55).
// The fifties get their own knot: with the westerlies as a single band at 45 the
// vector interpolation ran them straight down into the polar limb. And a
// zero-crossing is a DIRECTION discontinuity as well as a calm — `from` flips
// through 180 deg as the toward-vector passes through the origin — so it belongs
// in water nobody beats through: weather.js's floor keeps the speed sailable
// there, but a ship crossing 32.5 deg gets the wind round her ears. That is
// inherited behaviour (the old table's 30 deg crossing did the same) and the
// gradient clause in verify-wind measures speed only.
export const WIND_BANDS = [
  { lat: 0,  tx: -4.2,  tz: 0.0 },   //  4.2  ITCZ / doldrums: light, westward
  { lat: 8,  tx: -3.4,  tz: 3.4 },   //  4.8  the doldrums' edge, turning to SW
  { lat: 16, tx: -6.4,  tz: 6.4 },   //  9.1  NE trades, full
  { lat: 25, tx: -5.6,  tz: 5.6 },   //  7.9  the trades easing toward the highs
  { lat: 32, tx: -0.4,  tz: 0.4 },   //  0.6  horse latitudes: the calm belt
  { lat: 44, tx: 8.5,   tz: -8.5 },  // 12.0  the roaring forties
  { lat: 54, tx: 10.6,  tz: -10.6 }, // 15.0  the screaming fifties: windiest
  { lat: 66, tx: 6.2,   tz: -6.2 },  //  8.8  westerlies easing at the ice edge
  { lat: 80, tx: -4.2,  tz: 4.2 },   //  5.9  polar easterlies -> toward SW
  { lat: 90, tx: -3.2,  tz: 3.2 },   //  4.5
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
