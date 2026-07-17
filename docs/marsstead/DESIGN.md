# Marsstead — founding design document

*(Working title, and the live one: **www.marsstead.app** already stands, the
blue-dusk dune shader already running. Third sibling to Moorstead and
Saltstead — same identity, new world.)*

A procedural survival-and-homesteading game on the **real Mars**, scaled. You
land alone on a dead planet that was once alive, keep a suit's worth of air and
heat between you and the cold, and **build** — the first `stead` where the
homestead is not the setting but the point. Raise habs from the regolith, range
out by rover, jump the horizon by rocket, and follow a thread the sand has kept
for four billion years down to where life on **Earth** began. Third-person.
Browser-first, procedural-only, no asset files — ever.

> The name is the thesis. Moorstead is a homestead on the moors; Saltstead a
> homestead on the salt sea; **Marsstead is the homestead you actually build,
> hab by hab, on a world with no ports to sail into and no towns to walk to.**
> The planet gives you nothing. Everything on the surface that isn't rock, you
> put there.

This document is the founding contract, modelled on Saltstead's `docs/DESIGN.md`.
It is the design **and** the architecture: an implementer should be able to start
Phase 0 from it. Marsstead will graduate to its own repository
(`jamescockburn47/marsstead`, Vercel project `marsstead`) with its own `CLAUDE.md`
mirroring the family; until then this branch is where the plan lives.

---

## The identity (inherited from Moorstead & Saltstead — non-negotiable)

1. **Browser-first, instant-play, procedural-only.** All geometry, textures,
   audio synthesised in code. Low-poly flat-shaded style — `BufferGeometry`
   built in code, not voxels, but still **zero binary assets**. The landing
   page's dune shader is the proof of tone: one fragment shader, no downloads.
2. **Kid-safe shared worlds.** Server-authoritative caps, no raw player text as
   HTML (`escHtml` everywhere), no unbounded griefing surface. A shared base is
   built cooperatively or not at all — you cannot demolish another player's
   stead.
3. **The verify gate is the contract.** Headless `npm run verify` must be green
   before deploy. Every feature ships with an assertion that defends it. Pure
   logic lives in modules that import no THREE/DOM so the gate runs them under
   Node. (Saltstead is at 39 checks; Marsstead starts its own count at Phase 0.)
4. **Determinism.** Terrain, weather, ore, the mystery's placement — all derive
   from stable seeds and the baked real-Mars tables. Never `Math.random()` at
   build/spawn time for anything shared across clients. The one authored,
   non-deterministic thing in the world is **the player's base**, which is why
   it rides the save and the relay as explicit data.

---

## Why Mars is the hard sibling

Saltstead's planet is **99% flat water** — `chunkWorthBuilding` skips deep-ocean
tiles entirely and the ocean is a near-free shader plane. **Mars has no cheap
tile.** Every square metre is displaced heightfield; there is nothing to skip.
That single fact reshapes every inherited system:

| Saltstead assumption | Mars reality |
|---|---|
| 99% of chunks cost nothing (open water) | 100% of chunks are terrain; LOD is survival, not polish |
| Distance across water is *boring*, so compress it (open-sea gait) | Distance across Mars *is the content*; you can't hide it — you cross it faster (rover → rocket) |
| The world is a stage for the ship | The world is the antagonist (cold, dust, thin air, radiation, distance) |
| Income originates at sea (plunder) | Progress originates from the ground (prospect → extract → refine → build) |
| No death; the sea keeps accounts (founder/wreck) | No death; the planet keeps accounts (blackout/rescue, below) |

Everything that ports, ports **because** of these differences, not despite them.
The terrain streamer, the local-frame moving platform, the append-only anchored
content table, the weather-live layer, the verify methodology, the relay — all
inherited, all re-pointed at a world that is all land, all the time.

---

## The setting: "the tide went out four billion years ago"

Near-future, but the framing is deliberately small and unofficial — *owned by
nobody's art department*. You are not a national agency planting a flag. You are
an independent homesteader (then, in multiplayer, a scattering of them) on a
Mars that was once wet, warm-ish, and — the mystery insists — **alive**. The
deeper you dig, the older the story gets, until it stops being about you at all.

Real Mars is the whole hook, and it is honoured to the metre:

- **The dry sea.** Mars's northern lowlands (Vastitas Borealis) sit kilometres
  below the southern highlands — a real hemispheric dichotomy, and a genuine
  scientific candidate for an ancient ocean with debated palaeo-shorelines. That
  is the tide that went out. You homestead on its floor.
- **Real named places, real elevations.** Olympus Mons (~+21 km, the tallest
  volcano in the solar system), Valles Marineris (a canyon system 4,000 km long
  and up to 7 km deep), Hellas Planitia (~−8 km, the deepest basin), Jezero's
  river delta (where Perseverance landed), Gale crater (Curiosity), Cerberus
  Fossae (where InSight recorded real marsquakes), the Medusae Fossae, Arsia
  Mons's collapse pits (candidate lava-tube skylights). Every one is a
  destination the way Saltstead's legends are.
- **Real sky.** Butterscotch day, a **blue halo around the setting sun** (true —
  fine dust forward-scatters blue), Phobos hurrying west-to-east across the sky
  the wrong way and Deimos crawling the other. The landing-page shader already
  renders exactly this; it is the first module to formalise.
- **Real physics as gameplay levers.** 0.38 g (you jump higher, the rover
  bounds, the rocket goes far on little fuel — this is Marsstead's *wind*: a
  planetary constant you learn to exploit). ~0.6% of Earth's air pressure
  (parachutes barely bite, sound is thin, no wing flies — you hop on rockets,
  not planes). The sol is 24h 39m. CO₂ frost caps that breathe with the seasons.

Two game-design overrides, in the Saltstead tradition where truth loses to fun:
**you are never truly alone with your thoughts** (an optional mission-control /
crew voice — the NPC-brains row of the ports table below), and **the cold clock
is generous** (survival is
tense, not a stopwatch — see the blackout rule). Everything else defers to the
real planet.

---

## The core loop

Saltstead: spot a sail → chase → plunder → fence → upgrade. Marsstead's
compulsion loop replaces the prey with the planet:

**Survive** (watch suit air, heat, power, dust) → **prospect** (read the ground
with real instruments — spectrometer, ground radar, a magnetometer that twitches
at the mystery) → **extract** (drill ice, mine ore, crack the CO₂ air) →
**refine** at your stead (water, oxygen, methane fuel, metal, parts) → **build /
expand** the stead and **upgrade traversal** → **range farther** into colder,
higher, stranger ground → **uncover the next beat of the mystery** → the planet
raises the stakes (distance, altitude, the global dust storm, the deep dark).

**All progress originates from the ground.** There is no plunder and no port to
sell to — the antagonist is Mars itself. What money *is* to Saltstead, **refined
resource and manufactured parts** are to Marsstead: the thing you spend to climb.
The stead is where it is spent. Land — here, the *whole world* — finally earns,
because there is nothing else. This is the family's economy rule turned exactly
inside out, and it is coherent: on Mars, the ground is all there is.

Growth loop: a bigger stead refines faster and reaches farther → farther reach
finds richer ground and the next mystery site → which demands a bigger stead.
The difficulty curve is the planet's own thermostat: notoriety-and-heat becomes
**depth-and-distance-and-cold**. The farther and deeper you push, the less the
planet forgives.

---

## The world: real Mars, scaled, all terrain

### The data (baked, like `earthdata.js` — never by hand)

`src/marsdata.js` is **generated** by `scripts/build-marsdata.mjs` from public
NASA/USGS data, exactly as `earthdata.js` is baked from Natural Earth:

- **MOLA** (Mars Orbiter Laser Altimeter) global topography — the canonical,
  public-domain Mars DEM. Downsampled to a global grid the browser can hold
  (start ~0.25–0.5°; MASK-style), quantized to **Int16 metres**. A happy
  accident makes this clean: real Mars elevations span roughly −8,200 m (Hellas)
  to +21,900 m (Olympus) — **both fit inside Int16 with room to spare**, so the
  bake is raw metres, no offset, no scale loss at the skeleton level.
- **The USGS Gazetteer of Planetary Nomenclature** (public domain) → the named
  features table: craters, montes, valles, planitiae, fossae — each a
  lat/lon/diameter row. This becomes `marslegends.js` (below), the append-only
  content spine.
- **No imagery, ever.** Colour is *synthesised*, not sampled: dusty ochre
  lowlands, dark basaltic highland, wind-streak albedo, CO₂/H₂O frost at the
  caps and on pole-facing slopes — all a function of elevation, slope, latitude
  and season, the way `terraingen.colourFor` already does for Earth. Sampling a
  Mars photo would break invariant 1; deriving the look from the real *shape*
  does not.

### The projection module — `src/mars.js` (pure, the `earth.js` of Mars)

The direct analogue of `earth.js`: no THREE, no DOM, verify-gated. Decodes the
baked MOLA + gazetteer tables and answers what everything else asks —
`latLonToWorld` / `worldToLatLon` (equirectangular, with a spherical-error note
for the poles), `elevation(lat, lon)`, `slope(lat, lon)`, `named(lat, lon)`
(nearest gazetteer feature), `frostLine(lat, season)`, and the traversal-gait
factor. **Wraps east–west**, like Earth. Where Saltstead answers "how far to the
coast," Mars answers "how far to breathable shelter" — the nearest stead or
cached depot, which is what the survival HUD reads.

### Scale and the traversal answer

Mars's radius is 3,389.5 km — a whole planet, and unlike Saltstead there is no
boring ocean to compress away. So distance is solved the way the era-ladder
solves Saltstead's: **the way you cross Mars is itself the progression**, and
each tier changes *how* you travel, not just the number:

| Tier | Vehicle | How it crosses Mars | The 0.38 g lever |
|---|---|---|---|
| 0 | **On foot (EVA)** | walk the real terrain; suit air is the clock | bounding stride; a fall is survivable |
| 1 | **Unpressurised buggy** | fast local prospecting; open to the cold | it *leaps* ridges — low gravity is your suspension |
| 2 | **Pressurised rover** | a home that moves — your stead's frame ports here | a rolling airlock; range = its own life support |
| 3 | **Suborbital hopper** | "jump the horizon by rocket" — the distance-compressor | thin air + low g = huge ballistic hops on little fuel |
| 4 | **Orbital shuttle / point-to-point** | cross a hemisphere; land near a built stead | escape velocity is a *fifth* of Earth's — orbit is cheap |

The **hopper is Marsstead's open-sea gait**: it does not hide the terrain (the
terrain is the point), it lets you *skip across* it at speed and see it from
altitude — the Mars-scale thrill Saltstead gets from a fast crossing. And built
steads become fast-travel anchors: once you've raised a hab somewhere, you can
hop *to* it, so the world knits itself into a network of your own making. Reach
is a real cost — fuel is refined methane (Sabatier from CO₂ + your mined water),
so every hop spends the stead's output. Rangefinding is a resource decision, the
way a Saltstead crossing spends daylight and risks the horizon.

### Streaming — the hard part, honestly (`marsterrain.js` + `marschunk.js`)

The direct heirs of `terrain.js` / `terraingen.js`, but with the cheap-tile
escape hatch **deleted**, because nothing on Mars is cheap. The technique that
keeps it asset-free *and* infinite-detail is the family's oldest trick — real
data for the skeleton, procedural noise for the skin:

1. **The MOLA skeleton is the truth at range.** `elevation(lat, lon)` from the
   baked table places Olympus, Valles Marineris and Jezero's delta *exactly*
   where they really are. This is the large-scale shape, streamed as coarse LOD
   tiles for the planet view and the horizon.
2. **Procedural refinement is the skin at your boots.** Below MOLA's resolution,
   deterministic `fbm`/ridged noise (the `noise.js` port) adds rocks, ripples,
   small craters and dune fields — seeded by tile coordinate so every client
   grows the same ground. You get *real Mars at planet scale* and *walkable
   detail at human scale* from a small table plus a seed. This is precisely how
   `terraingen` skins Earth chunks; Mars just never gets to skip a tile.
3. **LOD is aggressive and mandatory.** Concentric rings of decreasing
   resolution around the player (the `RADIUS`/`BUILDS_PER_FRAME` pattern),
   geometry disposed out of range (invariant 7), a skirt/stitch scheme so LOD
   seams don't crack. This is **named risk #1** and Phase 0 exists to prove it
   holds when the whole frustum is terrain.
4. **One height function, two readers.** The CPU `elevation()` the rover
   physics and player feet stand on and the value the vertex shader displaces
   **must agree to the metre** — Saltstead's Gerstner CPU/GPU-lockstep rule
   (`waves.js` + `verify-waves`), re-pointed at terrain. A `verify-marsterrain`
   asserts the JS evaluator and the shader's height come from the same parameter
   table. Wheels that float or feet that clip are the Mars version of buoyancy
   disagreeing with the wave crest.

### Underground — the second frame (`marsunder.js`)

The mystery lives below the regolith, and Mars really is riddled with **lava
tubes** — voids tens of metres wide, roofed and stable, with real collapse-pit
skylights on the Tharsis volcanoes. This is a gift: the underground is a
**second local frame**, exactly the way Saltstead's below-decks hold is a
ship-local frame you enter through the hatch grating. You rappel or drive a
skylight, the surface terrain/sky/dust layers douse, and a light-tight tube
opens up — lit by your own lamps, pressure-sealable as an early natural stead,
and the corridor down to every beat of the panspermia thread. The camera clamps
within the tube walls; the frame transition happens at the skylight lip, the
gangplank moment reused wholesale.

---

## The stead: genuine base-building (the new system, the game's heart)

This is what neither sibling has and what the name promises. It is the largest
new subsystem and the one with no port to inherit — so it is designed to obey
every inherited invariant from the first line.

### What a stead *is* — data, not scenery

A stead is a **list of placed parts**: `{ type, cell:[q,r,layer], rot, seed }`,
snapped to a grid. That is the whole authored state of the world. It **rides the
save** (forward-refuse / back-migrate, the Saltstead pattern) and, in
multiplayer, **rides the relay** as the networked unit — a stead is to Marsstead
what a ship is to Saltstead. Because it is pure data over a deterministic parts
catalogue, any client rebuilds the identical geometry from the list; nothing
about the mesh is transmitted, only the list. Invariants 1 and 4 hold by
construction.

### The parts catalogue — `src/steadparts.js` (pure, verify-gated)

Every part is a **parametric procedural mesh built in code** — no assets. The
catalogue is a table (append-only, like `legends`/`ports`) of generators:

- **Structure:** hab cylinders, domes, connecting corridors, airlocks, the
  first inflatable starter-hab.
- **Power:** solar arrays (output scales with latitude, season, dust coating and
  the day/night terminator — real), an RTG (steady, precious), later a reactor.
- **Life support:** O₂ splitters (electrolysis of mined water), CO₂ scrubbers,
  heaters, water tanks, a Sabatier reactor (CO₂ + H₂ → methane fuel + water).
- **Production:** ice drills, ore refiners, a regolith sinterer (print more
  parts from the ground — the loop that lets the stead *grow itself*),
  greenhouses (food + a splash of green against all that ochre).
- **Reach:** landing pads and fuel depots that turn a stead into a hopper anchor.

Each generator is `buildPart(def, seed) -> { positions, colours, indices }`,
pure and headless — the exact contract `terraingen.buildChunkData` and
`shipframe` already honour, so `verify-steadparts` runs the whole catalogue
under Node and asserts every part is watertight, on-grid, and within its cell.

### The resource sim — `src/steadsim.js` (pure tick, verify-gated)

The stead is only real if it can fail. A pure per-tick simulation balances
**power, oxygen, water, heat, and fuel** across the placed parts:
production − consumption, with storage buffers and adjacency rules (an airlock
must bridge pressurised and unpressurised volumes; power routes along
connectors; a solar array under dust or in polar night underproduces). This is
Saltstead's plunder economy re-cast as a survival balance sheet, and it is
**pure**, so `verify-steadsim` can drive a stead through a sol, a dust storm and
a polar winter and assert it neither free-lunches nor unfairly starves.

The tension that makes it a game: **every part you add is another mouth.** A
bigger stead refines faster but draws more power and air; overreach in the polar
night and the lights dim. This is the fleet dilemma from Saltstead ("rich and
slow") re-cast as "capable and hungry."

### Building it, in third person

Placement is proximity + soft-lock + a snap grid — the same interaction grammar
as Saltstead's `E`-to-do, never a free-flying god cursor. You carry parts as
printed inventory from the sinterer; you walk to a cell; the ghost snaps; a
build meter runs while your suit clock keeps ticking. Kid-safe by construction:
in a shared stead you may only *add* and *operate*, never remove another
player's work.

### The blackout rule (what "running out" costs YOU — the founder/wreck heir)

Saltstead has no death; the sea keeps accounts in two escalating doses
(founder → wreck). Marsstead keeps the exact shape, because the planet is
lethal and the game must not be:

1. **Brownout** — suit air or stead power crosses the red line: the screen
   desaturates and narrows, movement slows, the HUD screams. The warning shot.
   Reach shelter or a cached depot and you recover with nothing worse than a
   fright.
2. **Blackout** — you let it run all the way out: **you don't die.** You wake at
   your nearest stead (or the drop capsule if you have none), rescued — but the
   planet takes its tithe: the **cargo you were carrying is lost** (dropped on
   the sand at the blackout point, recoverable if you go back for it), the
   **prospecting sample chain resets**, and any **unpowered stead you were away
   from may have shed a part to the cold** (a heater cracked, an array frosted —
   repairable, never destroyed). Banked, powered stead-state is untouched — the
   equivalent of Davy Jones' Locker being safe. The lesson curve mirrors
   Saltstead's exactly: brownout teaches "top up early"; blackout teaches
   "never range beyond your air."

The state rides the save, so a refresh is never a rescue — the same rule that
makes Saltstead's crippled flag matter.

---

## The mystery: panspermia, and where life on Earth began

This is the legends layer made into a spine — the thread the landing page sells
("a planetary mystery the sand has kept for four billion years"). It is the
game's wonder and its through-line, and it is grounded in **real** Mars science
so that discovery teaches something true, the way Saltstead's star chart teaches
real navigation.

### The premise (real science, wondrous conclusion)

Mars was wet and possibly habitable four billion years ago, long before Earth's
own life is firmly recorded. Rock is thrown between the two planets for real —
we hold **Martian meteorites** on Earth (the ALH84001 debate over
microfossil-like carbonate structures is real history). Marsstead's mystery
follows that thread to its most wondrous defensible end: **life may have begun
here, and been carried to Earth** in the ejecta of an ancient impact. The dig
runs from hard, real geology toward that reveal — never contradicting the
science, only leaning into its open questions.

A quiet, lovely piece of family connective tissue falls out of this: if the
origin of Earth-life is *here*, then Moorstead's moors and Saltstead's seas
literally began on the world you are now homesteading. The three `stead`s share
one biosphere's story.

### `src/marslegends.js` — the anchored, append-only content table

Modelled exactly on `legends.js` (append-only, verify-gated, each row anchored
to real geography, each exercising a different system). Kinds carry over and add
one:

- **`site`** — a real named place worth the voyage (a mystery beat lives here).
- **`hazard`** — the rules bend (a dust storm cell, a Cerberus-Fossae marsquake
  zone, a radiation-hot crater).
- **`vault`** — an underground chamber (the lava-tube frame), the endgame reveals.
- **`wonder`** — a pure navigation/awe landmark (the Olympus caldera rim, the
  Valles Marineris wall) that pays in *arrival*, teaching geography by stealth.
- **`relic`** *(new)* — a fragment of the panspermia thread: a sample, a
  reading, a structure. Relics chain; each points at the next real site.

The design rules are Saltstead's, unchanged: **anchored to real geography;
discovered, not listed** (instrument anomalies and chart fragments point you
there — no map-marker shopping list); **the payoff respects the economy** (a
relic advances the story and unlocks tech, it doesn't hand you free resource);
**each kind stresses a different system** (site = traversal/survival, hazard =
the weather/terrain sim, vault = the underground frame, wonder = navigation,
relic = the instruments).

### The chain, in real places (the spine of Phase 3)

Discovered, never signposted — the magnetometer twitches, a chart fragment names
a crater, a hail from mission control notes an anomaly — but always pointing at
**real** Mars:

1. **The old shoreline.** On the dichotomy boundary, the terrain remembers a
   waterline. First hint the tide was real. (Teaches: read the land.)
2. **Jezero's delta.** A real river delta; the ground here logged flowing water.
   The first relic — mineral signatures a real rover went looking for.
3. **A recurring slope lineae seep + a methane spike.** Real, unresolved Mars
   mysteries. The magnetometer/spectrometer earn their keep; the trail turns
   *down*.
4. **A lava-tube vault (Arsia-Mons-class skylight).** The underground frame
   opens. Subsurface ice, then structure — the ALH84001 question made walkable.
5. **The deep dark.** The final vault, and the ejection event: the record of the
   impact that flung Martian rock — and its cargo — toward a young Earth. The
   game's Davy-Jones's-Locker endpoint, in the deepest ground.

Pacing across a whole planet is **named risk #5**: the chain must be reliably
*findable* without being a checklist. The instruments are the answer — they get
warmer as you near a beat, so the world itself leads without a marker floating in
the sky.

---

## Real weather, real Mars (the weather-live pattern, re-pointed)

Saltstead eases live Open-Meteo wind into its sails. Mars has no live feed, so
the analogue is a **deterministic Mars climate model** driven by season (areocentric
longitude Lₛ), latitude and elevation — real seasonal CO₂ cap growth, the diurnal
thermal swing, and the crown jewel of Mars drama: **dust**.

- **Dust devils** — real, common, and the ambient life of the plains (the
  wildlife-layer role): thin rotating columns that cross the dunes, tug at loose
  regolith, and lightly *clean or coat* your solar arrays as they pass.
- **The global dust storm** — Mars's equivalent of the Saltstead storm-as-event,
  and bigger than anything the sea does. Real Mars storms can shroud the whole
  planet for weeks. In-game it is a season-scale threat you can forecast and must
  prepare for: the sky reddens to opaque, solar output collapses (this is why the
  RTG and the reactor exist), visibility falls to a hazard, and a stead that
  can't ride out the dark on stored power is in trouble. It *builds* the way
  Saltstead's wind builds offshore — a slow, legible, dramatic override where
  fun beats a literal simulation.

Any climate reads deterministically from the model — no fetch, no dependency
(the truth is baked, unlike Saltstead's optional live layer). The sky itself is
`src/marssky.js`, the landing page's shader promoted to a module: butterscotch
day, blue-haloed dusk, Phobos hurrying the wrong way, the film-grain that keeps
the gradient from banding.

---

## Third person, and the astronaut

You look down on your homesteader and the stead you are raising — the object of
the whole fantasy on screen at all times, the Saltstead camera rule intact. Two
rigs: a close orbit on foot / inside a hab, a pulled-back view from a rover or at
altitude in a hopper. Interaction is proximity + soft-lock, never a crosshair.

The captain becomes the **colonist**: a readable procedural character model in a
pressure suit, with cosmetic progression that is now also *mechanical* flavour —
suit tiers (the hats of Marsstead) carry more air, shrug off more cold, resist
more radiation. The suit is your smallest, most personal stead.

---

## What ports from Saltstead / Moorstead

| Family system | Becomes in Marsstead |
|---|---|
| Terrain streamer + chunk gen (`terrain`/`terraingen`, LOD, dispose-on-range) | The 100%-terrain Mars streamer — same pattern, cheap-tile skip deleted |
| `earth.js` pure projection + baked-table decode | `mars.js` — MOLA + gazetteer decode, `elevation`/`slope`/`named` |
| Data-in-code bake (`build-earthdata.mjs`, Natural Earth → Int16) | `build-marsdata.mjs` — MOLA + USGS Gazetteer → Int16 metres |
| `noise.js` fbm/value noise | Direct port — the sub-MOLA procedural skin |
| Ship-local moving frame + gangplank transition | Pressurised rover interior; the lava-tube underground frame |
| Below-decks hold (light-tight second frame) | The underground / sealed-hab interior frame |
| Wave CPU/GPU lockstep (`waves` + `verify-waves`) | Terrain height CPU/GPU lockstep (`verify-marsterrain`) |
| `legends.js` append-only anchored content table | `marslegends.js` — sites, hazards, vaults, wonders, relics |
| `ports`/`shipyard` append-only catalogues | `steadparts.js` — the base-building parts catalogue |
| Plunder economy (income at sea) | The resource sim (`steadsim`) — progress from the ground |
| Founder/wreck rule (no death, the sea accounts) | The brownout/blackout rule (no death, the planet accounts) |
| Sky/weather/season/storm | `marssky` + deterministic Mars climate; the global dust storm |
| Wildlife layer (fins, pods, gulls) | Dust devils, drifting frost, the ambient life of a dead plain |
| Weather-live easing discipline | Deterministic climate model (baked, not fetched) |
| Relay client + additive protocol; ship as networked unit | Stead as networked unit; co-op homesteading |
| Save (forward-refuse/back-migrate), update-check, telemetry | Direct port |
| NPC brains on the EVO (`llama-server`, canned fallback first-class) | Mission-control / crew voice — LLM a layer, never a dependency |
| Procedural audio + shanties | Suit-radio hiss, wind-thin ambience, the stead's hum |
| Verify-gate methodology, docs structure, `deploy.mjs` gate | Day one |

**New, with no family equivalent:** freeform base-building (parts catalogue +
grid/snap + resource sim), rover/hopper/orbital vehicle physics under 0.38 g and
thin air, the underground exploration frame at scale, and a planet where LOD is
not an optimisation but the thing that makes the game possible at all.

---

## The EVO and the ledger (family infrastructure, already sized for this)

Marsstead already speaks to the family's home server: the landing page fires a
visitor beacon at `/dash/visit`, which Vercel rewrites to the same EVO door
Saltstead uses, and the Admiralty Board (`:8099`) already musters visitors and
play-starts "for every stead." When Marsstead needs a relay (multiplayer) and a
brain (mission-control voice), they ride the same box: the EVO X2's UMA pool has
headroom to spare, `llama-server-moorstead` (Gemma, `--parallel 32`) can carry a
third game's register, and the CSP/tunnel pattern is proven twice over. Nothing
new to stand up — Marsstead slots into infrastructure built to hold it.

---

## Phases (each gated by verify, the family way)

- **Phase 0 — the ground (kill/go gate).** One region of real Mars (Jezero or a
  single MOLA tile), heightfield streaming + LOD with the cheap-tile skip
  removed, walk it in a suit under 0.38 g, third-person camera, the suit-air /
  thermal HUD. **The gate:** does walking real Mars terrain feel right, and does
  the all-terrain streamer hold framerate when nothing in the frustum is free?
  This proves named risks #1 and #6 or the project stops here. *(Verify:
  `verify-mars` for the projection/elevation math, `verify-marsterrain` for
  CPU/GPU height lockstep and LOD stitching; a `live-mars.mjs` puppeteer walk.)*
- **Phase 1 — the planet.** Global MOLA baked + procedural skin, the USGS
  gazetteer, `marssky` promoted from the landing page, the deterministic climate
  model, tier-0→1 traversal (foot + buggy), day/night and dust devils.
- **Phase 2 — the homestead.** The parts catalogue, grid/snap building, the
  resource sim (power/air/water/heat/fuel), prospecting instruments, drilling and
  refining — the survival loop closes. Tier-2 pressurised rover (the moving
  frame). *(Verify: `verify-steadparts`, `verify-steadsim`.)*
- **Phase 3 — the reach and the mystery.** Hopper/orbital traversal (the
  distance-compressor), the underground frame, `marslegends` and the panspermia
  chain wired to their real sites, the global dust storm as a season-scale event.
- **Phase 4 — multiplayer.** Relay integration (the EVO box), the stead as a
  networked unit, co-op homesteading in shared, add-only steads.
- **Phase 5 — progression and balance.** The full traversal + suit + reactor
  ladder, depth-and-distance-and-cold as the difficulty thermostat, the
  mission-control / crew voice (NPC brains), economy balance across a sol-year.

---

## Named risks

1. **100%-terrain planet streaming.** No cheap tile to skip; LOD is mandatory,
   not polish. Chunked multi-resolution heightfield (real MOLA skeleton +
   procedural skin), aggressive concentric LOD with skirt/stitch, dispose on
   range. Phase 0 exists to prove this holds when the whole frustum is terrain.
2. **Base-building persistence, determinism and multiplayer sync.** Solved by
   making the stead pure data (a list of placed parts over a deterministic
   catalogue) that rides both the save and the relay; geometry is rebuilt
   client-side, never transmitted. `verify-steadparts` keeps the catalogue
   watertight; `verify-steadsim` keeps the economy honest.
3. **Crossing a whole planet without tedium or triviality.** The traversal ladder
   *is* the answer — the hopper is the open-sea gait, built steads become
   fast-travel anchors, and reach costs refined fuel so distance stays a real
   decision.
4. **A survival sim that's tense but kid-safe.** No death; the brownout/blackout
   rule (the founder/wreck heir) makes running out costly but never terminal, and
   the cold clock is deliberately generous.
5. **Mystery pacing across a huge world.** Discovered-not-listed, but the
   instruments warm as you near a beat so the world leads without a floating
   marker — the star-chart discipline (read the live sim, never a lookup table of
   answers) applied to discovery.
6. **CPU/GPU terrain agreement.** One height-parameter table generates both the
   GLSL displacement and the JS `elevation()` evaluator; `verify-marsterrain`
   asserts they stay in lockstep, so wheels don't float and feet don't clip —
   Saltstead's wave-lockstep rule, re-pointed at land.
