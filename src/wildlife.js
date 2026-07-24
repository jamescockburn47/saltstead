// Wildlife — the pure simulation half, no THREE, no DOM. verify-wildlife.mjs
// guards it; wildlifelayer.js gives everything bodies.
//
// The sea must not be boring (DESIGN.md pillar): the water itself should
// tell you WHERE you are. Gulls mean land is close, dolphins ride with you
// offshore, an albatross means true blue water, and a lazy fin circling an
// anchored hull in the warm shallows means somewhere tropical — every
// species is a navigation instrument first and a spectacle second.

// which ambient species belong at this coast distance + |latitude|
export function ambientSpecies(coastDist, latAbs) {
  return {
    gulls: coastDist < 1400,
    dolphins: coastDist > 500,
    albatross: coastDist > 3000 && latAbs > 20,
    shark: coastDist < 900 && latAbs < 42,
    whale: coastDist > 4000 && latAbs < 65, // the abyss has a resident
  };
}

// THE FRENZY — sharks gather at a sinking. elapsed: seconds since she went
// down; i: which fin. They arrive from OUTSIDE the scene (the spiral opens
// at ~130 m) and tighten on the wreck over half a minute, then circle the
// flotsam at a fin's length. The sea attends a death.
export const FRENZY_FINS = 3;
export const FRENZY_S = 240; // how long the sea remembers a wreck
export function frenzyPos(elapsed, i) {
  const r = Math.max(8 + i * 2.5, 130 - elapsed * 4.5);
  const a = elapsed * (0.28 + i * 0.05) + i * 2.1;
  return { x: Math.sin(a) * r, z: Math.cos(a) * r, heading: a + Math.PI / 2, r };
}

// THE WHALE — the abyss's own navigation instrument: a long submerged
// cruise, then a minute at the surface (blow, a rolling back, the fluke on
// the dive). u: cycle phase [0..1); one cycle is WHALE_PERIOD seconds.
//   y      — back height relative to the surface (negative = under)
//   pitch  — body pitch (the fluke-up dive at the end)
//   blow   — 0..1: the spout column stands in the first breaths
export const WHALE_PERIOD = 90;
export function whaleState(u) {
  if (u < 0.62) return { y: -9, pitch: 0, blow: 0 };            // the deep cruise
  if (u < 0.9) {
    const s = (u - 0.62) / 0.28;                                 // surfaced: back awash
    return {
      y: -0.6 + Math.sin(s * Math.PI) * 0.9,
      pitch: 0,
      blow: s < 0.3 ? 1 - s / 0.3 : 0,                           // the blow on arrival
    };
  }
  const d = (u - 0.9) / 0.1;                                     // the sounding dive
  return { y: -0.6 - d * 7, pitch: -0.5 * d, blow: 0 };
}

// the pod's bow-wave stations, SHIP-LOCAL metres (bow +z, starboard +x,
// same convention as shipframe.js). scale is the hull's frame scale (the
// sloop is 1): the offsets ride OUTSIDE the deck's half-beam (1.55 * scale,
// shipframe.js frameFor) whatever the rung — on the flagship the old fixed
// 4.5 m offsets put the leaps INSIDE the planking. Alternate sides, spread
// aft from just off the bow, where a real pod rides the pressure wave.
export function podStation(i, scale = 1) {
  const side = i % 2 ? 1 : -1;
  return {
    x: side * (1.55 * scale + 1.8 + i * 0.5),
    z: 4.6 * scale - i * 1.4,
  };
}

// the porpoising arc: phase in radians, one leap per 2*PI. Underwater cruise
// at -1.2, a clean arc breaking the surface for ~a third of the cycle.
export function porpoiseY(phase) {
  const s = Math.sin(phase);
  return s > 0 ? -1.2 + 2.1 * s : -1.2 + 0.25 * s;
}

// pitch (rad) matching the arc's slope so the body follows its own path
export function porpoisePitch(phase) {
  const s = Math.sin(phase), c = Math.cos(phase);
  return Math.atan2((s > 0 ? 2.1 : 0.25) * c, 3.5);
}

// steady circling: position + tangent heading on a circle of radius r
export function circlePos(t, r, speed, phase = 0) {
  const a = t * speed + phase;
  return {
    x: Math.sin(a) * r,
    z: Math.cos(a) * r,
    heading: a + Math.PI / 2, // tangent, anticlockwise
  };
}

// wing flap angle: gulls beat briskly, the albatross soars (locked wings,
// the rare unhurried beat) — flapRate scales the whole rhythm
export function flapAngle(t, rate, i = 0) {
  const beat = Math.sin(t * rate + i * 1.7);
  return beat * 0.55;
}

// THE REAL RHYTHM — no seabird flaps like a metronome. Flight is bouts of
// beating and stretches of SOARING with the wings flared in a shallow
// breathing V. Each bird carries its own bout clock (two incommensurate
// sines, phase-split by i), and soarBias slides the whole rhythm toward
// the soaring end: a gull glides often, an albatross almost always.
// Returns { angle, glide }: angle in radians for the wing hinge (bounded),
// glide 0..1 — how locked-out the wings are this instant (the layer banks
// harder on the glide, as a real bird does).
export function birdBeat(t, i = 0, soarBias = 0) {
  const cycle = Math.sin(t * 0.42 + i * 2.6) + Math.sin(t * 0.19 + i * 1.1);
  const bout = Math.min(1, Math.max(0, cycle * 0.8 + 0.7 - soarBias * 1.2));
  const flap = Math.sin(t * (9 - soarBias * 7.5) + i * 1.7) * 0.55;
  const flare = 0.22 + 0.06 * Math.sin(t * 1.9 + i * 0.9); // the soaring V, alive
  return { angle: flap * bout + flare * (1 - bout), glide: 1 - bout };
}

// THE INSHORE FLOCK — a wheeling cloud of small gulls that gathers as the
// land nears (flocklayer.js gives it bodies, Moorstead's murmuration idiom).
// The gate is the navigation instrument: nothing in blue water, first birds
// from ~1400 m off the coast, the full clamouring flock by ~350 m.
export function flockGate(coastDist) {
  return Math.min(1, Math.max(0, (1400 - coastDist) / (1400 - 350)));
}
