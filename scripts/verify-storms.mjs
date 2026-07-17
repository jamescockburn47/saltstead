// verify-storms: cyclones spin the right way per hemisphere, a calm eye inside a
// gale eyewall, a storm sky and a risen sea within the system and fair water
// beyond, a danger disc at the heart, and the whole thing deterministic in t.
import { stormsAt, stormWindAt, stormFieldAt, vortexToward } from '../src/storms.js';
import { latLonToWorld } from '../src/earth.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// cyclonic spin: CCW in the north (east of the eye blows north, -z), CW in the south
ok(vortexToward(100, 0, 1).z < 0, 'north storms spin CCW (east of the eye blows north)');
ok(vortexToward(100, 0, -1).z > 0, 'south storms spin CW (mirrored)');

// storms are abroad, deterministic in sim time
{
  const a = stormsAt(0), b = stormsAt(0);
  ok(a.length > 0, `storms are abroad (${a.length})`);
  ok(JSON.stringify(a) === JSON.stringify(b), 'and deterministic in sim time');
}

// around a real storm: calm eye, gale eyewall, fair water well beyond
{
  const s = stormsAt(0)[0];
  const far = latLonToWorld(58, -30); // no belt near here, no storm drifts this far
  const eye = stormWindAt(s.x, s.z, 0);
  const wall = stormWindAt(s.x + s.r * 0.5, s.z, 0);
  ok(eye && wall && eye.speed < wall.speed, `the eye is calmer than the eyewall (${eye.speed.toFixed(1)} < ${wall.speed.toFixed(1)})`);
  ok(wall.speed > 8, 'the eyewall blows a gale');
  ok(stormWindAt(far.x, far.z, 0) === null, 'clear water far beyond the storms');

  const fIn = stormFieldAt(s.x + s.r * 0.3, s.z, 0);
  const fOut = stormFieldAt(far.x, far.z, 0);
  ok(fIn.weatherState === 'storm' && fIn.seaScale > 1 && fIn.gloom > 0, 'inside: storm sky and a risen sea');
  ok(fOut.weatherState === 'clear' && Math.abs(fOut.seaScale - 1) < 1e-9, 'outside: fair and flat');
  ok(stormFieldAt(s.x, s.z, 0).danger > 0, 'the eye is dangerous water');
}

if (failed) { console.error(`verify-storms: ${failed} FAILED`); process.exit(1); }
console.log('verify-storms: OK — cyclones spin true, calm eye + gale eyewall, storm sky + risen sea, danger disc, deterministic');
