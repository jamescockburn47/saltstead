// verify-wind: the procedural wind field carries the trade-wind system — NE/SE
// trades in the tropics, SW/NW westerlies in the mid-latitudes, calm through the
// horse latitudes, windiest in the forties — hemisphere-mirrored, continuous,
// and deterministic. Yaw frame: 0 = S, +pi/2 = E, pi = N, -pi/2 = W; `from` is
// where the wind blows FROM.
import { windAt, WIND_BANDS } from '../src/wind.js';
import { latLonToWorld } from '../src/earth.js';
import { wrapAngle } from '../src/sailing.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };
const at = (lat, lon = -40) => { const p = latLonToWorld(lat, lon); return windAt(p.x, p.z); };

// trades: the tropics blow from the NE (north) and the SE (south)
{
  const n = at(15).from; // NE is between E (pi/2) and N (pi)
  ok(n > Math.PI / 2 && n < Math.PI, `NE trades at 15N (from yaw ${n.toFixed(2)})`);
  const s = at(-15).from; // SE is between S (0) and E (pi/2)
  ok(s > 0 && s < Math.PI / 2, `SE trades at 15S (from yaw ${s.toFixed(2)})`);
}

// westerlies: the mid-latitudes blow from the SW (north) and NW (south)
{
  const n = wrapAngle(at(45).from); // SW is between W (-pi/2) and S (0)
  ok(n < 0 && n > -Math.PI / 2, `SW westerlies at 45N (from yaw ${n.toFixed(2)})`);
  const s = wrapAngle(at(-45).from); // NW is between W (-pi/2) and N (-pi)
  ok(s < -Math.PI / 2 && s > -Math.PI, `NW westerlies at 45S (from yaw ${s.toFixed(2)})`);
}

// the horse latitudes calm; the forties blow hardest
ok(at(30).speed < at(15).speed && at(30).speed < at(45).speed, 'the horse latitudes are calm');
ok(at(45).speed > at(15).speed, 'the forties blow harder than the trades');

// ==================== THE MAGNITUDES ARE REAL m/s ====================
// THE FAULT THIS SECTION EXISTS TO CATCH (2026-07-26). Every ordering clause
// above passed on a field whose GLOBAL MAXIMUM was 9.19 m/s and which read under
// 3 m/s over a third of the sailable world (34.4% of lat -70..70, measured).
// Ordering is scale-free, so the whole
// table could be — and was — sized like a light breeze everywhere without a
// single check objecting; weather.js's 10 m/s floor then sat above the field's
// own ceiling and erased it. Ordering alone is not enough: the SCALE has to be
// asserted too, or the next quiet retune reintroduces the same bug.
//
// The numbers are surface-wind climatology. Deliberately stated as ranges, wide
// enough to retune inside and narrow enough that a light-breeze table or a
// permanent-hurricane table both fail.
{
  const band = (lat) => at(lat).speed;
  ok(band(16) > 7 && band(16) < 11,
    `the trades are trade winds: ${band(16).toFixed(2)} m/s at 16 deg (real 6-9, allow 7-11)`);
  ok(band(45) > 10 && band(45) < 16,
    `the roaring forties roar: ${band(45).toFixed(2)} m/s at 45 (real 10-14, allow 10-16)`);
  ok(band(-54) > 12 && band(-54) < 19,
    `the screaming fifties are the windiest water on earth: ${band(-54).toFixed(2)} m/s `
    + 'at 54S (real 13-16, allow 12-19)');
  ok(band(31) < 4 && band(0) < 6,
    `and the calm belts stay genuinely light: ${band(31).toFixed(2)} m/s in the horse `
    + `latitudes, ${band(0).toFixed(2)} in the doldrums — the geography IS the interest`);
  // the field's own dynamic range, which is what makes latitude legible
  let mx = 0, mxLat = 0;
  for (let l = -90; l <= 90; l += 0.25) { const s = at(l).speed; if (s > mx) { mx = s; mxLat = l; } }
  ok(mx > 12 && mx < 20,
    `the field's global maximum is a real gale-belt wind — ${mx.toFixed(2)} m/s at lat ${mxLat} `
    + '(it was 9.19, BELOW weather.js\'s own wind floor, which is how the bug hid)');
  ok(mx / Math.max(band(31), band(0)) > 3,
    `and the field spans ${(mx / Math.max(band(31), band(0))).toFixed(1)}x from calm belt to `
    + 'gale belt (needs 3x)');
}

// no calm belt may sit where a famous wind belt belongs — the old table's
// westerly-to-polar zero-crossing landed at 58 deg and flatly becalmed the
// screaming fifties (measured 2.12 m/s at 55, against 14.5 now)
// (43-58 deg is the belt where the westerlies are unambiguously the dominant
// system; 36-42 is the honest ramp out of the subtropical highs and is meant to
// be lighter.) Measured worst: 10.97 m/s at 43.
{
  let worst = Infinity, worstLat = 0;
  for (let l = 43; l <= 58; l += 0.5) {
    for (const s of [at(l).speed, at(-l).speed]) if (s < worst) { worst = s; worstLat = l; }
  }
  ok(worst > 9,
    `no calm belt hides inside the westerlies — 43-58 deg, both hemispheres, weakest `
    + `${worst.toFixed(2)} m/s at lat ${worstLat} (floor 9, measured 10.97; the old table's `
    + 'westerly-to-polar zero-crossing landed at 58 and read 2.12 m/s at 55)');
}

// deterministic
{
  const a = at(22), b = at(22);
  ok(a.from === b.from && a.speed === b.speed, 'the wind is deterministic');
}

// continuous: no band-edge jumps. Stated as a GRADIENT per degree of latitude,
// not as a step per sample, so the clause means the same thing whatever the
// sample spacing — and swept pole to pole, because the steepest transitions in
// the table are the direction flips and one of them lives at 74.35 deg, outside
// the old -60..60 sweep. Measured worst: 1.05 m/s per degree, on the 66->80 limb.
// SPEED ONLY: `from` flips through 180 deg AT a zero-crossing (32.54 and 74.35
// deg), which is inherent to interpolating a vector through the origin and is
// why those crossings are placed where nothing beats through. See wind.js.
{
  const STEP = 0.25, LIM = 1.3;
  let worst = 0, worstLat = 0;
  for (let l = -90; l < 90; l += STEP) {
    const g = Math.abs(at(l + STEP).speed - at(l).speed) / STEP;
    if (g > worst) { worst = g; worstLat = l; }
  }
  ok(worst <= LIM,
    `wind speed is continuous across latitude — steepest ${worst.toFixed(3)} m/s per degree `
    + `near lat ${worstLat} (limit ${LIM}, measured 1.05: the westerly-to-polar flip)`);
  // and the table itself must not carry a discontinuity the sweep could step over
  for (let i = 1; i < WIND_BANDS.length; i++) {
    ok(WIND_BANDS[i].lat > WIND_BANDS[i - 1].lat,
      `the band table is ordered in latitude (${WIND_BANDS[i - 1].lat} -> ${WIND_BANDS[i].lat})`);
  }
  ok(WIND_BANDS[0].lat === 0 && WIND_BANDS[WIND_BANDS.length - 1].lat === 90,
    'and it spans equator to pole, so no latitude falls off the end of it');
  ok(WIND_BANDS[0].tz === 0,
    'the equatorial band has no north-south limb: the southern mirror flips tz, and a '
    + 'non-zero tz at the equator would put a discontinuity straight through the ITCZ');
}

if (failed) { console.error(`verify-wind: ${failed} FAILED`); process.exit(1); }
console.log('verify-wind: OK — trades, westerlies through the whole 43-58 belt, calm horse',
  'latitudes and doldrums, REAL m/s magnitudes (max',
  `${(() => { let m = 0; for (let l = -90; l <= 90; l += 0.25) m = Math.max(m, at(l).speed); return m.toFixed(1); })()}`,
  'm/s), hemisphere-mirrored, continuous in gradient, deterministic');
