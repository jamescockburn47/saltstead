// verify-light: the light-dynamics drives. Eye adaptation eases the right
// way, the glitter blade follows the sun by day and hands to the moon by
// night, a new moon leaves the sea dark, and every azimuth is unit length.
import { EXPOSURE_BASE, exposureTarget, glitterSource, moonBrightness } from '../src/lightrig.js';
import { solarState, lunarState, moonPhase, DAY_LENGTH, MOON_MONTH_DAYS } from '../src/skymath.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// exposure: brighter scene -> lower exposure; bounded around the base
ok(exposureTarget(1) < exposureTarget(0), 'night runs more exposure than noon');
ok(Math.abs(exposureTarget(1) - 1.15) < 1e-9 && Math.abs(exposureTarget(0) - 1.32) < 1e-9,
  'the Moorstead range: midday 1.15 -> night 1.32');
ok(EXPOSURE_BASE > exposureTarget(1) && EXPOSURE_BASE < exposureTarget(0),
  'base exposure sits inside the range');

// moon brightness: floored at new, full at full
ok(Math.abs(moonBrightness(0) - 0.15) < 1e-9, 'new moon floor');
ok(Math.abs(moonBrightness(0.5) - 1) < 1e-9, 'full moon peak');

// daytime: the blade follows the sun's azimuth
{
  const sol = solarState(DAY_LENGTH * 0.35); // mid-morning
  const g = glitterSource(sol, lunarState(DAY_LENGTH * 0.35), 1);
  ok(g.amp > 0.5, `day glitter is on (${g.amp.toFixed(2)})`);
  ok(Math.abs(Math.hypot(g.ax, g.az) - 1) < 1e-9, 'azimuth is unit length');
  const sunAz = [sol.dir[0], sol.dir[2]];
  const dot = (g.ax * sunAz[0] + g.az * sunAz[1]) / Math.hypot(...sunAz);
  ok(dot > 0.999, 'blade points at the sun');
}

// a low sun narrows the blade more than a high one
{
  const noon = glitterSource(solarState(DAY_LENGTH * 0.5), lunarState(0), 1);
  const dusk = glitterSource(solarState(DAY_LENGTH * 0.72), lunarState(0), 1);
  ok(dusk.low > noon.low + 0.3, `sunset blade is narrower (low ${dusk.low.toFixed(2)} vs ${noon.low.toFixed(2)})`);
}

// night: full moon glitters (dimmer than day), new moon leaves the sea dark
{
  const tFull = DAY_LENGTH * MOON_MONTH_DAYS * 0.5; // full moon at midnight
  const sol = solarState(tFull);
  const lun = lunarState(tFull);
  ok(sol.dayness === 0, 'test premise: it is midnight');
  const g = glitterSource(sol, lun, moonBrightness(moonPhase(tFull)));
  if (lun.alt > 0.05) {
    ok(g.amp > 0.2 && g.amp < 0.5, `moonglade on the water (${g.amp.toFixed(2)})`);
    ok(Math.abs(Math.hypot(g.ax, g.az) - 1) < 1e-9, 'moon azimuth unit');
  }
  const dark = glitterSource(solarState(0), lunarState(0), moonBrightness(0));
  // t=0: new moon rides WITH the sun — both are down at midnight
  ok(dark.amp === 0, 'new-moon midnight sea is dark');
}

if (failed) { console.error(`verify-light: ${failed} FAILED`); process.exit(1); }
console.log('verify-light: OK — exposure eases 1.15->1.32, blade tracks sun, moonglade by phase, dark at new moon');
