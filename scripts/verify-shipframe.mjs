// verify-shipframe: the moving-deck frame maths (DESIGN.md risk 1).
// Local<->world must round-trip exactly, the deck clamp must hold, and the
// helm must be a reachable spot ON the deck.
import { DECK, HELM, localToWorld, worldToLocal, clampToDeck, nearHelm } from '../src/shipframe.js';

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

if (failed) { console.error(`verify-shipframe: ${failed} FAILED`); process.exit(1); }
console.log('verify-shipframe: OK — frame round-trips, deck clamp holds, helm reachable');
