// verify-wood: the procedural plank pixels — deterministic, plank-banded
// (seams darker than plank faces), tonally varied between planks, and
// different seeds give different wood.
import { woodPixels, stripeMean, SEAM_DARK } from '../src/woodgrain.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

const opts = { w: 128, h: 64, nPlanks: 8, seed: 7 };
const a = woodPixels(opts);
const b2 = woodPixels(opts);

// determinism (invariant 6): byte-identical across calls
ok(a.data.length === 128 * 64 * 4, `RGBA sizing (${a.data.length})`);
ok(a.data.every((v, i) => v === b2.data[i]), 'same seed, same bytes, every client');

// alpha stays opaque
{
  let opaque = true;
  for (let i = 3; i < a.data.length; i += 4) if (a.data[i] !== 255) { opaque = false; break; }
  ok(opaque, 'alpha channel fully opaque');
}

// plank structure: seam rows darker than the plank hearts
{
  const plankH = 64 / 8;
  let seams = 0, hearts = 0;
  for (let p = 0; p < 8; p++) {
    seams += stripeMean(a, p * plankH, p * plankH + 1);
    hearts += stripeMean(a, p * plankH + 3, p * plankH + 5);
  }
  ok(seams / hearts < SEAM_DARK + 0.15,
    `seams read dark (seam/heart ${(seams / hearts).toFixed(2)})`);
}

// planks differ from one another (per-plank tone spread is alive)
{
  const plankH = 64 / 8;
  const tones = [];
  for (let p = 0; p < 8; p++) tones.push(stripeMean(a, p * plankH + 3, p * plankH + 5));
  const spread = Math.max(...tones) - Math.min(...tones);
  ok(spread > 4, `plank tones vary (spread ${spread.toFixed(1)})`);
}

// a different seed is a different tree
{
  const c = woodPixels({ ...opts, seed: 8 });
  let diff = 0;
  for (let i = 0; i < a.data.length; i += 4) if (a.data[i] !== c.data[i]) diff++;
  ok(diff > a.data.length / 4 * 0.3, `seeds decorrelate (${diff} px differ)`);
}

if (failed) { console.error(`verify-wood: ${failed} FAILED`); process.exit(1); }
console.log('verify-wood: OK — deterministic planks, dark seams, live tone spread, seeds decorrelate');
