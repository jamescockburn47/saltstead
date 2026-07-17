// Foam maths — pure, no THREE, no DOM. verify-foam.mjs guards it.
//
// Two motion cues live here:
//  - FLECKS: deterministic foam dots scattered on a world-anchored grid. The
//    ship sails PAST them, which is what makes speed readable even mid-ocean.
//    Same cell -> same fleck on every client and every frame (invariant 6:
//    no Math.random at build time).
//  - WAKE: a ring buffer of foam patches dropped astern; world-anchored, they
//    expand and fade while the ship leaves them behind.

export const FLECK_CELL = 6;      // metres between grid cells
export const FLECK_RADIUS = 54;   // flecks live inside this ring around the ship
export const WAKE_LIFE = 3.4;     // seconds a wake patch lasts

const TAU = Math.PI * 2;

export function hash2i(x, z) {
  let h = (x | 0) * 374761393 + (z | 0) * 668265263;
  h = ((h ^ (h >> 13)) * 1274126177) | 0;
  h = h ^ (h >> 16);
  return (h >>> 0) / 4294967296;
}

// All flecks near (cx, cz): [{ x, z, phase }] — deterministic per grid cell.
export function flecksAround(cx, cz, radius = FLECK_RADIUS, cell = FLECK_CELL) {
  const out = [];
  const i0 = Math.floor((cx - radius) / cell), i1 = Math.floor((cx + radius) / cell);
  const j0 = Math.floor((cz - radius) / cell), j1 = Math.floor((cz + radius) / cell);
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const r = hash2i(i, j);
      if (r < 0.25) continue; // gaps: an even carpet reads as texture, not motion
      const x = (i + hash2i(i + 7919, j)) * cell;
      const z = (j + hash2i(i, j - 104729)) * cell;
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz > radius * radius) continue;
      out.push({ x, z, phase: r * TAU });
    }
  }
  return out;
}

// seconds between wake drops — faster ship, tighter trail
export function wakeInterval(speed) {
  return Math.max(0.06, 0.5 - 0.045 * speed);
}

export function newWake(cap = 96) {
  const slots = [];
  for (let i = 0; i < cap; i++) {
    slots.push({ x: 0, z: 0, age: Infinity, size0: 0, size1: 0, rot: 0, stretch: 1 });
  }
  return { cap, slots, next: 0, cool: 0 };
}

// emitters: [{ x, z, size, yaw?, stretch? }]. Spawns one patch per emitter on
// the cadence set by `speed`; recycles the oldest slot when full. Each patch
// remembers the course it was dropped on (rot, with a deterministic jitter so
// the trail reads as churned water, not stamped tiles) and how elongated it
// lies along that course. Mutates and returns w.
export function stepWake(w, dt, speed, emitters) {
  w.cool -= dt;
  for (const s of w.slots) s.age += dt;
  if (w.cool <= 0 && speed > 0.8 && emitters.length) {
    for (const e of emitters) {
      const s = w.slots[w.next];
      s.x = e.x; s.z = e.z; s.age = 0;
      s.size0 = e.size; s.size1 = e.size * 3.2;
      s.rot = (e.yaw || 0) + (hash2i(Math.round(e.x * 8), Math.round(e.z * 8)) - 0.5) * 0.8;
      s.stretch = e.stretch || 1;
      w.next = (w.next + 1) % w.cap;
    }
    w.cool = wakeInterval(speed);
  }
  return w;
}

export function wakeAlpha(slot) {
  const t = slot.age / WAKE_LIFE;
  return t >= 1 ? 0 : (1 - t) * 0.8;
}

export function wakeSize(slot) {
  const t = Math.min(1, slot.age / WAKE_LIFE);
  return slot.size0 + (slot.size1 - slot.size0) * t;
}
