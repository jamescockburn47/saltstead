// verify-shipframe: the moving-deck frame maths (DESIGN.md risk 1).
// Local<->world must round-trip exactly, the deck clamp must hold, and the
// helm must be a reachable spot ON the deck.
import {
  DECK, HELM, frameFor, localToWorld, worldToLocal, clampToDeck, nearHelm,
  gunPosts, crewPosts, holdFor,
} from '../src/shipframe.js';
import { SLOOP, BRIG, SPECS } from '../src/shipphysics.js';
import { HULLS } from '../src/shipyard.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

let seed = 777;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

for (let i = 0; i < 200; i++) {
  const ship = { x: (rnd() - 0.5) * 1e4, y: rnd() * 4, z: (rnd() - 0.5) * 1e4, yaw: (rnd() - 0.5) * 20 };
  const l = { x: (rnd() - 0.5) * 6, y: rnd() * 3, z: (rnd() - 0.5) * 10 };
  const w = localToWorld(ship, l.x, l.y, l.z);
  const back = worldToLocal(ship, w.x, w.y, w.z);
  ok(Math.abs(back.x - l.x) < 1e-8 && Math.abs(back.y - l.y) < 1e-8 && Math.abs(back.z - l.z) < 1e-8,
    `round-trip ${i} (drift ${Math.abs(back.x - l.x).toExponential(1)})`);
}

// yaw=0: bow along +z, local +x stays +x
const w0 = localToWorld({ x: 0, y: 0, z: 0, yaw: 0 }, 1, 0, 2);
ok(w0.x === 1 && w0.z === 2, 'yaw 0 is identity');
// quarter turn: local bow (+z) points at world +x
const w9 = localToWorld({ x: 0, y: 0, z: 0, yaw: Math.PI / 2 }, 0, 0, 1);
ok(Math.abs(w9.x - 1) < 1e-9 && Math.abs(w9.z) < 1e-9, 'yaw PI/2 sends bow to +x');

for (let i = 0; i < 100; i++) {
  const p = clampToDeck((rnd() - 0.5) * 40, (rnd() - 0.5) * 40);
  ok(p.x >= DECK.minX && p.x <= DECK.maxX && p.z >= DECK.minZ && p.z <= DECK.maxZ,
    `clamp inside deck (${i})`);
}

ok(HELM.x >= DECK.minX && HELM.x <= DECK.maxX && HELM.z >= DECK.minZ && HELM.z <= DECK.maxZ,
  'helm stands on the deck');
ok(nearHelm(HELM.x, HELM.z), 'standing at the helm counts');
ok(nearHelm(HELM.x + 1.2, HELM.z), 'a stride away still counts');
ok(!nearHelm(0, DECK.maxZ - 0.3), 'the bow is not the helm');

// frameFor: the sloop's frame IS the constants; a bigger hull scales true
{
  const s9 = frameFor(SLOOP);
  ok(['minX', 'maxX', 'minZ', 'maxZ', 'y'].every((k) => Math.abs(s9.deck[k] - DECK[k]) < 1e-12),
    'frameFor(SLOOP) reproduces DECK exactly');
  ok(Math.abs(s9.helm.z - HELM.z) < 1e-12 && s9.scale === 1, 'and HELM, at unit scale');
  const b = frameFor(BRIG);
  const k = BRIG.length / SLOOP.length;
  ok(Math.abs(b.deck.maxZ - DECK.maxZ * k) < 1e-9, 'the brig\'s deck scales with her length');
  ok(b.deck.y > DECK.y, 'her deck stands higher off the water');
  ok(b.helm.z > b.deck.minZ && b.helm.z < b.deck.maxZ, 'her helm still stands on her own deck');
  // the clamp and the helm test honour the bigger frame
  const p = clampToDeck(99, -99, 0.2, b.deck);
  ok(p.x === b.deck.maxX - 0.2 && p.z === b.deck.minZ + 0.2, 'the clamp walks the brig\'s deck');
  ok(nearHelm(b.helm.x, b.helm.z, 1.5, b.helm), 'standing at the brig\'s helm counts');
  ok(!nearHelm(0, b.deck.maxZ - 0.3, 1.5, b.helm), 'her bow is not her helm');
}

// gun posts: however many guns a rung carries, every post sits INSIDE the
// hull, ordered bow to stern, with clear water between the muzzles
for (const [name, spec] of Object.entries(SPECS)) {
  const F = frameFor(spec);
  for (const n of [1, 2, 3, 4, 6]) {
    const posts = gunPosts(F.deck, F.scale, n);
    ok(posts.length === n, `${name}: ${n} guns get ${n} posts`);
    ok(posts.every((z) => z > F.deck.minZ && z < F.deck.maxZ),
      `${name}: all ${n} posts inside the deck`);
    for (let i = 1; i < posts.length; i++) {
      ok(posts[i] < posts[i - 1], `${name}: posts run bow to stern`);
      ok(posts[i - 1] - posts[i] > 0.5, `${name}: muzzles don't touch`);
    }
  }
  // crew stations stand on the deck too
  for (const p of crewPosts(F.deck, 5, 3)) {
    ok(p.x > F.deck.minX && p.x < F.deck.maxX && p.z > F.deck.minZ && p.z < F.deck.maxZ,
      `${name}: crew stations on the deck`);
  }
}
// deterministic
ok(JSON.stringify(crewPosts(DECK, 4, 7)) === JSON.stringify(crewPosts(DECK, 4, 7)),
  'crew stations deterministic');

// the hold: for every hull that declares one (shipyard below: true), the
// below-decks frame fits inside the ship and a captain can stand in it
{
  const belows = HULLS.filter((h) => h.below);
  ok(belows.length >= 4, `the big hulls carry holds (${belows.length})`);
  ok(!HULLS.find((h) => h.id === 'sloop').below, 'the sloop is an open boat — no hold');
  for (const h of belows) {
    const F = frameFor(h.spec), H = holdFor(h.spec);
    ok(H.minX > F.deck.minX && H.maxX < F.deck.maxX
      && H.minZ > F.deck.minZ && H.maxZ < F.deck.maxZ,
      `${h.id}: the hold nests inside the hull's footprint`);
    ok(H.y < F.deck.y, `${h.id}: the hold sole lies below the weather deck`);
    ok(H.headroom > 1.35, `${h.id}: a captain stands below (${H.headroom.toFixed(2)} m headroom)`);
    ok(H.hatch.x > H.minX && H.hatch.x < H.maxX && H.hatch.z > H.minZ && H.hatch.z < H.maxZ,
      `${h.id}: the companionway lands ON the hold sole`);
    ok(H.hatch.x > F.deck.minX && H.hatch.x < F.deck.maxX
      && H.hatch.z > F.deck.minZ && H.hatch.z < F.deck.maxZ,
      `${h.id}: and pierces the walkable weather deck`);
    // the clamp walks the hold like it walks the deck
    const p = clampToDeck(99, -99, 0.35, H);
    ok(p.x === H.maxX - 0.35 && p.z === H.minZ + 0.35, `${h.id}: the clamp holds her walls`);
  }
}

if (failed) { console.error(`verify-shipframe: ${failed} FAILED`); process.exit(1); }
console.log('verify-shipframe: OK — frame round-trips, deck clamp holds, helm reachable, guns + crew on deck');
