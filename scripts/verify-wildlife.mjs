// verify-wildlife: every species is a navigation instrument — gulls mean
// land, the albatross means blue water, the fin means warm shallows — and
// the motion maths stays inside its envelopes.
import {
  ambientSpecies, porpoiseY, porpoisePitch, circlePos, flapAngle, birdBeat,
  flockGate, podStation,
  frenzyPos, FRENZY_FINS, FRENZY_S, whaleState, WHALE_PERIOD,
} from '../src/wildlife.js';

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

// the pod stations clear the planking on EVERY rung of the shipyard ladder
// (hull lengths 9..30 -> frame scale 1..3.33; deck half-beam is 1.55*scale,
// shipframe.js) — the regression was leaps INSIDE the flagship's hull
{
  for (const len of [9, 11, 13, 16, 19, 24, 30]) {
    const s = len / 9;
    for (let i = 0; i < 4; i++) {
      const st = podStation(i, s);
      ok(Math.abs(st.x) > 1.55 * s + 1,
        `pod ${i} clears the beam at length ${len} (|x| ${Math.abs(st.x).toFixed(1)} vs half-beam ${(1.55 * s).toFixed(1)})`);
    }
  }
  ok(podStation(0, 1).x * podStation(1, 1).x < 0, 'the pod rides both sides');
  ok(podStation(0, 1).z > podStation(3, 1).z, 'and spreads aft from the bow');
}

// the frenzy: fins arrive from OUTSIDE the scene, tighten onto the wreck,
// and never leave it once gathered — the sea attends a sinking
{
  ok(FRENZY_FINS >= 2 && FRENZY_S >= 120, 'a frenzy is a crowd that lingers');
  const far = frenzyPos(0, 0), near = frenzyPos(60, 0);
  ok(far.r > 100, `they start beyond the frame (${far.r.toFixed(0)} m out)`);
  ok(near.r < 15, `and tighten onto the wreck (${near.r.toFixed(0)} m)`);
  ok(frenzyPos(200, 0).r <= near.r + 1e-9, 'once gathered they stay gathered');
  ok(frenzyPos(30, 0).r > frenzyPos(30, 2).r - 25
    && Math.abs(frenzyPos(30, 0).x - frenzyPos(30, 1).x) > 1,
    'the pack is decorrelated, not a conga line');
}

// the whale: mostly a rumour in the deep, a minute of back and blow at the
// surface, the fluke pitch on the sounding dive — and the cycle closes
{
  ok(ambientSpecies(5000, 30).whale && !ambientSpecies(2000, 30).whale,
    'the whale belongs to the abyss');
  let surfaced = 0, blew = false, dove = false;
  for (let u = 0; u < 1; u += 0.005) {
    const w = whaleState(u);
    ok(Number.isFinite(w.y) && Number.isFinite(w.pitch), `whale finite at ${u.toFixed(2)}`);
    if (w.y > -1.5) surfaced++;
    if (w.blow > 0.5) blew = true;
    if (w.pitch < -0.3) dove = true;
  }
  ok(surfaced > 20 && surfaced < 120, `a minute at the surface, no more (${surfaced} samples)`);
  ok(blew, 'the blow stands when she surfaces');
  ok(dove, 'the fluke pitches on the dive');
  ok(Math.abs(whaleState(0).y - whaleState(0.999).y) < 1.5, 'the cycle closes in the deep');
  ok(WHALE_PERIOD > 45, 'an encounter, not a metronome');
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

// the real rhythm: bouts of beating, real stretches of soaring on flared
// wings; the albatross lives at the soaring end; birds decorrelate
{
  let glideG = 0, flapG = 0, glideA = 0, mx = 0;
  for (let t = 0; t < 120; t += 0.05) {
    const g = birdBeat(t, 0);
    const a = birdBeat(t, 0, 0.85);
    mx = Math.max(mx, Math.abs(g.angle), Math.abs(a.angle));
    if (g.glide > 0.85) glideG++;
    if (g.glide < 0.15) flapG++;
    if (a.glide > 0.85) glideA++;
    ok(g.glide >= 0 && g.glide <= 1, `glide bounded at t=${t.toFixed(2)}`);
  }
  ok(mx <= 0.7, `beat envelope bounded (${mx.toFixed(2)})`);
  ok(glideG > 200, `gulls truly soar between bouts (${glideG} locked samples)`);
  ok(flapG > 300, `and beat in earnest (${flapG} driving samples)`);
  ok(glideA > glideG * 1.5, `the albatross soars far more than a gull (${glideA} vs ${glideG})`);
  ok(birdBeat(1, 0).angle !== birdBeat(1, 1).angle, 'birds ride separate bout clocks');
}

// the inshore flock gate: a navigation instrument — nothing in blue water,
// gathering from ~1400 m, the full flock close in
ok(flockGate(3000) === 0, 'no flock in blue water');
ok(flockGate(1500) === 0, 'silence beyond the gathering line');
ok(flockGate(900) > 0.3 && flockGate(900) < 0.8, 'the flock gathers as land nears');
ok(flockGate(350) === 1 && flockGate(0) === 1, 'the full clamour close inshore');
ok(flockGate(800) > flockGate(1200), 'monotonic toward the coast');

if (failed) { console.error(`verify-wildlife: ${failed} FAILED`); process.exit(1); }
console.log('verify-wildlife: OK — species read the waters, porpoise arc sane, circles tangent, birds soar and beat in bouts, the flock gathers inshore');
