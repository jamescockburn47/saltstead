// verify-crewchat: the crew's brains are grounded — retrieval picks the
// right sea lore per question and dumps nothing on gibberish; the role
// affinity lifts but never fabricates; the SHIP'S FACTS card carries the
// trust-this framing and every live row; personas are deterministic; and
// the corpus states the game's REAL numbers (drift guards).
import { SEA_FACTS, retrieveFacts, factsBlock, roleAffinity } from '../src/seafacts.js';
import { crewPersona, buildShipCard, crewContext, CARD_MAX, CONTEXT_MAX } from '../src/crewchat.js';
import { GAIT_MAX } from '../src/earth.js';
import { HAND_COST, PRIZE_VALUE } from '../src/port.js';
import { PRIZE_CREW } from '../src/fleet.js';
import { HULLS } from '../src/shipyard.js';
import { PORTS } from '../src/ports.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// ---- corpus shape ----
ok(SEA_FACTS.length >= 24, `a real corpus (${SEA_FACTS.length} facts)`);
for (const f of SEA_FACTS) {
  ok(typeof f.id === 'string' && f.id.length > 1, 'fact has an id');
  ok(Array.isArray(f.keywords) && f.keywords.length >= 3, `${f.id}: real keywords`);
  ok(typeof f.text === 'string' && f.text.length > 60, `${f.id}: a real fact, not a stub`);
}

// ---- retrieval picks the right topic ----
const hits = (q, role, id) => retrieveFacts(q, role).some((f) => f.id === id);
ok(hits('how do I make her go faster', 'helmsman', 'trim'), 'speed question finds the trim fact');
ok(hits('where is el dorado', 'lookout', 'el-dorado'), 'el dorado question finds the hunt');
ok(hits('can we sail up the river', null, 'rivers'), 'river question finds the river road');
ok(hits('that navy corvette is chasing us', 'gunner', 'navy'), 'navy question finds the doctrine');
ok(hits('where can I sell these prizes', 'cook', 'havens'), 'fencing question finds the havens');
ok(hits('how do I hire more crew', null, 'hiring'), 'hiring question finds the muster fact');

// gibberish and empty retrieve NOTHING — no fact-dumping
ok(retrieveFacts('').length === 0, 'empty question retrieves nothing');
ok(retrieveFacts('zzz qqq xylophone').length === 0, 'gibberish retrieves nothing');
ok(factsBlock('') === '', 'no facts, no block');

// the affinity LIFTS a relevant fact, never fabricates relevance
{
  const plain = retrieveFacts('what do the chart colours mean', null);
  ok(plain.some((f) => f.id === 'charts'), 'chart question finds the chart fact unaided');
  ok(retrieveFacts('zzz qqq', 'lookout').length === 0,
    'a lookout still has nothing to say to gibberish');
  ok(roleAffinity('gunner').includes('combat') && roleAffinity('helmsman').includes('sailing'),
    'roles hold their patches');
}

// caps hold
{
  const picked = retrieveFacts('wind sail trim speed river port navy treasure', 'helmsman', 2);
  ok(picked.length <= 2, 'k is respected');
  ok(picked.reduce((s, f) => s + f.text.length, 0) <= 620, 'char budget respected');
}

// ---- drift guards: the corpus states the LIVE numbers ----
const all = SEA_FACTS.map((f) => f.text).join(' ');
ok(all.includes('TWENTY times') && GAIT_MAX === 20, 'gait fact matches GAIT_MAX');
ok(all.includes('60 doubloons') && HAND_COST === 60, 'hiring fact matches HAND_COST');
ok(all.includes('400 doubloons') && PRIZE_VALUE === 400, 'prize fact matches PRIZE_VALUE');
ok(all.includes('THREE hands') && PRIZE_CREW === 3, 'prize-crew fact matches PRIZE_CREW');
ok(all.includes('thirty-six') && HULLS[HULLS.length - 1].berths === 36,
  'berth fact matches the galleon');
ok(all.includes('sleeps one') && HULLS[0].berths === 1, 'berth fact matches the sloop');
{
  const dockyards = PORTS.filter((p) => p.kind === 'dockyard').length;
  ok(all.includes('Eighteen honest dockyards') && dockyards === 18,
    `port fact matches the roster (${dockyards})`);
}

// ---- personas: deterministic, first hand is the helmsman ----
ok(JSON.stringify(crewPersona(0)) === JSON.stringify(crewPersona(0)), 'personas deterministic');
ok(crewPersona(0).role === 'helmsman', 'berth zero is the helmsman');
ok(crewPersona(3).name && crewPersona(3).home && crewPersona(3).mood, 'later hands fully drawn');

// ---- the SHIP'S FACTS card ----
const state = {
  faction: 'pirate', hullName: 'Sloop', guns: 1, berths: 1, crew: 1,
  gold: 120, banked: 40, fleetSize: 0, posText: '17°51′N 76°54′W',
  speedKn: 6.2, pointOfSail: 'Beam reach', windMs: 11, weatherState: 'clear',
  gait: 5, overLand: false, coastDist: 900, aground: false, anchorDown: false,
  crippled: false, rigPct: 100, hullPct: 100,
  nearestPort: { name: 'Port Royal', kind: 'haven', dist: 700, bearing: 'north' },
  zoneName: 'Port Royal', hasTreasureMap: true, night: false,
};
{
  const card = buildShipCard(state);
  ok(card.startsWith('SHIP’S FACTS'), 'the card announces itself');
  ok(card.includes('trust these over anything you remember'), 'the trust framing rides the card');
  ok(card.includes('Black Flag'), 'the card knows the flag');
  ok(card.includes('17°51'), 'the card carries the position');
  ok(card.includes('Port Royal') && card.includes('north'), 'the card bears to the nearest port');
  ok(card.includes('treasure map'), 'the card knows what is aboard');
  ok(card.length <= CARD_MAX, `card under the cap (${card.length})`);

  const river = buildShipCard({ ...state, overLand: true, gait: 1 });
  ok(river.includes('INLAND on a river'), 'inland the card says river, flat water, real banks');

  const ctx = crewContext(state, crewPersona(0), 'how do I sail faster?');
  ok(ctx.includes('SHIP’S FACTS') && ctx.includes('never recite'), 'context = card + framed facts');
  ok(ctx.length <= CONTEXT_MAX, `context under the cap (${ctx.length})`);
}

if (failed) { console.error(`verify-crewchat: ${failed} FAILED`); process.exit(1); }
console.log('verify-crewchat: OK — retrieval true, no fact-dumping, card trusted, '
  + 'personas deterministic, numbers drift-guarded');
