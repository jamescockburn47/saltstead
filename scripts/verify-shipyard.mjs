// verify-shipyard: the ladder climbs honestly — every rung costs more, hits
// harder, berths more and draws deeper than the last; the briefing doctrine
// exists for every hull; and the yard's ledger never sells what you can't
// pay for.
import { HULLS, hullById, nextHull, prevHull, canBuyHull, buyHull } from '../src/shipyard.js';
import { beaches } from '../src/shipphysics.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// the ladder's shape: seven rungs, sloop to galleon
ok(HULLS.length >= 7, `a full ladder (${HULLS.length} rungs)`);
ok(HULLS[0].id === 'sloop' && HULLS[0].price === 0, 'the sloop is the free first rung');
ok(HULLS[HULLS.length - 1].id === 'galleon', 'the galleon crowns the ladder');
for (let i = 1; i < HULLS.length; i++) {
  const a = HULLS[i - 1], b = HULLS[i];
  ok(b.price > a.price, `${b.id} costs more than ${a.id}`);
  ok(b.guns >= a.guns, `${b.id} throws at least ${a.id}'s broadside`);
  ok(b.berths > a.berths, `${b.id} berths more hands`);
  // every rung buys speed OR broadside weight — the galleon alone trades
  // the frigate's legs for six guns a side, and that trade must stay real
  if (b.id === 'galleon') {
    ok(b.spec.maxSpeed < a.spec.maxSpeed, 'the galleon is slower than the frigate ON PURPOSE');
    ok(b.guns > a.guns, 'and outguns her for it');
  } else {
    ok(b.spec.maxSpeed > a.spec.maxSpeed, `${b.id} is faster in a straight line`);
  }
  ok(b.spec.turnRate < a.spec.turnRate, `${b.id} pays for it in the turn`);
  ok(b.spec.draft > a.spec.draft, `${b.id} draws deeper`);
}
// the beaching line sits where the briefings say it does
ok(beaches(hullById('schooner').spec), 'the schooner still beaches');
ok(!beaches(hullById('brig').spec), 'the brig is the first rung that cannot');

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
ok(nextHull('sloop')?.id === 'cutter', 'the sloop\'s next rung is the cutter');
ok(nextHull(HULLS[HULLS.length - 1].id) === null, 'the top of the ladder has no next rung');

// the wreck rule reads DOWN the ladder and never off the bottom
ok(prevHull('brig').id === 'schooner', 'a wrecked brig drops to a schooner');
ok(prevHull('galleon').id === 'frigate', 'a wrecked galleon drops to a frigate');
ok(prevHull('sloop').id === 'sloop', 'a wrecked sloop captain is staked a sloop — never nothing');
ok(prevHull('no-such-hull').id === 'sloop', 'an unknown hull wrecks down to the bottom rung, never a crash');

// the yard's ledger
const cutterPrice = hullById('cutter').price;
ok(!canBuyHull(cutterPrice - 1, 'sloop'), 'a doubloon short is short');
ok(canBuyHull(cutterPrice, 'sloop'), 'the exact price buys her');
ok(!canBuyHull(999999, HULLS[HULLS.length - 1].id), 'no rung above the top, however rich');
{
  const deal = buyHull(cutterPrice + 500, 'sloop');
  ok(deal && deal.hull === 'cutter' && deal.gold === 500 && deal.paid === cutterPrice,
    'the ledger adds up: hull swapped, price paid, change right');
  ok(buyHull(cutterPrice - 1, 'sloop') === null, 'the yard refuses short payment');
}

// the helm ladder: tillers below the brig, a proper wheel from the brig up —
// the wheel arrives WITH the hold (both mark the move to real ships)
ok(HULLS.filter((h) => h.wheel).map((h) => h.id).join() === 'brig,corvette,frigate,galleon',
  'the wheel arrives with the brig and rides every rung above');
ok(HULLS.every((h) => !!h.wheel === !!h.below), 'wheel and hold arrive together');

if (failed) { console.error(`verify-shipyard: ${failed} FAILED`); process.exit(1); }
console.log('verify-shipyard: OK — the ladder climbs honestly, every hull briefs its captain, the yard\'s ledger adds up');
