// verify-legends: the highlight-points table is append-only content
// (invariant 2) — a malformed row must never reach production silently.
import { LEGENDS, LEGEND_KINDS } from '../src/legends.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

ok(LEGENDS.length >= 2, 'the table has content');

const ids = new Set();
for (const l of LEGENDS) {
  ok(typeof l.id === 'string' && /^[a-z0-9-]+$/.test(l.id), `id well-formed (${l.id})`);
  ok(!ids.has(l.id), `id unique (${l.id})`);
  ids.add(l.id);
  ok(LEGEND_KINDS.includes(l.kind), `${l.id}: kind '${l.kind}' is legal`);
  ok(typeof l.name === 'string' && l.name.length >= 3, `${l.id}: has a name`);
  ok(typeof l.lat === 'number' && l.lat >= -90 && l.lat <= 90, `${l.id}: lat on Earth (${l.lat})`);
  ok(typeof l.lon === 'number' && l.lon >= -180 && l.lon <= 180, `${l.id}: lon on Earth (${l.lon})`);
  ok(typeof l.radius === 'number' && l.radius > 0 && l.radius <= 1000, `${l.id}: sane radius (${l.radius})`);
  ok(Number.isInteger(l.phase) && l.phase >= 1 && l.phase <= 5, `${l.id}: phase in the plan (${l.phase})`);
  ok(typeof l.pitch === 'string' && l.pitch.length >= 40, `${l.id}: pitch says something`);
}

// the founding pair must never fall out of the table
ok(ids.has('dragons-wales'), 'the Welsh dragons are in');
ok(ids.has('bermuda-triangle'), 'the Bermuda Triangle is in');

// sanity-pin the founding pair to their real geography (a fat-fingered edit
// that moves the dragons to the Pacific should go red)
const dragons = LEGENDS.find((l) => l.id === 'dragons-wales');
ok(Math.abs(dragons.lat - 53.07) < 1 && Math.abs(dragons.lon + 4.08) < 1, 'dragons nest in Snowdonia');
const bermuda = LEGENDS.find((l) => l.id === 'bermuda-triangle');
ok(bermuda.lat > 20 && bermuda.lat < 32 && bermuda.lon > -80 && bermuda.lon < -60, 'triangle sits off Bermuda');

if (failed) { console.error(`verify-legends: ${failed} FAILED`); process.exit(1); }
console.log(`verify-legends: OK — ${LEGENDS.length} legends, all rows well-formed, founding pair present`);
