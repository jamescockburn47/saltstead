// verify-wildlife: every species is a navigation instrument — gulls mean
// land, the albatross means blue water, the fin means warm shallows — and
// the motion maths stays inside its envelopes.
import { ambientSpecies, porpoiseY, porpoisePitch, circlePos, flapAngle } from '../src/wildlife.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// species read the waters
{
  const harbour = ambientSpecies(200, 54);   // Whitby roads
  ok(harbour.gulls && !harbour.albatross && !harbour.dolphins, 'harbour: gulls, no albatross, no pod');
  const tropics = ambientSpecies(400, 18);   // a Caribbean anchorage
  ok(tropics.shark && tropics.gulls, 'warm shallows: the fin and the gulls');
  ok(!ambientSpecies(400, 54).shark, 'no fin in the North Sea');
  const blue = ambientSpecies(5000, 35);     // mid-Atlantic
  ok(blue.albatross && blue.dolphins && !blue.gulls && !blue.shark, 'blue water: albatross + pod, no gulls, no fin');
  ok(!ambientSpecies(5000, 5).albatross, 'no albatross in the doldrums');
}

// the porpoise arc: breaks the surface, never dives past its cruise depth
{
  let mx = -Infinity, mn = Infinity;
  for (let p = 0; p < Math.PI * 2; p += 0.01) {
    const y = porpoiseY(p);
    mx = Math.max(mx, y); mn = Math.min(mn, y);
    ok(Number.isFinite(porpoisePitch(p)), `pitch finite at ${p.toFixed(2)}`);
  }
  ok(mx > 0.5, `the leap clears the water (peak ${mx.toFixed(2)})`);
  ok(mn >= -1.5, `the dive stays shallow (floor ${mn.toFixed(2)})`);
  ok(Math.abs(porpoiseY(0) - porpoiseY(Math.PI * 2)) < 1e-9, 'the cycle closes');
  ok(porpoisePitch(0.5) > 0 && porpoisePitch(Math.PI - 0.5) < 0, 'nose up rising, nose down falling');
}

// circling: on the circle, heading tangent
{
  const c = circlePos(3.7, 15, 0.4, 1.1);
  ok(Math.abs(Math.hypot(c.x, c.z) - 15) < 1e-9, 'on the circle');
  const c2 = circlePos(3.71, 15, 0.4, 1.1);
  const move = Math.atan2(c2.x - c.x, c2.z - c.z);
  const diff = Math.atan2(Math.sin(move - c.heading), Math.cos(move - c.heading));
  ok(Math.abs(diff) < 0.05, `heading is the tangent (off by ${diff.toFixed(3)} rad)`);
}

// flap: bounded, rate scales, birds decorrelate
{
  let mx = 0;
  for (let t = 0; t < 20; t += 0.05) mx = Math.max(mx, Math.abs(flapAngle(t, 9)));
  ok(mx <= 0.55 + 1e-9 && mx > 0.5, `flap envelope (${mx.toFixed(2)})`);
  ok(flapAngle(1, 9, 0) !== flapAngle(1, 9, 1), 'birds beat out of phase');
}

if (failed) { console.error(`verify-wildlife: ${failed} FAILED`); process.exit(1); }
console.log('verify-wildlife: OK — species read the waters, porpoise arc sane, circles tangent, flaps bounded');
