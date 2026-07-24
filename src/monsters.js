// Sea monsters — the pure fight logic, no THREE, no DOM. verify-monsters.mjs
// guards it; monsterlayer.js gives them bodies. Two boss legends live here:
//
//   THE KRAKEN (kraken-deep) — tentacles grab the hull, the crew hacks them
//   off while you steer for shallow water where it cannot follow — or stand
//   and shoot every arm off it. One ship can flee it; a crewed one can kill it.
//
//   Y DDRAIG GOCH (dragons-wales) — a dragon circles high over the Irish
//   Sea and stoops on your rig. She is only in cannon reach DURING the
//   stoop: wound her three times and she flees to her crag in Snowdonia —
//   heave to under Snowdon and the longboat brings down the hoard.
//
// Both machines are deterministic given their inputs (invariant 6).

// ---- the Kraken ----
export const KRAKEN_ARMS = 6;

// THE ARM'S LIVING CURVE — per-segment bend angles (radians) the scene
// layer skins cylinders onto (monsterlayer). t: seconds; i: which arm;
// grip [0..1]: how hard she holds (the fight loosens it); slam [0..1]: the
// STRIKE — at 0 the arm writhes its grip, rising toward 1 it REARS back
// off the hull, and the layer drives it 1 -> 0 fast so the whip-down reads
// as a blow. Root stands near-straight out of the sea; the curl gathers
// toward the tip — a wave travels DOWN the arm so every arm writhes on its
// own clock. Bounded: no joint ever folds back through the last
// (|angle| < 0.9 rad at any grip/slam).
export const ARM_SEGS = 8;
export function tentacleSpine(t, i, grip = 0.7, slam = 0) {
  const out = [];
  for (let s = 0; s < ARM_SEGS; s++) {
    const u = s / (ARM_SEGS - 1);
    const wave = Math.sin(t * 1.9 + i * 1.9 - u * 3.6) * 0.22 * (0.35 + u);
    const curl = -(0.06 + 0.46 * grip * u * u);
    // the rear-back: root throws OUT, tip straightens — the arm stands off
    // the hull at full slam, cocked; easing back to 0 whips it down
    const rear = slam * (0.45 * (1 - u) - curl * 0.9);
    out.push(Math.max(-0.9, Math.min(0.9, curl + wave * (1 - slam * 0.6) + rear)));
  }
  return out;
}

// THE WING BEAT — pure drive for the dragon's articulated wings (the layer
// skins two hinged membrane panels per side onto it). The OUTER panel lags
// the inner by a fixed phase and over-swings it: that whip is what reads as
// flight instead of a flapping board. Stooping folds both panels hard back.
// Everything bounded (|angle| < 1 rad); tail and neck ride the same clock.
// state: false/'circling' | true/'stoop' | 'climb'. Big soarers do not
// flap like metronomes: circling is BURST-AND-GLIDE (bouts of beats, then
// wings locked out in a shallow breathing dihedral), the downstroke drives
// faster than the upstroke recovers (the skewed wave), and climbing out of
// the stoop is all power — deeper, quicker strokes, no glide at all.
export function wingBeat(t, state = false) {
  if (state === true || state === 'stoop') {
    return { inner: 0.5, outer: -0.95, tail: Math.sin(t * 3.1) * 0.12, neck: -0.28 };
  }
  const climb = state === 'climb';
  // the bout gate: two slow incommensurate sines — irregular flapping
  // bouts with real glides between (clamped, so glides are truly locked)
  const bout = climb ? 1
    : Math.min(1, Math.max(0, (Math.sin(t * 0.37) + Math.sin(t * 0.23 + 1.3)) * 0.9 + 0.5));
  const rate = climb ? 3.1 : 2.4;
  const amp = climb ? 0.58 : 0.5;
  // the skewed stroke: sin(ph + k·sin ph) falls fast, recovers slow
  const ph = t * rate;
  const s = Math.sin(ph + 0.42 * Math.sin(ph));
  const sLag = Math.sin(ph - 0.7 + 0.42 * Math.sin(ph - 0.7));
  // the glide pose: wings out in a shallow dihedral that breathes
  const glideIn = 0.14 + 0.04 * Math.sin(t * 0.9);
  const glideOut = -0.06 + 0.05 * Math.sin(t * 0.7 + 0.5);
  return {
    inner: s * amp * bout + glideIn * (1 - bout),
    outer: sLag * amp * 1.6 * bout + glideOut * (1 - bout),
    tail: Math.sin(t * 1.1) * 0.22,
    neck: Math.sin(ph + 0.4) * 0.12 * bout,
  };
}

// her fire between stoops: short bursts while she circles (~every 7 s), so
// the flame is never more than a few seconds off camera. [0..1] envelope.
export function circleFire(t) {
  return Math.max(0, Math.sin(t * 0.9)) ** 8;
}

// the slam clock — pure so both the layer and the verify read the same
// strike: each arm rears over ~1.2 s and whips down in ~0.4 s, staggered
// around the pod so at most one or two arms strike at once
export function slamPhase(t, i) {
  const cycle = (t * 0.14 + i / KRAKEN_ARMS) % 1; // one strike per arm per ~7 s
  if (cycle < 0.82) return 0;
  const u = (cycle - 0.82) / 0.18;
  return u < 0.72 ? u / 0.72 : (1 - u) / 0.28; // slow rear, fast whip-down
}
export const KRAKEN_WARN = 8;     // s of boiling sea before the arms come up
export const KRAKEN_HOLD = 60;    // s before it tires and lets go on its own
export const KRAKEN_SHALLOW = 400; // game m of coast where it cannot follow
export const KRAKEN_HACK = 10;    // crew-seconds of axe-work per arm
export const KRAKEN_RIG_RATE = 0.012; // rigging shredded per second in its grip
export const KRAKEN_LOOT = 1200;  // what the deeps owe you for slaying it

export function newKraken() {
  return { state: 'rising', t: 0, arms: KRAKEN_ARMS, hackT: 0 };
}

// mutates k; crew: hands hacking (the captain counts himself in), coastDist:
// game metres of water under the escape rule. Returns events this step.
export function stepKraken(k, dt, crew, coastDist) {
  const ev = { grabbed: false, released: false, slain: false };
  if (k.state === 'rising') {
    k.t += dt;
    if (k.t >= KRAKEN_WARN) { k.state = 'gripping'; k.t = 0; ev.grabbed = true; }
    return ev;
  }
  if (k.state !== 'gripping') return ev;
  k.t += dt;
  // the crew hacks at the arms — every hand, and the captain's own axe
  k.hackT += (crew + 1) * dt;
  while (k.hackT >= KRAKEN_HACK && k.arms > 0) {
    k.hackT -= KRAKEN_HACK;
    k.arms--;
  }
  if (k.arms <= 0) { k.state = 'slain'; ev.slain = true; return ev; }
  if (coastDist < KRAKEN_SHALLOW) { k.state = 'fled'; ev.released = true; return ev; }
  if (k.t >= KRAKEN_HOLD) { k.state = 'fled'; ev.released = true; }
  return ev;
}

// a broadside into the writhing mass takes an arm clean off
export function shootKrakenArm(k) {
  if (k.state !== 'gripping' || k.arms <= 0) return { hit: false, slain: false };
  k.arms--;
  if (k.arms <= 0) k.state = 'slain';
  return { hit: true, slain: k.arms <= 0 };
}

// how much way she can make in its grip: six arms all but stop her
export function krakenDrag(k) {
  if (k.state !== 'gripping') return 1;
  return Math.max(0.15, 1 - 0.14 * k.arms);
}

export function krakenOver(k) {
  return k.state === 'slain' || k.state === 'fled';
}

// ---- Y Ddraig Goch ----
export const DRAGON_HP = 3;        // wounds before she breaks off for her crag
export const DRAGON_CIRCLE = 11;   // s wheeling high, out of reach
export const DRAGON_STOOP = 3.5;   // s of the dive — the firing window
export const DRAGON_CLIMB = 3;     // s regaining her height
export const DRAGON_RAKE = 0.14;   // rig torn per stoop she completes unharried
export const DRAGON_HIT = 0.75;    // a laid gun mostly tells at her wingspan
export const DRAGON_HIGH = 60;     // circling altitude (visual)
export const DRAGON_LOW = 9;       // she bottoms out at masthead height
export const HOARD_GOLD = 2000;    // the crag's hoard — sea plunder, re-buried
export const HOARD_REACH = 500;    // game m off the crag for the longboat party

export function newDragon() {
  return { state: 'circling', t: 0, hp: DRAGON_HP, raked: false };
}

// mutates d. Returns { rake: bool } — true the single moment she passes
// through the rig this stoop.
export function stepDragon(d, dt) {
  const ev = { rake: false };
  if (d.state === 'fled') return ev;
  d.t += dt;
  if (d.state === 'circling' && d.t >= DRAGON_CIRCLE) {
    d.state = 'stoop'; d.t = 0; d.raked = false;
  } else if (d.state === 'stoop') {
    // the rake lands at the bottom of the dive, once
    if (!d.raked && d.t >= DRAGON_STOOP * 0.55) { d.raked = true; ev.rake = true; }
    if (d.t >= DRAGON_STOOP) { d.state = 'climb'; d.t = 0; }
  } else if (d.state === 'climb' && d.t >= DRAGON_CLIMB) {
    d.state = 'circling'; d.t = 0;
  }
  return ev;
}

// she is only a target on the way down
export function dragonVulnerable(d) {
  return d.state === 'stoop';
}

export function woundDragon(d) {
  if (d.state === 'fled') return { fled: true };
  d.hp--;
  if (d.hp <= 0) { d.state = 'fled'; return { fled: true }; }
  return { fled: false };
}

// visual altitude through the cycle: high on the wheel, masthead in the stoop
export function dragonAlt(d) {
  if (d.state === 'stoop') {
    const u = Math.min(1, d.t / DRAGON_STOOP);
    const dip = Math.sin(u * Math.PI); // down and back up in one pass
    return DRAGON_HIGH - (DRAGON_HIGH - DRAGON_LOW) * dip;
  }
  if (d.state === 'climb') {
    const u = Math.min(1, d.t / DRAGON_CLIMB);
    return DRAGON_LOW + (DRAGON_HIGH - DRAGON_LOW) * u * 0.4 + DRAGON_HIGH * 0.6 * u * u;
  }
  return DRAGON_HIGH;
}

export function dragonGone(d) {
  return d.state === 'fled';
}
