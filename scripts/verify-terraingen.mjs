// verify-terraingen: chunks are deterministic, well-shaped, and the
// deep-water skip really skips — the 99%-water planet must cost ~nothing.
import { CHUNK, RES, buildChunkData, chunkWorthBuilding, colourFor } from '../src/terraingen.js';
import { latLonToWorld } from '../src/earth.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// a chunk on the Jamaican coast: right shape, deterministic, has dry land
const pr = latLonToWorld(17.93, -76.84); // Port Royal
const cx = Math.floor(pr.x / CHUNK), cz = Math.floor(pr.z / CHUNK);
const a = buildChunkData(cx, cz);
const b = buildChunkData(cx, cz);
const n = RES + 1;
ok(a.pos.length === n * n * 3 && a.col.length === n * n * 3, 'vertex arrays sized to the grid');
ok(a.idx.length === RES * RES * 6, 'index count matches the quad grid');
ok(a.pos.every((v, i) => v === b.pos[i]), 'positions deterministic');
ok(a.col.every((v, i) => v === b.col[i]), 'colours deterministic');
ok(a.hasDry, 'the Port Royal chunk has dry land');
ok(chunkWorthBuilding(cx, cz), 'coastal chunk is worth building');

// world-space positions: chunk covers exactly its own square
ok(Math.abs(a.pos[0] - cx * CHUNK) < 1e-6, 'chunk starts on its grid line');
ok(Math.abs(a.pos[(n * n - 1) * 3] - (cx + 1) * CHUNK) < 1e-6, 'chunk ends on the next');

// mid-Atlantic: not worth building
const atl = latLonToWorld(30, -45);
ok(!chunkWorthBuilding(Math.floor(atl.x / CHUNK), Math.floor(atl.z / CHUNK)),
  'deep-ocean chunk skipped');

// inland is LAND, not sea: a ship up a river must see ground, not ocean
// plane, however far from the coast (the deep-water skip is for water only)
for (const [name, lat, lon] of [
  ['Amazon at Manaus', -3.1, -60.0],
  ['Amazon at Obidos', -1.9, -55.5],
  ['Kansas interior', 38.5, -98.4],
]) {
  const w = latLonToWorld(lat, lon);
  const icx = Math.floor(w.x / CHUNK), icz = Math.floor(w.z / CHUNK);
  ok(chunkWorthBuilding(icx, icz), `${name}: inland land chunk worth building`);
  ok(buildChunkData(icx, icz).hasDry, `${name}: inland chunk has dry land`);
}

// palette: monotone bands, sane RGB
let prev = null;
for (const h of [-20, -3, 1, 5, 15, 40]) {
  const c = colourFor(h);
  ok(c.length === 3 && c.every((v) => v >= 0 && v <= 1), `colour legal at h=${h}`);
  ok(prev === null || c.join() !== prev, `bands differ around h=${h}`);
  prev = c.join();
}

if (failed) { console.error(`verify-terraingen: ${failed} FAILED`); process.exit(1); }
console.log('verify-terraingen: OK — deterministic chunks, deep-water skip, palette sane');
