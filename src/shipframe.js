// Ship-local frame maths — pure, no THREE, no DOM.
// The ship is its own coordinate frame: the captain's position is stored
// ship-LOCAL and the world sees it through the ship's transform (in the scene
// this is THREE parenting; these functions are the same maths in pure form,
// used for deck clamping, camera targets, and the headless gate).
//
// Convention: bow points along local +z; yaw rotates about +y;
// yaw = 0 means the bow points at world +z. forward = (sin(yaw), cos(yaw)).

export const DECK = { minX: -1.55, maxX: 1.55, minZ: -5.0, maxZ: 4.6, y: 1.15 };

export const HELM = { x: 0, z: -4.0 }; // the tiller, near the stern

// the walkable frame for any hull on the shipwright's ladder: the sloop's
// proportions, scaled by the spec's length (shipphysics.js). DECK/HELM above
// stay as the sloop's own numbers — frameFor(SLOOP) reproduces them exactly,
// so every existing caller keeps its old geometry.
export function frameFor(spec) {
  const s = spec.length / 9; // the sloop is the unit hull
  return {
    deck: {
      minX: -1.55 * s, maxX: 1.55 * s,
      minZ: -5.0 * s, maxZ: 4.6 * s,
      y: 1.15 * s,
    },
    helm: { x: 0, z: -4.0 * s },
    scale: s,
  };
}

// Where the broadside lives: deck-local z posts for n guns a side, spaced
// down the waist and ALWAYS inside the hull, however many guns the rung
// carries. ship.js plants the visible cannon here and main.js muzzlePos
// fires from the same posts — one truth, two readers.
export function gunPosts(deck, scale, n) {
  if (n <= 1) return [0.5 * scale];
  const fwd = deck.maxZ * 0.55, aft = deck.minZ * 0.72;
  const posts = [];
  for (let i = 0; i < n; i++) posts.push(fwd + (aft - fwd) * (i / (n - 1)));
  return posts;
}

// Deterministic stations for n visible hands about a deck (NPC crews, prize
// crews): staggered port/starboard down the waist, clear of the rails.
export function crewPosts(deck, n, seed = 0) {
  const posts = [];
  const span = deck.maxZ * 0.7 - deck.minZ * 0.6;
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0.5 : i / (n - 1);
    const wob = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 0.5 + 0.5; // cheap unit hash
    posts.push({
      x: (i % 2 ? 0.45 : -0.45) * deck.maxX * (0.6 + 0.4 * wob),
      z: deck.minZ * 0.6 + span * u,
    });
  }
  return posts;
}

// yaw-only frame: walking happens on the yaw frame (the deck stays flat
// underfoot); pitch/roll is applied visually by the scene graph on top.
export function localToWorld(ship, lx, ly, lz) {
  const s = Math.sin(ship.yaw), c = Math.cos(ship.yaw);
  return {
    x: ship.x + lx * c + lz * s,
    y: ship.y + ly,
    z: ship.z - lx * s + lz * c,
  };
}

export function worldToLocal(ship, wx, wy, wz) {
  const s = Math.sin(ship.yaw), c = Math.cos(ship.yaw);
  const dx = wx - ship.x, dz = wz - ship.z;
  return {
    x: dx * c - dz * s,
    y: wy - ship.y,
    z: dx * s + dz * c,
  };
}

export function clampToDeck(lx, lz, margin = 0.2, deck = DECK) {
  return {
    x: Math.max(deck.minX + margin, Math.min(deck.maxX - margin, lx)),
    z: Math.max(deck.minZ + margin, Math.min(deck.maxZ - margin, lz)),
  };
}

export function nearHelm(lx, lz, radius = 1.5, helm = HELM) {
  const dx = lx - helm.x, dz = lz - helm.z;
  return dx * dx + dz * dz <= radius * radius;
}
