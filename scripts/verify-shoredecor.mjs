// verify-shoredecor: the shore fringe is deterministic, rooted on dry land
// beside real water, capped, and dressed to its LATITUDE — palms never grow
// on a Norwegian fjord, conifers never on a Caribbean cay.
import {
  DECOR_CELL, DECOR_MAX, DECOR_KINDS, decorForCell, speciesFor, hutTint,
  buildingKind,
} from '../src/shoredecor.js';
import { buildPlant, FLORA_KINDS, FLORA_MAX_VERTS } from '../src/flora.js';
import {
  latLonToWorld, worldToLatLon, elevation, coastDistGame, riverDistGame,
} from '../src/earth.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

const cellAt = (lat, lon) => {
  const w = latLonToWorld(lat, lon);
  return { cx: Math.floor(w.x / DECOR_CELL), cz: Math.floor(w.z / DECOR_CELL) };
};

// gather decoration over a block of cells around a coast point
const gather = (lat, lon, r = 3) => {
  const { cx, cz } = cellAt(lat, lon);
  const all = [];
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) all.push(...decorForCell(cx + dx, cz + dz));
  }
  return all;
};

// determinism + shape on a Jamaican coast cell
const pr = cellAt(17.93, -76.84);
const a = decorForCell(pr.cx, pr.cz);
const b = decorForCell(pr.cx, pr.cz);
ok(JSON.stringify(a) === JSON.stringify(b), 'cell decoration deterministic');
ok(a.length <= DECOR_MAX, 'cell respects the instance cap');
for (const it of a) {
  ok(DECOR_KINDS.includes(it.kind), `kind legal (${it.kind})`);
  const ll = worldToLatLon(it.x, it.z);
  ok(elevation(ll.lat, ll.lon) > 0.5, 'instance stands on dry land');
  ok(Math.min(coastDistGame(ll.lat, ll.lon), riverDistGame(ll.lat, ll.lon)) < 200,
    'instance hugs a waterline');
  ok(it.s > 0.4 && it.s < 2 && it.tint.length === 3, 'scale and tint sane');
}

// the open sea grows nothing
const atl = cellAt(30, -45);
ok(decorForCell(atl.cx, atl.cz).length === 0, 'mid-Atlantic cell is bare');

// deep inland (far from coast AND river) grows nothing — the fringe is a
// fringe, not a forest simulation
const kans = cellAt(38.7, -99.5);
ok(decorForCell(kans.cx, kans.cz).length === 0, 'dry interior cell is bare');

// LATITUDE: the tropics carry palms and no conifers; the north carries
// conifers and no palms; the polar rim is bare
const carib = gather(17.93, -76.84);
ok(carib.length > 0, 'the Jamaican coast is decorated at all');
ok(carib.some((i) => i.kind === 'palm'), 'palms on the Caribbean shore');
ok(!carib.some((i) => i.kind === 'conifer'), 'no conifers on the Caribbean shore');
const norway = gather(61.1, 5.0);
ok(norway.length > 0, 'the Norwegian coast is decorated at all');
ok(norway.some((i) => i.kind === 'conifer'), 'conifers on the Norwegian shore');
ok(!norway.some((i) => i.kind === 'palm'), 'no palms on the Norwegian shore');
const svalbard = gather(78.2, 15.6, 2);
ok(!svalbard.some((i) => i.kind !== 'hut' && i.kind !== 'scrub'),
  'nothing but scrub past the polar rim');

// the species table itself: hard latitude walls hold for any dice, and the
// zone SEAMS blend — mid-boundary latitudes grow BOTH neighbours' species
for (let roll = 0.05; roll < 1; roll += 0.1) {
  ok(speciesFor(64, 5, 4, 30, roll) !== 'palm', 'no palm at 64N');
  ok(speciesFor(10, -60, 4, 30, roll) !== 'conifer', 'no conifer at 10N');
  ok(speciesFor(75, 15, 4, 30, roll) === null || speciesFor(75, 15, 4, 30, roll) === 'scrub',
    'polar rim: scrub at most');
}
{
  const at = (lat) => {
    const s = new Set();
    for (let roll = 0.005; roll < 1; roll += 0.01) s.add(speciesFor(lat, 5, 4, 100, roll));
    return s;
  };
  const seam35 = at(35); // oak country, conifers arriving, broadleaf leaving
  ok(seam35.has('conifer') && seam35.has('oak'),
    'the 35-deg seam grows both conifer and oak');
  const seam30 = at(30); // the broadleaf/oak handover
  ok(seam30.has('broadleaf') && seam30.has('oak'),
    'the 30-deg seam grows both broadleaf and oak');
  const seam25 = at(25); // palms not yet gone, broadleaf still strong
  ok(seam25.has('palm') && seam25.has('broadleaf'),
    'the 25-deg seam grows both palm and broadleaf');
  const england = at(51); // the English coast is oak country
  ok(england.has('oak'), 'England grows oaks');
  const seam66 = at(66); // the polar fade thins conifers, never a wall
  ok(seam66.has('conifer') || seam66.has('scrub'), 'the 66-deg seam still grows');
}
// the building seam blends too: at 24 deg the dice can build either way
{
  const kinds = new Set();
  for (let roll = 0.05; roll < 1; roll += 0.1) kinds.add(buildingKind(24, false, roll));
  ok(kinds.has('hut') && kinds.has('cottage'), 'the 24-deg hamlet builds either way');
}

// flora: every species grows, deterministically, within the vertex budget,
// flexes bounded, normals unit — the grown-tree contract the layer builds on
for (const kind of FLORA_KINDS) {
  const a2 = buildPlant(kind, 12345);
  const b2 = buildPlant(kind, 12345);
  const c2 = buildPlant(kind, 54321);
  ok(a2 && a2.p.length > 0 && a2.p.length % 9 === 0, `${kind}: builds triangles`);
  ok(a2.p.length / 3 <= FLORA_MAX_VERTS, `${kind}: within the vertex budget (${a2.p.length / 3})`);
  ok(a2.p.every((v, i) => v === b2.p[i]) && a2.w.every((v, i) => v === b2.w[i]),
    `${kind}: deterministic per seed`);
  ok(c2.p.length !== a2.p.length || !a2.p.every((v, i) => v === c2.p[i]),
    `${kind}: different seeds grow different plants`);
  ok(a2.w.every((v) => v >= 0 && v <= 1.01), `${kind}: flex weights bounded`);
  let nrmOk2 = true, yMin = 1e9, yMax = -1e9;
  for (let i = 0; i < a2.n.length; i += 3) {
    const l = Math.hypot(a2.n[i], a2.n[i + 1], a2.n[i + 2]);
    if (Math.abs(l - 1) > 1e-3) { nrmOk2 = false; break; }
  }
  for (let i = 1; i < a2.p.length; i += 3) { yMin = Math.min(yMin, a2.p[i]); yMax = Math.max(yMax, a2.p[i]); }
  ok(nrmOk2, `${kind}: normals unit length`);
  ok(yMax > 0.3 && yMin > -1.5 && yMax < 14, `${kind}: stands up from its root (${yMin.toFixed(1)}..${yMax.toFixed(1)})`);
}
ok(buildPlant('nonsense', 1) === null, 'unknown kind refuses politely');

// hamlets: somewhere along a well-harboured coast the huts stand, near the
// water, styled to their climate — keep the BIGGEST hamlet the sweep finds
let huts = [];
for (let dz = -8; dz <= 8; dz++) {
  for (let dx = -8; dx <= 8; dx++) {
    const found = decorForCell(pr.cx + dx, pr.cz + dz).filter((i) => i.kind === 'hut');
    if (found.length > huts.length) huts = found;
  }
}
ok(huts.length >= 3, `a hamlet stands somewhere on the Caribbean coast (${huts.length} huts)`);
for (const h of huts) {
  const ll = worldToLatLon(h.x, h.z);
  ok(Math.min(coastDistGame(ll.lat, ll.lon), riverDistGame(ll.lat, ll.lon)) < 160,
    'huts keep to the water\'s edge');
}
ok(hutTint(60, false)[0] < hutTint(10, false)[0], 'northern timber darker than tropical thatch');

// the 1700s built to their climate: huts in the hot belts, cottages north
ok(buildingKind(10, false) === 'hut' && buildingKind(20, true) === 'hut',
  'hot belts build huts');
ok(buildingKind(45, false) === 'cottage' && buildingKind(60, false) === 'cottage',
  'temperate and northern coasts build cottages');
const SETTLEMENT = ['hut', 'cottage', 'church'];

// THE AMAZON IS DEEP JUNGLE: dense canopy on the banks, and NO settlements —
// nobody built on that bank in the 1700s (El Dorado's country)
const amazon = gather(-3.155, -60.0, 3);
ok(amazon.length > 120, `the Amazon banks carry a dense jungle (${amazon.length} instances)`);
const canopy = amazon.filter((i) => i.kind === 'broadleaf' || i.kind === 'palm').length;
ok(canopy > amazon.length * 0.6, 'the jungle is closed canopy, not scrub');
ok(!amazon.some((i) => SETTLEMENT.includes(i.kind)), 'no settlements on the Amazon');
ok(!amazon.some((i) => i.kind === 'conifer'), 'no conifers in the jungle');

// temperate river country DOES settle — hamlets of cottages somewhere along
// the European coasts, and any church stands among cottages, never alone
let cottages = [];
for (let dz = -8; dz <= 8 && !cottages.length; dz++) {
  for (let dx = -8; dx <= 8 && !cottages.length; dx++) {
    const cell = decorForCell(cellAt(50.25, -3.78).cx + dx, cellAt(50.25, -3.78).cz + dz);
    if (cell.some((i) => i.kind === 'cottage')) cottages = cell;
  }
}
ok(cottages.length > 0, 'a cottage hamlet stands somewhere on the Devon coast');
{
  // sweep a broad band of temperate coast: every church keeps cottage company
  let churches = 0, lonely = 0;
  for (let dz = -10; dz <= 10; dz++) {
    for (let dx = -10; dx <= 10; dx++) {
      const cell = decorForCell(cellAt(50.25, -3.78).cx + dx, cellAt(50.25, -3.78).cz + dz);
      const nCh = cell.filter((i) => i.kind === 'church').length;
      if (nCh) {
        churches += nCh;
        if (!cell.some((i) => i.kind === 'cottage')) lonely++;
      }
    }
  }
  ok(lonely === 0, `no church stands without its village (${churches} churches swept)`);
}

if (failed) { console.error(`verify-shoredecor: ${failed} FAILED`); process.exit(1); }
console.log('verify-shoredecor: OK — deterministic shore fringe, latitude-true species, '
  + 'hamlets on the waterline, caps hold');
