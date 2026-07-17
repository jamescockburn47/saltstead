// verify-helmsman: the hand at the wheel steers FOR the mark, keeps the
// trim honest, never points into the no-go, works upwind on alternating
// boards, and calls the arrival. Then the whole loop: a simulated voyage
// under helm orders actually REACHES a mark that needs a beat to windward.
import { helmOrder, ARRIVE_R, TACK_S } from '../src/helmsman.js';
import { newShipState, stepShip, SLOOP } from '../src/shipphysics.js';
import { IRONS, wrapAngle } from '../src/sailing.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// a reaching mark: steer straight at it, rudder signed right, trim honest
{
  const o = helmOrder(0, 0, 0, 1000, 0, 0); // mark due east, wind from north-ish
  ok(!o.arrived && !o.tacking, 'an open reach is no tack');
  ok(o.rudder > 0.5, `she puts the helm over toward the mark (${o.rudder.toFixed(2)})`);
  ok(o.trim >= 0 && o.trim <= 1, 'trim inside the sheet');
  const oL = helmOrder(0, 0, 0, -1000, 0, 0);
  ok(oL.rudder < -0.5, 'and the other way for the other beam');
}

// the no-go: a mark dead upwind is never steered AT — the order points a
// close-hauled board, and the board swaps on the tack clock. (sailing.js
// convention: heading === windFrom is bow dead into the wind.)
{
  const windFrom = 0;                                    // the eye is heading 0
  const a = helmOrder(0, 0, 0, 0, 4000, windFrom, 10);   // mark bearing 0 = dead upwind
  ok(a.tacking, 'dead upwind is a beat, not a straight line');
  const b = helmOrder(0, 0, 0, 0, 4000, windFrom, 10 + TACK_S);
  // reconstruct each order's intended heading from its rudder error (yaw 0)
  const wantA = wrapAngle(a.rudder / 1.6);
  const wantB = wrapAngle(b.rudder / 1.6);
  ok(Math.sign(wantA) !== Math.sign(wantB), 'the boards alternate on the clock');
  ok(Math.abs(wrapAngle(wantA - windFrom)) > IRONS, 'no board points into the no-go');
}

// arrival: inside the ring the helm comes off and the sail is handed
{
  const o = helmOrder(1.2, 0, 0, ARRIVE_R * 0.5, 0, 0);
  ok(o.arrived && o.rudder === 0 && o.trim === 0, 'the mark made, the way handed off');
}

// THE VOYAGE: sim a sloop under helm orders to a mark 3 km up-and-across
// wind — the whole loop must actually get there (wind allowing IS allowing)
{
  const s = newShipState(0, 0);
  const wind = { from: 2.4, speed: 8 };
  const mark = { x: 1800, z: -2400 };
  let t = 0, arrived = false;
  const DT = 1 / 10;
  for (let i = 0; i < 10 * 60 * 45 && !arrived; i++) { // a 45-sim-minute watch: beats are slow
    const o = helmOrder(s.yaw, s.x, s.z, mark.x, mark.z, wind.from, t);
    if (o.arrived) { arrived = true; break; }
    s.rudder = o.rudder;
    s.trim += (o.trim - s.trim) * Math.min(1, DT * 2); // the hand eases the sheet
    stepShip(s, wind, DT, SLOOP);
    t += DT;
  }
  ok(arrived, `the helmsman made the mark (${Math.hypot(s.x - mark.x, s.z - mark.z).toFixed(0)} m off at the end)`);
}

if (failed) { console.error(`verify-helmsman: ${failed} FAILED`); process.exit(1); }
console.log('verify-helmsman: OK — steers for the mark, respects the no-go, tacks on the clock, and actually arrives');
