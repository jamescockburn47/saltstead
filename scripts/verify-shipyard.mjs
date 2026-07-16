// verify-shipyard: the ladder climbs honestly — every rung costs more, hits
// harder, berths more and draws deeper than the last; the briefing doctrine
// exists for every hull; and the yard's ledger never sells what you can't
// pay for.
import { HULLS, hullById, nextHull, prevHull, canBuyHull, buyHull } from '../src/shipyard.js';
import { beaches } from '../src/shipphysics.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// the ladder's shape
ok(HULLS.length >= 2, `at least two rungs (${HULLS.length})`);
ok(HULLS[0].id === 'sloop' && HULLS[0].price === 0, 'the sloop is the free first rung');
for (let i = 1; i < HULLS.length; i++) {
  const a = HULLS[i - 1], b = HULLS[i];
  ok(b.price > a.price, `${b.id} costs more than ${a.id}`);
  ok(b.guns >= a.guns, `${b.id} throws at least ${a.id}'s broadside`);
  ok(b.berths > a.berths, `${b.id} berths more hands`);
  ok(b.spec.maxSpeed > a.spec.maxSpeed, `${b.id} is faster in a straight line`);
  ok(b.spec.turnRate < a.spec.turnRate, `${b.id} pays for it in the turn`);
  ok(b.spec.draft > a.spec.draft, `${b.id} draws deeper`);
}

// the design thesis in the data: the first rung beaches, the ladder loses it
ok(beaches(HULLS[0].spec), 'the sloop beaches — the shallows are her bolt-hole');
ok(!beaches(HULLS[HULLS.length - 1].spec), 'the top rung anchors off — big is not always best');

// every hull briefs its captain
for (const h of HULLS) {
  ok(Array.isArray(h.briefing) && h.briefing.length >= 3,
    `${h.id} has a real briefing (${h.briefing?.length || 0} points)`);
  ok(h.briefing.every((p) => typeof p === 'string' && p.length > 40),
    `${h.id}'s briefing points are sentences, not stubs`);
  ok(typeof h.pitch === 'string' && h.pitch.length > 20, `${h.id} has a pitch`);
  ok(h.spec && Number.isFinite(h.spec.maxSpeed), `${h.id} carries a physics spec`);
}
// the sloop's briefing teaches the early doctrine by name
const sloopText = HULLS[0].briefing.join(' ').toLowerCase();
for (const word of ['run', 'treasure', 'corvette', 'shallow', 'repair']) {
  ok(sloopText.includes(word), `the sloop briefing speaks of "${word}"`);
}

// lookups degrade safely
ok(hullById('sloop').id === 'sloop', 'hullById finds the sloop');
ok(hullById('no-such-hull').id === 'sloop', 'an unknown hull reads as the sloop, never a crash');
ok(nextHull('sloop')?.id === 'brig', 'the sloop\'s next rung is the brig');
ok(nextHull(HULLS[HULLS.length - 1].id) === null, 'the top of the ladder has no next rung');

// the wreck rule reads DOWN the ladder and never off the bottom
ok(prevHull('brig').id === 'sloop', 'a wrecked brig drops to a sloop');
ok(prevHull('sloop').id === 'sloop', 'a wrecked sloop captain is staked a sloop — never nothing');
ok(prevHull('no-such-hull').id === 'sloop', 'an unknown hull wrecks down to the bottom rung, never a crash');

// the yard's ledger
const brigPrice = hullById('brig').price;
ok(!canBuyHull(brigPrice - 1, 'sloop'), 'a doubloon short is short');
ok(canBuyHull(brigPrice, 'sloop'), 'the exact price buys her');
ok(!canBuyHull(999999, HULLS[HULLS.length - 1].id), 'no rung above the top, however rich');
{
  const deal = buyHull(brigPrice + 500, 'sloop');
  ok(deal && deal.hull === 'brig' && deal.gold === 500 && deal.paid === brigPrice,
    'the ledger adds up: hull swapped, price paid, change right');
  ok(buyHull(brigPrice - 1, 'sloop') === null, 'the yard refuses short payment');
}

if (failed) { console.error(`verify-shipyard: ${failed} FAILED`); process.exit(1); }
console.log('verify-shipyard: OK — the ladder climbs honestly, every hull briefs its captain, the yard\'s ledger adds up');
