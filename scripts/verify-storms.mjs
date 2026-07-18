// verify-storms: cyclones spin the right way per hemisphere, a calm eye inside a
// gale eyewall, a storm sky and a risen sea within the system and fair water
// beyond, a danger disc at the heart, and the whole thing deterministic in t.
import {
  stormsAt, stormWindAt, stormFieldAt, vortexToward,
  stormBandAt, canvasRisk, BAND_GAIN, REEF_WIND, REEF_TRIM, STORM_DANGER_R,
} from '../src/storms.js';
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
  const s = stormsAt(0).reduce((a, b) => (b.intensity > a.intensity ? b : a));
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

// THE OUTER BAND (passage layer): fast water in the ring between the danger
// disc and the rim — nothing outside, nothing in the dangerous heart
{
  const s = stormsAt(0).reduce((a, b) => (b.intensity > a.intensity ? b : a));
  const far = latLonToWorld(58, -30);
  const mid = STORM_DANGER_R + (s.r - STORM_DANGER_R) * 0.5;
  ok(stormBandAt(s.x + mid, s.z, 0) > 1.05, 'the outer band carries fast water');
  ok(stormBandAt(s.x + mid, s.z, 0) <= BAND_GAIN, 'bounded by the gamble’s promise');
  ok(stormBandAt(s.x, s.z, 0) === 1, 'no free ride in the dangerous heart');
  ok(stormBandAt(far.x, far.z, 0) === 1, 'and none on a fair sea');
  ok(stormBandAt(s.x + mid, s.z, 0) === stormBandAt(s.x + mid, s.z, 0), 'deterministic');
}

// SHORTEN SAIL OR TEAR CANVAS: no risk under the reef wind or at an honest
// reef; pressing harder in more wind pays more rig
{
  ok(canvasRisk(REEF_WIND - 1, 1) === 0, 'under the reef wind the canvas holds');
  ok(canvasRisk(30, REEF_TRIM) === 0, 'an honest reef holds in any gale');
  const easy = canvasRisk(22, 0.7), hard = canvasRisk(28, 1);
  ok(easy > 0 && hard > easy, `pressing harder in more wind pays more rig (${easy.toFixed(4)} < ${hard.toFixed(4)})`);
  ok(hard < 0.02, 'but even full press is a gamble, not an execution');
}

if (failed) { console.error(`verify-storms: ${failed} FAILED`); process.exit(1); }
console.log('verify-storms: OK — cyclones spin true, calm eye + gale eyewall, danger disc, the band pays, the reef rule holds, deterministic');
