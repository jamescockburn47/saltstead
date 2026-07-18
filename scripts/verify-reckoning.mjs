// verify-reckoning: the log casts within its honest error, the reckoning
// advances by heading and logged speed alone, an unmodelled set opens the
// gap the way a real current did, and a fix closes the book.
import {
  chipLog, newReckoning, castReckoning, stepReckoning, reckonErrorKm,
  fixReckoning, LOG_ERR,
} from '../src/reckoning.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// the cast: bounded error, deterministic, period-phrased
{
  for (let s = 1; s <= 40; s++) {
    const c = chipLog(s, 6);
    ok(Math.abs(c.estMs - 6) <= 6 * LOG_ERR + 1e-9, `a cast is within its error (${c.estMs.toFixed(2)})`);
  }
  ok(chipLog(3, 6).estMs === chipLog(3, 6).estMs, 'the same cast reads the same');
  ok(chipLog(3, 6).text.includes('knots') && chipLog(3, 6).text.includes('glass'),
    'the reading is a sailor’s sentence');
  ok(Math.abs(chipLog(1, 6).kn - chipLog(1, 6).estMs * 1.944) < 1e-9, 'knots are knots');
  let varied = false;
  for (let s = 2; s <= 12; s++) if (chipLog(s, 6).estMs !== chipLog(1, 6).estMs) varied = true;
  ok(varied, 'different casts, different thumbs');
}

// the arithmetic: heading and logged speed, gait riding both
{
  const rk = castReckoning(newReckoning(0, 0), 5);
  for (let i = 0; i < 100 * 10; i++) stepReckoning(rk, 0, 1 / 10); // due south 100 s
  ok(Math.abs(rk.z - 500) < 1e-6 && Math.abs(rk.x) < 1e-6, `due south by the book (${rk.z.toFixed(1)})`);
  const rg = castReckoning(newReckoning(0, 0), 5);
  for (let i = 0; i < 100 * 10; i++) stepReckoning(rg, 0, 1 / 10, 10);
  ok(Math.abs(rg.z - 5000) < 1e-6, 'the gait compresses the ocean for the book too');
}

// the lesson: an unmodelled set opens the gap at exactly the current's pace
{
  const cur = 2.2; // a Gulf-Stream-strength set, due east
  const rk = castReckoning(newReckoning(0, 0), 6);
  let x = 0, z = 0;
  const DT = 1 / 10, T = 600;
  for (let i = 0; i < T / DT; i++) {
    x += (Math.sin(0) * 6 + cur) * DT; // truth: through-water 6 + the set
    z += Math.cos(0) * 6 * DT;
    stepReckoning(rk, 0, DT); // the book: through-water only
  }
  const err = reckonErrorKm(rk, x, z);
  ok(Math.abs(err - (cur * T) / 1000) < 0.01,
    `ten minutes in the stream puts the book out by the stream (${err.toFixed(2)} km)`);
  // the fix: reports the miss, closes the book
  const reported = fixReckoning(rk, x, z);
  ok(Math.abs(reported - err) < 1e-9, 'the fix reports the miss');
  ok(reckonErrorKm(rk, x, z) === 0 && rk.since === 0, 'and corrects the book');
}

if (failed) { console.error(`verify-reckoning: ${failed} FAILED`); process.exit(1); }
console.log('verify-reckoning: OK — honest casts, heading-and-speed arithmetic, the set is the error, the fix closes the book');
