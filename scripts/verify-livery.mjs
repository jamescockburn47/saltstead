// verify-livery: the two sides read DIFFERENT at a glance — dark hull vs
// blue-black-and-buff, tanned canvas vs admiralty white — and each flag is
// honestly its own cloth: skull on black, red cross on white.
import { LIVERIES, liveryOf, flagPixels, FLAG_W, FLAG_H } from '../src/livery.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// palettes: distinct, and each in its design register
{
  const p = LIVERIES.pirate, n = LIVERIES.navy;
  ok(p.hullBase.join() !== n.hullBase.join(), 'the hulls wear different paint');
  ok(p.sails !== n.sails && p.stripe !== n.stripe && p.flag !== n.flag,
    'sails, bands and flags all differ');
  const lum = (c) => ((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.6 + (c & 255) * 0.1;
  ok(lum(p.sails) < lum(n.sails) - 60,
    `tanned pirate canvas reads dark against admiralty white (${Math.round(lum(p.sails))} vs ${Math.round(lum(n.sails))})`);
  ok(p.hullBase.every((v) => v < 60), 'the pirate hull is tarred near-black');
  ok(n.hullBase[2] > n.hullBase[0], 'the navy hull leans blue');
  ok(liveryOf('pirate') === p && liveryOf('trader') === null,
    'liveries answer by id; honest trade wears plain wood');
}

// flags: right size, opaque, and each one its own cloth
{
  for (const kind of ['black', 'ensign']) {
    const f = flagPixels(kind);
    ok(f.w === FLAG_W && f.h === FLAG_H && f.data.length === FLAG_W * FLAG_H * 4,
      `${kind}: a full field of pixels`);
    let opaque = true;
    for (let i = 3; i < f.data.length; i += 4) if (f.data[i] !== 255) opaque = false;
    ok(opaque, `${kind}: no ghost pixels`);
  }
  const black = flagPixels('black'), ens = flagPixels('ensign');
  const count = (f, test) => {
    let n = 0;
    for (let i = 0; i < f.data.length; i += 4) if (test(f.data[i], f.data[i + 1], f.data[i + 2])) n++;
    return n;
  };
  const dark = (r, g, b) => r < 40 && g < 40 && b < 40;
  const white = (r, g, b) => r > 200 && g > 200 && b > 200;
  const red = (r, g, b) => r > 150 && g < 80 && b < 80;
  const blue = (r, g, b) => b > 80 && r < 60;
  ok(count(black, dark) > FLAG_W * FLAG_H * 0.6, 'the black flag is mostly black');
  ok(count(black, white) >= 8, `and carries the skull and bones (${count(black, white)} white px)`);
  ok(count(ens, red) >= FLAG_W + FLAG_H, 'the ensign carries the red cross');
  ok(count(ens, blue) >= 12, 'and the blue canton');
  ok(count(ens, dark) === 0, 'no black on the ensign');
}

if (failed) { console.error(`verify-livery: ${failed} FAILED`); process.exit(1); }
console.log('verify-livery: OK — two hulls, two canvases, two honest flags');
