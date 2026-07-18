// verify-searoute: the sea router never lays a leg across land — a course
// blocked by a peninsula rounds it, a strait as narrow as Gibraltar is
// threaded, open water stays a clean direct leg, the world seam is crossed
// the short way, and the search is deterministic.
import { seaRoute, seaLeg } from '../src/searoute.js';
import { isLand, latLonToWorld, worldToLatLon, dxWrap, wrapX } from '../src/earth.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// every leg of a route, finely sampled, is honest water (the final approach
// may touch the destination's own beach — the same grace seaRoute grants)
function allSea(route, fx, fz) {
  let ax = fx, az = fz;
  for (let i = 0; i < route.length; i++) {
    const skipB = i === route.length - 1 ? 600 : 0;
    const dx = dxWrap(ax, route[i].x);
    const len = Math.hypot(dx, route[i].z - az);
    const n = Math.max(1, Math.ceil(len / 25));
    for (let s = 0; s <= n; s++) {
      const t = s / n;
      if (skipB && (1 - t) * len < skipB) continue;
      const ll = worldToLatLon(wrapX(ax + dx * t), az + (route[i].z - az) * t);
      if (isLand(ll.lat, ll.lon)) return false;
    }
    ax = route[i].x; az = route[i].z;
  }
  return true;
}

// seaLeg itself: an Atlantic leg is water, a leg across Florida is not
{
  const a = latLonToWorld(28, -60), b = latLonToWorld(32, -50);
  ok(seaLeg(a.x, a.z, b.x, b.z), 'an open-Atlantic leg is honest water');
  const g = latLonToWorld(27, -83.5), o = latLonToWorld(27, -79.5);
  ok(!seaLeg(g.x, g.z, o.x, o.z), 'a leg straight across Florida is not');
}

// ROUND THE PENINSULA — Gulf of Mexico to the Atlantic: the rhumb line runs
// straight across Florida; the route must round it by sea instead
{
  const a = latLonToWorld(27, -83.5), b = latLonToWorld(27, -79.5);
  const r = seaRoute(a.x, a.z, b.x, b.z);
  ok(r !== null, 'Gulf -> Atlantic finds a route at all');
  if (r) {
    ok(allSea(r, a.x, a.z), 'Gulf -> Atlantic: every leg is honest water');
    const minLat = Math.min(...r.map((p) => worldToLatLon(p.x, p.z).lat));
    ok(minLat < 26.2, `it rounds Florida to the south (reached ${minLat.toFixed(1)}N)`);
    const last = r[r.length - 1];
    ok(Math.abs(dxWrap(last.x, b.x)) < 1 && Math.abs(last.z - b.z) < 1, 'the last mark is the click itself');
  }
}

// THE STRAIT — Atlantic into the Mediterranean through Gibraltar (the
// narrowest water the grid must keep open)
{
  const a = latLonToWorld(36, -7.5), b = latLonToWorld(37, 3);
  const r = seaRoute(a.x, a.z, b.x, b.z);
  ok(r !== null, 'Atlantic -> Med finds a route');
  if (r) {
    ok(allSea(r, a.x, a.z), 'Atlantic -> Med: every leg is honest water');
    // some point ALONG the path passes the strait's mouth (the string-pull
    // may leave no waypoint there — the legs still thread it)
    let throughStrait = false;
    let px = a.x, pz = a.z;
    for (const p of r) {
      const dx = dxWrap(px, p.x), len = Math.hypot(dx, p.z - pz);
      const n = Math.max(1, Math.ceil(len / 25));
      for (let s = 0; s <= n; s++) {
        const ll = worldToLatLon(wrapX(px + dx * (s / n)), pz + (p.z - pz) * (s / n));
        if (Math.abs(ll.lat - 36) < 1.2 && ll.lon > -6.5 && ll.lon < -4) throughStrait = true;
      }
      px = p.x; pz = p.z;
    }
    ok(throughStrait, 'and it threads the Strait of Gibraltar');
  }
}

// OPEN WATER — no land between: the route collapses to (nearly) the direct leg
{
  const a = latLonToWorld(20, -40), b = latLonToWorld(25, -35);
  const r = seaRoute(a.x, a.z, b.x, b.z);
  ok(r !== null && r.length <= 3, `open water stays a clean course (${r ? r.length : 0} legs)`);
  if (r) {
    const last = r[r.length - 1];
    ok(Math.abs(dxWrap(last.x, b.x)) < 1 && Math.abs(last.z - b.z) < 1, 'ending exactly at the mark');
  }
}

// THE SEAM — mid-Pacific across the antimeridian goes the short way
{
  const a = latLonToWorld(10, 175), b = latLonToWorld(10, -175);
  const r = seaRoute(a.x, a.z, b.x, b.z);
  ok(r !== null, 'a course across the dateline routes');
  if (r) {
    let len = 0, ax = a.x, az = a.z;
    for (const p of r) { len += Math.hypot(dxWrap(ax, p.x), p.z - az); ax = p.x; az = p.z; }
    ok(len < 4440 * 3, `and takes the short arc (${Math.round(len)} m by the log)`);
  }
}

// DETERMINISM — the same course twice is the same route
{
  const a = latLonToWorld(27, -83.5), b = latLonToWorld(27, -79.5);
  ok(JSON.stringify(seaRoute(a.x, a.z, b.x, b.z)) === JSON.stringify(seaRoute(a.x, a.z, b.x, b.z)),
    'the sea route is deterministic');
}

if (failed) { console.error(`verify-searoute: ${failed} FAILED`); process.exit(1); }
console.log('verify-searoute: OK — no leg crosses land, Florida rounded, Gibraltar threaded, open water direct, seam crossed short, deterministic');
