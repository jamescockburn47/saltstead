// verify-wind: the procedural wind field carries the trade-wind system — NE/SE
// trades in the tropics, SW/NW westerlies in the mid-latitudes, calm through the
// horse latitudes, windiest in the forties — hemisphere-mirrored, continuous,
// and deterministic. Yaw frame: 0 = S, +pi/2 = E, pi = N, -pi/2 = W; `from` is
// where the wind blows FROM.
import { windAt } from '../src/wind.js';
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

// deterministic
{
  const a = at(22), b = at(22);
  ok(a.from === b.from && a.speed === b.speed, 'the wind is deterministic');
}

// continuous: speed steps smoothly with latitude (no band-edge jumps)
{
  let smooth = true, prev = at(-60).speed;
  for (let l = -60; l <= 60; l += 1) { const s = at(l).speed; if (Math.abs(s - prev) > 1.5) smooth = false; prev = s; }
  ok(smooth, 'wind speed is continuous across latitude');
}

if (failed) { console.error(`verify-wind: ${failed} FAILED`); process.exit(1); }
console.log('verify-wind: OK — trades, westerlies, calm horse latitudes, hemisphere-mirrored, continuous, deterministic');
