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
  };
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
