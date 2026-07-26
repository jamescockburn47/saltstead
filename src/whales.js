// Whales — the pure simulation half, no THREE, no DOM. verify-whales.mjs
// guards it; wildlifelayer.js gives the pods bodies.
//
// ---------------------------------------------------------------------------
// THE BUG THIS MODULE EXISTS TO KILL (2026-07-26)
// ---------------------------------------------------------------------------
// Until today the whale was drawn at a SHIP-RELATIVE offset:
//
//     wx = sx + sin(yaw + 1.9 + wAng) * range        // wildlifelayer.js, gone
//     wz = sz + cos(yaw + 1.9 + wAng) * range
//
// so she translated with the hull — you could never sail past her — and worse,
// because the ship's own yaw sat inside the bearing, putting the helm over
// swung a hundred-and-seventy-tonne animal round the ship like a fender on a
// warp. The owner's report was exact: "fixed to a point off the ship's hull,
// so they move in alignment with the boat rather than under their own speed."
//
// A whale has a world position, a course of her own, and no interest whatever
// in the player. So: pods are seeded per WORLD CELL (invariant 6 — the same
// water carries the same whales for every client, and never Math.random), they
// travel a great slow circuit in WORLD coordinates, and each animal's pose in
// the water comes from a sounding cycle running on the WORLD CLOCK. The ship
// overtakes a slow pod; a fast one crosses her bow. Nothing below reads the
// ship's position or heading — the one exception is the White Whale, who is a
// legend HUNTING the hull, and even she only stalks a lagged anchor
// (stalkAnchor) so a turn of the helm cannot move her.
//
// ---------------------------------------------------------------------------
// TWO SIGN CONVENTIONS, both load-bearing
// ---------------------------------------------------------------------------
// HEADING is the house yaw: forward = (sin h, cos h) — shipframe.js, and the
// frame the layer's `rotation.y` puts the body into.
//
// PITCH is THREE's `rotation.x` on a body whose bow lies along local +z.
// Rotation about x by t maps (0, 0, z) to y' = -z sin t, so the fluke tip at
// local (0, 0, -L/2) rises to y' = +(L/2) sin t: POSITIVE PITCH PUTS THE BOW
// DOWN AND THE FLUKES UP. That is why the sounding dive below pitches
// positive, and why flukeTipY/bowTipY exist — verify-whales holds the sounding
// against them, so nobody can flip the sign and leave the great animal diving
// tail-first.

import { unit2 } from './noise.js';
import { isLand, worldToLatLon, coastDistGame, wrapX } from './earth.js';

const TAU = Math.PI * 2;
const ease = (u) => u * u * (3 - 2 * u);

// ---------------------------------------------------------------------------
// SCALE, honestly
// ---------------------------------------------------------------------------
// This is the whaling age and she is the animal the age knew: a sperm whale.
// A bull runs 18-20 m against a SLOOP's 9 m of hull (shipphysics.js) — twice
// the ship, and the White Whale is a galleon's length of animal. verify-whales
// holds these against the shipyard ladder so the sizes can never quietly drift
// back to decorative.
export const BULL_LEN = 19;   // a bull sperm whale
export const COW_LEN = 15;    // the cows of the pod
export const CALF_LEN = 7.5;  // and a calf, near enough a sloop long
export const WHITE_LEN = 27;  // the White Whale of Mocha: a pale mountain

// Her shape as fractions of her length. THESE ARE THE MESH'S OWN NUMBERS:
// wildlifelayer.js imports BODY_R for the unit body's trunk radius, so the trim
// this module computes and the body the layer builds can never drift apart.
// HALF_BEAM is her widest half-width (the case, 1.22x the trunk) — the
// clearance the pod's formation is checked against.
export const BODY_R = 0.066;
export const HALF_BEAM = 0.086;

// ---------------------------------------------------------------------------
// THE SPAWN TABLE — deterministic pods per world cell
// ---------------------------------------------------------------------------
// One candidate pod per cell, present on a seeded roll. WHALE_CELL matches the
// merchant table's cell (merchants.js CELL); mean pod spacing is
// CELL/sqrt(POD_CHANCE) ~ 9.7 km, and only a track through the 2 x
// ENCOUNTER_FAR corridor meets one — at blue-water gait that is a pod within
// hailing range about every eight minutes (0.38/6000^2 x 3200 m x ~60 m/s).
// An event, not a parade.
export const WHALE_CELL = 6000;      // seeding cell, game metres
export const POD_CHANCE = 0.38;      // of cells carry a pod
export const POD_MAX = 5;            // the biggest pod (and the body pool)
export const WHALE_STREAM_R = 2600;  // the layer bodies pods inside this
// furthest a pod's circuit strays from her cell centre: R + weave on both axes
// at once (the weave rides x and z independently, so the excursion is diagonal
// — a flat R + weave bound is FALSE and verify-whales sweeps every cell for it)
export const POD_REACH = 1500 + 90 * Math.SQRT2;
export const WHALE_SEA = 1500;       // game metres to the nearest coast, minimum
// RETIRED 2026-07-26, and the retirement IS the fix. This was the whole of the
// old visibility rule: draw her at full strength until sixteen metres down, then
// stop. The sea is opaque, so between nought and sixteen what the eye actually
// got was the intersection of a twenty-metre body with the water plane — a
// flat-topped grey slab with a hard waterline edge. submergedFade below replaces
// it with a dissolve. Kept as a named tombstone rather than deleted, because the
// number reads plausible and someone will otherwise re-invent it.
export const WHALE_SEEN_RETIRED = -16;

// A pod's whole life as numbers: where her circuit lies, how fast and which
// way round she works it, how many animals, and the phase her cycle started
// on. Every field comes off the cell hash — same water, same whales, every
// client, every session. Returns null for an empty cell.
export function cellPod(cx, cz) {
  if (unit2(cx * 5.9 + 0.31, cz * 11.7 + 0.73) >= POD_CHANCE) return null;
  const seed = 1 + unit2(cx * 3.1 + 2.7, cz * 13.3 + 5.1) * 997;
  const R = 700 + unit2(seed + 1.1, 3.7) * 800;
  const speed = 1.9 + unit2(seed + 2.3, 7.1) * 1.3;   // 3.7-6.2 knots: a cruise
  const dir = unit2(seed + 3.5, 11.3) < 0.5 ? -1 : 1;
  return {
    id: `wh-${cx}-${cz}`,
    kind: 'pod',
    seed,
    n: podCount(seed),
    ox: (cx + 0.5) * WHALE_CELL,      // the circuit's centre
    oz: (cz + 0.5) * WHALE_CELL,
    R,
    speed,
    w: (dir * speed) / R,             // rad/s about the circuit
    a0: unit2(seed + 4.7, 13.9) * TAU,
    // she does not swim a compass line — but the weave is capped against the
    // circuit's own radius, so the harmonics can never modulate her speed by
    // more than about a fifth (verify-whales holds the envelope)
    weave: Math.min(40 + unit2(seed + 5.9, 17.3) * 50, R * 0.06),
    wp1: unit2(seed + 6.1, 19.7) * TAU,
    wp2: unit2(seed + 7.3, 23.1) * TAU,
    phase0: unit2(seed + 8.5, 29.3), // where in the sounding cycle she starts
    spread: 13 + unit2(seed + 9.7, 31.1) * 6, // metres between animals abreast
  };
}

// how many animals: singletons happen (an old bull works alone), but a pod is
// the ordinary case, and three or more carries a calf (memberLen)
export function podCount(seed) {
  const r = unit2(seed * 1.7 + 0.9, 37.1);
  if (r < 0.22) return 1;
  if (r < 0.48) return 2;
  if (r < 0.72) return 3;
  if (r < 0.89) return 4;
  return POD_MAX;
}

// WHERE THE POD IS, at world time t — closed form, so there is no integration
// state to drift, no client to disagree, and no frame rate to matter. She
// works a great slow circuit (a 900 m circle at 2.5 m/s is a 38-minute lap:
// over the minute an encounter lasts that is a steady course) with a weave
// laid over it so her track is a wandering loop rather than a compass line.
//
// The velocity is the ANALYTIC derivative of exactly the position above, so
// her heading is where she is actually going — never a separate guess that can
// disagree with her motion (verify-whales holds it against a finite
// difference). Returns { x, z, heading, speed }.
export function podPose(pod, t) {
  const a = pod.a0 + pod.w * t;
  const x = pod.ox + Math.sin(a) * pod.R + pod.weave * Math.sin(3 * a + pod.wp1);
  const z = pod.oz + Math.cos(a) * pod.R + pod.weave * Math.cos(2 * a + pod.wp2);
  const vx = pod.w * (Math.cos(a) * pod.R + 3 * pod.weave * Math.cos(3 * a + pod.wp1));
  const vz = pod.w * (-Math.sin(a) * pod.R - 2 * pod.weave * Math.sin(2 * a + pod.wp2));
  return { x, z, heading: Math.atan2(vx, vz), speed: Math.hypot(vx, vz) };
}

// Every pod within r of (px, pz) at time t, nearest first: [{ pod, x, z,
// heading, speed, dist }]. A pod over land or in thin water is vetoed on her
// CURRENT position, so a circuit that carries her toward a coast simply drops
// out of the world (the layer re-consults this on a slow poll, never per
// frame — the hash walk and the coast samples are far too dear for that).
export function podsNear(t, px, pz, r = WHALE_STREAM_R) {
  const out = [];
  const m = r + POD_REACH;
  const c0x = Math.floor((px - m) / WHALE_CELL), c1x = Math.floor((px + m) / WHALE_CELL);
  const c0z = Math.floor((pz - m) / WHALE_CELL), c1z = Math.floor((pz + m) / WHALE_CELL);
  for (let cz = c0z; cz <= c1z; cz++) {
    for (let cx = c0x; cx <= c1x; cx++) {
      const pod = cellPod(cx, cz);
      if (!pod) continue;
      const p = podPose(pod, t);
      const dist = Math.hypot(p.x - px, p.z - pz);
      if (dist > r) continue;
      // wrapX FIRST: past the antimeridian a raw x gives a longitude outside
      // ±180, where earth.js answers "open sea" for everything — which put
      // whales over Kamchatka until this line
      const ll = worldToLatLon(wrapX(p.x), p.z);
      if (isLand(ll.lat, ll.lon)) continue;
      if (coastDistGame(ll.lat, ll.lon) < WHALE_SEA) continue;
      out.push({ pod, ...p, dist });
    }
  }
  out.sort((a, b) => a.dist - b.dist);
  return out;
}

// ---------------------------------------------------------------------------
// THE POD'S FORMATION — loose, in her own frame
// ---------------------------------------------------------------------------
// Pod-local metres, the shipframe convention the layer rotates into: +z ahead
// of the leader, +x abreast. Alternating sides, each rank further out and well
// astern, with a seeded lateral jitter so the pod reads as a pod and not as a
// parade.
//
// THE CLEARANCE LAW, and it is a real one: every pair of animals must be clear
// either FORE-AND-AFT (their lag gap exceeds their combined half-lengths) or
// ABEAM (their side gap exceeds their combined half-beams). Two nineteen-metre
// bodies swimming through one another is unmissable. verify-whales sweeps every
// pod and every instant of the drift below against that law — which is why the
// drift lives HERE and not in the layer, where the gate could not see it.
export function memberOffset(pod, i) {
  if (i === 0) return { side: 0, lag: 0 };
  // a calf tucks in at her mother's flank, just outboard and a little astern,
  // where a real calf rides — she is not given a rank of her own
  if (isCalf(pod, i)) {
    const m = memberOffset(pod, i - 1);
    return {
      side: m.side + Math.sign(m.side || 1) * 0.5 * pod.spread,
      lag: m.lag - 0.35 * pod.spread,
    };
  }
  const s = i % 2 ? 1 : -1;
  const rank = Math.ceil(i / 2);
  const j = unit2(pod.seed + i * 7.3, 19.1);
  return {
    side: s * (0.9 + 0.35 * rank + 0.3 * j) * pod.spread,
    lag: -(0.5 + 1.9 * rank) * pod.spread,
  };
}

// the formation BREATHES: each animal wanders a couple of metres about her
// station on her own slow clock. Small on purpose — the clearance law above is
// checked with this included, and a loose pod is not a scattering one.
export function memberDrift(pod, i, t) {
  return {
    side: Math.sin(t * 0.11 + i * 2.3) * pod.spread * 0.13,
    lag: Math.sin(t * 0.08 + i * 1.7) * pod.spread * 0.09,
  };
}

// her station this instant: what the layer actually draws
export function memberStation(pod, i, t) {
  const o = memberOffset(pod, i), d = memberDrift(pod, i, t);
  return { side: o.side + d.side, lag: o.lag + d.lag };
}

// the last animal of a pod of three or more is a CALF — a cow-and-calf pair is
// what sells the scale of the adults, and she breathes with her mother
export function isCalf(pod, i) {
  return pod.kind === 'pod' && pod.n >= 3 && i === pod.n - 1;
}

export function memberLen(pod, i) {
  if (pod.kind === 'white') return WHITE_LEN;
  if (isCalf(pod, i)) return CALF_LEN * (0.9 + 0.2 * unit2(pod.seed + i * 2.3, 5.1));
  if (i === 0) return BULL_LEN * (0.94 + 0.12 * unit2(pod.seed + 1.7, 3.3));
  return COW_LEN * (0.9 + 0.2 * unit2(pod.seed + i * 3.1, 7.7));
}

// each animal carries her own offset into the sounding cycle — small, because
// a pod surfaces and sounds loosely TOGETHER (a few seconds apart, not a few
// minutes), and a calf comes up beside her mother
export function memberPhase(pod, i) {
  if (i === 0) return 0;
  if (isCalf(pod, i)) return memberPhase(pod, i - 1) + 0.004;
  return unit2(pod.seed + i * 11.3, 2.9) * 0.055;
}

export function memberCycle(pod, i, t) {
  return (t / WHALE_PERIOD + pod.phase0 + memberPhase(pod, i)) % 1;
}

// ---------------------------------------------------------------------------
// THE SOUNDING CYCLE — what makes a whale epic
// ---------------------------------------------------------------------------
// One animal's whole behaviour at the surface, as a phase machine on u in
// [0, 1). Five acts, and the LAST one is the point: a real absence. A whale
// you can always see is a barge.
//
//   rise   16 s  up out of the deep, bow lifting
//   blow   22 s  at the surface, three breaths, the spout standing
//   cruise 51 s  the long shallow cruise, back awash, rolling on the swell
//   sound  19 s  the arch, the bow going down, THE FLUKES CLEAR OF THE WATER
//   deep   51 s  gone. She surfaces again a hundred metres further on, because
//                the pod's circuit ran on the whole time she was under.
export const WHALE_PERIOD = 160;  // seconds, one whole cycle
export const WHALE_DEEP = 46;     // metres she sounds to (absolute, not scaled)
export const BREATHS = 3;         // blows per surfacing
export const PHASE = {
  rise: [0, 0.10],
  blow: [0.10, 0.24],
  cruise: [0.24, 0.56],
  sound: [0.56, 0.68],
  deep: [0.68, 1],
};

// one breath: a hard vertical jet, then a plume that hangs and dies. b runs
// 0..BREATHS across the blow phase. Returns { jet, age } — jet 0..1 drives the
// column's opacity and height, age 0..1 its spread (a dying spout widens).
function breath(b) {
  if (b >= BREATHS) return { jet: 0, age: 1 };
  const f = b % 1;
  return { jet: f < 0.14 ? f / 0.14 : Math.exp(-(f - 0.14) * 5.5), age: f };
}

// The pose of one animal at cycle phase u, for a body `len` metres long.
// Heights are metres relative to the LOCAL SEA SURFACE (the layer adds
// waveHeight, so she rides the swell like everything else afloat): the shallow
// band scales with the animal, so a calf shows a calf's back, while the depth
// of the sounding does not — a calf dives with her mother.
// Returns { phase, y, pitch, roll, blow, blowAge }.
export function whalePose(u, len = BULL_LEN) {
  const p = ((u % 1) + 1) % 1;
  const r = len * BODY_R;          // her radius at the shoulder: how much back
                                   // there IS to show above the water
  // cruising trim. She floats IN the sea, not on it: about a quarter of her
  // half-height stands proud, which is the spine, the hump and the knuckles
  // and nothing else. (The first pass showed 0.45r of her and she read as a
  // barge — the screenshots settled the number.)
  const awash = -0.74 * r;
  const seg = (k) => (p - PHASE[k][0]) / (PHASE[k][1] - PHASE[k][0]);

  if (p < PHASE.rise[1]) {
    const s = seg('rise');
    return {
      phase: 'rise',
      y: awash + (-WHALE_DEEP - awash) * (1 - s) ** 2,
      pitch: -0.34 * (1 - s) ** 1.5,           // bow UP: she is climbing
      roll: 0,
      blow: 0,
      blowAge: 0,
    };
  }
  if (p < PHASE.blow[1]) {
    const s = seg('blow');
    const b = breath(s * BREATHS);
    return {
      phase: 'blow',
      y: awash + 0.36 * r * Math.sin(s * Math.PI),
      pitch: -0.04 * Math.cos(s * Math.PI * 3),
      roll: 0.05 * Math.sin(s * Math.PI * 2),
      blow: b.jet,
      blowAge: b.age,
    };
  }
  if (p < PHASE.cruise[1]) {
    const s = seg('cruise');
    return {
      phase: 'cruise',
      y: awash + 0.24 * r * Math.sin(s * Math.PI * 5),
      pitch: 0.05 * Math.sin(s * Math.PI * 5 + 1.6),
      roll: 0.12 * Math.sin(s * Math.PI * 3.5),
      blow: 0,
      blowAge: 0,
    };
  }
  if (p < PHASE.sound[1]) {
    const s = seg('sound');
    // TWO BEATS. The ARCH: she rounds her back, the bow drops and the flukes
    // come clear — five or six metres of tail standing out of the sea, which
    // is the shot every whaler in every log was watching for. Then the
    // PLUNGE: the flukes slip under and she is simply gone.
    if (s < 0.55) {
      const d = s / 0.55;
      return {
        phase: 'sound',
        y: awash - 1.9 * r * d ** 1.6,
        pitch: 1.34 * ease(d),
        roll: 0.06 * Math.sin(d * Math.PI * 2),
        blow: 0,
        blowAge: 0,
      };
    }
    const d = (s - 0.55) / 0.45;
    const top = awash - 1.9 * r;
    return {
      phase: 'sound',
      y: top + (-WHALE_DEEP - top) * d ** 1.7,
      pitch: 1.34 - 0.55 * d,
      roll: 0,
      blow: 0,
      blowAge: 0,
    };
  }
  const s = seg('deep');
  return {
    phase: 'deep',
    y: -WHALE_DEEP,
    // the pitch runs from where the plunge left her to where the rise wants
    // her, so the cycle closes on itself exactly
    pitch: 0.79 * (1 - s) - 0.34 * s,
    roll: 0,
    blow: 0,
    blowAge: 0,
  };
}

// the fluke tip and the bow tip, in metres relative to the sea surface, for a
// body of length len at this pose. THE TEST OF THE WHOLE SOUNDING: the flukes
// must come clear of the water while the bow goes well under. (Local
// (0, 0, -L/2) under THREE's rotation.x by pitch lands at y + (L/2) sin pitch;
// the bow at +L/2 takes the opposite sign.)
export function flukeTipY(pose, len) {
  return pose.y + Math.sin(pose.pitch) * len * 0.5;
}
export function bowTipY(pose, len) {
  return pose.y - Math.sin(pose.pitch) * len * 0.5;
}

// ---------------------------------------------------------------------------
// UNDER THE WATER (2026-07-26)
// ---------------------------------------------------------------------------
// THE DEFECT, from the v2 showcase: "a submerged whale is drawn as a flat slab
// lying ON the water rather than under it... an animal a metre or two down reads
// as a hard-edged grey shape on the surface with no refraction or depth fade."
//
// The cause is that the sea is OPAQUE and she was drawn at full strength until
// forty-six metres down. So what the eye got was the INTERSECTION of a
// twenty-metre body with the water plane: a flat-topped grey shape with a hard
// waterline edge, which is exactly a slab. Nothing was fading, nothing was
// hidden, and the shape had no depth cue of any kind.
//
// Three options were open — hide her the moment she is under, fade her with
// depth, or draw her properly beneath the surface. The last needs the water to
// become translucent, which is a whole rendering pass and would change every
// frame of the game to fix one animal. The first is a pop. So: FADE, because it
// is also what a deck actually sees. A dark body under open ocean goes by
// Beer-Lambert, and the e-folding depth here is set so she is a pale shadow at a
// metre, a rumour at four and gone by ten — which is a real sighting range for
// a whale under a boat, and it turns the hard waterline edge into a dissolve.
// She takes the SEA'S OWN COLOUR as she goes, not grey transparency, so what
// closes over her is water and not fog.
export const WHALE_FADE = 3.2;    // e-folding depth, metres
export const WHALE_GONE = 0.045;  // below this she is not drawn at all
export const WHALE_UP = 0.5;      // ...and above this she counts as SHOWING
// her highest point relative to the local sea surface: the top of the trunk at
// her own scale. Positive means part of her is out of the water.
export function whaleTopY(pose, len) { return pose.y + len * BODY_R; }
export function submergedFade(topY) {
  return topY >= 0 ? 1 : Math.exp(topY / WHALE_FADE);
}

// the foam ring where an animal breaks the surface: strong through the blow
// and the sounding, a wash through the cruise, nothing once she is down.
// 0..1 — the layer's opacity.
export function churnGlow(pose, len) {
  const r = len * BODY_R;
  const near = Math.max(0, 1 - Math.max(0, -pose.y) / (3.2 * r));
  const kick = pose.phase === 'sound' ? 0.5 : pose.phase === 'blow' ? 0.34 : 0.18;
  return Math.min(1, near * (kick + 0.5 * pose.blow));
}

// ---------------------------------------------------------------------------
// THE WHITE WHALE — the one animal that is interested in you
// ---------------------------------------------------------------------------
// legends.js 'white-whale': she has worked the water off Mocha for thirty
// years and she RAMS trespassers (main.js keeps her ram clock). She is
// therefore allowed to close on the ship — but she is NOT allowed to be glued
// to it, which was the whole complaint. So her circuit's anchor STALKS the
// hull with real inertia: put the helm hard over and she holds her own course
// for the better part of a minute before she comes round. Pure and stateless:
// hand it the anchor you have and get the next one back.
export const WHITE_TAU = 26;   // seconds of lag in her stalk
export const WHITE_R = 120;    // the radius she works around you — she comes IN
export function stalkAnchor(a, sx, sz, dt, tau = WHITE_TAU) {
  const k = 1 - Math.exp(-Math.max(0, dt) / tau);
  return { x: a.x + (sx - a.x) * k, z: a.z + (sz - a.z) * k };
}

// her pod spec: one vast pale animal on a tight fast circuit about the anchor.
// Pass `out` to reuse a spec across frames (the layer does — no per-frame
// allocation for a permanent resident).
export function whitePod(anchor, out = null) {
  const pod = out || {
    id: 'wh-white', kind: 'white', seed: 41, n: 1,
    R: WHITE_R, speed: 3.4, w: 3.4 / WHITE_R, a0: 0,
    weave: 26, wp1: 1.1, wp2: 2.7, phase0: 0.18, spread: 20,
  };
  pod.ox = anchor.x;
  pod.oz = anchor.z;
  return pod;
}
