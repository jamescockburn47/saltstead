// The helmsman — pure course-keeping, no THREE, no DOM. verify-helmsman.mjs
// guards it; main.js gives the orders to a hand at the wheel.
//
// With a crew aboard the captain sets a course on the chart and a hand
// takes the helm: rudder toward the mark, trim kept honest for the point
// of sail, and the wind's NO-GO respected — a mark dead upwind is worked
// toward on the closest close-hauled heading, tacking on a slow clock the
// way a shorthanded watch actually would. The captain is freed for the
// deck, the hold, the guns — the ship keeps sailing.

import { IRONS, BEAT, optimalTrim, wrapAngle } from './sailing.js';
import { dxWrap } from './earth.js';

export const ARRIVE_R = 250;    // close enough: the mark is made
export const TACK_S = 50;       // seconds a watch holds each board upwind
const PINCH = IRONS + 0.12;     // a green hand's close-hauled — the old poor-VMG angle
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
// BEAT (sailing.js) is the VMG-optimal angle off the eye — the helmsman holds it
// upwind instead of pinching. The old close-hauled = IRONS + 0.12 made only ~half
// the achievable progress to windward (the audit's Gap 1).

// yaw/x/z: the ship; tx/tz: the mark; windFrom: wind direction (radians);
// t: seconds (drives the tack clock). Returns { rudder [-1..1], trim,
// arrived, tacking } — the caller applies rudder/trim while a hand is
// aboard to obey them.
// skill [0..1]: the hand at the wheel is only as good as who you signed — a green
// hand pinches (PINCH), a master holds the VMG-optimal beat (BEAT). Default 1.
export function helmOrder(yaw, x, z, tx, tz, windFrom, t = 0, skill = 1) {
  const dxw = dxWrap(x, tx); // shortest east-west delta across the world seam
  const dist = Math.hypot(dxw, tz - z);
  if (dist <= ARRIVE_R) {
    return { rudder: 0, trim: 0, arrived: true, tacking: false };
  }
  const bearing = Math.atan2(dxw, tz - z);
  // the eye of the wind: heading === windFrom is bow dead INTO it
  // (sailing.js convention — rel = heading - windFrom, 0 = in irons)
  const eye = windFrom;
  const offEye = wrapAngle(bearing - eye); // how far the mark sits off the eye
  const beat = PINCH + (BEAT - PINCH) * clamp01(skill); // green pinches, master optimal
  let want = bearing, tacking = false;
  if (Math.abs(offEye) < beat) {
    // the mark is inside the beat: hold the best board, swap on the clock
    tacking = true;
    const board = Math.abs(offEye) < 0.08
      ? (Math.floor(t / TACK_S) % 2 ? 1 : -1)  // dead upwind: alternate boards
      : Math.sign(offEye);
    want = eye + board * beat;
  }
  const err = wrapAngle(want - yaw);
  return {
    rudder: Math.max(-1, Math.min(1, err * 1.6)),
    trim: optimalTrim(wrapAngle(yaw - windFrom)),
    arrived: false,
    tacking,
  };
}

// Follow an ordered list of waypoints. ship: { yaw, x, z }. route: [{x,z}, …].
// i: the current target index (the caller stores it). Advances past any legs
// already reached (except the last), then issues a helmOrder for the active leg.
// `arrived` is true ONLY at the final waypoint; `next` is the (possibly advanced)
// index for the caller to keep.
export function helmRoute(ship, route, i, windFrom, t = 0, skill = 1) {
  if (!route || route.length === 0) return { rudder: 0, trim: 0, arrived: true, tacking: false, next: 0 };
  let idx = Math.max(0, Math.min(i, route.length - 1));
  while (idx < route.length - 1) {
    const m = route[idx];
    if (Math.hypot(dxWrap(ship.x, m.x), m.z - ship.z) <= ARRIVE_R) idx++;
    else break;
  }
  const m = route[idx];
  const o = helmOrder(ship.yaw, ship.x, ship.z, m.x, m.z, windFrom, t, skill);
  return { ...o, next: idx, arrived: o.arrived && idx === route.length - 1 };
}
