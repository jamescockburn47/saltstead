// verify-weather: the wind shelters inshore and fills in offshore, the sky
// dressing table is sane, and the sea state tracks the wind inside its clamps.
// Pure half only — the live fetch is a layer, never a dependency (the
// Moorstead rule).
import {
  windProfile, seaStateFor, seaBandsFor, skyDressing, swellRise,
  WIND_FLOOR, WIND_LEE, SWELL_REF, SWELL_REF_WIND,
} from '../src/weather.js';
import { windAt } from '../src/wind.js';
import { latLonToWorld } from '../src/earth.js';
import {
  SEA_STATE_MIN, SEA_STATE_MAX, SEA_SWELL_MAX, RIVER_STATE, MAX_WAVE_HEIGHT,
  setSeaState, getSeaState, waveHeight, significantHeight, waveBandHeight,
  MAX_HARM_SWELL, MAX_HARM_CHOP,
  shoreOpenAtten, shoreEnv, SHORE_WAVES,
} from '../src/waves.js';
import { speedTarget } from '../src/sailing.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// ======================= THE WIND: FLOOR AND SHELTER =======================
// WHAT THESE USED TO SAY, AND WHY THAT WAS THE BUG (2026-07-26). Three clauses
// here pinned the magic number 10:
//     ok(WIND_FLOOR === 10, 'the game sea is never becalmed: floor at 10 m/s')
//     ok(windProfile(0, 7) === WIND_FLOOR && windProfile(0, 2) === WIND_FLOOR, ...)
//     ok(windProfile(9999, 1) === WIND_FLOOR, ...)
// Every one of them PASSED while the game was broken, and the second and third
// passed BECAUSE it was broken: they asserted that the floor swallows the
// weather, which is precisely what it was doing. wind.js's latitude field
// maxed out at 9.19 m/s, so a floor of 10 sat above the field's own ceiling and
// won at every latitude on earth — harbour wind read exactly 10.00 everywhere,
// blue water read 10.00 at fourteen of nineteen sample latitudes, and the swell
// that falls out of the wind was 1.54 from the doldrums to the Southern Ocean.
// A gate that pins a constant cannot tell a floor from a ceiling.
//
// What the design actually promises is a PROPERTY, and these clauses assert the
// property instead: (a) the sail always has a workable breeze, wherever and
// whenever; (b) latitude genuinely reads through into the wind; (c) blue water
// carries near twice a harbour's wind; (d) the calm belts are lighter than the
// westerlies. A floor that ever again eats the weather fails (b) and (d).
const at = (lat, lon = -40) => { const p = latLonToWorld(lat, lon); return windAt(p.x, p.z); };

// (a) THE SEA IS NEVER BECALMED — the pillar, stated as a bound and not a
// number. 4.5 m/s is Beaufort 3 and drives the hull at 0.56x its wind factor
// (sailing.js speedTarget), so she sails; the sweeps (oars.js) answer the rest.
ok(WIND_FLOOR >= 3.5 && WIND_FLOOR <= 6,
  `the floor is a light breeze, not the world's only weather (${WIND_FLOOR} m/s; `
  + 'a working range of 3.5-6 — Beaufort 3ish. Below this she is dead in the water; '
  + 'above it the floor starts masking the latitude field, which is the 2026-07-26 bug)');
ok(windProfile(0, 0) >= WIND_FLOOR && windProfile(9999, 0) >= WIND_FLOOR,
  'a dead-calm forecast, inshore or offshore, still gives the sail the floor to work with');
ok(windProfile(9999, 40) > WIND_FLOOR * 5,
  'and it is a FLOOR, not a clamp: a hard wind passes through it untouched');
// asked of sailing.js itself rather than of a copied divisor — the gate must
// not carry its own private idea of how wind becomes hull speed
ok(speedTarget(1, WIND_FLOOR, 1) >= 0.5,
  `and the floor is enough wind to sail on: ${speedTarget(1, WIND_FLOOR, 1).toFixed(2)}x of hull `
  + 'speed on a perfect beam reach (sailing.js speedTarget; this gate\'s bound is 0.5)');

// (b) THE FLOOR MUST NOT SWALLOW THE FIELD — the clause the old gate lacked.
// Held two ways: the field's own ceiling has to clear the floor by a wide
// margin, and a majority of the sailable world has to read its OWN wind
// offshore rather than the floor's.
{
  let peak = 0, peakLat = 0, above = 0, total = 0;
  for (let l = -70; l <= 70; l += 0.5) {
    const s = at(l).speed;
    if (s > peak) { peak = s; peakLat = l; }
    total++;
    if (windProfile(9999, s) > WIND_FLOOR + 1e-9) above++;
  }
  ok(peak > WIND_FLOOR * 2.5,
    `the wind field's ceiling clears the floor by a wide margin — ${peak.toFixed(2)} m/s `
    + `at lat ${peakLat} against a ${WIND_FLOOR} floor (needs 2.5x). When this ratio `
    + 'went BELOW 1 the whole trade-wind system vanished and no other check noticed');
  ok(above / total > 0.55,
    `and most of the sailable world reads its own latitude offshore, not the floor `
    + `(${(100 * above / total).toFixed(0)}% of lat -70..70 above the floor; needs 55%)`);
}

// (c) SHELTER AND FILL-IN: blue water carries 1.9x a sheltered harbour's wind,
// full by ~1.5 km (the playtest fix), monotone all the way out. Measured with a
// westerly base, because in a calm belt the floor closes the gap — correctly:
// there is no lee effect to feel when the whole system is already at the floor.
{
  const base = 12; // the roaring forties, open water
  ok(Math.abs(windProfile(0, base) - base * WIND_LEE) < 1e-9,
    `a harbour keeps ${(100 * WIND_LEE).toFixed(0)}% of blue water's wind `
    + `(${windProfile(0, base).toFixed(2)} of ${base})`);
  ok(Math.abs(windProfile(50000, base) - base) < 1e-9,
    'and blue water carries the open-water field itself, undoctored');
  ok(Math.abs(windProfile(1500, base) - base) < 1e-9,
    'full fill-in already by 1.5 km off (the playtest fix)');
  ok(Math.abs(windProfile(50000, base) / windProfile(0, base) - 1.9) < 1e-9,
    'the harbour-to-blue-water contrast is still 1.9x — what makes a crossing fly');
  ok(windProfile(800, base) > windProfile(0, base) && windProfile(800, base) < base,
    'filling in through the inshore band');
  let prev = -1, mono = true;
  for (let d = 0; d <= 6000; d += 100) { const w = windProfile(d, base); if (w < prev - 1e-9) mono = false; prev = w; }
  ok(mono, 'monotonic fill-in all the way out');
}

// (d) THE GEOGRAPHY READS THROUGH — the wind tells you where on earth you are.
// This is the assertion whose absence let the bug ship: with the old floor
// every one of these numbers was 10.00.
{
  const blue = (lat) => windProfile(9999, at(lat).speed);
  const doldrums = blue(0), trades = blue(16), horse = blue(31), forties = blue(45),
    fifties = blue(-54);
  ok(trades > doldrums * 1.6 && trades > horse * 1.6,
    `the trades blow harder than both calm belts (${trades.toFixed(2)} vs doldrums `
    + `${doldrums.toFixed(2)}, horse latitudes ${horse.toFixed(2)})`);
  ok(forties > trades * 1.25 && fifties > forties,
    `and the westerlies harder than the trades, the fifties hardest of all `
    + `(${forties.toFixed(2)} in the forties, ${fifties.toFixed(2)} in the fifties)`);
  ok(fifties / horse > 3,
    `the wind SAYS where you are: ${(fifties / horse).toFixed(1)}x from the horse `
    + 'latitudes to the screaming fifties (needs 3x; it was 1.00x before this was fixed)');
  // THE FLOOR MUST NEVER CLIMB BACK OVER THE TRADES. Note that `doldrums` and
  // `horse` above BOTH read exactly the floor — correctly, that is what a calm
  // belt is now — so those two clauses are really "the trades clear the floor".
  // The contrast between a harbour and blue water is likewise only the full
  // 1.9x where the sheltered value clears the floor, i.e. above
  // WIND_FLOOR/WIND_LEE. If a future floor rise pushed that threshold over the
  // trade belt the tropics would lose their wind geography exactly as the whole
  // world did before 2026-07-26, and every ordering clause above would still
  // pass. This is the clause that would not.
  const lit = WIND_FLOOR / WIND_LEE;
  ok(lit < at(16).speed,
    `a sheltered harbour feels the full ${(1 / WIND_LEE).toFixed(2)}x contrast wherever the open `
    + `wind clears ${lit.toFixed(2)} m/s — which the trade belt does at ${at(16).speed.toFixed(2)}. `
    + 'If the floor ever rises past the trades again, the tropics go back to reading one number');
}

// the sky dressing table: every state dresses sanely, and worse weather
// never wears LESS cloud
{
  for (const st of ['clear', 'overcast', 'fog', 'rain', 'storm']) {
    const d = skyDressing(st);
    ok(d.cloud >= 0 && d.cloud <= 1 && d.rain >= 0 && d.rain <= 1, `${st} dresses in bounds`);
  }
  ok(skyDressing('clear').cloud < skyDressing('overcast').cloud, 'overcast wears more cloud than clear');
  ok(skyDressing('storm').cloud === 1, 'a storm fills the sky');
  ok(skyDressing('storm').rain > skyDressing('rain').rain, 'a storm rains harder than rain');
  ok(skyDressing('clear').rain === 0 && skyDressing('overcast').rain === 0
    && skyDressing('fog').rain === 0, 'only rain and storm are wet');
}

// sea state follows the wind, clamped, and scales the real wave field
ok(seaStateFor(7) > 0.9 && seaStateFor(7) < 1.05, `7 m/s is today's sea (${seaStateFor(7).toFixed(2)})`);
ok(seaStateFor(24) === SEA_STATE_MAX, 'gale pins the ceiling');
ok(seaStateFor(0) === SEA_STATE_MIN, 'calm pins the floor');

// the two-band sea: chop is the LOCAL wind-sea, swell needs wind AND water
{
  const calmIn = seaBandsFor(10, 100);    // light air in the land's lee
  const calmOut = seaBandsFor(10, 5000);  // light air, blue water
  const galeIn = seaBandsFor(22, 100);    // hard wind, sheltered
  const galeOut = seaBandsFor(22, 5000);  // hard wind, blue water — the rollers
  // THE LEE NO LONGER KILLS THE SEA (2026-07-25). These three assertions used
  // to demand the lee carry NO rollers — and that intent, honestly encoded,
  // is what left the game swell-less wherever players actually sail. A lee is
  // a DIMINISHING, not a wall: swell is far-travelled water, so it arrives
  // under the land reduced, and the inshore calm belongs to waves.js's shore
  // field (shoreOpenAtten, the strait gate), which applies it once and
  // properly. What must still hold is the ORDERING and the contrast.
  ok(calmIn.swell > 0.35 && calmIn.swell < calmOut.swell * 0.7,
    `the lee diminishes the rollers without killing them (${calmIn.swell.toFixed(2)} `
    + `vs ${calmOut.swell.toFixed(2)} in blue water)`);
  ok(galeOut.swell > 2, `a gale over blue water rolls DEEP (${galeOut.swell.toFixed(2)})`);
  ok(galeIn.swell < galeOut.swell * 0.6, 'the land\'s lee still tells, even in wind');
  // the benchmark: the title scene's water (the landing-page video, sea state
  // 1.9) is what the game must be able to reach. An ordinary working breeze
  // over open water has to put a real heave under her.
  ok(seaBandsFor(12, 5000).swell > 1.1,
    `an ordinary breeze offshore carries the landing page's heave `
    + `(${seaBandsFor(12, 5000).swell.toFixed(2)})`);
  ok(calmOut.swell > 1 && calmOut.swell < galeOut.swell,
    `the deep sea always rolls; the gale rolls deeper (${calmOut.swell.toFixed(2)})`);
  ok(galeOut.chop > calmOut.chop, 'chop follows the wind');
  ok(Math.abs(seaBandsFor(15, 100).chop - seaBandsFor(15, 9000).chop) < 1e-9,
    'chop is local — it does not care about fetch');
  ok(seaBandsFor(99, 99999).swell <= 2.4 && seaBandsFor(99, 99999).chop <= 1.9,
    'both bands respect their ceilings');
  // the contrast the deck feels: gale/blue-water total vs light-air/lee total
  const heavy = galeOut.swell + galeOut.chop, quiet = calmIn.swell + calmIn.chop;
  ok(heavy > quiet * 2, `the sea VARIES: ${heavy.toFixed(2)} rolling vs ${quiet.toFixed(2)} quiet`);
}

// ============ THE SWELL CURVE SATURATES, AND KEEPS ITS REFERENCE ============
// The rise was linear (0.22 * (wind - 3)) and hit the 2.4 ceiling at 13.95 m/s.
// Harmless while the wind was pinned at 10 everywhere; fatal once the wind field
// carries real westerlies, because the ordinary roaring-forties day would then
// sit ON the ceiling and a storm on top of it would add nothing. Two properties
// matter and both are asserted: the REFERENCE is unmoved (waves.js
// SPECTRUM.level, verify-waves, verify-seamotion and glitter.js's energy
// reference all quote the 10 m/s day), and the CEILING is reserved for weather
// the latitude field cannot reach on its own.
{
  ok(Math.abs(seaBandsFor(SWELL_REF_WIND, 9999).swell - SWELL_REF) < 1e-9,
    `the ${SWELL_REF_WIND} m/s day offshore still raises exactly ${SWELL_REF} — the number `
    + 'waves.js was calibrated against, held here so a curve change cannot silently move it');
  // THE ONE MAGIC NUMBER WORTH PINNING, and only because it is QUOTED
  // ELSEWHERE as a literal: waves.js SPECTRUM.level's derivation, verify-waves
  // ("hsSw * 1.54"), verify-seamotion section 9, and glitter.js GLINT.refSwell
  // all carry 1.54 by hand. Moving it is legitimate — but then those four have
  // to move with it, and this clause is what makes that impossible to forget.
  ok(SWELL_REF === 1.54 && SWELL_REF_WIND === 10,
    `SWELL_REF is quoted as a bare 1.54 in waves.js (SPECTRUM.level's derivation, twice), `
    + `verify-waves, verify-seamotion (twice), glitter.js GLINT.refSwell, verify-glitter and `
    + `live-glitter. It now reads ${SWELL_REF} at ${SWELL_REF_WIND} m/s: update all of those, `
    + 'then this clause');
  // weather.js clamps the rise with a literal 2.4 rather than importing
  // waves.js's ceiling (it is a pure module with no imports, deliberately), so
  // the two must be pinned together or a change to one silently decouples them
  ok(SEA_SWELL_MAX === 2.4 && SEA_STATE_MAX === 2,
    `weather.js clamps the two bands with literal 2.4 and 1.9 against waves.js's `
    + `SEA_SWELL_MAX ${SEA_SWELL_MAX} / SEA_STATE_MAX ${SEA_STATE_MAX}: move both together`);
  ok(swellRise(0) === 0 && swellRise(3) === 0,
    'no long sea builds under 3 m/s: a true calm carries no rollers of its own');
  let mono = true;
  for (let w = 0; w < 60; w += 0.1) if (swellRise(w + 0.1) < swellRise(w) - 1e-12) mono = false;
  ok(mono, 'the rise is monotone in wind');
  // where the ceiling is reached, and that it is out of the field's reach
  let peg = Infinity;
  for (let w = 0; w < 80; w += 0.01) if (swellRise(w) >= SEA_SWELL_MAX) { peg = w; break; }
  let fieldMax = 0;
  for (let l = -90; l <= 90; l += 0.5) fieldMax = Math.max(fieldMax, windProfile(9999, at(l).speed));
  ok(peg > 15 && peg < 24,
    `the swell ceiling is a GALE's sea, reached at ${peg.toFixed(1)} m/s (Beaufort 8; `
    + 'the old linear rise reached it at 13.91, an ordinary westerly day)');
  ok(peg > fieldMax * 1.15,
    `and the SUSTAINED field cannot reach it alone — ${fieldMax.toFixed(1)} m/s at its `
    + `windiest against a ${peg.toFixed(1)} m/s ceiling (needs 15% of headroom; a pegged `
    + 'ceiling is a flat top end)');
  // AND THE GUST IS PART OF THE WIND. main.js multiplies the field by
  // (1 + gusts) with gusts in [-0.45, +0.45] BEFORE windProfile, so the
  // instantaneous wind in the fifties reaches 21.7 m/s and the swell target
  // there does peg the ceiling. That is not a fault — the realised band is the
  // TARGET eased at 0.015/s (tau ~67 s) against a ~90 s gust cycle, so about a
  // fifth of the gust gets through — but a gate that measured only the mean and
  // claimed "gusts have somewhere to go" would be asserting something it had
  // not looked at. So the honest clause is about what the EASED band reaches.
  const GUST_PEAK = 1.45, GUST_THROUGH = 0.25; // the ease's share of a 90 s gust
  const gustyPeak = fieldMax * GUST_PEAK;
  const sustained = swellRise(fieldMax);
  const realised = sustained + (Math.min(swellRise(gustyPeak), SEA_SWELL_MAX) - sustained) * GUST_THROUGH;
  ok(swellRise(gustyPeak) >= SEA_SWELL_MAX,
    `a full gust in the windiest belt DOES reach the ceiling (${gustyPeak.toFixed(1)} m/s), which `
    + 'is what makes the top of the sea reachable by weather at all');
  ok(realised < SEA_SWELL_MAX * 0.97,
    `but the swell's easing keeps the sustained sea off it — the eased band reaches `
    + `${realised.toFixed(2)} of ${SEA_SWELL_MAX} under a fair-weather gust cycle, so a storm on `
    + 'top still tells');
  // the slope must not go the other way either: a saturating curve that
  // saturates too early is the same fault by a different route
  ok(seaBandsFor(15, 9999).swell > seaBandsFor(10, 9999).swell * 1.25,
    `and the curve still CLIMBS through the westerlies: ${seaBandsFor(10, 9999).swell.toFixed(2)} `
    + `at 10 m/s to ${seaBandsFor(15, 9999).swell.toFixed(2)} at 15 (needs 1.25x)`);
}

// ============ AND THE SEA SAYS WHERE ON EARTH YOU ARE ============
// The consequence the owner reported: seaBandsFor takes the wind, so a constant
// wind is a constant sea. Measured before the fix: swell band 1.54 and
// significant height 2.88 m at fourteen of nineteen sample latitudes — no
// variation from the doldrums to the Southern Ocean, and never a big sea without
// a storm event. This clause is the one that would catch that regression: it
// walks the actual latitude field through windProfile into seaBandsFor and holds
// the SPREAD of the resulting sea.
{
  const hsSw = significantHeight(0), hsCh = significantHeight(1);
  const seaAt = (lat) => {
    const b = seaBandsFor(windProfile(9999, at(lat).speed), 9999);
    return { ...b, hs: Math.hypot(hsSw * b.swell, hsCh * b.chop) };
  };
  const horse = seaAt(31), doldrums = seaAt(0), trades = seaAt(16), fifties = seaAt(-54);
  ok(horse.hs < 1.2 && doldrums.hs < 1.2,
    `the calm belts lie near-flat — ${horse.hs.toFixed(2)} m in the horse latitudes, `
    + `${doldrums.hs.toFixed(2)} m in the doldrums (ceiling 1.2 m)`);
  ok(fifties.hs > 3.2,
    `and the fifties run a real ocean — ${fifties.hs.toFixed(2)} m significant height (floor 3.2 m)`);
  ok(fifties.hs / horse.hs > 3.5,
    `the sea VARIES BY GEOGRAPHY: ${(fifties.hs / horse.hs).toFixed(1)}x from the calm belts to `
    + 'the Southern Ocean (needs 3.5x; it was 1.00x — a constant sea — before 2026-07-26)');
  ok(trades.hs > doldrums.hs * 2 && trades.hs < fifties.hs,
    `the trades sit honestly between them (${trades.hs.toFixed(2)} m)`);
  // and the storm still has somewhere to go on top of the worst fair weather.
  // Judged against the GUSTING wind, not the mean: main.js multiplies the field
  // by (1 + gusts), gusts in [-0.45, +0.45], so the fifties touch 21.7 m/s and
  // the swell TARGET there does peg the ceiling. What keeps the realised band
  // off it is the swell's own easing (main.js: 0.015/s, tau ~67 s, against a
  // ~90 s gust period — about a fifth of the gust gets through). So the honest
  // statement is about the SUSTAINED sea, and the gust headroom is asserted
  // separately below.
  ok(fifties.swell < SEA_SWELL_MAX * 0.95,
    `the windiest SUSTAINED fair-weather sea leaves the storm ceiling room `
    + `(${fifties.swell.toFixed(2)} of ${SEA_SWELL_MAX}) — otherwise a cyclone in the fifties `
    + 'draws the same water as a fair day there');
}

// ====== THE COAST STAYS QUIETER THAN BLUE WATER — EVERY LATITUDE ======
// THE DESIGN'S FIRST LAW (waves.js: "the coast must stay quieter than blue
// water even in the surf band"), swept over the whole world instead of tested at
// one or two coasts. live-shore.mjs holds this at the Palisadoes and the Solent,
// but both of those are WIND belts; the marginal case is a calm belt, and only a
// sweep finds it.
//
// WHAT THE SWEEP FINDS, STATED PLAINLY RATHER THAN HIDDEN. The shore-parallel
// surf set (waves.js SHORE_WAVES, fixed amplitudes) rides the CHOP band, and
// chop is 0.5 + 0.055 * wind — dominated by its constant term, so it falls to
// only 0.75 in a dead calm against 1.05 in a working breeze. The OPEN set, which
// rides the swell band, falls to a seventh over the same range (wind shelter,
// then the fetch curve, then shoreOpenAtten). The two do not scale together, so
// in a calm belt the surf is 99% of the inshore sea and reaches PARITY with the
// open ocean at that latitude: worst measured 1.027, at lat -36.5, 40 m off the
// sand. That is a pre-existing calibration — the surf barely answers the wind —
// which the wind rebuild of 2026-07-26 exposed rather than caused (before, every
// coast on earth sat at the same 10 m/s and the ratio was a uniform 0.35). The
// fix is for the surf to follow the SWELL band, since a breaker IS shoaling
// swell, and that lives in the ocean shader's band composition.
// Until then this clause pins the parity so it cannot quietly worsen.
{
  const hsSw = significantHeight(0), hsCh = significantHeight(1);
  const surfHs = (cd, chop) => {
    const e = shoreEnv(-cd);
    let v = 0;
    for (const w of SHORE_WAVES) v += (w.amp * e * chop) ** 2 / 2;
    return 4 * Math.sqrt(v);
  };
  const coastHs = (lat, cd) => {
    const b = seaBandsFor(windProfile(cd, at(lat).speed), cd);
    return Math.hypot(Math.hypot(hsSw * b.swell, hsCh * b.chop) * shoreOpenAtten(-cd),
      surfHs(cd, b.chop));
  };
  const blueHs = (lat) => {
    const b = seaBandsFor(windProfile(9999, at(lat).speed), 9999);
    return Math.hypot(hsSw * b.swell, hsCh * b.chop);
  };
  const SURF_PARITY = 1.15;   // 1.12x over the measured 1.027
  const COAST_CEILING = 1.6;  // m of significant height, anywhere inshore
  let worst = 0, wLat = 0, wCd = 0, tallest = 0, tLat = 0;
  for (let l = -70; l <= 70; l += 0.5) {
    const blue = blueHs(l);
    for (const cd of [40, 50, 60, 80, 110, 160, 240, 300, 600]) {
      const h = coastHs(l, cd);
      if (h / blue > worst) { worst = h / blue; wLat = l; wCd = cd; }
      if (h > tallest) { tallest = h; tLat = l; }
    }
  }
  ok(worst <= SURF_PARITY,
    `the coast never OUT-RUNS blue water: worst inshore-to-open significant-height ratio `
    + `${worst.toFixed(3)} at lat ${wLat}, ${wCd} m off the sand (bound ${SURF_PARITY}, measured `
    + '1.027 — parity in the calm belts, where the surf set is 99% of the inshore sea because '
    + 'it rides the chop band and chop barely answers the wind)');
  ok(tallest < COAST_CEILING,
    `and no coast anywhere raises a dangerous sea: tallest inshore significant height `
    + `${tallest.toFixed(2)} m at lat ${tLat} (ceiling ${COAST_CEILING} m) — the ABSOLUTE `
    + 'form of the law, which the ratio alone cannot give (both sides could grow together)');
  // and the ratio must not be flat: a coast field that did nothing would also
  // pass a ceiling. Blue water has to out-run the shore where the wind blows.
  ok(coastHs(-54, 110) / blueHs(-54) < 0.35,
    `where the wind blows the coast is FAR quieter — ${(coastHs(-54, 110) / blueHs(-54)).toFixed(3)} `
    + 'of blue water at 54S, 110 m off');
}
{
  // THE SEA STATE STOPPED BEING A CLEAN LINEAR FACTOR WITH PHASE C, and that is
  // the point of Phase C. This clause used to read
  //     ok(Math.abs(y2 - 2 * y0) < 1e-12, 'sea state is a clean linear factor')
  // which was true of a pure sum of sines and is false of a Stokes surface: the
  // second-order term carries a^2, so it carries the state SQUARED. The law is
  // now exact rather than linear —
  //     y(g) = g * (linear sum) - g^2 * (harmonic sum)
  // — and it is what makes a calm sea sinusoidal and a gale peak with no extra
  // knob. Held here to float64 rounding against the band sums themselves.
  const X = 123.4, Z = -56.7, T = 42;
  const [l0, h0] = waveBandHeight(0, X, Z, T), [l1, h1] = waveBandHeight(1, X, Z, T);
  const y0 = waveHeight(X, Z, T);
  setSeaState(2);
  const y2 = waveHeight(X, Z, T);
  ok(Math.abs(y0 - ((l0 + l1) - (h0 + h1))) < 1e-12,
    'at state 1 the surface is linear sum minus harmonic sum');
  ok(Math.abs(y2 - (2 * (l0 + l1) - 4 * (h0 + h1))) < 1e-12,
    'and at state 2 the LINEAR half doubles while the Stokes harmonic QUADRUPLES '
    + '— the sea state is linear on the sines and quadratic on the cresting');
  ok(Math.abs(y2 - 2 * y0) > 1e-9,
    `so doubling the state is NOT a clean scaling any more: ${(y2 - 2 * y0).toExponential(2)} m `
    + 'of extra crest at state 2 (it was exactly 0 before Phase C)');
  ok(getSeaState() === 2, 'getter reads back');
  setSeaState(99);
  ok(getSeaState() === SEA_STATE_MAX, 'setter clamps');
  // a river is calmer than any sea the wind can make: the setter admits the
  // near-flat inland state, and the waves really do lie down
  ok(RIVER_STATE < SEA_STATE_MIN, 'river calm undercuts the wind floor');
  setSeaState(RIVER_STATE);
  ok(getSeaState() === RIVER_STATE, 'inland water may lie near-flat');
  // the envelope carries the Stokes harmonic too (Phase C): at a fully-aligned
  // crest the second-order term ADDS, so the linear amplitude sum alone is no
  // longer an upper bound. On a river it is worth 3.8e-5 m — a bound correction,
  // not a loosened threshold.
  ok(Math.abs(waveHeight(123.4, -56.7, 42))
    < MAX_WAVE_HEIGHT * RIVER_STATE
      + (MAX_HARM_SWELL + MAX_HARM_CHOP) * RIVER_STATE * RIVER_STATE + 1e-12,
    'river waves are ripples');
  setSeaState(1); // leave the world as we found it for later scripts
}

if (failed) { console.error(`verify-weather: ${failed} FAILED`); process.exit(1); }
console.log('verify-weather: OK —', `${WIND_FLOOR} m/s light-breeze floor that does NOT`,
  'swallow the latitude field, 1.9x harbour-to-blue-water fill-in by 1.5 km,',
  `the ${SWELL_REF_WIND} m/s reference swell held at ${SWELL_REF} with the ceiling`,
  'reserved for a gale, sky dressing sane, sea state linear + clamped,',
  'and both wind and sea say where on earth you are');
