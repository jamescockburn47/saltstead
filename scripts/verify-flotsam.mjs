// verify-flotsam: the sea's wreckage is deterministic per cell + epoch, at
// honest densities, drifts but never strands on-stage, and the bottles and
// rafts keep their laws — maps for the mapless, rumours of unwon legends,
// souls with made-up minds.
import {
  flotsamNear, crateValue, bottleLead, raftSouls,
  F_CELL, F_EPOCH, F_LIFE, HOOK_R, BOTTLE_R, RAFT_R,
} from '../src/flotsam.js';
import { isLand, worldToLatLon, latLonToWorld } from '../src/earth.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// deterministic, and everything returned is truly near and truly afloat
{
  const open = latLonToWorld(30, -40); // mid-Atlantic
  const a = flotsamNear(500, open.x, open.z);
  const b = flotsamNear(500, open.x, open.z);
  ok(JSON.stringify(a) === JSON.stringify(b), 'the same waters carry the same wreckage');
  for (const o of a) {
    ok(Math.hypot(o.x - open.x, o.z - open.z) <= 2400, `${o.kind} is genuinely near`);
    const ll = worldToLatLon(o.x, o.z);
    ok(!isLand(ll.lat, ll.lon), `${o.kind} floats`);
    ok(['crate', 'bottle', 'raft'].includes(o.kind), 'a known kind');
  }
}

// density: sample many epochs of one patch — crates common, bottles scarce,
// rafts rare, most water empty
{
  const open = latLonToWorld(30, -40);
  const seen = { crate: 0, bottle: 0, raft: 0 };
  let epochs = 0;
  for (let e = 0; e < 400; e++) {
    epochs++;
    for (const o of flotsamNear(e * F_EPOCH + 60, open.x, open.z)) seen[o.kind]++;
  }
  ok(seen.crate > seen.bottle && seen.bottle > seen.raft,
    `crates > bottles > rafts (${seen.crate}/${seen.bottle}/${seen.raft})`);
  ok(seen.raft > 0, 'but a raft does come, given long enough');
  ok(seen.crate < epochs * 9, 'the sea is not a warehouse');
}

// life: a piece rides its window and the sea takes it
{
  const open = latLonToWorld(30, -40);
  let found = null, tAt = 0;
  for (let e = 0; e < 60 && !found; e++) {
    const t = e * F_EPOCH + 30;
    const list = flotsamNear(t, open.x, open.z);
    if (list.length) { found = list[0]; tAt = t; }
  }
  ok(found !== null, 'the patch eventually carries something');
  if (found) {
    const later = flotsamNear(tAt + F_LIFE + F_EPOCH, open.x, open.z);
    ok(!later.some((o) => o.id === found.id), 'the sea takes it after its window');
  }
}

// crates: bounded purses
for (let s = 1; s <= 30; s++) {
  const v = crateValue(s);
  ok(v >= 8 && v <= 30, `a crate is a crate's worth (${v})`);
}

// bottles: maps for the mapless, rumours of the unwon, purses when the sea
// is out of secrets
{
  let maps = 0;
  for (let s = 1; s <= 40; s++) if (bottleLead(s, false, []).kind === 'map') maps++;
  ok(maps > 15 && maps < 35, `the mapless mostly draw maps (${maps}/40)`);
  const legends = [{ name: 'the Kraken’s deep', dir: 'north' }];
  for (let s = 1; s <= 40; s++) {
    const l = bottleLead(s, true, legends);
    ok(l.kind === 'rumour' && l.legend.name, 'with a map aboard, the bottle talks legends');
  }
  for (let s = 1; s <= 40; s++) {
    const l = bottleLead(s, true, []);
    ok(l.kind === 'purse' && l.gold >= 15 && l.gold <= 35, 'out of secrets, a small purse');
  }
  ok(bottleLead(7, false, []).kind === bottleLead(7, false, []).kind, 'deterministic');
}

// rafts: one or two souls, minds made up, some of each given enough rafts
{
  let joiners = 0, grateful = 0;
  for (let s = 1; s <= 40; s++) {
    const souls = raftSouls(s);
    ok(souls.length >= 1 && souls.length <= 2, `a raft holds what a raft holds (${souls.length})`);
    for (const soul of souls) (soul.join ? joiners++ : grateful++);
  }
  ok(joiners > 5 && grateful > 5, `the sea sends both kinds (${joiners} join, ${grateful} thank)`);
}

ok(HOOK_R < BOTTLE_R + 10 && RAFT_R > BOTTLE_R, 'the reaches make sense at the rail');
ok(F_LIFE > F_EPOCH, 'generations overlap — the sea is never swept clean at once');

if (failed) { console.error(`verify-flotsam: ${failed} FAILED`); process.exit(1); }
console.log('verify-flotsam: OK — deterministic wreckage, honest densities, bottles and rafts keep their laws');
