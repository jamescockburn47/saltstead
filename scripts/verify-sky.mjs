// verify-sky: the solar/lunar/stellar maths. Day is day, night is night,
// golden hour sits at the horizon crossings, the moon cycles, the star frame
// is real enough to navigate by, and the heavens are deterministic.
import {
  DAY_LENGTH, solarState, lunarState, moonPhase, starWheelAngle,
  STAR_CATALOGUE, raDecToEq, starField, MOON_MONTH_DAYS,
} from '../src/skymath.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

const noon = solarState(DAY_LENGTH * 0.5);
const midnight = solarState(0);
const dawn = solarState(DAY_LENGTH * 0.25);
ok(noon.dayness === 1, 'noon is fully day');
ok(midnight.dayness === 0, 'midnight is fully night');
ok(noon.sunAlt > 0.8, 'sun stands high at noon');
ok(midnight.sunAlt < -0.5, 'sun is well down at midnight');
ok(dawn.golden > 0.3, `dawn is golden (${dawn.golden.toFixed(2)})`);
ok(noon.golden === 0, 'noon is not golden');
ok(dawn.dir[0] > 0.5, 'the sun rises in the east (+x)');
ok(solarState(DAY_LENGTH * 0.75).dir[0] < -0.5, 'and sets in the west (-x)');

// unit direction, continuous across the day boundary
for (const f of [0, 0.2, 0.5, 0.9, 0.999]) {
  const s = solarState(DAY_LENGTH * f);
  ok(Math.abs(Math.hypot(...s.dir) - 1) < 1e-9, `sun dir unit at frac ${f}`);
}
const wrapA = solarState(DAY_LENGTH - 0.01), wrapB = solarState(DAY_LENGTH + 0.01);
ok(Math.abs(wrapA.sunAlt - wrapB.sunAlt) < 0.01, 'no jump across the day wrap');

// moon: full cycle over the accelerated month; full moon rises when the sun sets
ok(Math.abs(moonPhase(0)) < 1e-9, 'month starts new');
ok(Math.abs(moonPhase(DAY_LENGTH * MOON_MONTH_DAYS * 0.5) - 0.5) < 1e-9, 'mid-month is full');
{
  const t = DAY_LENGTH * (MOON_MONTH_DAYS * 0.5); // full moon, midnight
  const lun = lunarState(t + DAY_LENGTH * 0.5);   // half a day later
  ok(lun.alt < 0 || Math.abs(lun.phase - 0.5) < 0.05, 'full moon opposes the sun');
}

// star frame: Polaris rides the pole, Orion straddles the equator, the belt
// is a tight line (the catalogue cannot ship a typo'd sky)
const pol = raDecToEq(2.5303, 89.264);
ok(pol[1] > 0.999, 'Polaris on the celestial pole (+Y)');
const rigel = raDecToEq(5.2423, -8.202), betel = raDecToEq(5.9195, 7.407);
ok(rigel[1] < 0 && betel[1] > 0, 'Orion straddles the celestial equator');
const belt = [[5.5334, -0.299], [5.6036, -1.202], [5.6793, -1.943]].map((s) => raDecToEq(...s));
const sep = (a, b) => Math.acos(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]);
ok(Math.abs(sep(belt[0], belt[1]) - sep(belt[1], belt[2])) < 0.01,
  "Orion's belt is evenly spaced");
const acrux = raDecToEq(12.4433, -63.099);
ok(acrux[1] < -0.85, 'the Southern Cross lives in the deep south');
ok(STAR_CATALOGUE.length >= 25, 'catalogue has the navigation kit');

// star wheel turns once per day; the field is deterministic (invariant 6)
ok(Math.abs(starWheelAngle(DAY_LENGTH) - starWheelAngle(0)) < 1e-9, 'wheel wraps daily');
const f1 = starField(), f2 = starField();
ok(f1.length === f2.length && f1.every((s, i) =>
  s.dir[0] === f2[i].dir[0] && s.mag === f2[i].mag), 'same heavens for every client');

if (failed) { console.error(`verify-sky: ${failed} FAILED`); process.exit(1); }
console.log('verify-sky: OK — solar curves sane, moon cycles, star frame navigable, heavens deterministic');
