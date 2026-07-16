# Saltstead — founding design document

*(Working title. Sibling project to Moorstead — same identity, new game.)*

A sea-based pirate game. Plunder ships, earn at sea, climb from a leaky coble to a
modern raider. Real-world Earth map, scaled. Multiplayer: every player captains their
own ship with an NPC crew. Third-person. Browser-first, procedural-only, no asset
files — ever.

## The identity (inherited from Moorstead, non-negotiable)

1. **Browser-first, instant-play, procedural-only.** All geometry, textures, audio
   synthesised in code. Low-poly flat-shaded style — `BufferGeometry` built in code,
   not voxels, but still zero binary assets.
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

## Third person

You look down on your captain and your ship — the object of the whole progression
fantasy is on screen at all times. Two camera rigs: close orbit on foot / on deck, a
pulled-back captain's view at the helm (pulling further back as ships get bigger).
Interaction is proximity + soft-lock, not crosshair. The captain needs a readable
procedural character model with cosmetic progression (hats).

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

## Multiplayer

Reuse the `worldsvc` relay model (rooms → oceans/shards; additive message protocol;
unknown types fall through). The networked unit is the **ship** (position, heading,
sail state); crew NPCs aboard are client-simulated from the ship's seed. Co-op first:
players crew each other's ships and hunt NPC convoys together. PvP only in opt-in
contested waters.

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
  walking the moving deck, helm, third-person camera. If sailing isn't fun in
  isolation, stop and rethink. ← *we are here*
- **Phase 1 — the world**: Earth coastline tables, streaming + LOD, 3–4 Caribbean
  ports, open-sea gait.
- **Phase 2 — the loop**: NPC merchants, cannons, boarding, loot, fencing, first
  upgrade tier.
- **Phase 3 — crew and land**: hire/manage crew, brain integration, taverns, rumours,
  on-foot exploration.
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
