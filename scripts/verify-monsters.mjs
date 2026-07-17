// verify-monsters: the Kraken warns before it grips, a crewed ship hacks
// free, shallow water is always an exit, guns take arms clean off, and it
// tires eventually; the dragon wheels/stoops/climbs on her clock, is only
// a target in the stoop, rakes once per pass, and three wounds send her
// to the crag.
import {
  KRAKEN_ARMS, KRAKEN_WARN, KRAKEN_HOLD, KRAKEN_SHALLOW, KRAKEN_LOOT,
  ARM_SEGS, tentacleSpine, slamPhase, wingBeat, circleFire,
  newKraken, stepKraken, shootKrakenArm, krakenDrag, krakenOver,
  DRAGON_HP, DRAGON_CIRCLE, DRAGON_STOOP, DRAGON_HIGH, DRAGON_LOW, HOARD_GOLD,
  newDragon, stepDragon, dragonVulnerable, woundDragon, dragonAlt, dragonGone,
} from '../src/monsters.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };
const DT = 1 / 30;

// the warning: the sea boils first, then the arms come up
{
  const k = newKraken();
  ok(k.state === 'rising' && krakenDrag(k) === 1, 'rising, she still sails free');
  let grabbed = false;
  for (let t = 0; t < KRAKEN_WARN + 1; t += DT) grabbed = stepKraken(k, DT, 0, 9999).grabbed || grabbed;
  ok(grabbed && k.state === 'gripping', 'after the warning it grips');
  ok(krakenDrag(k) < 0.2, `six arms all but stop her (${krakenDrag(k).toFixed(2)})`);
}

// a crewed ship hacks free — and a bigger crew hacks faster
{
  const hackTime = (crew) => {
    const k = newKraken(); k.state = 'gripping';
    let t = 0;
    while (!krakenOver(k) && t < 300) { stepKraken(k, DT, crew, 9999); t += DT; }
    return { t, k };
  };
  const solo = hackTime(0), crewed = hackTime(11);
  ok(crewed.k.state === 'slain', 'a full crew hacks every arm off — slain');
  ok(crewed.t < KRAKEN_HOLD, `and before it tires (${crewed.t.toFixed(0)} s)`);
  ok(crewed.t < solo.t, 'more hands, faster axes');
  ok(solo.k.state === 'fled' || solo.k.state === 'slain', 'even alone the fight ENDS');
}

// shallow water is always an exit
{
  const k = newKraken(); k.state = 'gripping';
  const ev = stepKraken(k, DT, 0, KRAKEN_SHALLOW - 1);
  ok(ev.released && k.state === 'fled', 'it cannot follow into the shallows');
  ok(krakenDrag(k) === 1, 'released, she sails free');
}

// guns take arms clean off; the last arm is the kill
{
  const k = newKraken(); k.state = 'gripping';
  const before = krakenDrag(k);
  const s = shootKrakenArm(k);
  ok(s.hit && !s.slain && k.arms === KRAKEN_ARMS - 1, 'a broadside takes an arm');
  ok(krakenDrag(k) > before, 'one arm fewer, a little more way');
  for (let i = 0; i < KRAKEN_ARMS - 2; i++) shootKrakenArm(k);
  const last = shootKrakenArm(k);
  ok(last.hit && last.slain && k.state === 'slain', 'the last arm is the kill');
  ok(!shootKrakenArm(newKraken()).hit, 'you cannot shoot what has not surfaced');
  ok(KRAKEN_LOOT > 900, 'the deeps pay for the risk');
}

// it tires: no grip lasts past the hold
{
  const k = newKraken(); k.state = 'gripping';
  let t = 0, released = false;
  while (t < KRAKEN_HOLD + 5 && !released) {
    // a huge silent crew of -1... no: zero crew still hacks (the captain);
    // use a fresh hack clock so arms survive to the timeout by shooting none
    k.hackT = 0; // the captain is at the HELM this fight, not the axe
    released = stepKraken(k, DT, 0, 9999).released;
    t += DT;
  }
  ok(released && k.state === 'fled', `it tires and lets go (${t.toFixed(0)} s)`);
}

// ---- the dragon ----
// she wheels, stoops, climbs — and is only a target on the way down
{
  const d = newDragon();
  ok(!dragonVulnerable(d) && dragonAlt(d) === DRAGON_HIGH, 'wheeling high, out of reach');
  let t = 0, raked = 0, sawLow = DRAGON_HIGH, vulnT = 0;
  while (t < 40) {
    const ev = stepDragon(d, DT);
    if (ev.rake) raked++;
    if (dragonVulnerable(d)) { vulnT += DT; sawLow = Math.min(sawLow, dragonAlt(d)); }
    t += DT;
  }
  ok(raked === 2, `two full cycles in 40 s, one rake each (${raked})`);
  ok(sawLow <= DRAGON_LOW + 1, `the stoop bottoms at masthead height (${sawLow.toFixed(1)})`);
  ok(vulnT > DRAGON_STOOP * 1.5 && vulnT < DRAGON_STOOP * 2.5,
    `the firing window is the stoop and only the stoop (${vulnT.toFixed(1)} s)`);
  ok(DRAGON_CIRCLE > DRAGON_STOOP * 2, 'most of her time she is untouchable');
}

// three wounds send her to the crag
{
  const d = newDragon();
  ok(DRAGON_HP === 3, 'three wounds is the fight');
  ok(!woundDragon(d).fled && !woundDragon(d).fled, 'two wounds anger her');
  ok(woundDragon(d).fled && dragonGone(d), 'the third sends her to the crag');
  ok(!stepDragon(d, 1).rake, 'fled, she rakes no more');
  ok(HOARD_GOLD > 1500, 'the hoard pays for the sail to Wales');
}

// the arm's living curve: full-length spines, every joint bounded (no arm
// folds through itself), the curl gathers toward the tip under grip, the
// wave keeps it moving, and no two arms writhe in step
{
  ok(ARM_SEGS >= 6, 'enough joints to read as a curve');
  for (const [t, i, g] of [[0, 0, 1], [3.7, 2, 0.5], [11, 5, 0.3]]) {
    const spine = tentacleSpine(t, i, g);
    ok(spine.length === ARM_SEGS, 'a full spine every call');
    ok(spine.every((a) => Math.abs(a) < 0.8), `every joint bounded (t=${t})`);
  }
  const gripped = tentacleSpine(2, 0, 1);
  ok(Math.abs(gripped[ARM_SEGS - 1]) > Math.abs(gripped[0]),
    'the curl gathers toward the tip');
  const a = tentacleSpine(1, 0, 0.7), b = tentacleSpine(2.5, 0, 0.7);
  ok(a.some((v, s) => Math.abs(v - b[s]) > 0.02), 'the arm moves with time');
  const arm0 = tentacleSpine(1, 0, 0.7), arm3 = tentacleSpine(1, 3, 0.7);
  ok(arm0.some((v, s) => Math.abs(v - arm3[s]) > 0.02), 'arms writhe out of step');

  // the SLAM: the strike clock lives in [0,1] and actually reaches the
  // rear; the spine stays bounded at full slam; the rear throws the root
  // OUT so the whip-down reads as a blow
  let mx = 0, staggered = false;
  for (let t = 0; t < 60; t += 0.05) {
    let striking = 0;
    for (let i = 0; i < KRAKEN_ARMS; i++) {
      const s = slamPhase(t, i);
      ok(s >= 0 && s <= 1, `slam bounded at t=${t.toFixed(1)}`);
      mx = Math.max(mx, s);
      if (s > 0.3) striking++;
    }
    if (striking > 0 && striking <= 2) staggered = true;
  }
  ok(mx > 0.9, `the strike reaches full rear (${mx.toFixed(2)})`);
  ok(staggered, 'the arms strike staggered, not as one');
  for (const s of [0, 0.5, 1]) {
    ok(tentacleSpine(3.3, 1, 1, s).every((a) => Math.abs(a) <= 0.9), `spine bounded at slam ${s}`);
  }
  ok(tentacleSpine(2, 0, 0.8, 1)[0] > tentacleSpine(2, 0, 0.8, 0)[0],
    'the rear throws the root out');
}

// the wing beat: bounded, the OUTER panel lags and over-swings the inner
// (the whip that reads as flight), the stoop folds hard back, and the
// circling fire bursts arrive and pass
{
  let maxIn = 0, maxOut = 0;
  for (let t = 0; t < 30; t += 0.02) {
    const w = wingBeat(t);
    for (const v of [w.inner, w.outer, w.tail, w.neck]) {
      ok(Math.abs(v) <= 1, `beat bounded at t=${t.toFixed(2)}`);
    }
    maxIn = Math.max(maxIn, Math.abs(w.inner));
    maxOut = Math.max(maxOut, Math.abs(w.outer));
  }
  ok(maxOut > maxIn, `the hand over-swings the arm (${maxOut.toFixed(2)} vs ${maxIn.toFixed(2)})`);
  // the lag: the outer's phase trails by the design offset (0.7 rad of the
  // 2.4 rad/s clock) — sample where inner peaks, outer must still be rising
  const tPeak = (Math.PI / 2) / 2.4;
  const atPeak = wingBeat(tPeak);
  ok(Math.abs(atPeak.inner - 0.5) < 1e-6 && atPeak.outer < 0.85 * 0.999,
    'the outer panel LAGS the inner');
  const stoop = wingBeat(3.3, true);
  ok(stoop.outer < -0.5 && stoop.inner > 0, 'the stoop folds the hand hard back');
  let burst = 0, quiet = 0;
  for (let t = 0; t < 30; t += 0.05) {
    const f = circleFire(t);
    ok(f >= 0 && f <= 1, 'circle fire bounded');
    if (f > 0.5) burst++;
    if (f < 0.05) quiet++;
  }
  ok(burst > 5 && quiet > burst, `she breathes in BURSTS (${burst} hot, ${quiet} quiet samples)`);
}

if (failed) { console.error(`verify-monsters: ${failed} FAILED`); process.exit(1); }
console.log('verify-monsters: OK — kraken warns/grips/tires, crew+guns free her, dragon stoops on her clock, three wounds to the crag');
