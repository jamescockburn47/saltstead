// verify-whales: the whale is a WORLD animal. Her pods are seeded per world
// cell, she travels a course of her own with an honest heading, she is sized
// against the shipyard ladder, and her sounding cycle really does put the
// flukes in the air and then take her away for a minute.
//
// THE REGRESSION THIS GATE EXISTS FOR: the whale used to be drawn at a
// ship-relative offset (ship + bearing(ship.yaw) * range), so she rode along
// with the hull and swung round it when the helm went over. Nothing in
// whales.js may take a ship's position or heading as an argument — the purity
// check below asserts that of the source itself, and live-whales.mjs proves it
// again in a real browser.
import { readFileSync } from 'node:fs';
import {
  cellPod, podCount, podsNear, podPose, memberOffset, memberDrift, memberStation,
  memberLen, memberPhase, memberCycle, isCalf, whalePose, flukeTipY, bowTipY,
  churnGlow, stalkAnchor, whitePod,
  WHALE_CELL, POD_CHANCE, POD_MAX, POD_REACH, WHALE_STREAM_R, WHALE_SEA,
  WHALE_PERIOD, WHALE_DEEP, WHALE_SEEN, BREATHS, PHASE, HALF_BEAM,
  BULL_LEN, COW_LEN, CALF_LEN, WHITE_LEN, WHITE_TAU,
} from '../src/whales.js';
import { SLOOP, GALLEON } from '../src/shipphysics.js';
import { isLand, worldToLatLon, coastDistGame, latLonToWorld } from '../src/earth.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// ---- purity, determinism, and NO SHIP ANYWHERE IN IT ----
{
  const src = readFileSync(new URL('../src/whales.js', import.meta.url), 'utf8');
  ok(!/from 'three'|require\(|document\.|window\./.test(src),
    'whales.js is pure — no THREE, no DOM');
  const code = src.replace(/\/\/[^\n]*/g, ''); // comments may SAY it; code may not DO it
  ok(!/Math\.random/.test(code), 'and deterministic — no Math.random anywhere');
  // the pod's own motion may never be a function of the hull. stalkAnchor and
  // whitePod are the one admitted exception (the White Whale hunts), so the ban
  // is on the functions that place an ordinary pod. The slice is asserted
  // NON-EMPTY first — a marker rename would otherwise turn the one check that
  // guards against the ship-relative regression into a no-op.
  const from = code.indexOf('export function cellPod');
  const to = code.indexOf('export function memberOffset');
  ok(from >= 0 && to > from + 2000,
    `the pod-motion span was found and is substantial (${to - from} chars)`);
  const podMotion = code.slice(from, to);
  ok(/podPose|podsNear/.test(podMotion), 'and it really contains the placing code');
  ok(!/\bsx\b|\bsz\b|ship|yaw/i.test(podMotion),
    'no ship position or heading reaches the pods’ own motion');
}

// ---- the spawn table: deterministic, honestly dense, and afloat ----
{
  const a = cellPod(4, -7), b = cellPod(4, -7);
  ok(JSON.stringify(a) === JSON.stringify(b) || (a === null && b === null),
    'the same cell carries the same pod, always');
  let pods = 0, cells = 0;
  const counts = new Array(POD_MAX + 1).fill(0);
  for (let cx = -20; cx < 20; cx++) {
    for (let cz = -20; cz < 20; cz++) {
      cells++;
      const p = cellPod(cx, cz);
      if (!p) continue;
      pods++;
      counts[p.n]++;
      ok(p.n >= 1 && p.n <= POD_MAX, `pod size in range (${p.n})`);
      ok(p.R >= 700 && p.R <= 1500, `circuit radius sane (${p.R.toFixed(0)} m)`);
      ok(p.speed >= 1.9 && p.speed <= 3.2, `cruise speed sane (${p.speed.toFixed(2)} m/s)`);
      ok(Math.abs(p.ox - (cx + 0.5) * WHALE_CELL) < 1e-9, 'the circuit sits in its cell');
    }
  }
  const rate = pods / cells;
  ok(Math.abs(rate - POD_CHANCE) < 0.09, `about POD_CHANCE of cells carry a pod (${rate.toFixed(3)} vs ${POD_CHANCE})`);
  ok(counts[1] > 0 && counts[POD_MAX] > 0,
    `both lone bulls and full pods happen (${counts.slice(1).join('/')})`);
  ok(counts[2] + counts[3] > counts[1], 'but a pod is the ordinary case');
  ok(podCount(13.7) === podCount(13.7), 'pod size is deterministic in the seed');
}

// ---- POD_REACH holds for EVERY cell, not a sampled row ----
// the weave rides x and z independently, so the excursion is diagonal: a flat
// R + weave bound was false by 27 m and this sweep is what caught it
{
  let worst = 0, worstId = '';
  for (let cx = -14; cx <= 14; cx++) {
    for (let cz = -14; cz <= 14; cz++) {
      const pod = cellPod(cx, cz);
      if (!pod) continue;
      const lap = (Math.PI * 2) / Math.abs(pod.w);
      for (let t = 0; t < lap; t += lap / 400) {
        const p = podPose(pod, t);
        const rad = Math.hypot(p.x - pod.ox, p.z - pod.oz);
        if (rad > worst) { worst = rad; worstId = pod.id; }
      }
    }
  }
  ok(worst < POD_REACH,
    `no pod ever strays past POD_REACH (worst ${worst.toFixed(1)} m of ${POD_REACH.toFixed(1)}, ${worstId})`);
  ok(worst > POD_REACH - 60, `and the bound is tight, not a shrug (${worst.toFixed(1)} m)`);
}

// ---- the circuit: a WORLD course, with an honest heading ----
{
  let checked = 0;
  for (let cx = -12; cx < 12 && checked < 8; cx++) {
    const pod = cellPod(cx, 3);
    if (!pod) continue;
    checked++;
    let vmin = Infinity, vmax = 0, rmax = 0, travelled = 0;
    let prev = podPose(pod, 0);
    for (let t = 0; t < 4000; t += 2) {
      const p = podPose(pod, t);
      ok(Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.heading),
        `pose finite at t=${t}`);
      vmin = Math.min(vmin, p.speed); vmax = Math.max(vmax, p.speed);
      rmax = Math.max(rmax, Math.hypot(p.x - pod.ox, p.z - pod.oz));
      travelled += Math.hypot(p.x - prev.x, p.z - prev.z);
      // the heading is the direction she is ACTUALLY moving: hold the analytic
      // velocity against a central difference of the position itself
      const back = podPose(pod, t - 0.5), fwd = podPose(pod, t + 0.5);
      const fd = Math.atan2(fwd.x - back.x, fwd.z - back.z);
      const err = Math.atan2(Math.sin(fd - p.heading), Math.cos(fd - p.heading));
      ok(Math.abs(err) < 0.01, `heading is where she is going at t=${t} (off ${err.toFixed(4)} rad)`);
      prev = p;
    }
    ok(vmin > 0.75 * pod.speed && vmax < 1.25 * pod.speed,
      `she holds her cruise (${vmin.toFixed(2)}-${vmax.toFixed(2)} vs ${pod.speed.toFixed(2)} m/s)`);
    ok(vmin > 1.3 && vmax < 4.2, `and it is a whale's pace (${vmin.toFixed(2)}-${vmax.toFixed(2)} m/s)`);
    ok(rmax < POD_REACH, `she stays within POD_REACH of her cell (${rmax.toFixed(0)} m)`);
    ok(travelled > 7000, `she genuinely travels (${(travelled / 1000).toFixed(1)} km in a lap)`);
    // and she MOVES: in the minute an encounter lasts she has left her berth
    const d60 = Math.hypot(podPose(pod, 60).x - podPose(pod, 0).x,
      podPose(pod, 60).z - podPose(pod, 0).z);
    ok(d60 > 90, `a minute puts her ${d60.toFixed(0)} m along her course`);
  }
  ok(checked >= 4, `enough circuits examined (${checked})`);
}

// ---- streaming: what podsNear hands back is near, afloat, and repeatable ----
{
  const open = latLonToWorld(30, -40); // mid-Atlantic, the whaling grounds
  const a = podsNear(1000, open.x, open.z, 12000);
  const b = podsNear(1000, open.x, open.z, 12000);
  ok(a.length === b.length, 'the same water at the same hour carries the same pods');
  ok(a.length > 0, `blue water carries whales (${a.length} pods within 12 km)`);
  let sorted = true;
  for (let i = 1; i < a.length; i++) if (a[i].dist < a[i - 1].dist) sorted = false;
  ok(sorted, 'nearest first');
  for (const e of a) {
    ok(e.dist <= 12000, 'genuinely near');
    const ll = worldToLatLon(e.x, e.z);
    ok(!isLand(ll.lat, ll.lon), `${e.pod.id} is afloat`);
    ok(coastDistGame(ll.lat, ll.lon) >= WHALE_SEA, `${e.pod.id} has water under her`);
  }
  // the land veto bites: no pod is ever handed back inside a continent
  const inland = latLonToWorld(48.8, 2.3); // Paris
  ok(podsNear(1000, inland.x, inland.z, 4000).length === 0, 'no whales over France');
  ok(WHALE_STREAM_R > 1600, 'pods are alive before the encounter gait wants them');
}

// ---- scale, against the ships she swims beside ----
{
  ok(BULL_LEN >= 2 * SLOOP.length,
    `a bull is twice the sloop (${BULL_LEN} m vs ${SLOOP.length} m of hull)`);
  ok(COW_LEN > SLOOP.length + 4, `a cow overtops the sloop (${COW_LEN} m)`);
  ok(CALF_LEN > SLOOP.length * 0.7 && CALF_LEN < COW_LEN * 0.6,
    `a calf is a calf, and still nearly a sloop long (${CALF_LEN} m)`);
  ok(WHITE_LEN > GALLEON.length * 0.85,
    `the White Whale is a galleon of an animal (${WHITE_LEN} m vs ${GALLEON.length} m)`);
  ok(BULL_LEN <= 34, 'and nothing here outgrows a blue whale');
}

// ---- the pod's formation: loose, ranked, and never overlapping ----
// THE CLEARANCE LAW, over every pod in a wide sweep AND over the drift's whole
// cycle (the drift used to live in the layer, where this gate could not see it,
// and two cows overlapped by two metres): each pair must be clear either
// fore-and-aft by their combined half-LENGTHS or abeam by their combined
// half-BEAMS. Animals are parallel in a pod, so those are the only two ways to
// pass close without swimming through one another.
{
  let pods = 0, calves = 0, bulls = 0, tightest = Infinity, worst = '';
  let maxDrift = 0;
  for (let cx = -20; cx < 20; cx++) {
    for (const cz of [11, -6]) {
      const pod = cellPod(cx, cz);
      if (!pod) continue;
      pods++;
      const len = [];
      for (let i = 0; i < pod.n; i++) {
        len.push(memberLen(pod, i));
        if (isCalf(pod, i)) calves++;
        if (i === 0) bulls++;
        const o = memberOffset(pod, i);
        ok(Number.isFinite(o.side) && Number.isFinite(o.lag), 'station finite');
        ok(memberPhase(pod, i) >= 0 && memberPhase(pod, i) < 0.08,
          `the pod surfaces together (offset ${memberPhase(pod, i).toFixed(3)} of a cycle)`);
        const d = memberDrift(pod, i, 137);
        maxDrift = Math.max(maxDrift, Math.hypot(d.side, d.lag));
      }
      ok(memberOffset(pod, 0).side === 0 && memberOffset(pod, 0).lag === 0, 'the leader leads');
      if (pod.n >= 3 && !isCalf(pod, 2)) {
        ok(memberOffset(pod, 1).side * memberOffset(pod, 2).side < 0,
          'the ranks spread off BOTH the leader’s quarters');
      }
      for (let t = 0; t < 80; t += 0.5) {
        const at = [];
        for (let i = 0; i < pod.n; i++) at.push(memberStation(pod, i, t));
        for (let i = 0; i < pod.n; i++) {
          for (let j = i + 1; j < pod.n; j++) {
            const dLag = Math.abs(at[i].lag - at[j].lag);
            const dSide = Math.abs(at[i].side - at[j].side);
            const needLag = (len[i] + len[j]) / 2;
            const needSide = (len[i] + len[j]) * HALF_BEAM;
            const slack = Math.max(dLag - needLag, dSide - needSide);
            if (slack < tightest) { tightest = slack; worst = `${pod.id} ${i}/${j} at t=${t}`; }
          }
        }
      }
    }
  }
  ok(pods > 8, `enough pods examined (${pods})`);
  ok(maxDrift > 1, `the formation really does breathe (${maxDrift.toFixed(1)} m of drift)`);
  ok(tightest > 0,
    `no two animals ever swim through one another (tightest clearance ${tightest.toFixed(1)} m, ${worst})`);
  ok(calves > 0 && bulls > 0,
    `pods carry a bull and, when big enough, a calf (${bulls} bulls, ${calves} calves)`);
  // a calf swims at her mother's flank, breathes with her, and a lone bull has
  // no calf at all
  for (let cx = -20; cx < 20; cx++) {
    const pod = cellPod(cx, 11);
    if (!pod) continue;
    if (pod.n === 1) ok(!isCalf(pod, 0), 'a lone whale is nobody’s calf');
    if (pod.n >= 3) {
      const c = pod.n - 1;
      ok(Math.abs(memberPhase(pod, c) - memberPhase(pod, c - 1)) < 0.01,
        'the calf surfaces with her mother');
      ok(memberLen(pod, c) < memberLen(pod, 0) * 0.6, 'and she is plainly a calf');
      const kid = memberOffset(pod, c), mum = memberOffset(pod, c - 1);
      ok(Math.hypot(kid.side - mum.side, kid.lag - mum.lag) < COW_LEN,
        'and she rides at her mother’s flank, not across the pod');
      ok(Math.sign(kid.side) === Math.sign(mum.side), 'on her mother’s side of the leader');
    }
  }
}

// ---- the sounding cycle: five acts, and the last one is a real absence ----
{
  const N = 4000;
  let surf = 0, deep = 0, flukeMax = -Infinity, bowAtFlukeMax = 0;
  let pitchMax = 0, yMax = -Infinity, yMin = Infinity;
  const seen = new Set();
  for (let i = 0; i < N; i++) {
    const u = i / N;
    const p = whalePose(u, BULL_LEN);
    seen.add(p.phase);
    ok(Number.isFinite(p.y) && Number.isFinite(p.pitch) && Number.isFinite(p.roll)
      && Number.isFinite(p.blow), `pose finite at u=${u.toFixed(4)}`);
    ok(p.blow >= 0 && p.blow <= 1.0001, `blow bounded at u=${u.toFixed(4)}`);
    ok(Math.abs(p.roll) < 0.3, 'she rolls, she does not capsize');
    if (p.y > -1.5) surf++;
    if (p.y < -20) deep++;
    pitchMax = Math.max(pitchMax, Math.abs(p.pitch));
    yMax = Math.max(yMax, p.y); yMin = Math.min(yMin, p.y);
    const f = flukeTipY(p, BULL_LEN);
    if (f > flukeMax) { flukeMax = f; bowAtFlukeMax = bowTipY(p, BULL_LEN); }
  }
  ok(seen.size === 5 && [...Object.keys(PHASE)].every((k) => seen.has(k)),
    `all five acts run (${[...seen].join(', ')})`);
  ok(surf / N > 0.35 && surf / N < 0.65, `a real spell at the surface (${(surf / N * 100).toFixed(0)}% of the cycle)`);
  ok(deep / N > 0.30, `and a real absence (${(deep / N * 100).toFixed(0)}% of the cycle deep)`);
  ok(deep / N * WHALE_PERIOD > 40,
    `the absence lasts (${(deep / N * WHALE_PERIOD).toFixed(0)} s down)`);
  ok(pitchMax < 1.5, `pitch bounded (${pitchMax.toFixed(2)} rad)`);
  ok(yMin <= -WHALE_DEEP + 1e-9 && yMax < 3, `depth envelope (${yMin.toFixed(1)}..${yMax.toFixed(1)} m)`);
  // THE MONEY SHOT: the flukes stand out of the sea while the bow goes under
  ok(flukeMax > 4, `the flukes come clear of the water (${flukeMax.toFixed(1)} m up)`);
  ok(bowAtFlukeMax < -6, `and the bow is well under at that moment (${bowAtFlukeMax.toFixed(1)} m)`);
  // the cycle closes on itself, so she can run forever without a jump
  const a = whalePose(0, BULL_LEN), b = whalePose(0.99999, BULL_LEN);
  ok(Math.abs(a.y - b.y) < 0.05 && Math.abs(a.pitch - b.pitch) < 0.02, 'the cycle closes in the deep');
  ok(WHALE_PERIOD > 90, 'an encounter, not a metronome');
}

// ---- the phases sit in the right order, and only the blow blows ----
{
  const mid = (k) => (PHASE[k][0] + PHASE[k][1]) / 2;
  ok(whalePose(mid('rise'), BULL_LEN).phase === 'rise', 'rise');
  ok(whalePose(mid('blow'), BULL_LEN).phase === 'blow', 'blow');
  ok(whalePose(mid('cruise'), BULL_LEN).phase === 'cruise', 'cruise');
  ok(whalePose(mid('sound'), BULL_LEN).phase === 'sound', 'sound');
  ok(whalePose(mid('deep'), BULL_LEN).phase === 'deep', 'deep');
  ok(whalePose(mid('rise') + 1, BULL_LEN).phase === 'rise', 'the phase wraps with the clock');
  ok(whalePose(mid('rise') - 1, BULL_LEN).phase === 'rise', 'and wraps backwards too');
  for (const k of ['rise', 'cruise', 'sound', 'deep']) {
    ok(whalePose(mid(k), BULL_LEN).blow === 0, `no spout in the ${k}`);
  }
  // three breaths per surfacing, each a hard jet that dies away
  let peaks = 0, lulls = 0, rising = false;
  const [lo, hi] = PHASE.blow;
  for (let u = lo; u < hi; u += (hi - lo) / 3000) {
    const j = whalePose(u, BULL_LEN).blow;
    if (j > 0.95 && !rising) { peaks++; rising = true; }
    if (j < 0.05) { rising = false; lulls++; }
  }
  ok(peaks === BREATHS, `she blows ${BREATHS} times at the surface (counted ${peaks})`);
  ok(lulls > 100, 'and breathes between the blows');
  // the plume spreads as it dies
  ok(whalePose(lo + 0.001, BULL_LEN).blowAge < whalePose(lo + 0.03, BULL_LEN).blowAge,
    'the spout ages through its breath');
}

// ---- the pose scales with the animal, the dive does not ----
{
  const u = (PHASE.cruise[0] + PHASE.cruise[1]) / 2;
  const bull = whalePose(u, BULL_LEN), calf = whalePose(u, CALF_LEN);
  ok(bull.y < calf.y, `a bull sits deeper in her trim than a calf (${bull.y.toFixed(2)} vs ${calf.y.toFixed(2)} m)`);
  const d = (PHASE.deep[0] + PHASE.deep[1]) / 2;
  ok(whalePose(d, BULL_LEN).y === whalePose(d, CALF_LEN).y, 'but a calf sounds with her mother');
  // even the calf's flukes clear the water when the pod sounds
  let calfFluke = -Infinity;
  for (let s = PHASE.sound[0]; s < PHASE.sound[1]; s += 1e-4) {
    calfFluke = Math.max(calfFluke, flukeTipY(whalePose(s, CALF_LEN), CALF_LEN));
  }
  ok(calfFluke > 1.5, `the calf's flukes come up too (${calfFluke.toFixed(1)} m)`);
}

// ---- the churn: foam where she breaks the sea, nothing once she is down ----
{
  const glow = (k, len = BULL_LEN) => {
    let mx = 0;
    for (let u = PHASE[k][0]; u < PHASE[k][1]; u += 1e-4) {
      mx = Math.max(mx, churnGlow(whalePose(u, len), len));
    }
    return mx;
  };
  ok(glow('blow') > 0.3, `foam at the blow (${glow('blow').toFixed(2)})`);
  ok(glow('sound') > 0.3, `foam at the sounding (${glow('sound').toFixed(2)})`);
  ok(glow('deep') === 0, 'no foam over an empty sea');
  for (let u = 0; u < 1; u += 1e-3) {
    const g = churnGlow(whalePose(u, BULL_LEN), BULL_LEN);
    ok(g >= 0 && g <= 1, `churn bounded at u=${u.toFixed(3)}`);
  }
}

// ---- the member cycle: the pod's own clock, decorrelated but together ----
{
  const pod = { kind: 'pod', seed: 137.3, n: 4, phase0: 0.3 };
  const us = [];
  for (let i = 0; i < pod.n; i++) us.push(memberCycle(pod, i, 500));
  ok(new Set(us.map((u) => u.toFixed(6))).size === pod.n, 'no two animals share a phase exactly');
  const spread = Math.max(...us) - Math.min(...us);
  ok(spread < 0.08, `but the pod surfaces together (${(spread * WHALE_PERIOD).toFixed(1)} s apart)`);
  ok(memberCycle(pod, 0, 0) === 0.3 && Math.abs(memberCycle(pod, 0, WHALE_PERIOD) - 0.3) < 1e-9,
    'the cycle is a clean function of the world clock');
}

// ---- the White Whale: she hunts, but she is never glued to the hull ----
{
  let a = { x: 0, z: 0 };
  a = stalkAnchor(a, 300, 0, 1);
  ok(a.x < 18, `a second of stalking moves her ${a.x.toFixed(1)} m, not 300`);
  ok(a.x > 5, 'but she does come on');
  let b = { x: 0, z: 0 };
  for (let i = 0; i < 90; i++) b = stalkAnchor(b, 300, 0, 1);
  ok(300 - b.x < 30, `and in a minute and a half she has closed (${b.x.toFixed(0)} of 300 m)`);
  const still = stalkAnchor({ x: 500, z: -200 }, 500, -200, 0.016);
  ok(Math.abs(still.x - 500) < 1e-9 && Math.abs(still.z + 200) < 1e-9,
    'a stationary ship never drags her about');
  ok(stalkAnchor({ x: 0, z: 0 }, 100, 0, 1, WHITE_TAU).x
    < stalkAnchor({ x: 0, z: 0 }, 100, 0, 4, WHITE_TAU).x, 'the stalk is monotone in dt');
  // her spec: one vast animal, and the same object reused frame to frame
  const spec = whitePod({ x: 10, z: 20 });
  ok(spec.n === 1 && spec.kind === 'white' && memberLen(spec, 0) === WHITE_LEN,
    'she works alone, at her own size');
  const again = whitePod({ x: 40, z: 50 }, spec);
  ok(again === spec && spec.ox === 40 && spec.oz === 50,
    'her spec is reused, not reallocated every frame');
  // and she still travels: a world position that circles her own anchor
  const p0 = podPose(spec, 0), p1 = podPose(spec, 20);
  ok(Math.hypot(p1.x - p0.x, p1.z - p0.z) > 40, 'she is never at rest beside you');
}

if (failed) { console.error(`verify-whales: ${failed} FAILED`); process.exit(1); }
console.log('verify-whales: OK — world-anchored pods on their own courses, sized against the ladder, flukes clear of the water and a real absence in the deep');
