// verify-oars: the visible sweeps hold their geometry — beaching hulls row,
// deep hulls tow; posts sit ON the rails inside the deck; the stroke stays
// bounded and staggered; everything deterministic.
import { oarMode, oarPosts, oarLength, oarStroke, towOffset, STROKE_S } from '../src/oars.js';
import { SPECS, SLOOP, GALLEON, beaches } from '../src/shipphysics.js';
import { frameFor } from '../src/shipframe.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// mode follows the beaching line exactly
for (const [name, spec] of Object.entries(SPECS)) {
  ok(oarMode(spec) === (beaches(spec) ? 'sweeps' : 'tow'),
    `${name}: ${beaches(spec) ? 'rows her own sweeps' : 'is towed by her longboat'}`);
}

// posts: paired port/starboard, on the rail, inside the deck's z-range
for (const [name, spec] of Object.entries(SPECS)) {
  const F = frameFor(spec);
  const posts = oarPosts(spec, 8);
  ok(posts.length >= 2 && posts.length % 2 === 0, `${name}: oars come in pairs (${posts.length})`);
  ok(posts.filter((p) => p.side === 1).length === posts.length / 2, `${name}: banks balance`);
  for (const p of posts) {
    ok(Math.abs(Math.abs(p.x) - F.deck.maxX * 0.98) < 1e-9, `${name}: pivot on the rail`);
    ok(p.z > F.deck.minZ && p.z < F.deck.maxZ, `${name}: pivot inside the deck`);
  }
  ok(JSON.stringify(posts) === JSON.stringify(oarPosts(spec, 8)), `${name}: posts deterministic`);
}

// more rowers, more oars out — up to the hull's room
ok(oarPosts(SLOOP, 0).length <= oarPosts(SLOOP, 8).length, 'a fuller muster ships more sweeps');

// the stroke: bounded angles, phase stagger between neighbours, periodic
{
  let maxSweep = 0, maxDip = 0;
  for (let t = 0; t < 60; t += 0.05) {
    const a = oarStroke(t, 0);
    maxSweep = Math.max(maxSweep, Math.abs(a.sweep));
    maxDip = Math.max(maxDip, Math.abs(a.dip));
  }
  ok(maxSweep < 0.6 && maxDip < 0.4, `stroke stays believable (sweep ${maxSweep.toFixed(2)}, dip ${maxDip.toFixed(2)})`);
  ok(Math.abs(oarStroke(1.23, 0).sweep - oarStroke(1.23 + STROKE_S, 0).sweep) < 1e-9, 'the stroke is periodic');
  ok(oarStroke(1.0, 0).sweep !== oarStroke(1.0, 1).sweep, 'neighbouring oars pull staggered');
  // rowing physics: the blade is buried during the AFT sweep (power) and
  // lifts for the forward recovery — deepest dip must land while sweep climbs
  {
    let deepT = 0, deepest = -Infinity;
    for (let tt = 0; tt < STROKE_S; tt += 0.01) {
      const d = oarStroke(tt, 0).dip;
      if (d > deepest) { deepest = d; deepT = tt; }
    }
    const dSweep = oarStroke(deepT + 0.01, 0).sweep - oarStroke(deepT - 0.01, 0).sweep;
    ok(dSweep > 0, 'the buried blade sweeps AFT — she rows forwards, not backwards');
  }
}

// the longboat tows from clear ahead of the stem, further for a longer hull
ok(towOffset(GALLEON) > GALLEON.length * 0.55, 'the longboat rides clear of the galleon');
ok(towOffset(GALLEON) > towOffset(SLOOP), 'a longer hull tows longer');
ok(oarLength(SLOOP) > SLOOP.beam * 0.5, 'the sweep reaches past the rail to water');

if (failed) { console.error(`verify-oars: ${failed} FAILED`); process.exit(1); }
console.log('verify-oars: OK — sweeps for the beaching hulls, the longboat for the deep, '
  + 'posts on the rails, stroke bounded and staggered');
