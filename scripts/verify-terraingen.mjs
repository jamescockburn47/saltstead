// verify-terraingen: chunks are deterministic, well-shaped, and the
// deep-water skip really skips — the 99%-water planet must cost ~nothing.
// The smooth-shoreline pass adds: fine grids on waterline chunks, analytic
// unit normals, and crack-free stitching against coarse neighbours.
import {
  CHUNK, RES, RES_SHORE, buildChunkData, chunkWorthBuilding, chunkRes, colourFor,
} from '../src/terraingen.js';
import { latLonToWorld } from '../src/earth.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// a chunk on the Jamaican coast: right shape, deterministic, has dry land
const pr = latLonToWorld(17.93, -76.84); // Port Royal
const cx = Math.floor(pr.x / CHUNK), cz = Math.floor(pr.z / CHUNK);
const a = buildChunkData(cx, cz);
const b = buildChunkData(cx, cz);
const n = a.res + 1;
ok(a.res === RES || a.res === RES_SHORE, 'chunk resolution is one of the two grids');
ok(a.pos.length === n * n * 3 && a.col.length === n * n * 3 && a.nrm.length === n * n * 3,
  'vertex arrays sized to the grid');
ok(a.idx.length === a.res * a.res * 6, 'index count matches the quad grid');
ok(a.pos.every((v, i) => v === b.pos[i]), 'positions deterministic');
ok(a.col.every((v, i) => v === b.col[i]), 'colours deterministic');
ok(a.nrm.every((v, i) => v === b.nrm[i]), 'normals deterministic');
ok(a.hasDry, 'the Port Royal chunk has dry land');
ok(chunkWorthBuilding(cx, cz), 'coastal chunk is worth building');
ok(chunkRes(cx, cz) === RES_SHORE, 'the waterline chunk earns the fine grid');

// analytic normals: unit length, never pointing down
let nrmOk = true;
for (let i = 0; i < a.nrm.length; i += 3) {
  const len = Math.hypot(a.nrm[i], a.nrm[i + 1], a.nrm[i + 2]);
  if (Math.abs(len - 1) > 1e-3 || a.nrm[i + 1] <= 0) { nrmOk = false; break; }
}
ok(nrmOk, 'normals are unit-length and upward');

// world-space positions: chunk covers exactly its own square
ok(Math.abs(a.pos[0] - cx * CHUNK) < 1e-6, 'chunk starts on its grid line');
ok(Math.abs(a.pos[(n * n - 1) * 3] - (cx + 1) * CHUNK) < 1e-6, 'chunk ends on the next');

// mid-Atlantic: not worth building
const atl = latLonToWorld(30, -45);
ok(!chunkWorthBuilding(Math.floor(atl.x / CHUNK), Math.floor(atl.z / CHUNK)),
  'deep-ocean chunk skipped');

// river corridors are LAND the ship can see: a ship up a river must see
// ground bank to bank, however far from the coast
for (const [name, lat, lon] of [
  ['Amazon at Manaus', -3.1, -60.0],
  ['Amazon at Obidos', -1.9, -55.5],
]) {
  const w = latLonToWorld(lat, lon);
  const icx = Math.floor(w.x / CHUNK), icz = Math.floor(w.z / CHUNK);
  ok(chunkWorthBuilding(icx, icz), `${name}: river-corridor chunk worth building`);
  ok(buildChunkData(icx, icz).hasDry, `${name}: river-corridor chunk has dry land`);
}
// ...but the deep interior the lens can never reach is culled like the deep
// sea: the captain can no longer step ashore, so land beyond INLAND_KEEP of
// every coast and river is never built (Kansas itself keeps its river
// corridor — the Smoky Hill runs right through the old test point)
for (const [name, lat, lon] of [['Sahara', 23, 10], ['Gobi', 43, 105], ['Outback', -25, 135]]) {
  const w = latLonToWorld(lat, lon);
  ok(!chunkWorthBuilding(Math.floor(w.x / CHUNK), Math.floor(w.z / CHUNK)),
    `${name}: unseeable interior chunk skipped`);
}

// stitching: find a fine chunk with a coarse east neighbour near Port Royal
// and check the shared edge is crack-free (coarse verts match, fine midpoints
// sit on the coarse segment)
let stitched = 0;
outer:
for (let dz = -6; dz <= 6; dz++) {
  for (let dx = -6; dx <= 6; dx++) {
    const fx = cx + dx, fz = cz + dz;
    if (chunkRes(fx, fz) !== RES_SHORE || chunkRes(fx + 1, fz) !== RES) continue;
    if (!chunkWorthBuilding(fx + 1, fz)) continue;
    const fine = buildChunkData(fx, fz);
    const coarse = buildChunkData(fx + 1, fz);
    const fn = fine.res + 1, cn = coarse.res + 1;
    for (let j = 0; j < cn; j++) {
      const fy = fine.pos[((2 * j) * fn + (fn - 1)) * 3 + 1]; // fine east edge, even vert
      const cy = coarse.pos[(j * cn + 0) * 3 + 1];            // coarse west edge
      if (Math.abs(fy - cy) > 1e-5) { ok(false, 'stitched edge: coarse verts match'); break outer; }
    }
    for (let j = 1; j < fn - 1; j += 2) {
      const ym = fine.pos[(j * fn + (fn - 1)) * 3 + 1];
      const y0 = fine.pos[((j - 1) * fn + (fn - 1)) * 3 + 1];
      const y1 = fine.pos[((j + 1) * fn + (fn - 1)) * 3 + 1];
      if (Math.abs(ym - (y0 + y1) / 2) > 1e-5) { ok(false, 'stitched edge: midpoints on segment'); break outer; }
    }
    stitched = 1;
    break outer;
  }
}
ok(stitched === 1, 'found and verified a fine/coarse stitched edge near Port Royal');

// palette: monotone bands, sane RGB
let prev = null;
for (const h of [-20, -3, 1, 5, 15, 40]) {
  const c = colourFor(h);
  ok(c.length === 3 && c.every((v) => v >= 0 && v <= 1), `colour legal at h=${h}`);
  ok(prev === null || c.join() !== prev, `bands differ around h=${h}`);
  prev = c.join();
}

// the shore has CHARACTER: rock, shingle, marsh, mangrove and ice shores all
// read differently from the plain sand beach
const sand = colourFor(1, 45, 0, 0, 0).join();
ok(colourFor(1, 45, 0, 0, 0.8).join() !== sand, 'rocky coast is not sand');
ok(colourFor(1, 45, 0, 0, 0.4).join() !== sand, 'shingle coast is not sand');
ok(colourFor(1, 45, 0, 0.02, 0, 100).join() !== sand, 'flat river ground reads marsh');
ok(colourFor(1, 5, 0, 0.02, 0, 100).join() !== colourFor(1, 45, 0, 0.02, 0, 100).join(),
  'tropical river shore reads mangrove, not temperate marsh');
ok(colourFor(1, 70, 0, 0, 0).join() !== sand, 'polar shore is ice, not sand');
ok(colourFor(1, 45, 0, 0.9, 0).join() !== sand, 'steep ground at the waterline reads rock');

if (failed) { console.error(`verify-terraingen: ${failed} FAILED`); process.exit(1); }
console.log('verify-terraingen: OK — deterministic chunks, analytic normals, '
  + 'fine shoreline grid stitched crack-free, deep-water skip, palette sane');
