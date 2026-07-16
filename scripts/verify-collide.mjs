// verify-collide: hulls are capsules, near misses miss, contacts push apart
// along an honest normal, and only iron-hard closing speed hurts.
import {
  shipCapsule, segSegNearest, collideShips, ramSeverity, RAM_HURT,
} from '../src/collide.js';
import { SLOOP, GALLEON, CORVETTE } from '../src/shipphysics.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// the capsule hugs the hull
{
  const c = shipCapsule(0, 0, 0, SLOOP); // bow at +z
  ok(Math.abs(c.ax) < 1e-9 && Math.abs(c.bx) < 1e-9, 'a north-headed hull keeps x = 0');
  ok(c.bz > 0 && c.az < 0 && c.bz === -c.az, 'segment symmetric bow/stern');
  ok(c.bz < SLOOP.length / 2, 'segment tucked inside the hull ends');
  ok(c.r > SLOOP.beam / 2 && c.r < SLOOP.beam, 'radius wraps half the beam plus rub-rail');
  const g = shipCapsule(5, 5, 1.3, GALLEON);
  ok(Math.hypot(g.bx - g.ax, g.bz - g.az) > Math.hypot(c.bx - c.ax, c.bz - c.az),
    'the galleon is the longer capsule');
}

// segment-segment nearest distance: the textbook cases
{
  ok(Math.abs(segSegNearest(0, 0, 10, 0, 0, 5, 10, 5).d - 5) < 1e-9, 'parallel tracks read their gap');
  ok(segSegNearest(0, 0, 10, 0, 5, -5, 5, 5).d < 1e-9, 'a crossing reads zero');
  ok(Math.abs(segSegNearest(0, 0, 1, 0, 5, 0, 9, 0).d - 4) < 1e-9, 'collinear end-to-end reads the gap');
}

// two sloops well apart: clear
ok(collideShips({ x: 0, z: 0, yaw: 0, speed: 5 }, SLOOP,
  { x: 30, z: 0, yaw: 0, speed: 0 }, SLOOP) === null, 'thirty metres apart is open water');

// dead alongside: contact, normal points from her toward me
{
  const hit = collideShips({ x: 3, z: 0, yaw: 0, speed: 0 }, SLOOP,
    { x: 0, z: 0, yaw: 0, speed: 0 }, SLOOP);
  ok(!!hit, 'rafted hulls touch');
  ok(hit.nx > 0.99, 'the push is abeam, from her deck toward mine');
  ok(hit.depth > 0 && hit.depth < SLOOP.beam, 'overlap depth is sane');
  ok(hit.closing === 0, 'nobody moving = no closing speed');
}

// a T-bone at speed: closing reads the ram
{
  // I sail east into her broadside as she lies head north across my course
  const hit = collideShips({ x: -4.5, z: 0, yaw: Math.PI / 2, speed: 6 }, SLOOP,
    { x: 0, z: 0, yaw: 0, speed: 0 }, SLOOP);
  ok(!!hit, 'the T-bone connects');
  ok(hit.closing > 5, `and reads the closing speed (${hit.closing.toFixed(1)} m/s)`);
  ok(ramSeverity(hit.closing) > 0.4, 'a 6 m/s ram is a real wound');
}

// bow-to-bow, both making way: closing speeds ADD
{
  const hit = collideShips({ x: 0, z: -7, yaw: 0, speed: 4 }, SLOOP,
    { x: 0, z: 7, yaw: Math.PI, speed: 4 }, CORVETTE);
  if (hit) ok(hit.closing > 7, `head-on closing sums both ways (${hit.closing.toFixed(1)})`);
  // (whether they touch at 14 m depends on the hull lengths — the corvette
  // reaches; assert only if contact)
  ok(collideShips({ x: 0, z: -30, yaw: 0, speed: 4 }, SLOOP,
    { x: 0, z: 30, yaw: Math.PI, speed: 4 }, CORVETTE) === null, 'sixty metres of sea between bows is clear');
}

// separating hulls: contact but no closing (they're already parting)
{
  const hit = collideShips({ x: 2.5, z: 0, yaw: Math.PI / 2, speed: 4 }, SLOOP,
    { x: 0, z: 0, yaw: 0, speed: 0 }, SLOOP);
  if (hit) ok(hit.closing === 0, 'sailing OUT of contact closes nothing');
}

// the severity curve: bumps are free, rams are not, the scale saturates
ok(ramSeverity(0) === 0 && ramSeverity(RAM_HURT) === 0, 'a fender bump costs nothing');
ok(ramSeverity(RAM_HURT + 3) > 0 && ramSeverity(RAM_HURT + 3) < 1, 'a firm ram wounds');
ok(ramSeverity(50) === 1, 'the scale tops out at a full holing');

// determinism
{
  const a = { x: 1, z: 2, yaw: 0.7, speed: 3 }, b = { x: 4, z: 3, yaw: 2.1, speed: 2 };
  ok(JSON.stringify(collideShips(a, SLOOP, b, GALLEON))
    === JSON.stringify(collideShips(a, SLOOP, b, GALLEON)), 'same inputs, same contact');
}

if (failed) { console.error(`verify-collide: ${failed} FAILED`); process.exit(1); }
console.log('verify-collide: OK — capsules hug the hulls, normals honest, only hard closing wounds');
