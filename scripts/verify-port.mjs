// verify-port: the plunder economy's first sink. The anchorage finds the
// right haven, the ledger adds up, and the loop is profitable in the right
// direction (capture > strip, hire-to-capture pays).
import {
  PORT_RADIUS, HARBOUR_RADIUS, PORT_SPEED, PRIZE_VALUE, HAND_COST, CREW_MAX,
  nearestHaven, inAnchorage, sellFleet, canHire,
} from '../src/port.js';
import { LEGENDS } from '../src/legends.js';
import { PRIZE_CREW, FLEET_MAX } from '../src/fleet.js';
import { lootRoll } from '../src/plunder.js';
import { M_PER_DEG } from '../src/earth.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// ---- the havens are on the map, and each ocean has a door ----
const havens = LEGENDS.filter((l) => l.kind === 'haven');
ok(havens.length >= 4, `at least four havens (${havens.length})`);
ok(havens.some((h) => h.lon > 40), 'the Indian Ocean has a door');
ok(havens.some((h) => h.lon < -70), 'the Caribbean has a door');

// ---- nearestHaven finds the right one ----
const pr = nearestHaven(17.94, -76.84);
ok(pr.haven.id === 'port-royal' && pr.dist < 1, 'off Port Royal, Port Royal is the port');
const na = nearestHaven(25.2, -77.3);
ok(na.haven.id === 'nassau', 'off New Providence, Nassau is the port');
const sm = nearestHaven(-17.0, 49.9);
ok(sm.haven.id === 'sainte-marie', 'off Madagascar, Sainte-Marie is the port');
const mid = nearestHaven(30, -40); // mid-Atlantic
ok(mid !== null && mid.dist > PORT_RADIUS * 3, 'mid-ocean is nobody\u2019s anchorage');

// distances are measured in the game's own frame (a degree = M_PER_DEG)
const oneDeg = nearestHaven(18.94, -76.84);
ok(Math.abs(oneDeg.dist - M_PER_DEG) < 1, 'a degree of anchorage bearing = M_PER_DEG metres');

// ---- the anchorage gate ----
// the furling harbour is a small heart inside the anchorage — a passing ship
// in the outer anchorage must NOT lose her wind
ok(HARBOUR_RADIUS < PORT_RADIUS / 2,
  `the furling harbour (${HARBOUR_RADIUS} m) is well inside the anchorage (${PORT_RADIUS} m)`);
ok(inAnchorage(PORT_RADIUS - 1, 0), 'stopped inside the anchorage: in port');
ok(inAnchorage(PORT_RADIUS - 1, PORT_SPEED), 'bare steerageway still puts in');
ok(!inAnchorage(PORT_RADIUS - 1, PORT_SPEED + 2), 'sweeping through at speed does not');
ok(!inAnchorage(PORT_RADIUS + 50, 0), 'hove to outside the anchorage does not');

// ---- the ledger ----
const sale = sellFleet(3, 5);
ok(sale.gold === 3 * PRIZE_VALUE && sale.sold === 3, 'three hulls, three payments');
ok(sale.crewBack === Math.min(CREW_MAX, 5 + 3 * PRIZE_CREW),
  'the prize crews come back aboard, up to the berths');
ok(sellFleet(0, 8).gold === 0, 'no prizes, no payment');
ok(sellFleet(FLEET_MAX, CREW_MAX).crewBack === CREW_MAX, 'berths never overflow');

ok(canHire(HAND_COST, CREW_MAX - 1), 'exact coin, one berth: the hand signs');
ok(!canHire(HAND_COST - 1, 4), 'short a doubloon: no articles');
ok(!canHire(10000, CREW_MAX), 'no berths: gold buys nothing');

// ---- the economy points the right way ----
let richest = 0;
for (let s = 1; s <= 200; s++) richest = Math.max(richest, lootRoll(s).gold);
ok(PRIZE_VALUE > richest,
  `a hull outsells the richest purse (${PRIZE_VALUE} > ${richest}) \u2014 capture beats strip`);
ok(PRIZE_CREW * HAND_COST < PRIZE_VALUE,
  'hiring a prize crew costs less than the prize pays \u2014 the loop closes uphill');

if (failed) { console.error(`verify-port: ${failed} FAILED`); process.exit(1); }
console.log('verify-port: OK — havens found, anchorage gated, ledger adds up, loop profitable');
