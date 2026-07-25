// verify-seamotion: THE MOTION GATE — the third axis of the sea v2 spec
// (docs/superpowers/specs/2026-07-25-sea-v2-design.md, "The gates").
//
// WHY THIS EXISTS. On 2026-07-25 a change that turned the wave directions to
// follow the wind shipped with all sixty headless checks green and made the
// ship buck like a startled horse in the real game. It was reverted (48b05ae).
// The fault was structural, not a tuning slip: wave phase is k·p in ABSOLUTE
// world metres, and play happens 20–40 km from the world origin (England sits
// near z = -22000), so rotating a direction pivots the entire field about a
// point twenty kilometres away. A tenth of a milliradian per frame slews the
// phase under the hull by more than a radian and she judders.
//
// Every check the repo had measured SPACE — parity, amplitudes, band shapes,
// monotone envelopes. None measured TIME. A sea can be perfectly parity-exact,
// perfectly bounded in amplitude, and still unsailable. This script closes
// that hole: it sails hulls over the live wave field at a fixed timestep and
// asserts the resulting MOTION is physical — smooth frame to frame, bounded in
// vertical acceleration, AT DISTANCE (where the bug lived and no other check
// looks), ACROSS A SEA-STATE CHANGE, ALONG A COAST, and deterministically.
//
// THE THRESHOLDS ARE MEASURED, NOT INVENTED. Each limit below carries the
// worst value the current (reverted-to) sea produces over a 560-run sweep of
// seven hull classes x eight sea states x random poses out to 60 km, and the
// headroom that limit leaves. Every failure message prints the measured number
// against its limit so a future failure is diagnosable without a debugger.
//
// Pure module gate: no THREE, no DOM, no Math.random.

import { newShipState, stepShip, shipAttitude, SPECS, SLOOP } from '../src/shipphysics.js';
import { optimalTrim } from '../src/sailing.js';
import {
  setSeaBands, setShoreSampler, getSeaBands, waveHeight, RIVER_STATE,
} from '../src/waves.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// deterministic poses (LCG — no Math.random in the gate)
let seed = 20260725;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

const DT = 1 / 30;                 // the game's frame budget
const maxOf = (a) => a.reduce((m, v) => (v > m ? v : m), -Infinity);
const minOf = (a) => a.reduce((m, v) => (v < m ? v : m), Infinity);
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const pct = (a, p) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

// ---- THE LIMITS (measured on the current sea; headroom in the comment) ----
// Rates and accelerations are per SECOND, not per frame, so the gate says the
// same thing at 20 Hz and at 144 Hz (the second difference over dt^2 converges
// on the true acceleration — measured invariant to 0.1% from 20 to 144 Hz).
const LIM = {
  vY: 9.0,     // heave rate, m/s     — worst measured 4.08 (schooner, storm): 2.2x
  vP: 1.6,     // pitch rate, rad/s   — worst measured 0.67 (sloop, storm):    2.4x
  vR: 2.2,     // roll rate, rad/s    — worst measured 0.97 (sloop, storm):    2.3x
  aY: 60,      // heave accel, m/s^2  — worst measured 26.7 (schooner, storm): 2.2x
  // STEP FRACTION: one frame's change as a share of the whole run's range.
  // Dimensionless, so it is blind to sea state and catches the judder that a
  // small-amplitude sea would hide from the absolute bounds. A signal resolved
  // at N frames per cycle sits near pi/N; aliased motion runs to 1.
  stepY: 0.20, // worst measured 0.074 (frigate, low state): 2.7x
  stepA: 0.25, // pitch/roll — worst measured 0.101 (cutter, low state):       2.5x
  // SPIKINESS: a discontinuity in the field is a single frame unlike its
  // neighbours. Two views of it, because they fail differently: max/median
  // convicts a lone glitch loudly; max/p95 is the tighter, better-behaved one.
  ratio: 18,   // max|d| / median|d| — worst measured 8.39 (strait crossing):  2.1x
  spike: 5.0,  // max|d| / p95|d|    — worst measured 2.29 (galleon, open):    2.2x
};

// one hull, one sea, one transit — the metrics that say whether she rode it
function transit({
  spec = SLOOP, gait = 1, bands = [1, 1], x0 = 0, z0 = 0, yaw0 = 0,
  secs = 90, ease = null, sampler = null, drive = null, wind = 9,
}) {
  setShoreSampler(sampler || null);
  setSeaBands(bands[0], bands[1]);
  const s = newShipState(x0, z0);
  s.yaw = yaw0;
  const w = { from: yaw0 - Math.PI / 2, speed: wind };  // beam reach: she moves
  s.trim = optimalTrim(Math.PI / 2);
  s.speed = spec.maxSpeed * 0.8;
  const ys = [], ps = [], rs = [];
  const n = Math.round(secs / DT);
  for (let i = 0; i < n; i++) {
    const t = i * DT;
    if (ease) ease(t);
    if (drive) drive(s, i); else stepShip(s, w, DT, spec, gait);
    const a = shipAttitude(s, t, spec);
    ys.push(a.y); ps.push(a.pitch); rs.push(a.roll);
  }
  setSeaBands(1, 1);
  setShoreSampler(null);

  const diff = (arr) => arr.slice(1).map((v, i) => Math.abs(v - arr[i]));
  const dy = diff(ys), dp = diff(ps), dr = diff(rs);
  const acc = [];
  for (let i = 1; i < ys.length - 1; i++) {
    acc.push(Math.abs(ys[i + 1] - 2 * ys[i] + ys[i - 1]) / (DT * DT));
  }
  const span = (a) => maxOf(a) - minOf(a);
  const rat = (d) => { const m = med(d); return m > 0 ? maxOf(d) / m : 0; };
  const spk = (d) => { const q = pct(d, 0.95); return q > 0 ? maxOf(d) / q : 0; };
  const step = (d, r) => (r > 1e-6 ? maxOf(d) / r : 0);
  return {
    ys, heave: span(ys),
    vY: maxOf(dy) / DT, vP: maxOf(dp) / DT, vR: maxOf(dr) / DT,
    aY: maxOf(acc),
    stepY: step(dy, span(ys)), stepP: step(dp, span(ps)), stepR: step(dr, span(rs)),
    rY: rat(dy), rP: rat(dp), rR: rat(dr), rA: rat(acc),
    qY: spk(dy), qP: spk(dp), qR: spk(dr), qA: spk(acc),
  };
}

// every motion assertion for one transit, in one place, each printing what it
// measured — a failing gate must name the number that broke it
function judge(name, m, lim = LIM) {
  const f = (v, d = 3) => v.toFixed(d);
  ok(m.vY <= lim.vY, `${name}: heave rate ${f(m.vY)} m/s exceeds ${lim.vY}`);
  ok(m.vP <= lim.vP, `${name}: pitch rate ${f(m.vP)} rad/s exceeds ${lim.vP}`);
  ok(m.vR <= lim.vR, `${name}: roll rate ${f(m.vR)} rad/s exceeds ${lim.vR}`);
  ok(m.aY <= lim.aY, `${name}: heave acceleration ${f(m.aY, 1)} m/s^2 exceeds ${lim.aY}`);
  ok(m.stepY <= lim.stepY, `${name}: heave step fraction ${f(m.stepY, 4)} exceeds ${lim.stepY} (the sea is out-running the frame)`);
  ok(m.stepP <= lim.stepA, `${name}: pitch step fraction ${f(m.stepP, 4)} exceeds ${lim.stepA}`);
  ok(m.stepR <= lim.stepA, `${name}: roll step fraction ${f(m.stepR, 4)} exceeds ${lim.stepA}`);
  ok(m.rY <= lim.ratio, `${name}: heave max/median step ${f(m.rY, 2)} exceeds ${lim.ratio} (a spike in the field)`);
  ok(m.rP <= lim.ratio, `${name}: pitch max/median step ${f(m.rP, 2)} exceeds ${lim.ratio}`);
  ok(m.rR <= lim.ratio, `${name}: roll max/median step ${f(m.rR, 2)} exceeds ${lim.ratio}`);
  ok(m.rA <= lim.ratio, `${name}: heave-accel max/median ${f(m.rA, 2)} exceeds ${lim.ratio}`);
  ok(m.qY <= lim.spike, `${name}: heave max/p95 step ${f(m.qY, 2)} exceeds ${lim.spike}`);
  ok(m.qP <= lim.spike, `${name}: pitch max/p95 step ${f(m.qP, 2)} exceeds ${lim.spike}`);
  ok(m.qR <= lim.spike, `${name}: roll max/p95 step ${f(m.qR, 2)} exceeds ${lim.spike}`);
  ok(m.qA <= lim.spike, `${name}: heave-accel max/p95 ${f(m.qA, 2)} exceeds ${lim.spike}`);
  return m;
}

// the whole sea-state ladder the weather model can hand the hull: from the
// swell-less inshore floor to a full storm (weather.js seaBandsFor bounds)
const STATES = [[0.10, 0.50], [0.60, 0.60], [1.0, 1.0], [1.6, 1.3], [2.4, 1.9]];
const CLASSES = Object.entries(SPECS);

const track = { vY: 0, vP: 0, vR: 0, aY: 0, stepY: 0, ratio: 0, spike: 0 };
const note = (m) => {
  track.vY = Math.max(track.vY, m.vY); track.vP = Math.max(track.vP, m.vP);
  track.vR = Math.max(track.vR, m.vR); track.aY = Math.max(track.aY, m.aY);
  track.stepY = Math.max(track.stepY, m.stepY, m.stepP, m.stepR);
  track.ratio = Math.max(track.ratio, m.rY, m.rP, m.rR, m.rA);
  track.spike = Math.max(track.spike, m.qY, m.qP, m.qR, m.qA);
};

// ---- 1. HOME WATER: every hull, every sea state, at the world origin ----
// The baseline. If this fails the sea itself is broken, not the frame.
for (const [name, spec] of CLASSES) {
  for (const bands of STATES) {
    const yaw = rnd() * Math.PI * 2;
    note(judge(`${name} @origin b${bands}`, transit({ spec, bands, yaw0: yaw })));
  }
}

// ---- 2. AT DISTANCE: the same test where the game is actually played ----
// THE POINT OF THIS WHOLE SCRIPT. The reverted judder was invisible at the
// origin (measured: the same per-frame rotation that drives heave acceleration
// to 296 m/s^2 off England reads 0.7 m/s^2 at 0,0) because the fault scales
// with |p|. England sits near z = -22000; blue water runs further still.
const FAR = [
  [0, -22000],        // the Channel, where the judder was reported
  [40000, -22000],    // the North Sea side
  [-30000, 40000],    // west and north
  [-38000, -38000],
  [120000, 90000],    // an ocean crossing's worth of world coordinate
];
for (const [name, spec] of CLASSES) {
  for (const [x0, z0] of FAR) {
    const bands = STATES[Math.floor(rnd() * STATES.length)];
    const yaw = rnd() * Math.PI * 2;
    note(judge(`${name} @(${x0},${z0}) b${bands}`, transit({ spec, bands, x0, z0, yaw0: yaw })));
  }
}
// and the storm, at distance, for every hull — the worst honest combination
for (const [name, spec] of CLASSES) {
  note(judge(`${name} storm @40km`,
    transit({ spec, bands: [2.4, 1.9], x0: 40000, z0: -22000, yaw0: rnd() * Math.PI * 2 })));
}

// ---- 3. THE SEA MUST ACTUALLY MOVE ----
// A gate that only bounds motion passes triumphantly on a millpond. The sea
// heaves in blue water; a river does not (RIVER_STATE, the inland floor).
{
  let minNormal = Infinity, minTag = '', maxRiver = 0, riverTag = '';
  for (const [name, spec] of CLASSES) {
    const yaw = rnd() * Math.PI * 2;
    const n = transit({ spec, bands: [1, 1], x0: 40000, z0: -22000, yaw0: yaw, secs: 60 });
    if (n.heave < minNormal) { minNormal = n.heave; minTag = name; }
    const r = transit({ spec, bands: [RIVER_STATE, RIVER_STATE], x0: 40000, z0: -22000, yaw0: yaw, secs: 60 });
    if (r.heave > maxRiver) { maxRiver = r.heave; riverTag = name; }
    ok(n.heave > 0.30,
      `${name}: a normal sea must heave the hull — range ${n.heave.toFixed(3)} m over 60 s (floor 0.30; measured worst 0.63)`);
    ok(r.heave < 0.20,
      `${name}: a river must lie near-flat — range ${r.heave.toFixed(3)} m (ceiling 0.20; measured worst 0.07)`);
  }
  ok(minNormal > maxRiver * 3,
    `blue water heaves far harder than a river (${minNormal.toFixed(3)} m ${minTag} vs ${maxRiver.toFixed(3)} m ${riverTag})`);
}

// ---- 4. ACROSS A SEA-STATE CHANGE ----
// main.js eases the two bands at different rates every frame (swell 0.015,
// chop 0.08 — the ocean's memory against the wind's). A sea whose state moves
// must not jolt the hull. The bound is SELF-CALIBRATING: the eased transit is
// held against the STEADY storm it eases into, over the same water, the same
// hull, the same pose — so it measures the CHANGE, not the destination.
// Measured: the honest rates cost a factor of 1.15; easing five times faster
// costs 6.96, and snapping the state costs 354.
const EASE_JOLT = 2.5;   // 2.2x over the measured 1.15
for (const [name, spec] of CLASSES) {
  const x0 = (rnd() - 0.5) * 80000, z0 = (rnd() - 0.5) * 80000, yaw = rnd() * Math.PI * 2;
  let sw = 0.15, ch = 0.55;
  const ease = (t) => {
    const blowing = t > 60 && t < 240;              // the gale gets up, then dies
    sw += ((blowing ? 2.4 : 0.15) - sw) * Math.min(1, DT * 0.015);
    ch += ((blowing ? 1.9 : 0.55) - ch) * Math.min(1, DT * 0.08);
    setSeaBands(sw, ch);
  };
  const eased = transit({ spec, x0, z0, yaw0: yaw, secs: 300, ease });
  const steady = transit({ spec, bands: [2.4, 1.9], x0, z0, yaw0: yaw, secs: 300 });
  note(judge(`${name} eased sea`, eased));
  const jolt = Math.max(eased.aY / steady.aY, eased.vY / steady.vY,
    eased.vP / steady.vP, eased.vR / steady.vR);
  ok(jolt <= EASE_JOLT,
    `${name}: easing the sea state jolts the hull ${jolt.toFixed(2)}x harder than the steady storm it eases into (limit ${EASE_JOLT}; measured worst 1.15)`);
  ok(eased.heave > steady.heave * 0.25,
    `${name}: the eased run reached a real sea (range ${eased.heave.toFixed(2)} m vs steady ${steady.heave.toFixed(2)} m)`);
}
ok(getSeaBands().swell === 1 && getSeaBands().chop === 1, 'the ease scenarios left the bands as they found them');

// ---- 5. THE COAST: the shore field under a moving hull ----
// The open set calms and a shore-parallel set rides in as the coast closes,
// both keyed on a sampled distance field — three smooth envelopes multiplied
// together, any of which could put a step under the hull. Sailed both with a
// real approach (an analytic island) and across a strait's medial line, where
// the field's gradient collapses and the shoreGate stands the breakers down.
{
  const openBefore = waveHeight(40000, -22000, 77.5); // the open sea, sampler-free
  const cx = 40000, cz = -22000;
  const island = (x, z) => {
    const dx = x - cx, dz = z - cz;
    const r = Math.hypot(dx, dz) || 1e-9;
    if (r > 3500) return null;                 // blue water beyond: no sampler
    return { d: 500 - r, gx: -dx / r, gz: -dz / r, gLen: 1 };
  };
  const strait = (x) => ({
    d: -Math.abs(x - cx) - 15,
    gx: Math.sign(x - cx) || 1, gz: 0,
    gLen: Math.min(1, Math.abs(x - cx) / 250), // collapses on the medial line
  });
  for (const [name, spec] of CLASSES) {
    const bands = STATES[1 + Math.floor(rnd() * 4)];
    // straight in from 1.4 km to the sand at a coastal 3 m/s (gait is 1 inshore)
    note(judge(`${name} coast approach b${bands}`, transit({
      spec, bands, x0: cx, z0: cz - 1400, yaw0: 0, secs: 460, sampler: island,
      drive: (s, i) => { s.z = cz - 1400 + i * DT * 3.0; },
    })));
    // and across a 1.4 km strait, through the gate's collapse and out again
    note(judge(`${name} strait crossing b${bands}`, transit({
      spec, bands, x0: cx - 700, z0: cz, yaw0: 0, secs: 700, sampler: strait,
      drive: (s, i) => { s.x = cx - 700 + i * DT * 2.0; },
    })));
  }
  ok(waveHeight(40000, -22000, 77.5) === openBefore,
    'every coast transit handed the sampler back — the open sea is bit-identical again');
}

// ---- 6. THE COMPRESSED OCEAN (gait) ----
// Blue water is sailed at up to GAIT_MAX = 10x, so the hull crosses the wave
// field ten times faster and the encounter frequency rises with it. That is
// design, not a fault — but it must stay a LINEAR consequence: heave rate may
// grow like the gait, acceleration like its square (omega_e^2), no worse. A
// phase fault that slews the field would break this law long before it broke
// anything else. Measured worst on the current sea: 1.99x and 2.10x.
{
  const GAIT_SLACK = 5;
  for (const [name, spec] of CLASSES) {
    const x0 = 40000, z0 = -22000, yaw = rnd() * Math.PI * 2;
    const base = transit({ spec, x0, z0, yaw0: yaw, secs: 90 });
    for (const g of [3, 10]) {
      const m = transit({ spec, gait: g, x0, z0, yaw0: yaw, secs: 90 });
      const fv = (m.vY / base.vY) / g, fa = (m.aY / base.aY) / (g * g);
      ok(fv <= GAIT_SLACK,
        `${name}: at gait ${g} the heave rate grows ${(fv * g).toFixed(1)}x — ${fv.toFixed(2)}x faster than the gait itself (limit ${GAIT_SLACK}; measured worst 1.99)`);
      ok(fa <= GAIT_SLACK,
        `${name}: at gait ${g} the heave acceleration grows ${(fa * g * g).toFixed(0)}x — ${fa.toFixed(2)}x faster than gait squared (limit ${GAIT_SLACK}; measured worst 2.10)`);
      // and the spikiness measures, which are scale-free, must still hold
      ok(m.rY <= LIM.ratio && m.rA <= LIM.ratio,
        `${name}: at gait ${g} the sea stays smooth in shape (max/median heave ${m.rY.toFixed(2)}, accel ${m.rA.toFixed(2)}, limit ${LIM.ratio})`);
    }
  }
}

// ---- 7. DETERMINISM ----
// Two players on the same water must feel the same sea, and a regression that
// leaks per-call state into the field (a v2 phase accumulator advanced by the
// evaluator rather than by the frame, say) must not pass. Two clauses:
// the same transit twice is bit-identical, AND the field is a function of
// (x, z, t) alone — not of the order the points were asked for.
{
  const run = () => transit({ spec: SPECS.BRIG, bands: [1.6, 1.3], x0: 40000, z0: -22000, yaw0: 0.7, secs: 40 }).ys;
  const a = run(), b = run();
  ok(a.length === b.length && a.every((v, i) => v === b[i]),
    'the same transit twice is bit-identical');

  const pts = [];
  for (let i = 0; i < 400; i++) {
    pts.push([(rnd() - 0.5) * 120000, (rnd() - 0.5) * 120000, rnd() * 7200]);
  }
  const forward = pts.map(([x, z, t]) => waveHeight(x, z, t));
  const backward = [...pts].reverse().map(([x, z, t]) => waveHeight(x, z, t)).reverse();
  ok(forward.every((v, i) => v === backward[i]),
    'the sea is a function of (x, z, t), not of the order it is sampled in (reversed)');
  const shuffled = new Array(pts.length);
  for (let i = 0; i < pts.length; i++) {
    const j = (i * 137 + 41) % pts.length;   // a fixed derangement, no randomness
    const [x, z, t] = pts[j];
    shuffled[j] = waveHeight(x, z, t);
  }
  ok(forward.every((v, i) => v === shuffled[i]),
    'the sea is a function of (x, z, t), not of the order it is sampled in (interleaved)');

  // and the same sea state must give the same water twice, after a round trip
  // through a different one — no hysteresis hiding in the band scalars
  const h0 = waveHeight(31337, -22000, 12.5);
  setSeaBands(2.4, 1.9); waveHeight(0, 0, 1);
  setSeaBands(1, 1);
  ok(waveHeight(31337, -22000, 12.5) === h0, 'the band scalars carry no hysteresis');
}

// leave the world as we found it — the later gate scripts inherit this module
setSeaBands(1, 1);
setShoreSampler(null);

if (failed) { console.error(`verify-seamotion: ${failed} FAILED`); process.exit(1); }
console.log('verify-seamotion: OK — the hull rides smoothly at the origin and at 120 km,',
  'through a gale getting up, along a coast and across a strait; worst seen:',
  `heave ${track.vY.toFixed(2)} m/s, ${track.aY.toFixed(1)} m/s^2,`,
  `step ${track.stepY.toFixed(3)}, max/median ${track.ratio.toFixed(1)}, max/p95 ${track.spike.toFixed(2)}`);
