// verify-watchbill: bells are deterministic, a real share of them are quiet,
// every event respects its gate, no kind fires twice running, and the
// passage arithmetic is honest.
import { bellEvent, spectacleLine, passageStats, BELL_S, QUIET } from '../src/watchbill.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

ok(BELL_S >= 60 && BELL_S <= 180, 'a bell is a real stretch of sailing');

// deterministic: the same passage strikes the same bells
{
  const ctx = { night: false, clear: true, storm: false, crew: 4 };
  for (let n = 0; n < 20; n++) {
    const a = bellEvent(7, n, ctx), b = bellEvent(7, n, ctx);
    ok(JSON.stringify(a) === JSON.stringify(b), `bell ${n} deterministic`);
  }
}

// quiet is load-bearing: across many passages, a real share of bells bring nothing
{
  let quiet = 0, total = 0;
  const ctx = { night: false, clear: true, storm: false, crew: 4 };
  for (let seed = 1; seed <= 40; seed++) {
    for (let n = 0; n < 12; n++) {
      total++;
      if (!bellEvent(seed, n, ctx)) quiet++;
    }
  }
  ok(quiet / total > QUIET * 0.7 && quiet / total < 0.75,
    `a real share of bells are just the sea (${(quiet / total * 100).toFixed(0)}%)`);
}

// gates hold: the moment can't stage what the world won't carry
{
  const fair = { night: false, clear: true, storm: false, crew: 4 };
  const foul = { night: true, clear: false, storm: true, crew: 0 };
  for (let seed = 1; seed <= 60; seed++) {
    for (let n = 0; n < 10; n++) {
      const a = bellEvent(seed, n, fair);
      if (a) ok(a.kind !== 'stelmo' && a.kind !== 'meteor',
        `no storm-fire or meteors on a clear day (${a.kind})`);
      const b = bellEvent(seed, n, foul);
      if (b) ok(b.kind !== 'breach' && b.kind !== 'meteor' && b.kind !== 'yarn'
        && b.kind !== 'dispute',
        `a stormy night with no crew stages only what it can (${b.kind})`);
    }
  }
  // a solo sloop never quarrels with itself
  for (let seed = 1; seed <= 60; seed++) {
    const e = bellEvent(seed, 3, { ...fair, crew: 1 });
    if (e) ok(e.kind !== 'dispute', 'one hand cannot quarrel');
  }
}

// no kind fires twice running
{
  const ctx = { night: false, clear: true, storm: false, crew: 4 };
  for (let seed = 1; seed <= 60; seed++) {
    let prev = null;
    for (let n = 0; n < 12; n++) {
      const e = bellEvent(seed, n, ctx, prev);
      if (e && prev) ok(e.kind !== prev, `no repeat: ${e.kind} after ${prev}`);
      if (e) prev = e.kind;
    }
  }
}

// spectacles have words; non-spectacles have none
ok(typeof spectacleLine('breach', 1) === 'string' && spectacleLine('breach', 1).length > 20,
  'a breach has words');
ok(typeof spectacleLine('stelmo', 2) === 'string', 'the fire has words');
ok(spectacleLine('yarn') === null, 'a yarn is not a spectacle');
ok(spectacleLine('breach', 5) === spectacleLine('breach', 5), 'wording deterministic');

// the brag sheet's arithmetic
{
  const s = passageStats(120, 600); // 120 km in 10 minutes
  ok(s.km === 120 && s.min === 10 && s.kmMin === 12, `passage stats honest (${JSON.stringify(s)})`);
  ok(passageStats(50, 0).kmMin === 0, 'zero time never divides');
}

if (failed) { console.error(`verify-watchbill: ${failed} FAILED`); process.exit(1); }
console.log('verify-watchbill: OK — bells deterministic, quiet floor holds, gates gate, no repeats, honest arithmetic');
