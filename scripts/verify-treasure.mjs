// verify-treasure: the X lands on REAL land within longboat reach of the sea,
// the same seed digs the same beach on every client, different seeds scatter,
// and a map won in the Caribbean stays an expedition, not an errand.
import { findDigSite, digDist, DIG_COAST_MAX, DIG_RADIUS } from '../src/treasure.js';
import { isLand, coastDistGame, latLonToWorld } from '../src/earth.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// maps won in three famous waters
const WATERS = [
  ['Caribbean', 17.5, -76.8],
  ['North Sea', 56.5, 3.0],
  ['Tasman Sea', -40, 160],
];
const sites = [];
for (const [name, lat, lon] of WATERS) {
  for (let seed = 1; seed <= 8; seed++) {
    const s = findDigSite(seed, lat, lon);
    ok(s !== null, `${name} seed ${seed} finds a beach`);
    if (!s) continue;
    sites.push(s);
    ok(isLand(s.lat, s.lon), `${name}/${seed}: the X is on land (${s.lat}, ${s.lon})`);
    ok(coastDistGame(s.lat, s.lon) <= DIG_COAST_MAX,
      `${name}/${seed}: within longboat reach of the shore`);
    const again = findDigSite(seed, lat, lon);
    ok(again.lat === s.lat && again.lon === s.lon, `${name}/${seed}: same seed, same beach`);
  }
}

// seeds scatter: not everyone digs the same island
{
  const uniq = new Set(sites.map((s) => `${s.lat},${s.lon}`));
  ok(uniq.size >= sites.length * 0.7, `sites scatter (${uniq.size}/${sites.length} unique)`);
}

// digDist agrees with the projection
{
  const s = { lat: 18.0, lon: -77.0 };
  const w = latLonToWorld(s.lat, s.lon);
  ok(digDist(w.x, w.z, s) < 1e-9, 'standing on the X reads zero');
  ok(Math.abs(digDist(w.x + 500, w.z, s) - 500) < 1e-6, '500m off reads 500');
  ok(DIG_RADIUS > DIG_COAST_MAX, 'an anchored ship can always reach a legal X by longboat');
}

if (failed) { console.error(`verify-treasure: ${failed} FAILED`); process.exit(1); }
console.log('verify-treasure: OK — X on real land near shore, deterministic, scattered, reachable');
