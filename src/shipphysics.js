// Ship physics — pure, no THREE, no DOM. verify-ship.mjs guards it.
// Convention matches shipframe.js: bow along local +z, forward = (sin yaw, cos yaw).

import { sailPower, speedTarget, wrapAngle } from './sailing.js';
import { waveHeight } from './waves.js';

// groundLine: the terrain elevation at which the hull stops. Positive = she
// can run her bow right up onto the sand (beachable); negative = she draws
// too much and fetches up on the shoal OFFSHORE — the longboat takes you in.
//
// THE LADDER'S PHYSICS DOCTRINE (shipyard.js sells these in this order):
// climbing a rung buys straight-line speed, broadside weight and berths; it
// SPENDS handiness and shallow water. The sloop turns on a doubloon and
// beaches; the galleon is a fortress that comes about like a cathedral.
export const SLOOP = {
  maxSpeed: 8.5,   // m/s, ~16.5 knots — arcade-brisk on purpose
  accel: 0.55,     // exponential approach rate when gaining speed
  drag: 0.35,      // and when losing it (sails luff, sea slows you)
  turnRate: 0.6,   // rad/s at full speed, full rudder
  draft: 0.45,     // hull sits this far below the sampled surface
  keel: 0.65,      // hull bottom below the group origin (ship.js buildHull)
  length: 9,
  beam: 3.2,
  groundLine: 0.05, // shallow draft: the bow takes the sand itself
};

export const CUTTER = {
  maxSpeed: 9.3, accel: 0.55, drag: 0.34, turnRate: 0.55,
  draft: 0.5, keel: 0.7, length: 11, beam: 3.6,
  groundLine: 0.03, // still takes the sand, just less of it
};

export const SCHOONER = {
  maxSpeed: 10.0, accel: 0.5, drag: 0.32, turnRate: 0.48,
  draft: 0.6, keel: 0.8, length: 13, beam: 4.2,
  groundLine: 0.01, // the last rung that beaches at all
};

export const BRIG = {
  maxSpeed: 10.5, accel: 0.4, drag: 0.3, turnRate: 0.4,
  draft: 0.9, keel: 1.1, length: 16, beam: 5.2,
  groundLine: -1.4, // deep draft: she anchors off and sends a boat in
};

export const CORVETTE = {
  maxSpeed: 11.2, accel: 0.38, drag: 0.3, turnRate: 0.36,
  draft: 1.1, keel: 1.3, length: 19, beam: 5.8,
  groundLine: -1.8,
};

export const FRIGATE = {
  maxSpeed: 11.8, accel: 0.34, drag: 0.28, turnRate: 0.3,
  draft: 1.4, keel: 1.6, length: 24, beam: 7.2,
  groundLine: -2.4,
};

export const GALLEON = {
  maxSpeed: 10.8, accel: 0.28, drag: 0.26, turnRate: 0.22,
  draft: 1.8, keel: 2.0, length: 30, beam: 9.0,
  groundLine: -3.0, // she anchors in the roads like a visiting cathedral
};

// every hull the game knows, smallest to largest — verify walks this
export const SPECS = { SLOOP, CUTTER, SCHOONER, BRIG, CORVETTE, FRIGATE, GALLEON };

// does this hull run up onto the beach, or must the boats go in?
export function beaches(spec) {
  return spec.groundLine > 0;
}

export function newShipState(x = 0, z = 0) {
  return { x, y: 0, z, yaw: 0, speed: 0, rudder: 0, trim: 0.5 };
}

// SWEEPS (and, for the great hulls, the longboat tow): the wind-proof
// crawl. Rowing pace grows with the hands pulling and shrinks with the
// hull — a sloop rows out of irons briskly, a galleon barely creeps behind
// her boat. Always slower than honest sailing: oars escape, sails travel.
export function oarSpeed(spec = SLOOP, crew = 0) {
  const rowers = Math.min(crew + 1, 12);          // the captain pulls too
  const raw = 0.55 + 0.16 * rowers;
  const size = (9 / spec.length) ** 0.6;          // the unit sloop rows best
  return Math.min(1.5, raw * size);
}

// POLING OFF: hard aground, the crew sets poles against the sand (or, for
// the hulls too proud to beach, the longboat runs the kedge anchor out and
// the capstan heaves her off). Seaward is read from the ground itself: of
// eight bearings around the hull, walk her along the one that shelves
// DOWNHILL fastest, with a small sternward tie-break so on a dead-flat bank
// she backs off the way she came on. Crew-scaled through oarSpeed — the same
// muscle that rows her rows her off — and the bow swings to face the water
// she is walked toward, so she floats free ready to sail. Mutates and
// returns s. groundAt(x, z) -> terrain height at a world point.
export function poleOff(s, dt, spec = SLOOP, crew = 0, groundAt) {
  const R = Math.max(spec.length, 14);
  let bx = 0, bz = 1, best = Infinity;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const gx = Math.sin(a), gz = Math.cos(a);
    const score = groundAt(s.x + gx * R, s.z + gz * R)
      + 0.05 * (gx * Math.sin(s.yaw) + gz * Math.cos(s.yaw)); // sternward nudge
    if (score < best) { best = score; bx = gx; bz = gz; }
  }
  const v = Math.max(0.5, oarSpeed(spec, crew));
  s.x += bx * v * dt;
  s.z += bz * v * dt;
  const err = wrapAngle(Math.atan2(bx, bz) - s.yaw);
  s.yaw += Math.max(-0.35 * dt, Math.min(0.35 * dt, err));
  s.speed = 0;
  return s;
}

// wind: { from, speed }. gait: open-sea distance multiplier (earth.js
// gaitFactor) — it scales the world slipping past, not the hull's dynamics,
// so trim/turn feel is identical inshore and out. furl: the crew hands the
// sails (anchorage / under a beach) — no drive, she glides to rest on drag.
// oarDrive: sweeps out (oarSpeed above) — a floor under the speed target
// that ignores the wind entirely, so she can crawl dead to windward or up a
// walled river. Mutates and returns s.
export function stepShip(s, wind, dt, spec = SLOOP, gait = 1, furl = false, oarDrive = 0, current = { vx: 0, vz: 0 }) {
  const power = furl ? 0 : sailPower(s.yaw, wind.from, s.trim);
  const target = Math.max(speedTarget(power, wind.speed, spec.maxSpeed), oarDrive);
  const rate = target > s.speed ? spec.accel : spec.drag;
  s.speed += (target - s.speed) * (1 - Math.exp(-rate * dt));

  // rudder bites with waterflow: barely steer when becalmed — but sweeps
  // lever her round regardless (one bank pulls, the other holds)
  let bite = 0.15 + 0.85 * Math.min(1, s.speed / spec.maxSpeed);
  if (oarDrive > 0) bite = Math.max(bite, 0.5);
  s.yaw += s.rudder * spec.turnRate * bite * dt;

  // SET AND DRIFT, honestly split (2026-07-25): the ALONG-TRACK set passes
  // whole — the fair (or foul) current every passage plan banks on, gait-
  // scaled like her own way — but the BEAM set is bounded by her way: a keel
  // makes LEEWAY, a few degrees of crab, never broadside surfing. Unbounded,
  // a 2-knot sloop in the Gulf Stream's 2.2 m/s travelled SIDEWAYS — the
  // report that named this rule.
  const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
  const along = current.vx * fx + current.vz * fz;
  let lx = current.vx - along * fx, lz = current.vz - along * fz;
  const lm = Math.hypot(lx, lz);
  const cap = 0.35 * (s.speed + 0.4);
  if (lm > cap) { lx *= cap / lm; lz *= cap / lm; }
  s.x += (fx * (s.speed + along) + lx) * gait * dt;
  s.z += (fz * (s.speed + along) + lz) * gait * dt;
  return s;
}

// ================= A BREAKER UNDER HER (Phase D, 2026-07-26) =================
// The field the shader whitens is the field that shoves her: waves.js
// breaking(). One function decides where the sea is breaking, so what the eye
// sees and what the hull feels can never be two different seas — the parity
// doctrine, carried past the waterline.
//
// NOBODY DIES IN SALTSTEAD. There is no capsize here, no knockdown, no hull
// damage: a breaker costs WAY and HEADING and nothing else. That is not a
// softening, it is the drama — head into a breaking sea and she takes the shove
// on the bow and holds her course, which is exactly what the seamanship says to
// do; take the same sea on the beam in a gale and she is slewed toward the
// breaker's own course, stops half dead and staggers. The player learns to point
// her the right way because the sea rewards it, not because a message says so.
//
// THE ROLL IS HANDED BACK, NOT FOLDED IN. shipAttitude's four samples ARE the
// sea, and verify-seamotion's roll-rate and step-shape thresholds measure exactly
// that surface; a kick added inside it would be measured as if the water had
// done it. So breakerEffect returns the roll and main.js applies it beside the
// wind heel — which is where the other visual-only lean already lives.
// HEAD, BEAM AND FOLLOWING ARE THREE DIFFERENT SEAS, and the first cut of this did
// not know it: the way loss and the slew both went as |sin(relative angle)|, which
// is symmetric fore and aft, so a FOLLOWING breaking sea — the classic broach, the
// one that puts a stern-quarter wave under her and takes the rudder's bite away —
// cost exactly nothing. The gate's own "head to it" case was a following sea
// mislabelled, and the claim that heading into a breaking sea was rewarded rode on
// it. A cold review caught both.
//
// The fix is one term and it IS the seamanship. Let rel be her heading relative to
// the breaker's own course: 0 running with it, +-pi head to it. Then
//     d(yaw)/dt = +yawRate * sin(rel)
// has an UNSTABLE fixed point at rel = 0 and a STABLE one at rel = pi. A following
// sea therefore diverges — she starts to slew, the slew grows, she broaches and ends
// up head to the sea — while head to it she is dead stable and holds her course
// exactly. Nobody had to write a rule; the sign of one sine does it.
export const BREAKER = {
  brkFloor: 0.12, // below this the crest is spilling, not breaking: nothing doing
  surge: 1.30,    // m/s of set along the breaker's own course at full strength
  wayLoss: 0.55,  // e-folding rate of her way under a full BEAM breaker, per second
  // a breaker on the BOW checks her too — it is a wall of water either way — but it
  // does not steal her heading. That is the whole of "safe and dramatic": she stops
  // and pitches, and stays pointing where the helm put her.
  headCheck: 0.55,
  yawRate: 0.30,  // rad/s of slew at the beam, and the broach's growth rate
  roll: 0.22,     // rad of stagger a full beam breaker throws in (12.6 deg)
};

// brk: waves.js breaking() under the hull, in [0, 1]. dirx/dirz: the wind sea's
// unit travel direction (waves.js waveBandDir). gait scales the SET, exactly as
// stepShip scales the current's, so a breaker feels the same inshore and out.
// Mutates s (way and heading) and returns { surge, beam, roll, way }.
export function breakerEffect(s, brk, dirx, dirz, spec = SLOOP, dt = 1 / 30, gait = 1) {
  const f = BREAKER.brkFloor;
  const b = Math.max(0, Math.min(1, (Math.min(1, brk) - f) / (1 - f)));
  if (b <= 0) return { surge: 0, beam: 0, roll: 0, way: 1 };
  // a light hull is thrown about and a galleon shrugs — the SAME steadiness
  // shipAttitude uses, so one hull answers one way to both
  const stiff = Math.min(1, (9 / spec.length) ** 0.7);
  // WHERE THE SEA IS RELATIVE TO HER: rel = 0 running with it, +-pi head to it,
  // +-pi/2 on the beam. sin(rel) is the beam-ness and its sign is which way she is
  // thrown; cos(rel) tells a following sea from a head one.
  const rel = wrapAngle(s.yaw - Math.atan2(dirx, dirz));
  const sr = Math.sin(rel), cr = Math.cos(rel);
  const beam = Math.abs(sr);
  const v = BREAKER.surge * b * stiff;
  s.x += dirx * v * dt * gait;
  s.z += dirz * v * dt * gait;
  // HER WAY: a beam breaker is a wall, a bow breaker is an impact, and a following
  // one does not check her at all — she surfs on it. The EXACT exponential, not
  // (1 - k dt): stepShip uses the exponential form for the same reason, because a
  // linear decay per frame makes the outcome depend on the frame rate and this game
  // runs anywhere from 20 to 144 Hz.
  const check = beam + BREAKER.headCheck * Math.max(0, -cr);
  const way = Math.exp(-BREAKER.wayLoss * b * check * stiff * dt);
  s.speed *= way;
  // HER HEADING: see the BREAKER comment. +sin(rel) is unstable at rel = 0 (the
  // following sea broaches her) and stable at rel = pi (head to it she holds).
  // Bounded by yawRate * dt at the beam, and smooth — no clamp, so no snap.
  s.yaw += BREAKER.yawRate * b * stiff * sr * dt;
  return { surge: v, beam, roll: -sr * BREAKER.roll * b * stiff, way, rel };
}

// Buoyancy attitude from four hull sample points on the live wave field.
// Returns { y, pitch, roll } — pitch/roll in radians, y is hull-centre height.
// ground (optional): (x, z) => terrain height. Wherever the sea floor rises
// past the keel, the hull RIDES it — beached on a slope the bow lifts and the
// deck takes the sand's tilt, instead of the hull merging into the land.
export function shipAttitude(s, t, spec = SLOOP, ground = null) {
  const lift = spec.draft + (spec.keel || 0);
  const surf = ground
    ? (x, z) => Math.max(waveHeight(x, z, t), ground(x, z) + lift)
    : (x, z) => waveHeight(x, z, t);
  const sy = Math.sin(s.yaw), cy = Math.cos(s.yaw);
  const hl = spec.length * 0.42, hb = spec.beam * 0.45;
  const bow = surf(s.x + sy * hl, s.z + cy * hl);
  const stern = surf(s.x - sy * hl, s.z - cy * hl);
  const star = surf(s.x + cy * hb, s.z - sy * hb);
  const port = surf(s.x - cy * hb, s.z + sy * hb);
  // a heavy hull stands STIFF in a seaway: her inertia refuses the chop a
  // dinghy answers. Scaled against the unit sloop — the galleon rides the
  // same sea at well under half the sloop's rock.
  const steadiness = Math.min(1, (9 / spec.length) ** 0.7);
  return {
    y: (bow + stern + star + port) / 4 - spec.draft,
    pitch: Math.atan2(stern - bow, hl * 2) * steadiness,
    roll: Math.atan2(port - star, hb * 2) * steadiness,
  };
}
