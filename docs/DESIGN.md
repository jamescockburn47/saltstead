# Saltstead — founding design document

*(Working title. Sibling project to Moorstead — same identity, new game.)*

A sea-based pirate game. Plunder ships, earn at sea, climb from a leaky coble to a
modern raider. Real-world Earth map, scaled. Multiplayer: every player captains their
own ship with an NPC crew. Third-person. Browser-first, procedural-only, no asset
files — ever.

## The identity (inherited from Moorstead, non-negotiable)

1. **Browser-first, instant-play, procedural-only.** All geometry, textures, audio
   synthesised in code. Low-poly flat-shaded style — `BufferGeometry` built in code,
   not voxels, but still zero binary assets. *Amended 2026-07-24 (the Marsstead
   port): the SEA is smooth-shaded — analytic per-pixel normals from the wave
   table (waves.js gradient) with fbm detail tilt, because a faceted FLUID is
   what read artificial. Land, hulls, clouds stay faceted; the flat-shaded law
   holds everywhere a surface is solid.*
2. **Kid-safe shared worlds.** Server-authoritative caps, no raw player text as HTML
   (`escHtml` everywhere), no unbounded griefing surface.
3. **The verify gate is the contract.** Headless `npm run verify` must be green before
   deploy. Every feature ships with an assertion that defends it. Pure logic lives in
   modules that import no THREE/DOM so the gate can run them under Node.
4. **Determinism.** Terrain, ships, NPC crew appearance derive from stable seeds.
   Never `Math.random()` at build/spawn time for anything shared across clients.

## The era answer: "piracy never died"

The player's son wants pirates AND the modern era. Resolution: an alt-history world
where piracy never stopped. The ship-upgrade ladder climbs **through time** — each
tier changes how you sail, not just the numbers:

| Tier | Ship | Era feel | Propulsion gameplay |
|---|---|---|---|
| 0 | Coble | starting boat (a Yorkshire nod) | oars + one lugsail |
| 1 | Sloop | golden age | wind: trim + point of sail |
| 2 | Brigantine | golden age | wind, more sail plan, bigger crew |
| 3 | Frigate | golden age peak | wind, broadsides, prestige |
| 4 | Steam raider | Victorian | coal: fuel management, ignores wind |
| 5 | Diesel trawler | 20th c. | fuel + speed, radar |
| 6 | Fast interceptor | modern | speed king, expensive to run |

The world is a timeless "pirate present": taverns and radio masts coexist; a galleon
and a container ship can share a horizon.

## The world: real Earth, scaled, non-uniform

- Coastlines + coarse elevation baked from public data (Natural Earth / ETOPO class)
  into quantized data tables **in code** — the same trick `moorsgeo.js` plays with
  OS map data. No asset files.
- **Non-uniform scale**: land masses ~1:250 (Britain ≈ 4 km, walkable), open-ocean
  distances compressed by a fast "open-sea gait" once out of sight of land. Target:
  an Atlantic crossing ≈ 10–15 minutes of real play.
- World wraps east–west. Starting region: the Caribbean.
- Big navigable rivers (Amazon, Thames) reuse the Moorstead river system (polyline +
  chainage + flow field).

## The core loop

Spot a sail (spyglass, flag identification, deception — fly false colours) → chase
using wind skill → disable or intimidate → board and plunder → fence loot at a port →
spend on ship, crew, repairs → bigger targets → notoriety raises navy/coastguard heat.

**All income originates at sea**: plunder, salvage, fishing, cargo running. Land is
where money is *spent* — taverns (recruit crew, buy rumours/treasure maps), shipwrights
(upgrades/repairs), hideouts (stash loot). On-foot exploration supports the sea game;
it never pays directly.

## The two flags (BUILT — faction.js + livery.js, verify-faction / verify-livery)

A fresh voyage begins with a **choice of colours**, and the two advantages differ
in KIND, not degree:

- **The Black Flag** — the individual edge. +12% hull speed over her rated class,
  +30% plunder off every prize, every honest sail is prey — and the King's
  corvettes hunt her on sight. Tarred-black hull, blood-red sheer band, tanned
  storm-dark canvas, the skull at the main truck.
- **The King's Colours** — the institutional edge. Rated speed, prize-court
  accounting, the trade is protected (the boarding law forbids plundering it) —
  but **G sends up a signal rocket**: corvettes in range converge on the raider
  in sight, and if the sea is empty the Admiralty sends one over the horizon.
  Blue-black topsides, the buff Nelson-chequer band, admiralty-white sails, the
  ensign at the truck.

The lanes carry a fourth armed type, the **raider** — a black-hulled fore-and-aft
brigantine: the navy player's quarry, a rival flag to a pirate. Every NPC's
attitude to the player (hunt / flee / neutral) follows the attitude matrix in
faction.js; merchants.js stays faction-blind and takes the attitude as an input.
The flag rides the save; every pre-faction save reads as a pirate.

## Sea battles (BUILT — combat.js, verify-combat)

Broadsides on F (R swaps round/chain shot), damage-as-states on both sides,
navy corvettes that hunt and shoot back, sinking + floating salvage, the
boarding autobattle for armed ships, the two-stage founder/wreck rule (below),
and yard repairs at any port. The design that got built:

The fight is **positioning, not aiming**. Third-person + low-poly means the skill
expression is the same one sailing already trains: wind, angle, timing.

1. **The chase is half the battle.** Encounter gait (in) means every fight starts
   with both ships at human speed inside ~400 m. Escape is always a legal outcome —
   outsail the pursuer to 1600 m and the current carries you away.
2. **Broadsides, not turrets.** Guns fire perpendicular to the hull in a fixed arc;
   you TURN the ship to bear. One key fires the ready side; reload is long (crew
   quality shortens it). Range ~250 m, damage falls off; chain shot (rig damage,
   slows them) vs round shot (hull damage, sinks them) is the tactical choice —
   slow a runner first, then pound or board.
3. **Damage is states, not hitpoints-on-screen**: sails torn (speed drops), rudder
   sprung (turn rate drops), hull holed (listing, slow flooding), mast down (dead in
   the water). Each state is visible on the low-poly model — the enemy TELLS you how
   hurt she is by how she sails.
4. **Boarding is the payday.** Sinking a prize sends most of her cargo to the bottom
   (a fraction floats as salvage). To take her whole: come alongside (<25 m),
   matched speed, grapple, and the crews fight it out as an autobattle weighted by
   crew size/quality/intimidation — the player's job was DELIVERING the boarding, not
   button-mashing it. Strike-the-colours: badly outmatched merchants surrender
   without a fight (intimidation is a stat that grows with notoriety).
5. **NPC crew fight the guns.** The player steers and calls the moment; the crew
   (visible on deck) runs the reload dance. Crew losses in boarding actions are the
   real cost of recklessness.
6. **Multiplayer**: co-op broadsides against navy convoys first; PvP only in opt-in
   contested waters (the same rule as the identity section).

### The founder/wreck rule (what sinking costs YOU)

No death in Saltstead — but the sea keeps accounts, in two escalating doses
(combat.js `founderCost` / `wreckSpoils`, wired in main.js `wreckShip`):

1. **Foundering** — first time the hull reaches 0: the crew heaves a **third of
   the chest** over the side, the hull is emergency-patched to `CRIPPLED_HULL`
   (0.3), and the ship is **CRIPPLED** (flagged on the HUD, persisted in the
   save) until a yard repairs her. The warning shot.
2. **Wrecked** — holed through again while still crippled: **she sinks.**
   Everyone lives; the longboat lands the crew (prize crews row clear too), the
   treasure map, the ship's log and a **tithe of the chest** (`WRECK_KEEP`, 10%)
   at the nearest port. Lost: the hull (drop one rung on the shipwright's ladder
   — `prevHull`; a wrecked sloop is staked a patched sloop, the game can never
   dead-end), the prize fleet astern, and the rest of the gold. **Banked gold in
   Davy Jones' Locker is untouched** — the wreck rule is what makes the Locker
   matter.

Damage and the crippled flag **ride the save**, so a page refresh is never a
repair. The intended lesson curve: foundering teaches "repair early"; the wreck
teaches "bank before you brawl". Only round shot can sink you — the dragon and
the whirlpool tear rig, the Kraken grips — so the rule lives where the navy is.

## Prizes and the fleet (yes — you can take her whole)

Boarding doesn't have to end at the strongbox. If you have the hands to spare,
you put a **prize crew** aboard and she's YOURS — she falls in astern and sails
in your wake. The fleet is the game's second progression rail, beside the hull
tiers.

1. **Crew is the currency of capture.** You start with 8 hands; a prize needs
   3 to man her. Take three prizes and you're stretched to the bone — the cap
   is your payroll, not an arbitrary number (hard cap 3 prizes in the sloop
   era; leadership grows with notoriety). Some captured sailors sign articles
   and join you (~a third of prizes) — piracy recruits from its victims,
   which is historically exactly right.
2. **What a fleet is FOR:**
   - **Sell her at port** (when ports land) — a whole hull is the biggest
     single payday in the game, worth many strongboxes.
   - **Transfer your flag** — the era ladder has two rails: buy your next
     ship at a shipwright, or TAKE one. Step aboard a captured brig and the
     sloop becomes the prize you sell.
   - **Line of battle** (when cannons land) — your prizes fight beside you;
     a fleet action against a navy convoy is the intended endgame.
   - **Cargo running** — each hull multiplies freight capacity.
3. **Prizes cost you.** Undermanned prizes sail slower than your flagship —
   a fleet makes you rich and SLOW, the classic pirate dilemma (Every hand
   on a prize is a hand not sailing your own ship.) Wages come later with
   ports; the fleet is where they'll bite.
4. **The fleet is one unit to the world**: your own ships never trigger the
   encounter slowdown or count as contacts — the current treats the convoy
   as one sail.
5. **Multiplayer rule:** another PLAYER's ship can never be permanently
   stolen — losing a boarding action in contested waters costs cargo and
   ransom, never the hull. Fleets are visible to other players (a line of
   prizes astern IS the notoriety display).

## The plunder economy

How gold ENTERS the world (sources, in intended order of discovery):

1. **Merchantmen** — the bread and butter. Deterministic spawns along real trade
   lanes; they flee, they're slower but stubborn, they carry coin + cargo. Boarding
   one is the tutorial for the whole game.
2. **Treasure maps → X marks the spot.** Maps come from boarded prizes, tavern
   rumour purchases, and legendary hunts. Each map deterministically picks a REAL
   islet/cove (seeded search of the coastline tables — same seed, same island for
   everyone) and inks an X on the captain's charts. Anchor in the cove, send the
   longboat (the crew digs — the land-earns-nothing rule holds: the gold was buried
   by pirates, i.e. it originated at sea), and the chest pays several prizes' worth.
   Maps are the game's compass: they point players AT the world.
3. **Wreck salvage** — real wreck sites (the 1715 Plate Fleet legend is the
   flagship) + procedural storm wrecks; diving pays in salvage sold at port.
4. **Cargo running** — honest(ish) freight between ports for players who want a
   quiet life between fights; prices vary by port so routes matter.
5. **Bounties & convoy raids** — posted at havens against notorious pirates (PvE
   and, in contested waters, PvP) and against escorted navy convoys — the endgame
   source, needs co-op.

How gold LEAVES the world (sinks, so the economy doesn't inflate):

- **Ship tiers** (the era ladder — the big aspirational sink), **repairs** (battle
  damage costs), **crew wages + recruitment** (bigger ships need bigger payrolls),
  **charts/rumours/maps** (information is purchasable), **port fees** in havens,
  and **insurance-free loss**: sink, and cargo aboard is gone.

Growth loop: bigger ship → bigger prizes sail your waters (spawn tables key off
hull tier) → bigger scores → bigger ship. Notoriety rises with income and raises
navy heat — the difficulty curve is the economy's own thermostat.

## Ports that work (the first sink)

Arrival is intuitive: run her right up the haven's beach (the hull rides the
sand and stops) — or just slow inside the anchorage — and E puts you in.
V1 is two transactions, because the loop needs a drain before it needs a shop:

- **Sell your prizes** — the whole fleet goes at once; the prize crews come back
  aboard (up to the sloop's berths). A prize sells for well over the richest
  boarding purse — capturing beats stripping, which is the point of the fleet.
- **Sign on hands** — the tavern trades gold for crew, which is the currency of
  capture. Gold -> hands -> prizes -> gold: the loop closes.

The door has since widened. Two tiers of harbour now (port.js + ports.js):

- **Havens** are legends rows (append-only): Port Royal, Nassau, Tortuga, Île
  Sainte-Marie — real pirate geography, spread so every ocean has a door. They
  fence prizes at **full price**, no questions asked.
- **Dockyards** (ports.js, append-only, ~18 real age-of-sail harbours from
  Havana to Nagasaki) serve every basin: **repairs, hands, and the
  shipwright** anywhere on earth, so a voyage never beats back to the
  Caribbean for a topmast. Honest ports ask questions: prizes fence at half.

The **shipwright's ladder** (shipyard.js) is THE progression purchase, seven
rungs deep: **sloop → cutter → schooner → brig → corvette → frigate → galleon**.
Each rung buys broadside weight, berths and (until the top) straight-line speed;
each SPENDS handiness and shallow water — the schooner is the last hull that
beaches, and the galleon trades the frigate's legs for six guns a side ON
PURPOSE (verify-shipyard holds that trade honest). Hulls are visibly their
class (ship.js): fore-and-aft rigs low on the ladder, braced square courses
from the brig up, a sterncastle and ochre band on the galleon, and a real row
of cannon at the gun posts main.js actually fires from (shipframe.js gunPosts
— one truth, two readers). NPC trades sail the same ladder (merchantlayer.js):
traders are schooners, Indiamen castle-sterned square-riggers, the navy
corvettes — with **visible deckhands** (crewPosts) so a living ship reads
alive and a derelict reads dead. Every hull carries a **captain's briefing** —
the survival doctrine shown on a fresh voyage and on every upgrade: the
sloop's is "run, hunt traders, dig treasure, hide in the shallows" (corvettes
break off the chase over water thinner than NAVY_SHOAL); the galleon's is
"you don't chase anymore — they come to you".

**The anchor** (anchor.js, pure + verify-anchor): Q lets go or weighs. The
cable is good to CABLE_DEPTH (20 m of game water — earth.js's shelf reaches
~44 m in blue water, so anchoring is an inshore act by construction) and
refuses a running drop above DROP_SPEED. Riding to it: position pinned over
the ground, way snubbed off exponentially, bow weathercocking to the wind
(swingToWind, shortest way round, no overshoot), sails handed (the same
`furl` flag the port panel uses). A catted anchor at the port bow swaps for
a taut cable out the hawse (ship.js setAnchor), and `anchorDown` rides the
save additively — she resumes riding where you left her.

**Below decks** (shipframe.js holdFor + ship.js buildBelowDecks): every hull
from the brig up carries a walkable hold under the weather deck — a second
ship-local frame (`mode: 'below'`) entered by E on the hatch grating abaft
the mainmast. The room is built light-tight to the same numbers main.js
walks, the sea/foam/rain layers douse while the lens is inside (a windowless
hold can only ever show them as leaks through seams), and the orbit camera
clamps within the hold's walls through the live hull transform so pitch and
roll carry it. Lit by its own lanterns, dressed by class: cargo everywhere,
housed guns on the fighting hulls, the great cabin on the galleon. NPC hulls
never build interiors nobody can visit.

**The warden's writ** (identity.js isWarden): a warden — the harbourmaster's
own standing, minted on the invite ledger — presses **Y** to materialise the
next class of ship under his boots, walking the whole seven-rung ladder and
wrapping at the top, whole and uncrippled, free. For anyone else the key is
dead silence. It is the inspection tool: any hull, any water, no economy.

**Collision is real** (collide.js): every hull is a capsule, contacts shoulder
apart, and closing speed above RAM_HURT wounds both ships through the same
combat.js damage states a broadside uses — the lighter hull pays more. The
navy knows it: a hunting corvette closes to NAVY_STANDOFF and then **circles
at gun range** (she rakes, she does not ram). Guns carry 420 m, ball flight
time scales with the range, and every muzzle throws a flash and a light.

## Third person

You look down on your captain and your ship — the object of the whole progression
fantasy is on screen at all times. Two camera rigs: close orbit on foot / on deck, a
pulled-back captain's view at the helm (pulling further back as ships get bigger).
Interaction is proximity + soft-lock, not crosshair. The captain needs a readable
procedural character model with cosmetic progression (hats).

## Shore leave

Anchor near a beach (or run her aground) and E puts the captain ashore by
longboat; the crew holds the ship. On foot you walk the real terrain — climb
for a view, find the X, dig with your own spade (same chest as sending the
crew, but you were THERE). E rows you back. Land still pays nothing directly
(the chest's gold originated at sea); ports, taverns and shipwrights hang off
this mode later.

## Real weather, real wind (the Moorstead weather-live pattern)

Open-Meteo at the ship's REAL lat/lon: the Azores get Azores wind, today. The
live sample eases into the wind base (never snaps the sails); WMO codes map
to clear/overcast/rain/fog/storm, which dress the sky for real (skyfx.js:
low-poly cumulus drifting downwind, rain streaking past the lens), grey the
light and raise the swell. Two game-design overrides where truth loses to
fun: the wind floors at 10 m/s EVERYWHERE (weather.js WIND_FLOOR — a real
calm is true to the Atlantic but false to the game), and it BUILDS offshore
(1x inshore -> 1.9x by ~1.5 km) regardless of the forecast, so crossings
fly. Any fetch failure leaves the procedural wind machine in charge — live
weather is a layer, never a dependency.

## The navigator's craft (learn real things while you sail)

Passage time is the game's biggest empty room; the furniture is REAL seamanship,
taught by doing. Two instruments land first, both built on systems that already
exist (nothing is faked):

- **The ship's log (L)** — a running journal the game writes for you, in period
  voice: departures, landfalls, weather turns, boardings, prizes, digs, groundings,
  star sights. Every entry is stamped with the ship's-bell watch (Middle, Morning,
  Forenoon, Afternoon, the dog watches, First) and the position in degrees and
  minutes — reading your own log teaches the watch system and how positions are
  written. Capped, persisted in the save, and one day the multiplayer brag sheet.
- **The star chart (N)** — a planisphere drawn from the SAME celestial frame the
  3D sky renders: the catalogue stars wheel westward through the night and tilt
  with your latitude. On a clear night the navigator takes a sight: **the pole
  star's altitude IS your latitude** (Southern Cross service south of the line).
  The sight is computed through the real transform, logged, and phrased as the
  lesson it is. By day or under cloud there is no sight — the weather system
  gates the instrument, which is itself the lesson.

Rules: instruments must read the live simulation (sky, weather, position) — never
a lookup table of answers; each should teach one true thing a sailor knew; all
optional — the M chart already navigates for you, these are for the joy of it.

Later, same pillar: dead reckoning (log line + compass + sand glass, then compare
against the real chart), flag signals, the lead line for depth. On **larger ships**
the crew becomes real management: genuine jobs (helm watches, lookouts, sail
handling, the galley) held by named NPCs — the yorkshire_bot brain pattern ports
for below-decks chatter, and the log starts writing entries about THEM.

## The passage layer (BUILT — docs/PASSAGE.md, ten pure modules)

The helmsman made the empty room bigger; the passage layer is the furniture.
The design law: **the helmsman gets you there; the captain gets you there
faster, richer, and readier** — attention converts to passage time, readiness,
intel or gold, and AFK stays safe. A watch-bell spine (watchbill.js) strikes
deterministic events in open water: yarns and disputes (yarns.js — morale),
bottles/crates/rafts (flotsam.js), spectacles, and the stern chase (chase.js —
heat, the hunter astern, the jettison bargain). Pull stations: gun drill
(gundrill.js), the carpenter's seams (carpenter.js), handlines on real grounds
(fishing.js), the chip log + dead reckoning (reckoning.js — the current IS the
error), the running survey (survey.js), storm-band riding and the reef rule
(storms.js), and the record book. Every module verify-gated; every field
additive on the save.

## The sea must not be boring (first-class pillar)

1. **Active sailing** — wind direction/strength matter; trim and point of sail are a
   skill. A good sailor outruns a bad one in the same ship. Engine tiers trade wind
   skill for fuel management.
2. **The ship is a place, not a vehicle** — walk the deck underway, man the helm,
   climb the crow's nest; the crew is visibly working.
3. **Encounter density** — merchants, patrols, whales, wreck salvage, drifting cargo,
   storms, other players. The horizon is never empty for long.
4. **NPC helmsman autopilot** — set a heading, then manage cargo/crew/chart below
   deck. Travel time becomes management time.
5. **Crew as characters** — brain-driven chatter (the yorkshire_bot pattern), wage
   grumbles, procedural shanties (the carols system ports).
6. **Weather as drama** — storms at sea are events, not skybox changes.

## Legends — the highlight points

A planet of accurate coastline is a map, not a game. The **legends layer** is what
makes sailing TOWARD somewhere: hand-placed wonders anchored to real geography, each
one a story a player tells afterwards. The table lives in `src/legends.js`
(append-only content, guarded by `verify-legends`); the founding pair came from the
co-designer: **dragons in Wales** and **the Bermuda Triangle**.

Design rules for a legend:

1. **Anchored to real geography** — the real-world map is the game's hook; a legend
   must make a real place worth the voyage (and teach a little geography by stealth).
2. **Discovered, not listed** — tavern rumours, chart fragments, and other players'
   stories point at legends; no map-marker shopping list.
3. **The payoff respects the economy** — land legends (the dragons) pay in treasure
   that originated at sea, so "money is made at sea" survives.
4. **Each kind exercises a different system** — boss (combat), anomaly (navigation
   skill), haven (social/multiplayer), hunt (quest chain), wreck (diving/salvage).
   A new legend should say which system it stresses.

Current table: the Welsh dragons, the Bermuda Triangle, the Kraken (Norwegian deeps),
the Corryvreckan whirlpool (real, off Scotland), the Flying Dutchman (Cape of Good
Hope), Port Royal (haven/social hub), Davy Jones' Locker (Mariana Trench endgame
vault), the 1715 Plate Fleet (real Florida treasure wrecks), El Dorado (Amazon river
hunt — where shallow draft beats the biggest ship).

**All eight non-haven legends are LIVE** (`src/legendfx.js` zones/anomalies +
`src/monsters.js` fights, guarded by verify-legendfx and verify-monsters):
the Triangle scrambles every instrument and drifts derelicts; the Corryvreckan
slings the rim and shreds the core; the Kraken grips (axes + broadsides + the
shallow-water escape); the dragon stoops and flees wounded to a lootable crag;
the Dutchman sails the Cape in storms and can be boarded but never shot; the
Plate Fleet pays diminishing dives; El Dorado pays once, up the Amazon; and
Davy Jones' Locker kills the wind and banks gold forever. The legends TABLE
stays append-only; runtime tuning lives keyed-by-id in legendfx.js.

## Multiplayer

Reuse the `worldsvc` relay model (rooms → oceans/shards; additive message protocol;
unknown types fall through). The networked unit is the **ship** (position, heading,
sail state); crew NPCs aboard are client-simulated from the ship's seed. Co-op first:
players crew each other's ships and hunt NPC convoys together. PvP only in opt-in
contested waters.

**Who sails where:** shared rooms need an invite (claimed on the dash → room +
token, exactly Moorstead's structure). **Guests always sail a private solo world**
(IndexedDB save, no relay connection) — the guest door is a demo, not a back door
into the shared sea.

**Encounter gait:** the open-sea fair current (up to 12x) dies away when another
ship is within hailing range — `encounterGait` in `earth.js` ramps every hull back
to human speed inside ~400 m (from ~1600 m out), symmetrically, since both crews
compute it from the same mutual distance. Without this, two ships at full gait
would close at ~200 m/s and never meet. Applies equally to player contacts and
future NPC merchants; `main.js` keeps the contact list (empty until Phase 2/4).

## What ports from Moorstead

| Moorstead system | Becomes |
|---|---|
| `addWater` living-water shader (ripple, glitter, fresnel, flow wavelets, freeze) | Ocean surface material; `aFlow` → ocean currents/river mouths; `uFrozen` → polar ice |
| Depth tint (vertex colour by depth) | Bathymetry tint — turquoise banks, dark Atlantic |
| Foam fringe | Coastal foam ring |
| River system (`moorsgeo` polylines, flow index) | Navigable great rivers |
| Sky/weather/season, storm | Direct port |
| Procedural audio + carols | SFX + shanties |
| Relay client + protocol invariants | Ship-granularity multiplayer |
| Save (forward-refuse, back-migrate), update-check, telemetry | Direct port |
| NPC wardrobe/roster determinism idioms | Crew generation |
| Verify-gate methodology, docs structure | Day one |

**New, no Moorstead equivalent**: wave displacement (Gerstner in the vertex shader
with an exactly-matching CPU function so buoyancy and visuals agree — see
`src/waves.js`), ship buoyancy + sailing model, the ship as a moving platform
(ship-local coordinate frame; the player transitions frames at the gangplank),
planet-scale streaming with LOD (99% of the planet is flat water), cannon combat,
boarding.

## Phases (each gated by verify scripts)

- **Phase 0 — sailing prototype (kill/go gate)**: one ocean, one sloop, wind, waves,
  walking the moving deck, helm, third-person camera. ✓ DONE
- **Phase 1 — the world**: Earth coastline tables, streaming + LOD, Caribbean
  ports, open-sea gait. ✓ DONE
- **Phase 2 — the loop**: NPC merchants (traders/indiamen/navy/derelicts), cannons,
  boarding + autobattle, loot, fencing, repairs, the legends live. ✓ DONE except
  the first upgrade tier ← *we are here: the shipwright is the next rung*
- **Phase 3 — crew and land**: hire/manage crew ✓ (hire/prizes), brain integration,
  taverns, rumours, on-foot exploration ✓ (shore leave, digs, the hoard).
- **Phase 4 — multiplayer**: relay integration, ships as networked entities, co-op
  crewing.
- **Phase 5 — progression**: the era ladder, notoriety/heat, economy balance.

## Named risks

1. **Walking on a moving ship.** Solution shape: the ship is its own local frame; the
   character's position is stored ship-local and the world transform comes from the
   ship's matrix. Phase 0 exists to prove this feels right.
2. **Planet-scale streaming.** Chunked heightfield + aggressive LOD; ocean tiles are
   nearly free.
3. **CPU/GPU wave agreement.** One wave-parameter table generates both the GLSL and
   the JS evaluator; a verify script asserts they stay in lockstep.
