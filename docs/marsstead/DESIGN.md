# Marsstead — founding design document

*(Working title, and the live one: **www.marsstead.app** already stands, the
blue-dusk dune shader already running. Third sibling to Moorstead and
Saltstead — same identity, new world.)*

A procedural survival-and-homesteading game on the **real Mars**, scaled. You
land alone on a dead planet that was once alive, keep a suit's worth of air and
heat between you and the cold, and **build** — the first `stead` where the
homestead is not the setting but the point. Raise habs from the regolith, range
out by rover, jump the horizon by rocket, and follow a thread the sand has kept
for four billion years down into the dark — to where life on **Earth** began,
and to something the deep would rather you did not find. Third-person.
Browser-first, procedural-only, no asset files — ever.

> The name is the thesis. Moorstead is a homestead on the moors; Saltstead a
> homestead on the salt sea; **Marsstead is the homestead you actually build,
> hab by hab, on a world with no ports and no towns.** The planet gives you
> nothing. Everything on the surface that isn't rock, you put there — and you
> put it there with **one companion**, a voice in your ear that is the only
> other mind for two hundred million kilometres.

This document is the founding contract, modelled on Saltstead's `docs/DESIGN.md`.
It is the design **and** the architecture: an implementer should be able to start
Phase 0 from it. Marsstead is its own repository (`jamescockburn47/marsstead`,
Vercel project `marsstead`) with its own `CLAUDE.md` mirroring the family.

---

## The two things that make it Marsstead (the USPs)

Everything below serves two ideas the siblings don't have. They are load-bearing;
cut either and this is just a pretty Mars walker.

### USP 1 — a real AI as your co-star, not a menu

You are the only human on Mars. **VESPER** *(working name — the evening voice)*
is the only other mind: a settlement/suit AI that is **actually driven by a
language model**, the Moorstead villager-brain pattern ported whole. Not barks
from a table — a companion that watches the same sky you do, remembers what you
built yesterday, warns you the storm is coming because it can read the same
forecast the sim runs, gets quietly delighted when a hab finally holds pressure,
and — this is the point — is **afraid in the deep with you**.

- **Real brain, canned heart.** The live LLM runs on the family's EVO server
  (`llama-server`, the worldsvc relay shape); the prompt carries the *live* world
  state — sol-time, temperature, suit air, power margin, where you are, what you
  just did, the last log lines — so VESPER speaks to the Mars you are actually
  standing in. But the **canned-line fallback is first-class** (pure,
  verify-gated, per-mood): if the relay is down or you're a guest, VESPER still
  speaks, still has a personality, still fills the silence. **The LLM is a layer,
  never a dependency** — the Moorstead/Saltstead weather-live rule, applied to a
  character.
- **The backdrop against solitude.** A whole empty planet is the biggest quiet
  room any `stead` has built. VESPER is the furniture that makes it bearable and
  then makes it *company*: ambient remarks on a good sunset, a hum of chatter on
  a long rover haul, the thing that turns passage-time into presence. This is
  Marsstead's answer to Saltstead's "the sea must not be boring."
- **It is your friend, and it stays your friend.** A firm design decision:
  **VESPER never turns on you.** The evil-AI twist is a cliché and it would
  poison the one relationship the game is built on. Its unease in the dark is
  *shared* fear, human-making, not menace — which is exactly what makes the
  horror land (below). The dread is the planet's; VESPER is the hand you hold in
  it.
- **Explicit, and honestly so.** VESPER is diegetically an AI — the game never
  pretends otherwise. That honesty is a feature: a kid meets a character that is
  openly a machine mind, warm and fallible, and the boundary is always clear.

Verify: prompt-assembly + the canned fallback table are pure modules
(`verify-vesper`); a live check with the relay stubbed asserts the panel opens,
the fallback voice fires, and **no game-state leak** — the prompt builder only
ever reads whitelisted fields.

### USP 2 — one of the aims is *terrifying*

Marsstead is **beautiful and dangerous**, and the danger has a bottom to it. The
homesteading on the surface is wonder and grind under a butterscotch sky; but the
mystery pulls you **down**, and the deeper you go the more the game stops being
cosy and starts being **afraid**. The final aim — reaching the origin, the thing
the panspermia thread is really about — is meant to genuinely frighten.

- **Horror without a monster to shoot.** Marsstead has **no combat** (the
  antagonist is the planet), so the terror is survival-horror in the truest
  sense: the dark, the cold, the dwindling air, the crushing alone-ness, the
  bootprints that are only ever *yours*, and — in the deepest vaults — the
  growing certainty that the origin of life left something behind that is not
  entirely finished. You do not fight it. You endure it, you flee it by the light
  of one failing lamp, and finally you *understand* it. Dread and awe, never gore.
- **Earned, opt-in, always escapable.** The surface is safe-ish; terror is a
  **destination you descend toward**, and you always know you're choosing it. And
  because of the no-death rule (the blackout, below), the worst the dark can do is
  cost you — never end you. Fear here is a tool for wonder, never a punishment.
  That reconciliation — **genuinely scary, wholly kid-safe, always fun** — is the
  hardest design line in the game and it is drawn on purpose (named risk).
- **VESPER makes it land.** A scary cave is just a cave. A scary cave with a
  friend whose voice tightens, who goes quiet when it shouldn't, who says *"I'm
  still here"* when the lamp gutters — that is fear you feel. USP 1 is the engine
  of USP 2.

---

## The identity (inherited from Moorstead & Saltstead — non-negotiable)

1. **Browser-first, instant-play, procedural-only.** All geometry, textures,
   audio synthesised in code. Low-poly flat-shaded style — `BufferGeometry`
   built in code, not voxels, but still **zero binary assets**. The landing
   page's dune shader is the proof of tone: one fragment shader, no downloads.
2. **Kid-safe shared worlds.** Server-authoritative caps, no raw player text as
   HTML (`escHtml` everywhere), no unbounded griefing surface. A shared stead is
   built cooperatively; you cannot demolish another player's work. The horror is
   atmospheric, never graphic.
3. **The verify gate is the contract.** Headless `npm run verify` must be green
   before deploy. Every feature ships with an assertion that defends it. Pure
   logic lives in modules that import no THREE/DOM so the gate runs them under
   Node.
4. **Determinism.** Terrain, weather, ore, the mystery's placement — all derive
   from stable seeds and the baked real-Mars tables. Never `Math.random()` at
   build/spawn time for anything shared across clients. The two authored,
   non-deterministic things are **the player's stead** and **VESPER's live
   speech** — which is exactly why the stead rides the save/relay as explicit
   data and VESPER always has a deterministic canned voice underneath.

---

## Beautiful and dangerous, always fun: the physics of Mars, designed in

The planet is not a backdrop with a red filter. Three real facts of Mars are
**mechanics, felt in every action** — each one simultaneously a source of
beauty, of danger, and of fun. Getting these three right is most of the game.

### 0.38 g — Marsstead's *wind*

Mars pulls at roughly a third of Earth. This is the planetary constant you learn
to exploit, the way a Saltstead captain learns the wind — and it must feel
different from Earth in **every** verb:

- **Movement:** an EVA stride is a low, floating bound; hang-time is long; you
  clear a boulder a walker couldn't. Momentum is heavy but gravity is light, so
  you *glide and wallow*, never twitch.
- **Falling is survivable** (and the no-death heir supports it): a drop that
  would break a leg on Earth costs you a stumble and some suit wear. This is what
  lets the terrain be genuinely vertical and the caves genuinely deep without
  being lethal.
- **Throwing, digging, dust:** flung regolith arcs slow and far; a dropped tool
  drifts down; the plume off a drill *hangs*. Low-g is legible on screen every
  second because loose matter obeys it visibly.
- **The vehicles trade on it:** the buggy *leaps* ridges (low-g is its
  suspension); the hopper crosses a horizon on a cupful of methane because thin
  air + weak gravity make ballistic hops enormous; orbit is cheap (escape
  velocity is a fifth of Earth's). Reduced gravity is why "jump the horizon by
  rocket" is physically honest, not a hand-wave.
- **One constant, one implementation:** `G_MARS` lives in a pure physics module;
  player, thrown matter, vehicles and the hopper all integrate against it, and
  `verify-physics` asserts jump apex, fall time and hop range match the 0.38-g
  numbers. Fun, danger and beauty all fall out of getting this one constant to
  *feel* right.

### The dust — the planet's breath, beautiful and treacherous

Mars is a world of dust, and it is everywhere by design — the ambient life, the
great danger, and half the beauty:

- **Beauty:** the butterscotch sky and the true **blue sunset halo** are dust
  (fine particles forward-scatter blue); low sun throws long shafts through
  suspended haze; your bootprints and rover tracks *persist* on a surface that
  had no marks before you — you are writing on a four-billion-year-old page.
- **The ambient layer (the wildlife-role):** **dust devils** cross the plains,
  real and common — thin rotating columns that tug loose regolith and, as they
  pass, **lightly clean or coat your solar arrays** (a real Martian effect, and a
  small gift-or-curse of power).
- **The danger — the global dust storm:** Mars's storms can shroud the *whole
  planet* for weeks. This is Marsstead's storm-as-event, bigger than anything the
  sea does: forecastable, dread-building, the sky reddening to opaque, **solar
  output collapsing** (this is *why* the RTG and reactor exist), visibility
  falling to a hazard. A stead that cannot ride out the dark on stored power is
  in real trouble. It *builds* like Saltstead's offshore wind — a slow, legible,
  dramatic override where fun beats a literal simulation.
- **On you:** dust films your visor, hazes the HUD, settles on everything. It is
  the texture of the world without a single texture file — all scatter maths in
  `marssky` and the dust shader.

### Harsh day and night — the sol as a tide

The Martian sol is 24 h 39 m, and the swing across it is brutal and beautiful:

- **The rhythm:** day is work and wonder — mild-ish, bright, the time to range
  and build. Night is survival and dread — down past −80 °C, solar power dead
  (hence storage / RTG / reactor), and the hour the mystery feels closest. Day
  and night are Marsstead's tides: a core rhythm you plan against, not a skybox
  swap.
- **Beauty:** a sky with a hundredth of Earth's light pollution — two hurrying
  moons (Phobos rising in the *west*, crossing in hours; Deimos crawling the
  other way), the Milky Way hard and bright, Earth itself a blue evening star you
  can find and stand under. The star chart that Saltstead teaches navigation with
  becomes, here, a thing of pure awe with a lesson inside it.
- **Danger:** the thermal cliff at dusk, the terminator racing across the plain,
  the cold that cracks an unpowered heater — the clock that makes shelter matter.
- **Generous, on purpose:** the cold clock is tense, not a stopwatch (the
  fun-over-truth override). You can be caught out at night and *survive* it hard;
  you should rarely be killed by arithmetic.

Together these three are the pillar in one line: **the same planet that gives you
the most beautiful sunset you've ever seen will kill you in the dark an hour
later — and crossing that line on purpose, with VESPER in your ear, is the
best fun the game has.**

---

## Why Mars is the hard sibling

Saltstead's planet is **99% flat water** — it skips deep-ocean tiles entirely and
the ocean is a near-free shader plane. **Mars has no cheap tile.** Every square
metre is displaced heightfield; there is nothing to skip. That single fact
reshapes every inherited system:

| Saltstead assumption | Mars reality |
|---|---|
| 99% of chunks cost nothing (open water) | 100% of chunks are terrain; LOD is survival, not polish |
| Distance across water is *boring*, so compress it (open-sea gait) | Distance across Mars *is the content*; you cross it faster (rover → rocket), never hide it |
| The world is a stage for the ship | The world is the antagonist (cold, dust, thin air, radiation, distance, the dark) |
| Income originates at sea (plunder) | Progress originates from the ground (prospect → extract → refine → build) |
| No death; the sea keeps accounts (founder/wreck) | No death; the planet keeps accounts (brownout/blackout) |
| The horizon is company (busy lanes) | The horizon is empty — VESPER is the company (USP 1) |

Everything that ports, ports **because** of these differences, not despite them.

---

## The setting: "the tide went out four billion years ago"

Near-future, framing deliberately small and unofficial — *owned by nobody's art
department*. You are not a national agency planting a flag; you are an
independent homesteader (then, in multiplayer, a scattering of them) on a Mars
that was once wet, warm-ish, and — the mystery insists — **alive**. The deeper
you dig, the older the story gets, until it stops being about you at all.

Real Mars is the whole hook, honoured to the metre: the northern-lowland dry
"ocean" of the hemispheric dichotomy (the tide that went out, with debated real
palaeo-shorelines); Olympus Mons (~+21 km); Valles Marineris (4,000 km long, up
to 7 km deep); Hellas (~−8 km, deepest); Jezero's river delta (Perseverance);
Gale (Curiosity); Cerberus Fossae (real marsquakes, InSight); the Medusae
Fossae; Arsia Mons's collapse pits (candidate lava-tube skylights). Every one is
a destination the way Saltstead's legends are.

---

## The core loop

Saltstead: spot a sail → chase → plunder → fence → upgrade. Marsstead replaces
the prey with the planet, and threads VESPER and the descent through all of it:

**Survive** (air, heat, power, dust — VESPER watching the gauges with you) →
**prospect** (read the ground with real instruments — spectrometer, ground
radar, a magnetometer that twitches at the mystery) → **extract** (drill ice,
mine ore, crack the CO₂ air) → **refine** at your stead (water, oxygen, methane
fuel, metal, parts) → **build / expand** the stead and **upgrade traversal** →
**range farther** into colder, higher, deeper, stranger ground → **follow the
thread down** toward the next beat of the mystery → the planet raises the stakes
(distance, altitude, the global storm, the dark).

**All progress originates from the ground.** No plunder, no port to sell to — the
antagonist is Mars. What money is to Saltstead, **refined resource and
manufactured parts** are to Marsstead: what you spend to climb. The stead is
where it is spent. The family's economy rule turned exactly inside out, and
coherent: on Mars, the ground is all there is.

Difficulty is the planet's own thermostat: Saltstead's notoriety-and-heat becomes
**depth-and-distance-and-cold-and-dark**. The farther and deeper you push, the
less the planet forgives — and the more afraid the game lets itself become.

---

## The world: real Mars, scaled, all terrain

### The data (baked, like `earthdata.js` — never by hand)

`src/marsdata.js` is **generated** by `scripts/build-marsdata.mjs` from public
NASA/USGS data, as `earthdata.js` is baked from Natural Earth:

- **MOLA** (Mars Orbiter Laser Altimeter) global topography — the canonical,
  public-domain Mars DEM. Downsampled to a browser-sized global grid (start
  ~0.25–0.5°), quantized to **Int16 metres**. A happy accident: real Mars
  elevations span roughly −8,200 m (Hellas) to +21,900 m (Olympus) — **both fit
  inside Int16**, so the bake is raw metres, no offset, no loss at the skeleton
  level.
- **The USGS Gazetteer of Planetary Nomenclature** (public domain) → the named
  features table (craters, montes, valles, planitiae, fossae), each a
  lat/lon/diameter row. Becomes `marslegends.js` (below).
- **No imagery, ever.** Colour is *synthesised*, not sampled: dusty ochre
  lowlands, dark basaltic highland, wind-streak albedo, CO₂/H₂O frost at the caps
  and pole-facing slopes — a function of elevation, slope, latitude and season,
  the way `terraingen.colourFor` already does for Earth. Deriving the look from
  the real *shape* keeps invariant 1; sampling a photo would break it.

### The projection module — `src/mars.js` (pure, the `earth.js` of Mars)

The direct analogue of `earth.js`: no THREE, no DOM, verify-gated. Decodes the
baked MOLA + gazetteer tables and answers what everything asks —
`latLonToWorld`/`worldToLatLon` (equirectangular; poles noted), `elevation`,
`slope`, `named` (nearest feature), `frostLine(lat, season)`, and the traversal
gait. **Wraps east–west**, like Earth. Where Saltstead asks "how far to the
coast," Mars asks "how far to breathable shelter" — the nearest stead or depot,
which the survival HUD reads.

### Scale and the traversal answer

No boring ocean to compress, so distance is solved the way the era-ladder solves
Saltstead's: **the way you cross Mars is itself the progression**, and each tier
changes *how* you travel, not just the number — and each leans on the 0.38-g
physics above:

| Tier | Vehicle | How it crosses Mars | The 0.38 g lever |
|---|---|---|---|
| 0 | **On foot (EVA)** | walk the real terrain; suit air is the clock | bounding stride; a fall is survivable |
| 1 | **Unpressurised buggy** | fast local prospecting; open to the cold | it *leaps* ridges — low g is the suspension |
| 2 | **Pressurised rover** | a home that moves — the stead frame ports here | a rolling airlock; range = its own life support |
| 3 | **Suborbital hopper** | "jump the horizon by rocket" — the distance-compressor | thin air + low g = huge ballistic hops on little fuel |
| 4 | **Orbital shuttle** | cross a hemisphere; land near a built stead | escape velocity a *fifth* of Earth's — orbit is cheap |

The **hopper is Marsstead's open-sea gait**: it doesn't hide the terrain (the
terrain is the point), it lets you *skip across* it and see it from altitude.
Built steads become fast-travel anchors — hop *to* a hab you raised, and the
world knits into a network of your own making. Reach costs refined methane
(Sabatier from CO₂ + your mined water), so every hop spends the stead's output:
rangefinding is a resource decision.

### Streaming — the hard part, honestly (`marsterrain.js` + `marschunk.js`)

Heirs of `terrain.js` / `terraingen.js`, with the cheap-tile escape hatch
**deleted**. The technique that keeps it asset-free *and* infinite-detail is the
family's oldest trick — real data for the skeleton, procedural noise for the
skin:

1. **The MOLA skeleton is the truth at range.** `elevation(lat, lon)` places
   Olympus, Valles Marineris and Jezero's delta *exactly* where they are —
   streamed as coarse LOD for the planet view and the horizon.
2. **Procedural refinement is the skin at your boots.** Below MOLA's resolution,
   deterministic `fbm`/ridged noise (the `noise.js` port) adds rocks, ripples,
   small craters and dune fields, seeded by tile coordinate so every client grows
   the same ground. Real Mars at planet scale *and* walkable detail from a small
   table plus a seed.
3. **LOD is aggressive and mandatory.** Concentric rings of decreasing resolution
   (the `RADIUS`/`BUILDS_PER_FRAME` pattern), geometry disposed out of range
   (invariant 7), skirt/stitch so seams don't crack. **Named risk #1**; Phase 0
   proves it holds when the whole frustum is terrain.
4. **One height function, two readers.** The CPU `elevation()` the rover physics
   and player feet stand on and the shader's vertex displacement **must agree to
   the metre** — Saltstead's Gerstner CPU/GPU-lockstep rule, re-pointed at
   terrain. `verify-marsterrain` asserts the JS evaluator and the shader share
   one parameter table. Floating wheels are Mars's version of buoyancy
   disagreeing with the wave crest.

### Underground — the second frame, and where the horror lives (`marsunder.js`)

Mars really is riddled with **lava tubes** — stable roofed voids with real
collapse-pit skylights on the Tharsis volcanoes. This is a gift: the underground
is a **second local frame**, exactly the way Saltstead's below-decks hold is a
ship-local frame entered through the hatch. You rappel or drive a skylight, the
surface terrain/sky/dust layers douse, and a light-tight tube opens — lit only by
your own lamp, pressure-sealable as an early natural stead, and the corridor down
to every beat of the panspermia thread. The camera clamps within the tube walls;
the frame transition happens at the skylight lip (the gangplank moment reused).
**This is the theatre of USP 2:** the dark, the single light, the cold, and VESPER
getting quiet.

---

## The stead: genuine base-building (the new system, the game's heart)

What neither sibling has, and what the name promises. Largest new subsystem, no
port to inherit — so designed to obey every inherited invariant from line one.

### What a stead *is* — data, not scenery

A stead is a **list of placed parts**: `{ type, cell:[q,r,layer], rot, seed }`,
snapped to a grid. That is the whole authored state of the world. It **rides the
save** (forward-refuse / back-migrate, the Saltstead pattern) and, in
multiplayer, **rides the relay** as the networked unit — a stead is to Marsstead
what a ship is to Saltstead. Pure data over a deterministic parts catalogue, so
any client rebuilds identical geometry from the list; nothing about the mesh is
transmitted. Invariants 1 and 4 hold by construction.

### The parts catalogue — `src/steadparts.js` (pure, verify-gated)

Every part is a **parametric procedural mesh built in code** — no assets. An
append-only table (like `legends`/`ports`) of generators:

- **Structure:** hab cylinders, domes, corridors, airlocks, the first inflatable
  starter-hab.
- **Power:** solar arrays (output scales with latitude, season, dust coating and
  the terminator — real), an RTG (steady, precious), later a reactor. *(Power is
  the dust storm's stakes and the night's stakes — see the physics pillar.)*
- **Life support:** O₂ splitters (electrolysis of mined water), CO₂ scrubbers,
  heaters, water tanks, a Sabatier reactor (CO₂ + H₂ → methane fuel + water).
- **Production:** ice drills, ore refiners, a regolith sinterer (print more parts
  from the ground — the loop that lets the stead *grow itself*), greenhouses
  (food + a splash of green against all that ochre).
- **Reach:** landing pads and fuel depots that turn a stead into a hopper anchor.

Each generator is `buildPart(def, seed) -> { positions, colours, indices }`,
pure and headless — the `terraingen.buildChunkData` / `shipframe` contract, so
`verify-steadparts` runs the whole catalogue under Node and asserts every part is
watertight, on-grid and within its cell.

### The resource sim — `src/steadsim.js` (pure tick, verify-gated)

The stead is only real if it can fail. A pure per-tick simulation balances
**power, oxygen, water, heat and fuel** across the placed parts: production −
consumption, storage buffers, adjacency rules (an airlock must bridge pressurised
and unpressurised volumes; power routes along connectors; a solar array under
dust or polar night underproduces). Saltstead's plunder economy re-cast as a
survival balance sheet — and **pure**, so `verify-steadsim` can drive a stead
through a sol, a dust storm and a polar winter and assert it neither free-lunches
nor unfairly starves.

The tension that makes it a game: **every part you add is another mouth.** Bigger
stead refines faster but draws more power and air; overreach in the polar night
and the lights dim. The Saltstead fleet dilemma ("rich and slow") re-cast as
"capable and hungry."

### Building it, in third person

Placement is proximity + soft-lock + a snap grid — the same `E`-to-do grammar,
never a free-flying god cursor. You carry parts as printed inventory from the
sinterer; you walk to a cell; the ghost snaps; a build meter runs while the suit
clock keeps ticking. Kid-safe by construction: in a shared stead you may only
*add* and *operate*, never remove another player's work.

### The blackout rule (what "running out" costs YOU — the founder/wreck heir)

Saltstead keeps accounts in two escalating doses (founder → wreck). Marsstead
keeps the exact shape, because the planet is lethal and the game must not be:

1. **Brownout** — suit air or stead power crosses the red line: the screen
   desaturates and narrows, movement slows, the HUD screams, VESPER's voice goes
   urgent. The warning shot. Reach shelter or a cached depot and you recover with
   nothing worse than a fright.
2. **Blackout** — you let it run all the way out: **you don't die.** You wake at
   your nearest stead (or the drop capsule if you have none), rescued — but the
   planet takes its tithe: the **cargo you were carrying is dropped** at the
   blackout point (recoverable if you go back), the **prospecting sample chain
   resets**, and an **unpowered stead you were away from may have shed a part to
   the cold** (a cracked heater, a frosted array — repairable, never destroyed).
   Banked, powered stead-state is untouched (the Davy-Jones's-Locker guarantee).
   Brownout teaches "top up early"; blackout teaches "never range beyond your
   air."

State rides the save, so a refresh is never a rescue — the rule that makes
Saltstead's crippled flag matter. **This is also what makes the horror safe:** the
dark can frighten and it can *cost*, but it can never end you.

---

## The mystery: panspermia, and where life on Earth began (the terrifying aim)

The legends layer made into a spine — the thread the landing page sells ("a
planetary mystery the sand has kept for four billion years"), and the object of
USP 2. Grounded in **real** Mars science so discovery teaches something true, the
way Saltstead's star chart teaches real navigation.

### The premise (real science, wondrous — and frightening — conclusion)

Mars was wet and possibly habitable four billion years ago, plausibly before
Earth's own life is firmly recorded. Rock is thrown between the planets for real
— we hold **Martian meteorites** on Earth (the ALH84001 microfossil debate is
real history). Marsstead follows that thread to its most wondrous defensible end:
**life may have begun here, and been carried to Earth** in the ejecta of an
ancient impact. The dig runs from hard geology toward that reveal — and the
closer it gets, the less it feels like a triumph and the more it feels like a
grave you shouldn't have opened. A quiet piece of family connective tissue falls
out of it: if Earth-life began *here*, then Moorstead's moors and Saltstead's
seas literally began on the world you are homesteading. The three `stead`s share
one biosphere's story.

### `src/marslegends.js` — the anchored, append-only content table

Modelled exactly on `legends.js` (append-only, verify-gated, each row anchored to
real geography, each stressing a different system). Kinds:

- **`site`** — a real named place worth the voyage (a mystery beat lives here).
- **`hazard`** — the rules bend (a storm cell, a Cerberus-Fossae marsquake zone,
  a radiation-hot crater).
- **`vault`** — an underground chamber (the lava-tube frame); the endgame reveals
  and the horror.
- **`wonder`** — a pure navigation/awe landmark (the Olympus caldera rim, the
  Valles Marineris wall) paying in *arrival*, teaching geography by stealth.
- **`relic`** — a fragment of the panspermia thread: a sample, a reading, a
  structure. Relics chain; each points at the next real site.

Rules are Saltstead's, unchanged: **anchored to real geography; discovered, not
listed** (instrument anomalies and chart fragments point you there — no map-marker
shopping list); **the payoff respects the economy** (a relic advances the story
and unlocks tech, it doesn't hand you free resource); **each kind stresses a
different system**.

### The chain, in real places (the spine, and the descent, of Phase 3)

Discovered, never signposted — the magnetometer twitches, a chart fragment names
a crater, VESPER notes an anomaly it can't explain — but always pointing at
**real** Mars, and always turning *down*:

1. **The old shoreline** (the dichotomy boundary) — the terrain remembers a
   waterline. The tide was real. *(Teaches: read the land. Tone: wonder.)*
2. **Jezero's delta** — a real river delta; the first relic, the mineral
   signatures a real rover went looking for. *(Tone: wonder, first unease.)*
3. **A recurring-slope-lineae seep + a methane spike** — real unresolved Mars
   mysteries; the instruments earn their keep and the trail turns down. *(Tone:
   the cosy starts to leave.)*
4. **A lava-tube vault (Arsia-class skylight)** — the underground frame opens;
   subsurface ice, then structure. The ALH84001 question made walkable. *(Tone:
   dread. VESPER goes quiet.)*
5. **The deep dark** — the final vault: the ejection event, the record of the
   impact that flung Martian rock — and its cargo — at a young Earth, and the
   thing that record was keeping. Davy-Jones's-Locker as an ending, in the
   deepest ground. *(Tone: terror, then awe.)*

Pacing across a whole planet is **named risk #5**: the chain must be reliably
*findable* without being a checklist. The instruments (and VESPER) are the answer
— they *warm* as you near a beat, so the world leads without a marker floating in
the sky.

---

## The sky — `src/marssky.js`

The landing page's shader promoted to a module: butterscotch day, blue-haloed
dusk, Phobos hurrying the wrong way, the film-grain that keeps the gradient from
banding — plus the night sky (two moons, hard stars, Earth as an evening star)
and the dust-storm reddening. Climate reads deterministically from a Mars model
(areocentric season Lₛ, latitude, elevation) — no fetch, no dependency; the truth
is baked, unlike Saltstead's optional live layer. This is the canvas the whole
"beautiful" half of the pillar paints on.

---

## Third person, and the astronaut

You look down on your homesteader and the stead you are raising — the object of
the whole fantasy on screen at all times, the Saltstead camera rule intact. Two
rigs: close orbit on foot / inside a hab, a pulled-back view from a rover or at
altitude in a hopper. Interaction is proximity + soft-lock, never a crosshair.

The captain becomes the **colonist**: a readable procedural character in a
pressure suit, cosmetic progression that is now also *mechanical* — suit tiers
(the hats of Marsstead) carry more air, shrug off more cold, resist more
radiation. The suit is your smallest, most personal stead, and the low-g bound is
read off its silhouette.

---

## What ports from Saltstead / Moorstead

| Family system | Becomes in Marsstead |
|---|---|
| Terrain streamer + chunk gen (LOD, dispose-on-range) | The 100%-terrain Mars streamer — cheap-tile skip deleted |
| `earth.js` pure projection + baked-table decode | `mars.js` — MOLA + gazetteer decode |
| Data-in-code bake (`build-earthdata.mjs`) | `build-marsdata.mjs` — MOLA + USGS Gazetteer → Int16 |
| `noise.js` fbm/value noise | Direct port — the sub-MOLA procedural skin |
| Ship-local moving frame + gangplank transition | Pressurised rover interior; the lava-tube underground frame |
| Below-decks hold (light-tight second frame) | The underground / sealed-hab interior frame |
| Wave CPU/GPU lockstep (`waves` + `verify-waves`) | Terrain height CPU/GPU lockstep (`verify-marsterrain`) |
| Buoyancy/wind physics | 0.38-g physics module (`G_MARS`, `verify-physics`) |
| `legends.js` append-only anchored content table | `marslegends.js` — sites, hazards, vaults, wonders, relics |
| `ports`/`shipyard` append-only catalogues | `steadparts.js` — the base-building catalogue |
| Plunder economy (income at sea) | The resource sim (`steadsim`) — progress from the ground |
| Founder/wreck rule (no death) | Brownout/blackout rule (no death; makes the horror safe) |
| Sky/weather/season/storm | `marssky` + deterministic Mars climate; the global dust storm |
| Wildlife layer (fins, pods, gulls) | Dust devils, drifting frost — the ambient life of a dead plain |
| **Moorstead NPC brains (`llama-server`, canned fallback)** | **VESPER — the AI co-star (USP 1), the same relay/brain/fallback shape** |
| Relay client + additive protocol; ship as networked unit | Stead as networked unit; co-op homesteading |
| Save (forward-refuse/back-migrate), update-check, telemetry | Direct port |
| Procedural audio + shanties | Suit-radio hiss, wind-thin ambience, the stead's hum, VESPER's voice |
| Verify-gate methodology, docs structure, `deploy.mjs` gate | Day one |

**New, with no family equivalent:** freeform base-building (parts catalogue +
grid/snap + resource sim), rover/hopper/orbital physics under 0.38 g and thin
air, the underground exploration frame at scale, **the AI co-star as a designed
character (USP 1)**, **survival-horror-without-combat (USP 2)**, and a planet
where LOD is not an optimisation but the thing that makes the game possible.

---

## The EVO and the ledger (family infrastructure — VESPER's home)

Marsstead already speaks to the family's home server: the landing page fires a
visitor beacon at `/dash/visit`, which Vercel rewrites to the same EVO door
Saltstead uses, and the Admiralty Board (`:8099`) musters visitors and
play-starts "for every stead." When Marsstead needs its relay (multiplayer) and
its **brain (VESPER)**, they ride the same box: the EVO X2's UMA pool has
headroom to spare, `llama-server-moorstead` (Gemma, `--parallel 32`) can carry a
third game's register — or VESPER earns its own model from UMA headroom if
contention shows. The CSP/tunnel pattern is proven twice over. Because VESPER is
the marquee feature, its serving is a first-class concern from Phase 3, not an
afterthought: rate-limited, per-pid queues, canned-fallback pass-through, a
"brain" card on the Board like Moorstead's. Nothing new to stand up — Marsstead
slots into infrastructure built to hold it.

---

## Phases (each gated by verify, the family way)

- **Phase 0 — the ground (kill/go gate).** One region of real Mars (Jezero or a
  single MOLA tile), heightfield streaming + LOD with the cheap-tile skip
  removed, walk it in a suit under **0.38 g**, third-person camera, the suit-air
  / thermal HUD, and a **first canned VESPER voice** so the tone is present from
  the first build. **The gate:** does walking real Mars terrain under low gravity
  feel right, and does the all-terrain streamer hold framerate when nothing in the
  frustum is free? Proves named risks #1, #3(low-g) and #6, or the project stops
  here. *(Verify: `verify-mars`, `verify-marsterrain`, `verify-physics`; a
  `live-mars.mjs` puppeteer walk.)*
- **Phase 1 — the planet.** Global MOLA baked + procedural skin, the USGS
  gazetteer, `marssky` promoted from the landing page, the deterministic climate
  model, tier-0→1 traversal (foot + buggy), day/night and dust devils. The
  *beautiful and dangerous* pillar becomes visible here.
- **Phase 2 — the homestead.** The parts catalogue, grid/snap building, the
  resource sim (power/air/water/heat/fuel), prospecting instruments, drilling and
  refining — the survival loop closes. Tier-2 pressurised rover (the moving
  frame). *(Verify: `verify-steadparts`, `verify-steadsim`.)*
- **Phase 3 — the reach, the voice, and the mystery.** Hopper/orbital traversal;
  **VESPER stood up on the EVO relay (USP 1) with the live brain over the canned
  floor**; the underground frame; `marslegends` and the panspermia chain wired to
  their real sites; the global dust storm; **the descent's horror tuning (USP
  2)**. *(Verify: `verify-vesper`, `verify-marslegends`.)*
- **Phase 4 — multiplayer.** Relay integration (the EVO box, VESPER's box), the
  stead as a networked unit, co-op homesteading in shared, add-only steads.
- **Phase 5 — progression and balance.** The full traversal + suit + reactor
  ladder, depth-and-distance-and-cold-and-dark as the difficulty thermostat, the
  horror curve and the VESPER-relationship arc balanced across a sol-year.

---

## Named risks

1. **100%-terrain planet streaming.** No cheap tile to skip; LOD is mandatory.
   Chunked multi-resolution heightfield (MOLA skeleton + procedural skin),
   aggressive concentric LOD with skirt/stitch, dispose on range. Phase 0 proves
   it.
2. **Base-building persistence, determinism, multiplayer sync.** The stead is
   pure data (placed-part list over a deterministic catalogue) that rides save and
   relay; geometry rebuilt client-side, never transmitted. `verify-steadparts` /
   `verify-steadsim` keep it honest.
3. **Getting the physics to *feel* right — 0.38 g, dust, day/night.** The pillar
   lives or dies on feel, not numbers. One `G_MARS` constant integrated
   everywhere (`verify-physics` asserts apex/fall/hop), dust as a first-class
   layer, the sol as a designed rhythm. Phase 0 gates the low-g walk specifically.
4. **A survival sim tense but kid-safe.** No death; brownout/blackout (the
   founder/wreck heir) makes running out costly, never terminal; the cold clock is
   deliberately generous.
5. **Mystery pacing across a huge world.** Discovered-not-listed, but the
   instruments (and VESPER) warm as you near a beat — the star-chart discipline
   (read the live sim, never a lookup table of answers) applied to discovery.
6. **CPU/GPU terrain agreement.** One height-parameter table drives both the GLSL
   displacement and the JS `elevation()`; `verify-marsterrain` keeps them in
   lockstep so wheels don't float — Saltstead's wave-lockstep rule on land.
7. **The AI co-star (USP 1): latency, quality, and never a dependency.** VESPER
   must feel alive without blocking the game. Async, off the render path; a
   first-class pure canned voice underneath (verify-gated) so offline/guest/relay-
   down play is still good; strict state whitelist (no leak); kid-safe register.
   The Moorstead pattern de-risks most of this — but a *co-star* is a higher bar
   than a village barfly, and the fallback carrying the personality is the
   insurance.
8. **The terrifying aim (USP 2): scary, kid-safe, and still fun.** The hardest
   design line. Horror is atmospheric (dark, cold, alone, dread, awe) never
   graphic; opt-in by depth; always escapable (blackout ⇒ no death); and warmed by
   VESPER so it reads as *shared* tension, not trauma. Tuned continuously in Phase
   3 and 5, with an eye always on "would this still be fun for the kid the family
   builds these for?"
