// verify-legendfx: every non-haven legend has a working zone at its real
// geography, the Triangle's lies are bounded and grow inward, the whirlpool
// slings the rim and swallows the core, dead air kills the trench, the dive
// ledger decays to a floor, and the Dutchman keeps her weather.
import { LEGENDS } from '../src/legends.js';
import {
  ZONE_R, legendAt, inZone, triangleDepth, compassJitter, TRIANGLE_GLOOM,
  whirlpoolPull, WHIRL_RIM, WHIRL_CORE, deadAir, bankable,
  diveRoll, DIVE_DECAY, DIVE_FLOOR, ELDORADO_GOLD,
  dutchmanSails, dutchmanCargo, dutchmanPos, DUTCHMAN_SPEED,
  WHIRL_ZONES, DEADAIR_ZONES, KRAKEN_ZONES, DRAGON_ZONES, DIVE_ZONES,
  DERELICT_ZONES, STORM_ZONES, STORM_GLOOM, STORM_WIND_MULT,
  ROC_GOLD, WHALE_RAM_S, WHALE_RAM_HULL, SELKIE_DWELL_S,
} from '../src/legendfx.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// every non-haven legend row has a zone; havens stay the port system's
{
  for (const l of LEGENDS) {
    if (l.kind === 'haven') {
      ok(!ZONE_R[l.id], `${l.id} is the port system's business, not a zone`);
    } else {
      ok(ZONE_R[l.id] > 100, `${l.id} has a workable zone (${ZONE_R[l.id] || 'none'})`);
      const hit = legendAt(l.lat, l.lon);
      ok(hit && hit.legend.id === l.id, `standing on ${l.id} finds ${l.id}`);
      ok(inZone(l.lat, l.lon, l.id), `inZone agrees for ${l.id}`);
    }
  }
  ok(legendAt(45, -35) === null, 'the mid-Atlantic is honest water');
  ok(!inZone(45, -35, 'kraken-deep'), 'the Kraken keeps to her deeps');
}

// the Welsh dragons hunt the IRISH SEA and nothing beyond it: Dublin's
// water and Liverpool Bay are theirs; the Celtic Sea, the Clyde and the
// Channel approaches are not (playtest: 'the dragon comes too far')
{
  const dragon = (lat, lon) => { const z = legendAt(lat, lon); return !!(z && z.legend.id === 'dragons-wales'); };
  ok(dragon(53.35, -5.5), 'mid-Irish Sea is dragon water');
  ok(dragon(53.4, -5.9), 'the Dublin approaches are dragon water');
  ok(dragon(53.5, -3.6), 'Liverpool Bay is dragon water');
  ok(dragon(52.3, -5.6), "St George's Channel is dragon water");
  ok(!dragon(51.2, -6.3), 'the Celtic Sea is not');
  ok(!dragon(55.6, -5.2), 'the Firth of Clyde is not');
  ok(!dragon(50.0, -5.5), "the Channel approaches off Land's End are not");
  ok(!dragon(51.3, -3.6), 'the Bristol Channel is not');
}

// the Triangle: depth grows inward, the lies are bounded, deterministic
{
  ok(triangleDepth(0, 2000) === 1, 'the heart of the triangle is depth 1');
  ok(triangleDepth(2000, 2000) === 0, 'the rim is depth 0');
  const a = compassJitter(100, 1), b = compassJitter(100, 1);
  ok(a.dLat === b.dLat && a.dYaw === b.dYaw, 'the lies are deterministic in time');
  let maxLat = 0, maxYaw = 0;
  for (let t = 0; t < 600; t += 0.7) {
    const j = compassJitter(t, 1);
    maxLat = Math.max(maxLat, Math.abs(j.dLat));
    maxYaw = Math.max(maxYaw, Math.abs(j.dYaw));
  }
  ok(maxLat > 0.3 && maxLat < 2, `the latitude lies but stays plausible (\u00b1${maxLat.toFixed(2)}\u00b0)`);
  ok(maxYaw > 0.3 && maxYaw < 2, 'the compass spins but not to uselessness');
  const rim = compassJitter(100, 0.1);
  ok(Math.abs(rim.dLat) < Math.abs(a.dLat) * 0.2, 'at the rim the instruments barely waver');
  ok(TRIANGLE_GLOOM > 0.3, 'the fog genuinely closes in');
}

// the whirlpool: rim slings, core swallows, outside is calm
{
  const R = 240;
  const out = whirlpoolPull(300, 0, R);
  ok(out.ax === 0 && out.az === 0, 'outside the pool the sea is just the sea');
  const rim = whirlpoolPull(R * 0.8, 0, R);
  ok(rim.rim && !rim.core, 'the outer band is the rim');
  const rimMag = Math.hypot(rim.ax, rim.az);
  ok(rimMag > 1, `the rim genuinely slings (${rimMag.toFixed(1)} m/s\u00b2)`);
  const core = whirlpoolPull(R * 0.15, 0, R);
  ok(core.core, 'the middle is the core');
  // the core pulls INWARD: acceleration dotted with the outward radial < 0
  ok(core.ax * 1 + core.az * 0 < 0, 'the core drags her down-current');
  ok(WHIRL_CORE < WHIRL_RIM, 'the bands nest');
  // swirl is tangential at the rim: mostly perpendicular to the radial
  const tangential = Math.abs(rim.az) > Math.abs(rim.ax);
  ok(tangential, 'the rim force runs AROUND the pool, not into it');
}

// dead air: whole at the rim, near-nothing over the trench, monotone
{
  ok(deadAir(600, 600) === 1, 'at the rim the wind is honest');
  ok(deadAir(0, 600) < 0.2, 'over the trench the sails hang dead');
  ok(deadAir(150, 600) < deadAir(450, 600), 'the deadness grows inward');
  ok(bankable(340.4) === 340, 'the vault takes whole doubloons');
  ok(bankable(-5) === 0, 'and never mints them');
}

// the dive ledger: deterministic, decays, never picked clean
{
  ok(diveRoll(3, 0) === diveRoll(3, 0), 'dives deterministic');
  ok(diveRoll(3, 0) > diveRoll(3, 1), 'the second dive pays less');
  ok(diveRoll(3, 9) >= DIVE_FLOOR, 'the seabed is never picked clean');
  ok(diveRoll(5, 0) >= 140 && diveRoll(5, 0) <= 360, 'a first dive pays inside its bounds');
  ok(DIVE_DECAY < 1 && DIVE_DECAY > 0.4, 'decay is a diminishing return, not a cliff');
}

// El Dorado pays like a city
ok(ELDORADO_GOLD > 1500, 'the gilded city out-pays any chest');

// the Dutchman: storm always, filthy night sometimes, fair weather never
{
  ok(dutchmanSails('storm', 0), 'she rounds the Cape in every storm');
  ok(dutchmanSails('rain', 0.8), 'and on a filthy night');
  ok(!dutchmanSails('rain', 0.2), 'but not a rainy noon');
  ok(!dutchmanSails('clear', 0.9), 'and never under stars');
  ok(dutchmanCargo(1) === dutchmanCargo(1), 'her cargo is deterministic');
  ok(dutchmanCargo(2) >= 800 && dutchmanCargo(2) <= 1500, 'cursed but bounded');
  const p1 = dutchmanPos(0, 1000, 2000, 1200);
  const p2 = dutchmanPos(10, 1000, 2000, 1200);
  const d = Math.hypot(p2.x - p1.x, p2.z - p1.z);
  ok(d > 30 && d < DUTCHMAN_SPEED * 10 * 1.2, `she makes way on her circuit (${d.toFixed(0)} m in 10 s)`);
  const r1 = Math.hypot(p1.x - 1000, p1.z - 2000);
  ok(Math.abs(r1 - 1200 * 0.7) < 1, 'she keeps her orbit inside the zone');
}

// the second dozen: the mythology is GLOBAL now — every zone family's
// members exist in the table with real zones, every family id resolves,
// and the new constants hold their design shape
{
  const families = [WHIRL_ZONES, DEADAIR_ZONES, KRAKEN_ZONES, DRAGON_ZONES,
    DIVE_ZONES, DERELICT_ZONES, STORM_ZONES];
  for (const fam of families) {
    for (const id of fam) {
      ok(LEGENDS.some((l) => l.id === id), `family member ${id} is a real legend row`);
      ok(ZONE_R[id] > 0, `${id} has a working zone`);
      ok(inZone(LEGENDS.find((l) => l.id === id).lat, LEGENDS.find((l) => l.id === id).lon, id),
        `${id}'s own geography is inside its zone`);
    }
  }
  ok(WHIRL_ZONES.length >= 3 && KRAKEN_ZONES.length >= 2 && DRAGON_ZONES.length >= 2,
    'the families genuinely grew');
  const zoned = Object.keys(ZONE_R).length;
  ok(zoned >= 20, `the mythology doubled (${zoned} zones)`);
  // the globe is covered: zones in both hemispheres, and spread east-west
  const zl = LEGENDS.filter((l) => ZONE_R[l.id]);
  ok(zl.some((l) => l.lat > 30) && zl.some((l) => l.lat < -30), 'both hemispheres carry legend');
  ok(zl.some((l) => l.lon > 100) && zl.some((l) => l.lon < -60), 'and both ends of the earth');
  ok(ROC_GOLD > 0 && WHALE_RAM_S > 10 && WHALE_RAM_HULL > 0 && WHALE_RAM_HULL < 0.5
    && SELKIE_DWELL_S > 5 && STORM_GLOOM > 0 && STORM_WIND_MULT > 1,
    'the new constants hold their shape');
}

if (failed) { console.error(`verify-legendfx: ${failed} FAILED`); process.exit(1); }
console.log('verify-legendfx: OK — zones at real geography, triangle lies bounded, whirlpool/dead-air/dives/Dutchman sound');
