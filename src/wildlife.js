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
