// verify-currents: the ribbons run along their axis, the gyres flow BOTH ways
// (eastbound mid-latitude limb, westbound tropical limb), they taper off the
// axis and die beyond the width, magnitudes are sane, and it's deterministic.
import { CURRENTS, currentAt } from '../src/currents.js';
import { latLonToWorld } from '../src/earth.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };
const mag = (v) => Math.hypot(v.vx, v.vz);

// the Gulf Stream sets to the NE (eastward +x, northward -z)
{
  const p = latLonToWorld(30, -76.5);
  const c = currentAt(p.x, p.z);
  ok(mag(c) > 0.3, `the Gulf Stream runs (${mag(c).toFixed(2)} m/s)`);
  ok(c.vx > 0 && c.vz < 0, 'it sets to the NE');
}

// the North Equatorial current sets WEST — the gyre's other limb, so the ocean
// carries current both ways
{
  const p = latLonToWorld(14, -50);
  ok(currentAt(p.x, p.z).vx < 0, 'the equatorial limb sets west — the gyre runs both ways');
}

// weaker off the axis, dead beyond the width
{
  const on = latLonToWorld(30, -76.5);
  const off = latLonToWorld(30, -40); // well east of the Gulf Stream axis
  ok(mag(currentAt(off.x, off.z)) < mag(currentAt(on.x, on.z)), 'the current weakens off its axis');
}
{
  const p = latLonToWorld(-20, -120); // south Pacific, far from every seed
  ok(mag(currentAt(p.x, p.z)) < 0.05, 'far from any current, the water lies still');
}

// bounded and deterministic
{
  const p = latLonToWorld(30, -76.5);
  const a = currentAt(p.x, p.z), b = currentAt(p.x, p.z);
  ok(a.vx === b.vx && a.vz === b.vz, 'currents are deterministic');
  ok(mag(a) <= 5, 'sane magnitude');
}

ok(CURRENTS.length >= 4, 'the gyres are seeded');

// the Atlantic equatorial limb reads cleanly westward, not diluted by a stray
// far-ocean ribbon bleeding across the map
{
  const p = latLonToWorld(14, -50);
  const c = currentAt(p.x, p.z);
  ok(c.vx < -0.8 && Math.abs(c.vz) < 0.6, `the Atlantic equatorial current runs clean west (${c.vx.toFixed(2)}, ${c.vz.toFixed(2)})`);
}

if (failed) { console.error(`verify-currents: ${failed} FAILED`); process.exit(1); }
console.log('verify-currents: OK — ribbons run their axis, gyres flow both ways, taper off-axis, still beyond, deterministic');
