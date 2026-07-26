// THE v2 SHOWCASE — a reproducible portfolio of stills (and three clips) of
// everything the sea rebuild of 2026-07-26 shipped: sea v2's long rollers,
// Stokes cresting and its break field, the wind readable off the water, the
// real latitude wind world, the sun's and moon's glitter roads, the ungrated
// water, the whales' sounding cycle, and the decorated coasts.
//
// THE ONE LESSON THIS SCRIPT IS BUILT AROUND. The landing page's water looks
// better than the game's while running the SAME shader, because the title scene
// is STAGED: src/titlescene.js pins TITLE_FRAC = 0.695 ("the sun low and gold")
// and SEA_STATE = 1.9 on both bands behind a composed low camera. Conditions and
// camera are everything. So every shot below names its hour, its water and its
// lens, and nothing is shot from the default chase camera at noon.
//
// WHAT IS STAGED AND WHAT IS NOT, because a publicity shot that lies is worse
// than no shot:
//   - THE WIND IS NEVER FAKED. Every site's wind is whatever wind.js gives that
//     latitude (doldrums 4.5, trades 9.1, forties 12, fifties 15 m/s), read back
//     and printed into the contact sheet. Choosing where to sail is staging;
//     forcing the anemometer would be lying, and the shots that need a gale go
//     to the Southern Ocean for it.
//   - THE SEA STATE IS PRE-LOADED, NOT INVENTED. main.js eases the swell band at
//     0.015/s (tau ~67 s: the ocean's memory), so a freshly teleported ship is
//     still riding the sea of wherever she came from. Each shot pre-loads
//     seaBands to the steady state the game itself is easing toward at that
//     place — the sea a ship that had been there twenty minutes would ride.
//     live-wind.mjs uses the same idiom for the same reason.
//   - THE CLOCK IS PINNED, not advanced. dayStart is re-aimed every frame so the
//     sun or moon stands exactly where the shot asked, instead of creeping
//     through a 1800 s day while the terrain streams in.
//   - The wave AXIS is snapped once on arrival (the game would take up to 100 s
//     to slew there at its own rate cap) and then left alone.
//
//   npm run dev                            (terminal 1)
//   node scripts/capture-showcase.mjs      (terminal 2)
//
// Options: --url=http://localhost:5173  --out=media/showcase  --only=03,07,whale
//          --width=2560 --height=1440  --noclips  --clipsonly
// Output:  media/showcase/*.png, *.webm, CONTACT-SHEET.md, showcase.json
// media/ is gitignored: the script and the sheet are the committed artefacts.

import puppeteer from 'puppeteer';
import { mkdirSync, readdirSync, statSync, renameSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const arg = (k, d) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};
const URL = arg('url', 'http://localhost:5173');
const OUT = resolve(arg('out', 'media/showcase'));
const VIEW = { width: +arg('width', 2560), height: +arg('height', 1440), deviceScaleFactor: 1 };
const ONLY = arg('only', '').split(',').map((s) => s.trim()).filter(Boolean);
const NOCLIPS = process.argv.includes('--noclips');
const CLIPSONLY = process.argv.includes('--clipsonly');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// THE SHOT LIST
// ---------------------------------------------------------------------------
// sky:   { frac } a fraction of the game day (0.745 = the title scene's gold),
//        { sunAlt } searches the MORNING arc for that raw solarState altitude
//        (0.10 ~ 5 deg, 0.23 ~ 13 deg, 0.78 ~ 50 deg — live-glitter's ladder),
//        { moon: alt } searches the whole 12-day moon-month for a FULL moon at
//        that altitude over a sea the sun has left (nightness > 0.99).
// sea:   'place' pre-loads the steady state for that water; a pair forces it.
// cam:   aim is the bearing the LENS LOOKS ALONG: 'sun'/'moon' (at the source),
//        'upwind' (into the weather, crests marching at the lens), 'downwind',
//        'shore' (at the land). `off` turns that many radians off it.
//        height is metres of eye above mean water — main.js lifts the lens to
//        clear the local crest, so 2 m genuinely rides the sea.
const SHOTS = [
  // ---- SEA v2: 28 components, Hs 1.93 m, rollers ~124 m ------------------
  {
    key: '01-sea-v2-rollers-golden-hour',
    title: 'Sea v2 — the long rollers at golden hour',
    where: 'the roaring forties, 45S 0E', lat: -45, lon: 0,
    demo: 'Sea v2: the 124 m rollers and the significant height a 12 m/s westerly builds.',
    sky: { frac: 0.715 }, weather: { state: 'clear', gloom: 0 }, sea: 'place',
    ship: { speed: 6.5, trim: 0.75, reach: 2.1 },
    // the low sun RAKES across the view axis rather than standing behind the
    // subject: cross-light is what models a wave into a shape
    cam: { aim: 'sun', off: 1.45, dist: 46, height: 16, side: 12, lookAhead: 60,
      lookY: 2, fov: 52 },
    settle: 7,
  },
  {
    key: '02-sea-v2-pure-seascape-swell',
    title: 'Sea v2 — pure seascape, the swell running away to the horizon',
    where: 'the roaring forties, 45S 0E', lat: -45, lon: 0,
    demo: 'Sea v2 alone: no ship, no wake — the length and the ordering of the rollers, '
      + 'from an eye three metres off the water.',
    sky: { frac: 0.30 }, weather: { state: 'clear', gloom: 0 }, sea: 'place',
    bare: true, ship: { hidden: true, speed: 0 },
    // the gaze is near LEVEL and the eye 4.5 m up: a lens tilted down into the
    // near water fills two thirds of the frame with foam three metres away, which
    // is the one range the break mask's cells are too coarse for
    cam: { aim: 'sun', off: 2.15, dist: 9, height: 5.5, lookAhead: 420, lookY: 5.0, fov: 50 },
    settle: 7,
  },

  // ---- CRESTING: Stokes-sharpened tops, the break field on downwind faces --
  {
    key: '03-crest-gale-downwind-breaking',
    title: 'Cresting — whitecaps breaking on the downwind faces of a gale sea',
    where: 'the screaming fifties, 54S 90E', lat: -54, lon: 90,
    demo: 'The break field: coverage climbs to its storm figure and the white water '
      + 'sits on the DOWNWIND faces, not on the wave tops.',
    sky: { frac: 0.665 }, weather: { state: 'clear', gloom: 0 }, sea: 'place',
    ship: { speed: 5, trim: 0.6, reach: 2.3 },
    cam: { aim: 'upwind', off: 1.05, dist: 62, height: 24, lookAhead: 130, lookY: 0, fov: 58 },
    settle: 8,
  },
  {
    key: '04-crest-sharp-tops-flat-troughs',
    title: 'Cresting — Stokes-sharpened tops against the sky from sea level',
    where: 'the screaming fifties, 54S 90E', lat: -54, lon: 90,
    demo: 'The Stokes second harmonic: sharp crests, flat troughs. Shot from the '
      + 'trough so the tops read as edges against a low sun.',
    sky: { sunAlt: 0.16 }, weather: { state: 'clear', gloom: 0 }, sea: 'place',
    bare: true, ship: { hidden: true, speed: 0 },
    // BACK-LIT, from the trough: a nine-degree sun behind the crests turns each
    // sharpened top into an edge and each flat trough into shadow
    cam: { aim: 'sun', off: 0.2, dist: 6, height: 2.6, lookAhead: 70, lookY: 3.0, fov: 50 },
    settle: 7,
  },

  // ---- THE WIND, READABLE OFF THE WATER --------------------------------------
  {
    key: '05-wind-readable-crest-lines',
    title: 'The wind read off the water — crest lines lying across it, all breaking one way',
    where: 'the screaming fifties, 54S 90E', lat: -54, lon: 90,
    demo: 'THE HERO SHOT for wind readability: the crest lines lie across the wind '
      + '(measured 0.1-5.9 deg out by live-crest) and the breaking is biased '
      + 'downwind, so the bearing is legible from the water alone.',
    sky: { frac: 0.635 }, weather: { state: 'clear', gloom: 0 }, sea: 'place',
    bare: true, ship: { hidden: true, speed: 0 },
    cam: { aim: 'upwind', off: 0.55, dist: 40, height: 42, lookAhead: 210, lookY: 0, fov: 58 },
    settle: 8,
  },

  // ---- A REAL WIND WORLD: the same lens, two belts --------------------------
  {
    key: '06-wind-world-doldrums-glassy',
    title: 'The wind world — the doldrums, glassy under the floor breeze',
    where: 'the ITCZ, 1N 25W', lat: 1.0, lon: -25.0,
    demo: 'One half of the wind-world pair: the calm belt at the 4.5 m/s floor. '
      + 'Same lens and hour as 07 — the only difference is the latitude.',
    sky: { frac: 0.72 }, weather: { state: 'clear', gloom: 0 }, sea: 'place',
    ship: { speed: 2.2, trim: 0.9, reach: 2.1 },
    cam: { aim: 'upwind', off: 0.9, dist: 34, height: 9, lookAhead: 70, lookY: 3 },
    settle: 7,
  },
  {
    key: '07-wind-world-fifties-westerly',
    title: 'The wind world — the screaming fifties under the same lens',
    where: 'the Southern Ocean, 54S 90E', lat: -54, lon: 90,
    demo: 'The other half: 15 m/s of westerly and the sea that goes with it, from '
      + 'the identical camera and hour as 06. The pair IS the claim.',
    sky: { frac: 0.72 }, weather: { state: 'clear', gloom: 0 }, sea: 'place',
    ship: { speed: 7.5, trim: 0.5, reach: 2.1 },
    cam: { aim: 'upwind', off: 0.9, dist: 34, height: 9, lookAhead: 70, lookY: 3 },
    settle: 8,
  },

  // ---- THE GLITTER ROADS (a LOW-SUN phenomenon — never shot at noon) -------
  {
    key: '08-glitter-sun-road-low-sun',
    title: "The sun's glitter road — a five-degree sun down the water",
    where: 'the trades, mid-Atlantic 16N 40W', lat: 16, lon: -40,
    demo: "Cox & Munk roughness: the sun's corridor from a low lens, the case the "
      + 'gate measures at 1.54x the off-source sea.',
    sky: { sunAlt: 0.10 }, weather: { state: 'clear', gloom: 0 }, sea: 'place',
    ship: { speed: 6, trim: 0.7, reach: 2.6 },
    cam: { aim: 'sun', dist: 26, height: 2.8, side: 9, lookAhead: 40, lookY: 3 },
    settle: 7,
  },
  {
    key: '09-glitter-golden-hour-crest-in-the-road',
    title: "Golden hour — a crest between the lens and the sun's road",
    where: 'the roaring forties, 45S 0E', lat: -45, lon: 0,
    demo: 'The composition the corridor needs: a wave crest across the road, from '
      + 'an eye a couple of metres off the water. Golden hour, gate figure 1.85x.',
    sky: { sunAlt: 0.23 }, weather: { state: 'clear', gloom: 0 }, sea: 'place',
    bare: true, ship: { hidden: true, speed: 0 },
    cam: { aim: 'sun', dist: 7, height: 2.1, lookAhead: 160, lookY: 2.4 },
    settle: 7,
  },
  {
    key: '10-glitter-moon-road-full-moon',
    title: "The moon's corridor over dark water — the biggest measured gain",
    where: 'the trades, mid-Atlantic 16N 40W', lat: 16, lon: -40,
    demo: 'The single largest measured improvement of the light work (sunward ratio '
      + '2.72 -> 3.50): a full moon at ~12 deg laying a road over a dark sea.',
    sky: { moon: 0.22 }, weather: { state: 'clear', gloom: 0 }, sea: 'place',
    ship: { speed: 5.5, trim: 0.7, reach: 2.6 },
    cam: { aim: 'moon', dist: 24, height: 3.0, side: 8, lookAhead: 40, lookY: 3.5 },
    settle: 7,
  },
  {
    key: '11-glitter-moonlit-seascape',
    title: 'Moonlight alone — the corridor with nothing else in frame',
    where: 'the roaring forties, 45S 0E', lat: -45, lon: 0,
    demo: "The moon's road down a big sea, pure seascape: the corridor's reach and "
      + 'how it breaks over the rollers.',
    sky: { moon: 0.22 }, weather: { state: 'clear', gloom: 0 }, sea: 'place',
    bare: true, ship: { hidden: true, speed: 0 },
    cam: { aim: 'moon', dist: 7, height: 2.4, lookAhead: 200, lookY: 2.0 },
    settle: 7,
  },

  // ---- THE GRATING IS GONE -------------------------------------------------
  {
    key: '12-clean-water-no-grating',
    title: 'The water hash, clean — a grazing lens 33 km from the world origin',
    where: 'the Indian Ocean, 4.6S 75E', lat: -4.6, lon: 75.0,
    demo: 'The east-west grating is gone: at play distances from the origin a 32-bit '
      + "fract hash used to collapse into world-axis stripes. This is the grazing "
      + 'view that showed them, under a high sun which is where they were worst. '
      + 'INSPECT THIS SHOT: any fine parallel filaments are the artifact returning.',
    sky: { frac: 0.44 }, weather: { state: 'clear', gloom: 0 }, sea: 'place',
    bare: true, ship: { hidden: true, speed: 0 },
    cam: { aim: 'upwind', off: 0.7, dist: 5, height: 2.4, lookAhead: 260, lookY: 2.6, fov: 62 },
    settle: 7,
  },

  // ---- THE WHALES ---------------------------------------------------------
  {
    key: '13-whale-sounding-flukes-clear',
    title: 'The sounding — flukes five metres clear of the water',
    where: 'the mid-Atlantic whaling grounds, 30N 42W', lat: 30, lon: -42,
    demo: 'The money shot of the five-act sounding cycle: the arch, the bow going '
      + 'down, and a bull sperm whale’s flukes standing 5-6 m out of the sea.',
    sky: { frac: 0.70 }, weather: { state: 'clear', gloom: 0 }, sea: 'place',
    // a LOW lens: the tail stands about six metres out of the water, so an eye at
    // four metres puts it against the sky instead of against the sea. The sloop
    // lies well off to one side of the view axis or the tail hides her.
    whale: { phase: 0.626, view: 'ahead', camDist: 30, camHeight: 4.0, camSide: 4,
      lookY: 4.0, shipOff: 52, shipSide: -34, fov: 46 },
    settle: 5,
  },
  {
    key: '14-whale-pod-blowing',
    title: 'A pod at the surface, the spouts standing',
    where: 'the mid-Atlantic whaling grounds, 30N 42W', lat: 30, lon: -42,
    demo: 'Act two of the cycle: three breaths with the spout, a pod on its own '
      + 'world course with a calf at her mother’s flank.',
    // 0.155 of the cycle is the SECOND breath's jet at its peak: whales.js runs
    // three breaths across the blow phase and each jet stands for about a second
    // of a 160 s cycle, so the phase has to be aimed, not guessed. (0.145 — the
    // figure the older probe used — lands on the spent plume, jet 0.011.)
    sky: { frac: 0.315 }, weather: { state: 'clear', gloom: 0 }, sea: 'place',
    whale: { phase: 0.155, view: 'quarter', camDist: 30, camHeight: 3.6, camSide: 3,
      lookY: 2.6, shipOff: 58, shipSide: -30, fov: 42 },
    settle: 5,
  },
  {
    key: '15-sloop-in-the-fifties-from-the-trough',
    title: 'The sloop in the screaming fifties, seen from the trough',
    where: 'the Southern Ocean, 54S 90E', lat: -54, lon: 90,
    demo: 'Everything at once, from where a sailor would see it: a nine-metre hull '
      + 'in a four-metre significant sea, a crest between the lens and her, '
      + 'whitecaps breaking downwind past her, and the light low on the water. The '
      + 'other gale frames are shot from aloft; this is the deck-height one.',
    sky: { frac: 0.70 }, weather: { state: 'clear', gloom: 0 }, sea: 'place',
    ship: { speed: 7.5, trim: 0.5, reach: 2.3 },
    cam: { aim: 'upwind', off: 1.9, dist: 19, height: 2.4, side: 5, lookAhead: 8,
      lookY: 4.5, fov: 46 },
    settle: 8,
  },

  // ---- LAND: THE DECORATED COASTS AND THEIR FLORA -------------------------
  {
    key: '16-shore-palisadoes-palms',
    title: 'The Palisadoes off Port Royal — palms on the spit at golden hour',
    where: 'Jamaica, 17.94N 76.88W', lat: 17.94, lon: -76.88,
    demo: 'Land vegetation: shoredecor/flora growing the tropical fringe to its own '
      + 'latitude, with the shore-aware sea lying quiet inside the reef.',
    sky: { frontLight: [14, 42] }, weather: { state: 'clear', gloom: 0 }, sea: 'place',
    shore: [-130, -50], ship: { speed: 1.6, trim: 0.8, reach: 2.1 },
    cam: { aim: 'shore', off: 0.1, dist: 58, height: 8, side: 14, lookAhead: 120,
      lookY: 6, fov: 34 },
    settle: 12,
  },
  {
    key: '17-shore-sognefjord-conifers',
    title: 'The mouth of Sognefjord — northern conifers on the rock',
    where: 'Norway, 61.1N 5.02E', lat: 61.1, lon: 5.02,
    demo: 'The same fringe, a different latitude: conifers and no palms, against '
      + 'the smoothed shoreline terrain.',
    sky: { frontLight: [10, 30] }, weather: { state: 'clear', gloom: 0 }, sea: 'place',
    shore: [-160, -60], ship: { speed: 1.4, trim: 0.8, reach: 2.1 },
    cam: { aim: 'shore', off: 0.12, dist: 62, height: 11, side: 16, lookAhead: 170,
      lookY: 30, fov: 44 },
    settle: 13,
  },
  {
    key: '18-shore-amazon-river-corridor',
    title: 'The Amazon at Manaus — the river corridor, jungle both banks',
    where: 'Brazil, 3.155S 60W', lat: -3.155, lon: -60.0,
    demo: 'The river corridor: deep jungle on both banks, terrain built for the '
      + 'corridor and culled everywhere it could not be seen, and a river sea.',
    sky: { frontLight: [14, 34] }, weather: { state: 'clear', gloom: 0 }, sea: 'place',
    river: true, ship: { speed: 2.0, trim: 0.7, reach: 2.1 },
    cam: { aim: 'shore', off: 0.55, dist: 44, height: 9, side: 12, lookAhead: 130,
      lookY: 10, fov: 44 },
    settle: 14,
  },
  {
    key: '19-shore-beachy-head-chalk',
    title: 'Beachy Head — the Seven Sisters over an English sea',
    where: 'England, 50.72N 0.12E', lat: 50.72, lon: 0.12,
    demo: 'Chalk cliffs and oak country: the fringe again, and the coast-aware sea '
      + 'calming under the land.',
    sky: { frontLight: [12, 38] }, weather: { state: 'clear', gloom: 0 }, sea: 'place',
    shore: [-150, -60], ship: { speed: 1.8, trim: 0.8, reach: 2.1 },
    cam: { aim: 'shore', off: 0.12, dist: 56, height: 10, side: 15, lookAhead: 150,
      lookY: 22, fov: 38 },
    settle: 12,
  },
];

// ---------------------------------------------------------------------------
// THE CLIPS — only where motion carries something a still cannot
// ---------------------------------------------------------------------------
// Each runs through showreel.js's own recorder rig (saltstead.showreel with a
// custom one-beat reel): body.reel for a bare canvas, a forced 1920x1080
// drawing buffer, MediaRecorder on the canvas's own captureStream PAUSED over
// the warp and settle, and the .webm downloaded when the beat ends.
const CLIPS = [
  {
    key: 'clip-whale-sounding',
    title: 'The sounding cycle — cruise, arch, flukes, gone',
    demo: 'Motion-only by construction: a still cannot show a 30 s behaviour. The '
      + 'awash cruise rolls on the swell, she rounds her back, the flukes come '
      + 'clear, and the sea closes over an animal that is then absent for 50 s.',
    sec: 27, settle: 5, where: 'the mid-Atlantic whaling grounds, 30N 42W',
  },
  {
    key: 'clip-gale-from-deck-height',
    title: 'A gale sea from deck height, the sloop lifted and dropped through it',
    demo: 'Motion-only: a still cannot show a nine-metre hull being lifted and '
      + 'dropped through a four-metre significant sea, or whitecaps forming on the '
      + 'downwind faces and dying again as each crest passes. This replaced a '
      + 'wind-veer clip that was recorded and CUT — see the note in this sheet.',
    sec: 22, settle: 5, where: 'the screaming fifties, 54S 90E',
  },
  {
    key: 'clip-golden-hour-rollers',
    title: 'A twelve-metre westerly at golden hour, from two metres above it',
    demo: 'Motion-only: the rollers lift and drop the lens, and the glitter road '
      + 'breaks apart and re-forms over each crest — which is the whole point of '
      + 'a Cox & Munk corridor and is invisible in a still.',
    sec: 22, settle: 5, where: 'the roaring forties, 45S 0E',
  },
];

// ---------------------------------------------------------------------------
// WHAT THE SHOOT FOUND — the honest half of the deliverable. Every item here was
// seen in the frames this script produces, and each says how it was attributed.
// A publicity set that hides what it saw is worth less than one that reports it.
const FINDINGS = [
  ['The east-west grating really is gone.',
    'The diagnostic frame (`12-clean-water-no-grating.png`) is a grazing lens 1.6 m '
    + 'above the water 33 km from the world origin under a 67 degree sun — the exact '
    + 'geometry the artifact lived in. Upscaled 2x, the 30-300 m band is isotropic: '
    + 'no parallel filaments anywhere in the set.'],
  ['DEFECT — the near-field whitecap foam grows a repeating chain of dark elliptical '
    + 'holes within about ten metres of the lens.',
    'Visible in every low-camera gale frame (02, 04, 09, 12) as a soft white mass with '
    + 'a regularly spaced line of dark ellipses through it. ATTRIBUTED: forcing '
    + '`uDetailAmp = 0` on the identical frame removes the holes and leaves smooth '
    + 'white streaks, so it is the detail block\'s churn-rag term magnifying past its '
    + 'useful scale. It is worst exactly where the player\'s own eye-level camera sits '
    + 'in a big sea, which makes it the most publicity-relevant blemish in the set.'],
  ['DEFECT (cosmetic) — a submerged whale is drawn as a flat slab lying ON the water '
    + 'rather than under it.',
    'Seen in 14 and in the sounding clip: an animal a metre or two down reads as a '
    + 'hard-edged grey shape on the surface with no refraction or depth fade. It sells '
    + 'the scale (which is why 14 works) but it does not read as an animal underwater.'],
  ['HAZARD — the gulls and the albatross are stationed on the SHIP, so they cross a '
    + 'low lens.',
    'wildlifelayer.js circles the gulls 7-19 m off the masthead and the albatross at a '
    + '42 m radius, 9 m up. A three-metre bird duly landed across the bottom corners '
    + 'of the first pure-seascape frame. This script detaches them for the bare shots; '
    + 'a player with the camera low and the wheel scrolled in gets them anyway.'],
  ['LIMIT — above about 45 m of eye height the ocean mesh\'s own edge comes into '
    + 'frame.',
    'The mesh is 720 m across and the fog closes at 620. A 75 m plan view (tried for '
    + 'the wind-veer clip) put a hard polygonal boundary of bare sky across the top of '
    + 'every frame. In ordinary play the camera cannot get there; a warden\'s photo '
    + 'camera can, and so can a showreel beat.'],
  ['CUT — a wind-veer clip was recorded twice and abandoned.',
    'The plan was to show the wind-sea\'s fan slewing downwind at waves.js\'s own '
    + 'AXIS_EASE rates (windTau 55 s, cap 0.030 rad/s) while the swell held its old '
    + 'line at 0.004, i.e. a crossed sea building on camera. It is genuinely in the '
    + 'height field, but from any camera that keeps the mesh edge out of frame the '
    + 'change in crest-line bearing over a minute is not legible — sampled frames at '
    + '2, 22, 42 and 60 s are hard to tell apart. Rather than ship a clip that '
    + 'oversells, the slot went to `clip-gale-from-deck-height`. If the veer is worth '
    + 'publicising it needs an on-screen wind arrow or a split screen, not a longer '
    + 'take.'],
  ['NOTE — the wind-world pair (06 and 07) is framed WIND-RELATIVE, not sun-relative.',
    'Both use the identical lens, eye height and hour; the aim is a fixed angle off '
    + 'the wind, and the two belts blow from different bearings, so the sun happens to '
    + 'stand in frame at 54S and out of it at 1N. The sea and the whitecaps are the '
    + 'comparison; the sky is not.'],
];

const wanted = (key) => !ONLY.length || ONLY.some((o) => key.includes(o));

const browser = await puppeteer.launch({
  headless: true,
  args: [`--window-size=${VIEW.width},${VIEW.height}`, '--enable-gpu',
    '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  defaultViewport: VIEW,
});
const rows = [];
const problems = [];
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('error', (e) => pageErrors.push(`PAGE CRASH: ${e}`));
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && !t.includes('404')) pageErrors.push(t);
    if (t.includes('[showreel]')) console.log('    page:', t);
  });
  const cdp = await page.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior',
    { behavior: 'allow', downloadPath: OUT, eventsEnabled: true });

  // ---- board as a guest on a fresh voyage under the black flag ----
  console.log(`loading ${URL} at ${VIEW.width}x${VIEW.height}`);
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.type('#invitename', 'Showcase');
  await page.click('#btnguest');
  await page.waitForSelector('#btnnew', { visible: true });
  await page.click('#btnnew');
  await page.waitForSelector('#btnpirate', { visible: true });
  await page.click('#btnpirate');
  await page.waitForFunction('!!window.saltstead', { timeout: 30000 });
  await sleep(6000);
  await page.evaluate(() => document.querySelector('#briefingclose')?.click());
  // A BARE CANVAS. body.reel is the showreel's own rule (index.html) and takes
  // the HUD, the minimap, the port panel and the touch UI; every remaining
  // overlay is a sibling of #app, which holds the renderer's canvas and nothing
  // else, so one rule finishes the job for the help button, the toasts and the
  // badges too.
  await page.addStyleTag({ content: 'body > *:not(#app) { display: none !important; }' });
  await page.evaluate(() => document.body.classList.add('reel'));

  // ---- THE RIG ----
  // Installed once. It wraps Game.frame (setAnimationLoop calls this.frame()
  // through a closure, so the patch takes) and re-asserts the shot's conditions
  // at the END of every frame: the clock, the sea state, the lens, and whether
  // the hull is in the picture. Everything it touches is a value main.js
  // recomputes from scratch each frame anyway, so nothing accumulates.
  const gfx = await page.evaluate(async () => {
    const g = window.saltstead;
    const Wv = await import('/src/waves.js');
    const E = await import('/src/earth.js');
    const S = await import('/src/skymath.js');
    const Wd = await import('/src/wind.js');
    const Wx = await import('/src/weather.js');
    const Wh = await import('/src/whales.js');
    window.__mod = { Wv, E, S, Wd, Wx, Wh };
    g.applyQuality('fine');
    g.gfxWatch.manual = true;   // the screenshot load must not demote the tier
    g.weatherLock = true;       // the shot owns the sky, not Open-Meteo
    g.saveClock = 1e9;          // no autosave writes a teleported voyage
    g.cine = null;
    window.__cfg = { off: false, skyT: null, sea: null, cam: null, hidden: false };

    const orig = g.frame.bind(g);
    g.frame = () => {
      orig();
      const c = window.__cfg;
      if (c.off) return;
      // THE CLOCK, pinned: dayStart is an offset onto a running t, so without
      // this the sun creeps through the shot while the terrain streams in.
      if (c.skyT !== null) g.dayStart = c.skyT - g.t;
      // THE SEA STATE, pinned to the place's own steady state (see the header).
      if (c.sea) {
        g.seaBands.swell = c.sea.swell; g.seaBands.chop = c.sea.chop;
        Wv.setSeaBands(c.sea.swell, c.sea.chop);
        g.ocean.uniforms.uSwellL.value = c.sea.swell;
        g.ocean.uniforms.uSwellS.value = c.sea.chop;
      }
      // THE LENS: rebuilt each frame from the live anchor, so a ship under way
      // — or a whale on her own course — keeps her station in the frame exactly
      // as the showreel's orbit does.
      if (c.cam) {
        const a = c.cam;
        let ax = a.fixed ? a.fixed.x : g.ship.x;
        let az = a.fixed ? a.fixed.z : g.ship.z;
        if (a.pod && window.__pod) {
          const p = Wh.podPose(window.__pod, g.t);
          ax = p.x; az = p.z;
          a.bearing = p.heading + a.podView;   // she is framed from her own quarter
        }
        // THE LENS ITSELF is part of the staging: a coast wants a longer one than
        // the 62 degree gameplay lens, and the ocean's glitter model has to be
        // re-told whenever it changes or the lobe is sized for the wrong pixel.
        if (a.fov && Math.abs(g.camera.fov - a.fov) > 1e-3) {
          g.camera.fov = a.fov;
          g.camera.updateProjectionMatrix();
          g.ocean.setLens(a.fov, g.renderer.domElement.height);
        }
        const sx = Math.sin(a.bearing), sz = Math.cos(a.bearing);  // the look axis
        const rx = Math.cos(a.bearing), rz = -Math.sin(a.bearing); // starboard of it
        g.photoCam = {
          x: ax - sx * a.dist + rx * (a.side || 0), y: a.height,
          z: az - sz * a.dist + rz * (a.side || 0),
          lookAt: { x: ax + sx * (a.lookAhead || 0), y: a.lookY || 2.2,
            z: az + sz * (a.lookAhead || 0) },
        };
      }
      // the hull out of the picture for the pure seascapes — and her foam with
      // her, which is a separate sprite layer with its own light drive
      if (g.shipGroup) g.shipGroup.visible = !c.hidden;
      if (g.captain && g.captain.group) g.captain.group.visible = !c.hidden;
      if (g.foam) for (const k of ['wakeMesh', 'fleckMesh']) {
        if (g.foam[k]) g.foam[k].visible = !c.hidden;
      }
      // BARE WATER, part two: the flotsam layer rebuilds from g.flotsamList every
      // geoClock tick, so a visibility flag would flicker. Marking the pieces
      // TAKEN is the game's own door and it sticks.
      if (c.bare) for (const o of g.flotsamList) g.flotsamTaken.add(o.id);
    };

    // ---- the in-page shot machinery, so only summaries cross the bridge ----
    // WHERE: the named point if it is afloat, else the nearest open water to it.
    window.__place = (lat, lon) => {
      const w = E.latLonToWorld(lat, lon);
      let spot = null;
      if (!E.isLand(lat, lon)) spot = { x: w.x, z: w.z };
      else {
        outer:
        for (let r = 40; r <= 4000; r += 40) {
          for (let a = 0; a < 32; a++) {
            const th = (a / 32) * Math.PI * 2;
            const x = w.x + Math.sin(th) * r, z = w.z + Math.cos(th) * r;
            const ll = E.worldToLatLon(x, z);
            if (!E.isLand(ll.lat, ll.lon) && E.signedCoastGame(ll.lat, ll.lon) < -40) {
              spot = { x, z }; break outer;
            }
          }
        }
      }
      if (!spot) throw new Error(`no water near ${lat},${lon}`);
      g.ship.x = spot.x; g.ship.z = spot.z; g.geoClock = 0;
      return spot;
    };
    // INSHORE, for the decorated coasts: water 60-160 m off the waterline, the
    // band live-shore.mjs photographs the fringe from.
    window.__placeShore = (lat, lon, lo = -160, hi = -60) => {
      const w = E.latLonToWorld(lat, lon);
      let spot = null;
      outer:
      for (let r = 20; r <= 2600; r += 20) {
        for (let a = 0; a < 32; a++) {
          const th = (a / 32) * Math.PI * 2;
          const x = w.x + Math.sin(th) * r, z = w.z + Math.cos(th) * r;
          const ll = E.worldToLatLon(x, z);
          const d = E.signedCoastGame(ll.lat, ll.lon);
          if (d < hi && d > lo && E.elevation(ll.lat, ll.lon) < -1.5) { spot = { x, z }; break outer; }
        }
      }
      if (!spot) throw new Error(`no inshore water near ${lat},${lon}`);
      g.ship.x = spot.x; g.ship.z = spot.z; g.geoClock = 0;
      return spot;
    };
    // THE RIVER: the deepest water in a small sweep, which is the channel.
    window.__placeRiver = (lat, lon) => {
      const w = E.latLonToWorld(lat, lon);
      let spot = w, best = 1e9;
      for (let dx = -400; dx <= 400; dx += 25) {
        for (let dz = -400; dz <= 400; dz += 25) {
          const ll = E.worldToLatLon(w.x + dx, w.z + dz);
          const e = E.elevation(ll.lat, ll.lon);
          if (e < best) { best = e; spot = { x: w.x + dx, z: w.z + dz }; }
        }
      }
      g.ship.x = spot.x; g.ship.z = spot.z; g.geoClock = 0;
      return spot;
    };
    // THE LANDWARD BEARING: the coast field's own gradient points at the land.
    window.__shoreBearing = () => {
      const ll = E.worldToLatLon(g.ship.x, g.ship.z);
      const e = 0.004;
      const dx = E.signedCoastGame(ll.lat, ll.lon + e) - E.signedCoastGame(ll.lat, ll.lon - e);
      const dz = E.signedCoastGame(ll.lat - e, ll.lon) - E.signedCoastGame(ll.lat + e, ll.lon);
      return Math.atan2(dx, dz);
    };
    // THE SEA THIS WATER WOULD ACTUALLY GIVE, de-gusted: the steady state
    // main.js is easing toward here, which is what a ship that had been on this
    // station twenty minutes would be riding.
    window.__steadySea = () => {
      const cd = g.overLand ? 0 : g.coastDist;
      const wind = Wx.windProfile(cd, Wd.windAt(g.ship.x, g.ship.z).speed);
      const b = g.overLand
        ? { swell: Wv.RIVER_STATE, chop: Wv.RIVER_STATE }
        : Wx.seaBandsFor(wind, g.coastDist);
      return { ...b, wind };
    };
    // THE AXIS, snapped once on arrival. The game slews it at a rate cap that
    // would take up to 100 s to come round after a teleport, and a per-frame
    // reassertion would fight main.js's own ease and shimmer the phase.
    window.__snapAxis = () => {
      const a = Wv.waveAxisFor(g.wind.from);
      Wv.setWaveAxes(a, a);
      g.seaAxisSet = true;
    };
    // WHEN, part two: FRONT-LIGHT THE SUBJECT. A coast shot wants the sun behind
    // the lens or the fringe is a silhouette — and the game's sun only ever
    // stands within about 90 degrees of due south (skymath: it rises at +x, sets
    // at -x, and bows toward the equator at noon), so the hour that lights a
    // given bearing has to be SEARCHED FOR rather than guessed. Returns the
    // clock whose sun stands nearest behind the camera inside an elevation band.
    window.__skyFrontLight = (bearing, elevMin, elevMax) => {
      const want = bearing + Math.PI;
      let best = null;
      for (let i = 0; i < 6000; i++) {
        const t = (i / 6000) * S.DAY_LENGTH;
        const s = S.solarState(t);
        const len = Math.hypot(...s.dir);
        const el = Math.asin(s.dir[1] / len) * 180 / Math.PI;
        if (el < elevMin || el > elevMax) continue;
        const az = Math.atan2(s.dir[0], s.dir[2]);
        const d = Math.abs(Math.atan2(Math.sin(az - want), Math.cos(az - want)));
        if (!best || d < best.d) best = { d, t, el };
      }
      return best;
    };
    // AND NO CYCLONE ON THE SHOT. storms.js lays a vortex over the wind field and
    // lifts the sea wherever a cyclone has the ship, and weatherLock pins the SKY
    // but not the weather underneath it — so a locked clear sky over a 24 m/s
    // storm wind is an inconsistent picture. The storm field tracks skyT, so
    // stepping whole days walks off it; the game's own stormField is the oracle.
    // NOTE the assignment to __cfg.skyT: the frame hook re-pins dayStart from it
    // every frame, so writing dayStart alone here would be undone before the
    // storm field was ever recomputed. (It was, on the first cut of this script.)
    // A MOON SHOT MUST STEP BY WHOLE MOON-MONTHS, not whole days. solarState is
    // periodic in DAY_LENGTH so a day-step leaves the sun exactly where it was —
    // but lunarState(t) = solarState(t - moonPhase(t)*DAY_LENGTH), so one day moves
    // the phase by 1/12 and the moon's altitude with it. Stepping
    // DAY_LENGTH*MOON_MONTH_DAYS is an integer number of solar days AND exactly one
    // lunar month, so the whole sky is identical and only the storms have moved.
    // (Measured before the fix: a moon shot asked for a full moon 12 deg up and,
    // after one day of storm-stepping, was shot at phase 0.60 and 46 deg.)
    window.__avoidStorm = async (skyT, maxDays = 6, step = S.DAY_LENGTH) => {
      for (let d = 0; d <= maxDays; d++) {
        const t = skyT + d * step;
        window.__cfg.skyT = t;
        g.dayStart = t - g.t;
        g.geoClock = 0;
        await new Promise((r) => setTimeout(r, 420));
        if (!(g.stormField.seaScale > 1 || g.stormField.danger > 0)) return { skyT: t, days: d };
      }
      window.__cfg.skyT = skyT;
      return { skyT, days: -1 };   // nowhere clear in a week: say so, don't hide it
    };
    // WHEN: the clock that puts the sun or the moon where the shot wants it.
    window.__skyAt = (spec) => {
      if (spec.frac !== undefined) return ((spec.day || 0) + spec.frac) * S.DAY_LENGTH;
      if (spec.sunAlt !== undefined) {
        let best = null;
        for (let i = 0; i < 6000; i++) {
          const t = (i / 6000) * S.DAY_LENGTH;
          const s = S.solarState(t);
          if (s.frac > 0.5) continue;             // the MORNING solution
          const d = Math.abs(s.sunAlt - spec.sunAlt);
          if (!best || d < best.d) best = { d, t };
        }
        return best.t;
      }
      // a FULL moon on a sea the sun has left: search the whole moon-month
      const span = S.DAY_LENGTH * S.MOON_MONTH_DAYS;
      let best = null;
      for (let i = 0; i < 24000; i++) {
        const t = (i / 24000) * span;
        if (S.solarState(t).nightness < 0.99) continue;
        const ph = S.moonPhase(t);
        if (0.15 + 0.85 * (1 - Math.abs(ph - 0.5) * 2) < 0.9) continue;
        const d = Math.abs(S.lunarState(t).alt - spec.moon);
        if (!best || d < best.d) best = { d, t };
      }
      return best.t;
    };
    // THE BEARING THE LENS LOOKS ALONG.
    window.__bearing = (aim, off = 0) => {
      const s = g.ocean.uniforms.uSunDirW.value;   // sun OR moon, whichever lights
      let b;
      if (aim === 'sun' || aim === 'moon') b = Math.atan2(s.x, s.z);
      else if (aim === 'upwind') b = g.wind.from;
      else if (aim === 'downwind') b = g.wind.from + Math.PI;
      else if (aim === 'shore') b = window.__shoreBearing();
      else b = +aim;
      return b + off;
    };
    // A POD ON THE GROUNDS, and the world clock jumped so her leader stands at a
    // chosen point of the sounding cycle when the shutter opens.
    window.__pod = null;
    window.__findPod = (lat, lon, wantN = 3) => {
      const base = E.latLonToWorld(lat, lon);
      for (const r of [8000, 20000, 40000, 70000]) {
        const list = Wh.podsNear(g.t, base.x, base.z, r);
        const pick = list.find((e) => e.pod.n >= wantN) || list[0];
        if (pick) { window.__pod = pick.pod; return { id: pick.pod.id, n: pick.pod.n }; }
      }
      return null;
    };
    window.__jumpCycle = (u) => {
      const pod = window.__pod;
      let tt = Wh.WHALE_PERIOD * (u - pod.phase0 - Wh.memberPhase(pod, 0));
      while (tt < g.t) tt += Wh.WHALE_PERIOD;
      g.t = tt;
    };
    // BARE WATER. The gulls wheel 7-19 m off the masthead and the albatross at a
    // 42 m radius and 9 m up (wildlifelayer.js — all SHIP-relative), so a lens two
    // metres above the water a few metres off the hull gets a three-metre bird
    // across it. That is a real composition hazard in ordinary play as well as a
    // ruined seascape here. It has to be done by DETACHING the bodies, not by
    // clearing `visible`: the layer re-asserts that flag every frame, and this
    // hook runs after the frame, so a flag written here is undone before the next
    // one is drawn. (It was, and a gull duly turned up in the first hero shot.)
    window.__bare = (on) => {
      const w = g.wildlife;
      const bodies = [...w.gulls.map((b) => b.group), w.alba.group, ...w.pod];
      for (const o of bodies) {
        if (on) { if (o.parent) { o.__par = o.parent; o.parent.remove(o); } } else if (o.__par
          && !o.parent) o.__par.add(o);
      }
    };
    // WHICH QUARTER the animal is seen from, as an offset onto her own heading:
    // 'ahead' stands the lens in front of her looking back down her course,
    // which is the bearing that shows the flukes' whole span when she sounds.
    window.__podView = { ahead: Math.PI, quarter: Math.PI * 0.75, abeam: Math.PI / 2 };
    // lay the ship BEYOND the pod along the view axis (and offset to one side of
    // it) so she stands behind the animal in frame and carries the scale
    window.__layOnPod = (view, off, side) => {
      const p = Wh.podPose(window.__pod, g.t);
      const b = p.heading + (window.__podView[view] ?? Math.PI);
      const sx = Math.sin(b), sz = Math.cos(b);
      const rx = Math.cos(b), rz = -Math.sin(b);
      g.ship.x = p.x + sx * off + rx * side;
      g.ship.z = p.z + sz * off + rz * side;
      g.ship.yaw = p.heading; g.ship.speed = 0; g.ship.trim = 0.6; g.geoClock = 0;
      return p;
    };
    // WHAT THE SHOT ACTUALLY CONTAINS, read out of the running game for the
    // contact sheet — so the sheet reports measurements and not intentions.
    window.__readout = () => {
      const ll = E.worldToLatLon(g.ship.x, g.ship.z);
      const sol = S.solarState(g.t + g.dayStart);
      const lun = S.lunarState(g.t + g.dayStart);
      const b = g.seaBands;
      // the break field's own mean over 400 x 400 m of the water in frame
      let brk = 0, n = 0;
      for (let i = 0; i < 56; i++) {
        for (let j = 0; j < 56; j++) {
          brk += Wv.breaking(g.ship.x + (i - 28) * 7, g.ship.z + (j - 28) * 7, g.t); n++;
        }
      }
      const r = g.wildlife.whaleReport();
      return {
        lat: +ll.lat.toFixed(3), lon: +ll.lon.toFixed(3),
        coastDistM: Math.round(g.coastDist), overLand: !!g.overLand,
        // 4440 m is earth.js's COAST_CAP (10 degrees): the field saturates there,
        // so a mid-ocean shot reads the cap and not a real distance
        coastCapped: g.coastDist >= E.COAST_CAP - 1,
        stormy: g.stormField.seaScale > 1 || g.stormField.danger > 0,
        camFov: +g.camera.fov.toFixed(1),
        camHeightM: +g.camera.position.y.toFixed(2),
        windMs: +g.wind.speed.toFixed(2),
        windFieldMs: +Wx.windProfile(g.overLand ? 0 : g.coastDist,
          Wd.windAt(g.ship.x, g.ship.z).speed).toFixed(2),
        windFromDeg: +((g.wind.from * 180 / Math.PI + 360) % 360).toFixed(0),
        swellBand: +b.swell.toFixed(3), chopBand: +b.chop.toFixed(3),
        significantHeightM: +Math.hypot(Wv.significantHeight(0) * b.swell,
          Wv.significantHeight(1) * b.chop).toFixed(2),
        meanWavelengthM: +Wv.meanWavelength(0).toFixed(0),
        breakFieldPct: +(brk / n * 100).toFixed(3),
        sunElevDeg: +(Math.asin(sol.dir[1]) * 180 / Math.PI).toFixed(1),
        dayFrac: +sol.frac.toFixed(3),
        nightness: +sol.nightness.toFixed(2),
        moonElevDeg: +(Math.asin(lun.dir[1] / Math.hypot(...lun.dir)) * 180 / Math.PI).toFixed(1),
        moonPhase: +S.moonPhase(g.t + g.dayStart).toFixed(2),
        decorCells: [...g.shoreDecor.cells.values()].filter((c) => c.mesh).length,
        terrainChunks: g.terrain.chunks.size,
        tier: g.gfxQuality,
        whale: r ? { n: r.n, kind: r.kind,
          phases: r.members.map((m) => m.phase),
          leaderCycle: window.__pod
            ? +Wh.memberCycle(window.__pod, 0, g.t).toFixed(3) : null,
          flukeY: +Math.max(...r.members.map((m) => m.flukeY - m.surf)).toFixed(2),
          up: r.members.filter((m) => m.visible).length } : null,
      };
    };
    const gl = g.renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown',
      buffer: `${gl.drawingBufferWidth}x${gl.drawingBufferHeight}`,
    };
  });
  console.log(`  GPU ${gfx.renderer}`);
  console.log(`  drawing buffer ${gfx.buffer}, tier fine, watchdog pinned manual\n`);

  // ---- the stills ---------------------------------------------------------
  for (const s of CLIPSONLY ? [] : SHOTS) {
    if (!wanted(s.key)) continue;
    const before = pageErrors.length;
    console.log(`${s.key}  —  ${s.where}`);
    const staged = await page.evaluate(async (spec) => {
      const g = window.saltstead;
      const c = window.__cfg;
      c.off = false;
      c.hidden = !!(spec.ship && spec.ship.hidden);
      c.bare = !!spec.bare;
      window.__bare(c.bare);
      if (spec.weather) { g.weatherState = spec.weather.state; g.gloom = spec.weather.gloom; }
      // 1. A PROVISIONAL CLOCK, because the sun's bearing is what a sun-aimed lens
      // is pointed by. The final clock is chosen at step 5, after the geometry.
      c.skyT = window.__skyAt(spec.sky.frontLight ? { frac: 0.62 } : spec.sky);
      g.dayStart = c.skyT - g.t;
      // 2. the water
      let pod = null;
      if (spec.whale) {
        if (!window.__findPod(spec.lat, spec.lon)) throw new Error('no pod on the grounds');
        pod = window.__layOnPod(spec.whale.view, spec.whale.shipOff, spec.whale.shipSide);
      } else if (spec.shore) window.__placeShore(spec.lat, spec.lon, spec.shore[0], spec.shore[1]);
      else if (spec.river) window.__placeRiver(spec.lat, spec.lon);
      else window.__place(spec.lat, spec.lon);
      await new Promise((r) => setTimeout(r, 700));   // coast distance re-samples
      // 3. the sea this place gives, pre-loaded past the ocean's 67 s memory
      const st = window.__steadySea();
      c.sea = spec.sea === 'place' ? { swell: st.swell, chop: st.chop }
        : { swell: spec.sea[0], chop: spec.sea[1] };
      window.__snapAxis();
      // 4. the hull: at a reach so the sail sets full, or hove to
      if (spec.ship && !spec.whale) {
        g.ship.yaw = g.wind.from + (spec.ship.reach ?? 2.1);
        g.ship.trim = spec.ship.trim ?? 0.8;
        g.ship.speed = spec.ship.speed ?? 0;
        g.ship.rudder = 0;
      }
      // 5. the lens, and then the hour that lights what it is pointed at
      if (spec.whale) {
        const w = spec.whale;
        c.cam = { pod: true, podView: window.__podView[w.view] ?? Math.PI,
          bearing: pod.heading + (window.__podView[w.view] ?? Math.PI),
          dist: w.camDist, height: w.camHeight, side: w.camSide,
          lookAhead: 0, lookY: w.lookY, fov: w.fov || 62 };
      } else {
        const k = spec.cam;
        c.cam = { bearing: window.__bearing(k.aim, k.off || 0), dist: k.dist,
          height: k.height, side: k.side || 0, lookAhead: k.lookAhead || 0,
          lookY: k.lookY ?? 2.2, fov: k.fov || 62 };
      }
      let front = null;
      if (spec.sky.frontLight) {
        front = window.__skyFrontLight(c.cam.bearing, spec.sky.frontLight[0], spec.sky.frontLight[1]);
        c.skyT = front.t;
      }
      // 6. and no cyclone standing on it (the sky is locked; the wind is not)
      const storm = spec.storms === 'allow' ? { skyT: c.skyT, days: 0 }
        : await window.__avoidStorm(c.skyT, 6,
          spec.sky.moon !== undefined ? window.__mod.S.DAY_LENGTH * window.__mod.S.MOON_MONTH_DAYS
            : undefined);
      c.skyT = storm.skyT;
      g.dayStart = c.skyT - g.t;
      // 7. THE WHALE'S CLOCK, LAST OF ALL, and that ordering is the whole trick:
      // the jump aims the leader's sounding cycle at the moment the shutter opens,
      // so anything that burns wall-clock time after it (the storm search burns up
      // to two and a half seconds) shifts the animal out of the act being
      // photographed. The first cut jumped in step 2 and got a fluke root 1.6 m
      // out of the water instead of 6.
      if (spec.whale) {
        window.__jumpCycle(spec.whale.phase - (spec.settle + 0.35) / 160);
        g.dayStart = c.skyT - g.t;         // the jump moved t; re-aim the sky
        window.__layOnPod(spec.whale.view, spec.whale.shipOff, spec.whale.shipSide);
      }
      return { bearing: +c.cam.bearing.toFixed(3), fov: c.cam.fov, sea: c.sea,
        skyT: +c.skyT.toFixed(1), steadyWind: +st.wind.toFixed(2),
        stormDaysStepped: storm.days,
        stormStepUnit: spec.sky.moon !== undefined ? 'moon-month' : 'day',
        frontLightSunElevDeg: front ? +front.el.toFixed(1) : null,
        frontLightOffAxisDeg: front ? +(front.d * 180 / Math.PI).toFixed(0) : null };
    }, s);
    await sleep((s.settle || 7) * 1000);
    const m = await page.evaluate(() => window.__readout());
    await page.screenshot({ path: join(OUT, `${s.key}.png`) });
    const errs = pageErrors.slice(before);
    rows.push({ ...s, measured: m, staged, errors: errs });
    console.log(`    wind field ${m.windFieldMs} m/s from ${m.windFromDeg}deg (live gusting `
      + `${m.windMs.toFixed(1)}${m.stormy ? ', A CYCLONE IS ON THIS WATER' : ''})`
      + `  bands ${m.swellBand}/${m.chopBand}  Hs ${m.significantHeightM} m  break ${m.breakFieldPct}%`);
    console.log(`    sun ${m.sunElevDeg}deg  moon ${m.moonElevDeg}deg (phase ${m.moonPhase})`
      + `  lens ${m.camFov}deg at ${m.camHeightM} m`
      + `  coast ${m.coastCapped ? 'open ocean (capped)' : `${m.coastDistM} m`}`
      + (m.decorCells ? `  decor ${m.decorCells} cells` : '')
      + `  terrain ${m.terrainChunks}`
      + (staged.stormDaysStepped > 0 ? `  [stepped ${staged.stormDaysStepped} ${staged.stormStepUnit}(s) off a storm]` : '')
      + (staged.frontLightSunElevDeg !== null
        ? `  [front-light: sun ${staged.frontLightSunElevDeg}deg up, `
          + `${staged.frontLightOffAxisDeg}deg off behind the lens]` : '')
      + (m.whale ? `  whale n=${m.whale.n} up=${m.whale.up} cycle ${m.whale.leaderCycle} `
        + `fluke ${m.whale.flukeY} m` : ''));
    if (m.stormy) problems.push(`${s.key}: a cyclone sits on this water — the sky is locked `
      + 'clear over a storm wind, which is an inconsistent picture');
    if (errs.length) {
      problems.push(`${s.key}: ${errs.slice(0, 2).join(' | ')}`);
      console.log(`    PAGE ERROR: ${errs[0].slice(0, 160)}`);
    }
  }

  // ---- the clips, through showreel.js's own recorder ----------------------
  if (!NOCLIPS) {
    for (const clip of CLIPS) {
      if (!wanted(clip.key)) continue;
      console.log(`\n${clip.key}  —  recording ${clip.sec} s`);
      const seen = new Set(readdirSync(OUT).filter((f) => f.endsWith('.webm')));
      // the rig stands down: showreel's own orbit owns photoCam and its beats
      // own the clock, so two writers would race for the lens
      await page.evaluate(() => { window.__cfg.off = true; });
      const done = new Promise((res) => {
        cdp.on('Browser.downloadProgress', (e) => { if (e.state === 'completed') res(); });
      });
      const out = await page.evaluate(async ([key, sec, settle]) => {
        const g = window.saltstead;
        const { Wv, S, Wh } = window.__mod;
        const PIN = (skyT) => { g.dayStart = skyT - g.t; };
        // one beat per clip. `stage` dresses the set during the paused settle;
        // `during(g, u)` runs every frame of the take and owns the lens, so it
        // overrides the orbit pose showreel set a line earlier.
        const beats = {
          'clip-whale-sounding': [{
            name: 'The sounding', lat: 30, lon: -42, frac: 0.70, sec, hull: 'sloop',
            weather: { state: 'clear', gloom: 0 }, dist: 40, height: 7, az0: 0, az1: 0,
            stage: (gg) => {
              const base = window.__mod.E.latLonToWorld(30, -42);
              let pick = null;
              for (const r of [8000, 20000, 40000, 70000]) {
                const l = Wh.podsNear(gg.t, base.x, base.z, r);
                pick = l.find((e) => e.pod.n >= 3) || l[0];
                if (pick) break;
              }
              window.__pod = pick.pod;
              // open on the late cruise so the take runs cruise -> arch ->
              // flukes -> gone: the settle is paused film, so pay for it here
              window.__jumpCycle(0.50 - settle / Wh.WHALE_PERIOD);
              gg._skyT = 0.70 * S.DAY_LENGTH;
              PIN(gg._skyT);
              window.__layOnPod('ahead', 44, -28);
              gg._sea = window.__steadySea();
              window.__snapAxis();
            },
            during: (gg) => {
              PIN(gg._skyT);
              gg.seaBands.swell = gg._sea.swell; gg.seaBands.chop = gg._sea.chop;
              Wv.setSeaBands(gg._sea.swell, gg._sea.chop);
              // the lens tracks the ANIMAL from ahead of her, with the sloop
              // lying beyond her for scale — she swims at the camera, rounds her
              // back and puts her flukes up in the middle of the frame
              // a 46 degree lens: the game's own 62 makes a 19 m animal at 30 m
              // small, and this clip's whole subject is one animal's behaviour
              if (Math.abs(gg.camera.fov - 46) > 1e-3) {
                gg.camera.fov = 46;
                gg.camera.updateProjectionMatrix();
              }
              gg.ocean.setLens(46, gg.renderer.domElement.height);
              const p = Wh.podPose(window.__pod, gg.t);
              const b = p.heading + Math.PI;
              const sx = Math.sin(b), sz = Math.cos(b);
              const rx = Math.cos(b), rz = -Math.sin(b);
              gg.photoCam = {
                x: p.x - sx * 23 + rx * 8, y: 4.6, z: p.z - sz * 23 + rz * 8,
                lookAt: { x: p.x, y: 3.6, z: p.z },
              };
            },
          }],
          'clip-gale-from-deck-height': [{
            name: 'A gale from deck height', lat: -54, lon: 90, frac: 0.70, sec,
            hull: 'sloop',
            weather: { state: 'clear', gloom: 0 }, dist: 20, height: 3, az0: 0, az1: 0,
            stage: (gg) => {
              gg._skyT = 0.70 * S.DAY_LENGTH;
              PIN(gg._skyT);
              gg.ship.yaw = gg.wind.from + 2.3;
              gg.ship.trim = 0.5; gg.ship.speed = 7.5;
              gg._sea = window.__steadySea();
              window.__snapAxis();
              gg._bear = gg.wind.from + 1.9;
            },
            during: (gg) => {
              PIN(gg._skyT);
              gg.seaBands.swell = gg._sea.swell; gg.seaBands.chop = gg._sea.chop;
              Wv.setSeaBands(gg._sea.swell, gg._sea.chop);
              gg.ocean.setLens(gg.camera.fov, gg.renderer.domElement.height);
              // deck height, on her quarter, holding station as she is lifted:
              // main.js lifts photoCam to clear the local crest, so the lens itself
              // rides the swell and the horizon moves the way a sailor's does
              const sx = Math.sin(gg._bear), sz = Math.cos(gg._bear);
              const rx = Math.cos(gg._bear), rz = -Math.sin(gg._bear);
              gg.photoCam = {
                x: gg.ship.x - sx * 19 + rx * 5, y: 2.4, z: gg.ship.z - sz * 19 + rz * 5,
                lookAt: { x: gg.ship.x + sx * 8, y: 4.5, z: gg.ship.z + sz * 8 },
              };
            },
          }],
          'clip-golden-hour-rollers': [{
            name: 'Golden hour rollers', lat: -45, lon: 0, frac: 0.745, sec, hull: 'sloop',
            weather: { state: 'clear', gloom: 0 }, dist: 26, height: 3, az0: 0, az1: 0,
            stage: (gg) => {
              // the sun low and gold, the title scene's own hour
              gg._skyT = 0.745 * S.DAY_LENGTH;
              PIN(gg._skyT);
              gg.ship.yaw = gg.wind.from + 2.4;
              gg.ship.trim = 0.7; gg.ship.speed = 6.5;
              gg._sea = window.__steadySea();
              window.__snapAxis();
            },
            during: (gg) => {
              PIN(gg._skyT);
              gg.seaBands.swell = gg._sea.swell; gg.seaBands.chop = gg._sea.chop;
              Wv.setSeaBands(gg._sea.swell, gg._sea.chop);
              // showreel forces a 1920x1080 buffer without re-telling the ocean
              // its lens, and the glitter lobe's resolution model rides that
              gg.ocean.setLens(gg.camera.fov, gg.renderer.domElement.height);
              const s = gg.ocean.uniforms.uSunDirW.value;
              const b = Math.atan2(s.x, s.z);       // straight down the road
              const sx = Math.sin(b), sz = Math.cos(b);
              const rx = Math.cos(b), rz = -Math.sin(b);
              gg.photoCam = {
                x: gg.ship.x - sx * 24 + rx * 9, y: 2.6, z: gg.ship.z - sz * 24 + rz * 9,
                lookAt: { x: gg.ship.x + sx * 60, y: 3.2, z: gg.ship.z + sz * 60 },
              };
            },
          }],
        }[key];
        return window.saltstead.showreel({ beats, settleSec: settle, beatSec: sec });
      }, [clip.key, clip.sec, clip.settle]);
      console.log(`    ${out}`);
      await Promise.race([done, sleep(40000)]);
      await sleep(2000);
      const fresh = readdirSync(OUT).filter((f) => f.endsWith('.webm') && !seen.has(f));
      if (!fresh.length) {
        problems.push(`${clip.key}: no .webm landed in ${OUT}`);
        console.log('    FAILED: no .webm landed');
      } else {
        const src = join(OUT, fresh[0]);
        const dst = join(OUT, `${clip.key}.webm`);
        try { rmSync(dst); } catch { /* first run */ }
        renameSync(src, dst);
        const mb = statSync(dst).size / 1e6;
        clip.file = `${clip.key}.webm`;
        clip.sizeMB = +mb.toFixed(1);
        console.log(`    -> ${clip.key}.webm (${mb.toFixed(1)} MB, 1920x1080)`);
      }
      // the rig comes back for whatever follows
      await page.evaluate(() => {
        window.__cfg.off = false;
        window.saltstead.weatherLock = true;
        window.saltstead.gfxWatch.manual = true;
      });
    }
  }

  if (pageErrors.length) {
    console.log(`\n${pageErrors.length} page/console error(s) over the whole run:`);
    for (const e of pageErrors.slice(0, 6)) console.log(`  ${e.replace(/\n/g, ' ').slice(0, 220)}`);
  }
} finally {
  await browser.close();
}

// ---------------------------------------------------------------------------
// THE CONTACT SHEET — so the owner can pick without opening every file
// ---------------------------------------------------------------------------
const clipRows = CLIPS.filter((c) => c.file);
writeFileSync(join(OUT, 'showcase.json'), `${JSON.stringify({
  captured: new Date().toISOString(),
  viewport: `${VIEW.width}x${VIEW.height}`,
  stills: rows.map((r) => ({ key: r.key, title: r.title, where: r.where,
    demonstrates: r.demo, staged: r.staged, measured: r.measured, errors: r.errors })),
  clips: clipRows.map((c) => ({ key: c.key, title: c.title, file: c.file,
    seconds: c.sec, sizeMB: c.sizeMB, demonstrates: c.demo })),
  problems,
  findings: FINDINGS.map(([head, body]) => ({ head, body })),
}, null, 2)}\n`);

const md = [];
md.push('# Saltstead v2 — showcase contact sheet', '');
md.push(`Captured ${new Date().toISOString().slice(0, 16).replace('T', ' ')}Z at `
  + `**${VIEW.width}x${VIEW.height}**, \`fine\` tier with the fps watchdog pinned manual, `
  + 'weather locked, the clock pinned per shot, and the sea state pre-loaded to each '
  + "place's own steady state (`scripts/capture-showcase.mjs` — re-run it to rebuild "
  + 'the whole set).', '');
md.push('Every figure below is **read out of the running game after the shot settled**, '
  + 'not copied from the design notes. Wind is whatever `wind.js` gives that latitude — '
  + 'no shot forces the anemometer.', '');
md.push('The **wind** column is the de-gusted field value — the wind that built the sea '
  + 'in the picture. The live HUD wind gusts ±45% about it on a 90 s cycle and is given '
  + 'per shot below.', '');
md.push('| # | file | where | hour | wind | sea (swell/chop, Hs) | break field | shows |');
md.push('|---|------|-------|------|------|----------------------|-------------|-------|');
for (const r of rows) {
  const m = r.measured;
  const hour = m.nightness > 0.5
    ? `night, moon ${m.moonElevDeg}°, phase ${m.moonPhase}`
    : `sun ${m.sunElevDeg}°`;
  md.push(`| ${r.key.slice(0, 2)} | \`${r.key}.png\` | ${r.where} | ${hour} `
    + `| ${m.windFieldMs} m/s from ${m.windFromDeg}° `
    + `| ${m.swellBand}/${m.chopBand}, Hs ${m.significantHeightM} m `
    + `| ${m.breakFieldPct}% | ${r.title} |`);
}
md.push('');
md.push('## Shot by shot', '');
for (const r of rows) {
  const m = r.measured;
  const st = r.staged;
  md.push(`### \`${r.key}.png\` — ${r.title}`, '');
  md.push(`- **Where** ${r.where} — measured ${m.lat}, ${m.lon}; `
    + (m.overLand ? 'inside the coastline, so the water is a RIVER (near-flat by design)'
      : m.coastCapped ? 'open ocean (the coast field is at its 4440 m cap)'
        : `${m.coastDistM} m off the waterline`));
  md.push(`- **Hour** ${m.nightness > 0.5 ? 'night' : 'day'}, day fraction ${m.dayFrac}; `
    + `sun ${m.sunElevDeg}° above the horizon, moon ${m.moonElevDeg}° at phase ${m.moonPhase} `
    + '(0 new, 0.5 full)'
    + (st.frontLightSunElevDeg !== null
      ? `. Hour chosen to FRONT-LIGHT the subject: the sun stands `
        + `${st.frontLightOffAxisDeg}° off dead behind the lens at ${st.frontLightSunElevDeg}° up`
      : ''));
  md.push(`- **Wind** field ${m.windFieldMs} m/s from ${m.windFromDeg}° `
    + `(live, gusting: ${m.windMs.toFixed(2)} m/s)`
    + (m.stormy ? '. **A CYCLONE IS ON THIS WATER** — the locked clear sky does not '
      + 'match the storm wind under it; treat this shot with suspicion.' : '')
    + (st.stormDaysStepped > 0
      ? `. The clock was stepped ${st.stormDaysStepped} whole ${st.stormStepUnit}(s) to walk off a cyclone.`
      : ''));
  md.push(`- **Sea** swell band ${m.swellBand}, chop band ${m.chopBand}, `
    + `significant height ${m.significantHeightM} m, mean swell wavelength ${m.meanWavelengthM} m`);
  md.push(`- **Break field** ${m.breakFieldPct}% mean over a 400 m square of the water in frame `
    + '(the DRAWN white area is several times this by construction — shading gain 3)');
  md.push(`- **Lens** ${m.camFov}° vertical, eye ${m.camHeightM} m above the water`);
  if (m.decorCells) md.push(`- **Shore decoration** ${m.decorCells} cells carrying meshes, `
    + `${m.terrainChunks} terrain chunks streamed`);
  if (m.whale) md.push(`- **Whales** ${m.whale.n} animals (${m.whale.kind}), `
    + `${m.whale.up} above water, cycle phases ${m.whale.phases.join(' / ')}, `
    + `highest fluke ROOT ${m.whale.flukeY} m above the local sea surface `
    + '(the tips stand about a metre higher again)');
  md.push(`- **Shows** ${r.demo}`);
  if (r.errors && r.errors.length) {
    md.push(`- **WARNING** page errors during this shot: ${r.errors.slice(0, 2).join(' | ')}`);
  }
  md.push('');
}
if (clipRows.length) {
  md.push('## Clips', '');
  md.push('Recorded through `src/showreel.js`’s own rig: a bare canvas, a forced '
    + '1920x1080 drawing buffer, and MediaRecorder on the canvas’s captureStream '
    + 'paused over every warp and settle so nothing but the take is in the file.', '');
  for (const c of clipRows) {
    md.push(`### \`${c.file}\` — ${c.title}`, '');
    md.push(`- ${c.sec} s, ${c.sizeMB} MB, 1920x1080, ${c.where}`);
    md.push(`- **Why motion** ${c.demo}`);
    md.push('');
  }
}
if (problems.length) {
  md.push('## Problems in this run', '');
  for (const p of problems) md.push(`- ${p}`);
  md.push('');
}
md.push('## What the shoot found', '');
md.push('Written from the frames above, not from the design notes. Two of these are '
  + 'defects the headless gates cannot see, because they are about what the water '
  + 'LOOKS like at a particular range from a particular lens.', '');
for (const [head, body] of FINDINGS) md.push(`- **${head}** ${body}`);
md.push('');
writeFileSync(join(OUT, 'CONTACT-SHEET.md'), `${md.join('\n')}\n`);
console.log(`\nwrote ${join(OUT, 'CONTACT-SHEET.md')} and showcase.json`);
console.log(`${rows.length} stills, ${clipRows.length} clips in ${OUT}`);
if (problems.length) {
  console.log('\nPROBLEMS:');
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
}
