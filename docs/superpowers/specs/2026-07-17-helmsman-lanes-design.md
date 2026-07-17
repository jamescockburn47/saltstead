# Helmsman lanes, currents, wind, storms, and lane traffic — design

**Date:** 2026-07-17
**Status:** approved design, pre-plan
**Triggered by:** an audit finding the helmsman (`src/helmsman.js`) steers a naive
rhumb line — it never routes through the fast blue water for the open-sea gait boost,
and it beats at a pinching angle that wins only ~51% of achievable upwind VMG.

## Goal

Give the NPC helmsman (and, by the same machinery, NPC traffic) a real sense of the
sea road: read the wind, the currents, and the deep-water gait, and lay the course a
good navigator would — riding favourable water and wind, tacking and gybing for genuine
VMG, working the authored trade lanes that also carry merchant, navy, and pirate sail,
and standing clear of storms. So the horizon is worked, the round trip actually works,
and encounters cluster where ships really meet. The helmsman covers the dull legs; the
captain is pulled back to the wheel for every moment that carries stakes (§5.1) — and a
better hand costs coin, so active sailing stays a skill worth having.

**Five subsystems**, designed as cleanly-separable pure modules so each is built and
verified independently even though they ship as one spec, plus two contained tunings:

1. **Lanes** — an authored trade-route network + routing that costs gait, current *and*
   wind, so the historic routes emerge from the cost function.
2. **Currents** — authored real-world surface-current ribbons (complete gyres) as a
   gait-coupled drift field.
3. **Wind field** — a deterministic, procedural, latitude-banded wind (trades /
   westerlies / doldrums), replacing live weather. This is the missing third leg beside
   gait and current, and it delivers the original ask: *optimal course by wind*.
4. **Storms** — procedural, deterministic moving storm systems (hurricanes in the real
   belts/seasons; standing gales in the forties): vortex wind, raised sea, reduced
   visibility, hull/rig damage, and avoidance routing. Fills DESIGN pillar 6.
5. **Lane-anchored traffic** — merchants/navy/pirates placed and moved by the lanes.

**Tunings:** §0 halves `GAIT_MAX` (20 → 10); the VMG fix (§5) replaces the pinching beat.

**Live weather is removed** — see §3.

## World scale (what everything is calibrated against)

`earth.js`: `M_PER_DEG = 444`, equirectangular (`x = lon·444`, `z = -lat·444`),
land ~1:250.

- Whole Earth ≈ **160 km × 80 km** in game metres.
- Havana → Cádiz (a transatlantic leg) ≈ **34 km**.
- Ships sighted at **5 km** (`LOOKOUT_R`); simulated within **9 km** (`ACTIVE_R`); spawn
  cell **6 km** (`CELL`).
- Blue-water gait reaches full gait by ~2.5 km of coast; **this spec halves it 20 → 10**
  (§0), pulling an Atlantic crossing back toward the stated 10–15 min DESIGN target.
- The Caribbean home waters are a *tight* archipelago in game coords (islands often
  <1 km apart) — corridors there must be narrow; blue-water corridors can be wide.

## Existing facts this design relies on

- **`gaitFactor(coastDist)`** (`earth.js`) — the "deep sea speed boost": 1× inshore, 5×
  offshore, 10× blue water (after §0). Applied to world-advance in `main.js` /
  `shipphysics.stepShip`.
- **Sailing model** (`sailing.js`) — point-of-sail power curve, `optimalTrim`,
  `speedTarget`; `IRONS = 0.52`. The VMG-optimal beat is a static ≈ 0.87 rad (§5).
- **Determinism is invariant 6** — same waters, same trade, every session. All lane,
  current, and wind-*structure* data is static; storm tracks, spawn/offset/role choices
  are deterministic functions of position/seed/sim-time (never `Date.now`/`Math.random`).
- **Pure-module discipline** — new modules take no THREE/DOM import and each gets a
  `scripts/verify-*.mjs` gate; `npm run verify` must be green before deploy.
- A near-uniform current or wind moves nearby ships alike, so neither perturbs the
  `encounterGait` balance (no analogue of the fair-current damping is needed).

---

## Module map

**New (pure, verify-gated):**
- `src/lanes.js` — lane table + connectivity graph + `route()` (costs gait+current+wind).
- `src/currents.js` — current-ribbon table + `currentAt(x,z)` drift field.
- `src/wind.js` — the procedural latitude-banded wind field + `windAt(x,z,t)`.
- `src/storms.js` — deterministic storm systems + `stormsAt(t)` / `stormWindAt(...)`.
- `src/helmwatch.js` — the hand-off watcher: `decide(state) → {mode, reason}` (§5.1).

**Changed:**
- `src/earth.js` — `GAIT_MAX` 20 → 10 (§0).
- `src/helmsman.js` — follows a *route*; VMG-optimal beat and gybe (§5), **skill-scaled**.
- `src/shipphysics.js` — `stepShip` gains an optional current vector (default zero).
- `src/merchants.js` — spawns bias toward lanes; idle movement is role-based (§6).
- `src/weather.js` — **`LiveWeather` removed**; `windProfile`/`seaStateFor`/`skyDressing`
  kept; `mapMarine` retired with the live layer.
- `src/port.js` / `src/main.js` — sign a **rated helmsman** (sets `helmSkill`) in the
  existing hire economy (§5.1).
- `src/mapui.js` / `src/main.js` — course-give UX (route preview + pick among
  alternatives) and the soft/hard handback alerts (§5.1).
- `src/main.js` — route at course-set; wind field + storms drive `wind`/`weatherState`;
  current + storm drift into physics; no more Open-Meteo poll.

---

## 0. Blue-water gait halved (`earth.js`)

`GAIT_MAX` drops **20 → 10**. `gaitFactor` becomes `1 + 4·smooth(...) + 5·smooth(...)`
— offshore stays ~5×, blue water tops at 10×. Travel becomes deliberate management time
(a DESIGN pillar); the current then carries a *larger relative share* of blue-water pace.

**Echoed in copy and hard-asserted by the gate — all move together or `verify` fails:**
- `src/earth.js:299` — the constant + the "20x" comment above `gaitFactor`.
- `scripts/verify-earth.mjs:107` — `GAIT_MAX === 20` → `=== 10` (and line 110/116 read
  `GAIT_MAX` so they follow automatically).
- `src/seafacts.js` / `src/crewchat.js` — the "fair current" fact says **"TWENTY
  times"** → "TEN times".
- `scripts/verify-crewchat.mjs:58` — asserts the chat includes `'TWENTY times'` and
  `GAIT_MAX === 20`; update both.
- `index.html:392` — "a fair current carries you up to ×20" → ×10.
- `scripts/verify-fleet.mjs` — literal `20` as a fast follow-test pace (not a `GAIT_MAX`
  assertion; still passes); refresh the stale "20x" labels.

---

## 1. `src/lanes.js` — the network

### Data (append-only, the `legends.js`/`ports.js` idiom)

```js
export const LANES = [
  { id: 'treasure-fleet', name: 'The Treasure Fleet',
    marks: [
      { port: 'havana' },
      { lat: 28, lon: -72, width: 12000 },
      { lat: 34, lon: -40, width: 15000 },            // wide blue-water leg
      { lat: 37, lon: -12, width: 4000, choke: true }, // approaches narrow
      { port: 'cadiz' },
    ] },
  // Manila galleon, spice road (Cape Town↔Batavia), East India run, the Horn, home waters…
];
```

- `marks` is an ordered waypoint list. `{ port: id }` reuses a `ports.js` dockyard or
  `legends.js` haven (shared id ⇒ lanes join into one graph). `{ lat, lon }` is a bare
  sea-mark bending the lane around a cape or through deep water.
- **`width`** (game metres, corridor *half*-width) is per-mark, interpolated along the
  segment. Generous by default — **~8 km** — widened to **12–15 km** on blue-water legs,
  narrowed to **2–4 km** through archipelagos and at chokepoints. Traffic and the player
  disperse across the local width; nothing tracks the bare centreline.
- **`choke: true`** flags a funnel (cape/strait/narrow approach) — where traffic bunches
  and pirates lurk.

### Graph + edge cost (now gait + current + wind)

At load: resolve marks to world xz (`latLonToWorld`), dedupe shared nodes, build
bidirectional edges. Each edge stores a **precomputed transit time** — Σ over sampled
sub-segments of `length / v_eff`, where along a sub-segment of heading `h`:

```
v_eff ≈ hull · gaitFactor(coastDist) · pointOfSailFactor(h, windAt) + current·ĥ
```

`pointOfSailFactor` uses the **static structural** wind field (§3): an edge you must
*beat* costs its VMG (≈ speed·cos(beat)), a reach costs full speed, a run its broad-reach
VMG. So a leg that fights the wind is expensive and the router avoids it. All three
fields are static ⇒ edge costs compute once at module load. (Storms are dynamic and
handled separately, below and §4.)

**This is what makes the historic routes emerge:** north-about to Europe wins not because
it's hand-declared "the" route but because it's a reach on the westerlies with a fair
Gulf Stream, so its edge cost is genuinely lower than a due-east beat against trades and
current.

### Query — the one entry point `main.js` calls at course-set

```js
route(fromX, fromZ, toX, toZ, t) → [{ x, z }, …]   // ordered waypoints, last = destination
```

Returns the **cheapest of three** candidates (the hybrid model):
1. **Direct** — today's rhumb line, time-costed by sampling the same `v_eff`.
2. **Lane** — nearest-lane on-ramp → Dijkstra over the node graph → off-ramp → destination.
3. **Dogleg seek** — a small fixed set of offshore bows, each time-costed.

Then it applies **storm avoidance** (§4): if an active storm's danger disc intersects the
chosen path, insert a detour waypoint around it (or pick the next-best candidate that
clears it). If **Direct** wins and no storm intervenes, the result is today's behaviour —
**no regression**. Routing runs **once per course-set**; storm re-planning is the one
dynamic exception (§4).

### Helper queries

```js
nearestLanePoint(x, z) → { x, z, tangent, width, laneId, choke } | null
chokepoints() → [{ x, z, width, laneId }]          // pirate placement
```

---

## 2. `src/currents.js` — the ribbon field

### Data (append-only) — complete gyres, both limbs

```js
export const CURRENTS = [
  // North Atlantic gyre — CLOCKWISE, a closed loop:
  { id: 'gulf-stream', name: 'Gulf Stream',           // NE limb: US coast → Europe
    path: [ {lat:25,lon:-80}, {lat:35,lon:-73}, {lat:41,lon:-50}, {lat:50,lon:-25} ],
    speed: 2.2, width: 6000 },   // m/s along the path; half-width game metres (gameplay-scaled)
  { id: 'canary', name: 'Canary Current',             // S limb, off Iberia/Africa
    path: [ {lat:43,lon:-13}, {lat:30,lon:-18}, {lat:20,lon:-20} ], speed: 1.0, width: 6000 },
  { id: 'n-equatorial-atl', name: 'North Equatorial', // W limb, back to the Caribbean
    path: [ {lat:15,lon:-25}, {lat:14,lon:-55}, {lat:14,lon:-72} ], speed: 1.4, width: 8000 },
  // …North Pacific gyre (Kuroshio→N Pacific Current→California→N Equatorial), the two
  //    SOUTHERN gyres (CCW), the Antarctic Circumpolar (E, right round), Agulhas.
];
```

**Currents run both ways across each ocean because gyres are closed loops** — a westward
tropical limb (equatorial, ~10–20°) *and* an eastward mid-latitude limb (Gulf Stream→N
Atlantic Current; Kuroshio→N Pacific Current, ~35–50°), joined by the eastern-boundary
return. Northern gyres turn clockwise, southern counter-clockwise. So there's a genuine
eastbound highway and a westbound highway — the round trip works.

Widths are **gameplay-scaled** (~5–8 km half-width) to sit under the lane corridors — a
literal 1:250 of the real ~100 km Gulf Stream would be sub-km and useless.

### Query

```js
currentAt(x, z) → { vx, vz }   // m/s world-frame drift; summed over ribbons in range,
                               // direction = local path tangent, tapered to 0 at width, 0 beyond
```

### Coupling

- **Player world-advance** becomes `(hull·gait + current·gait)` — a favourable ribbon a
  real boost, a foul one a real tax, tuned to ~20–30% of blue-water speed (now a larger
  share of the halved base).
- **`lanes.js` edge cost** reads the same field ⇒ lanes and currents agree by construction.
- **v1 boundary:** current drift applies to the **player only**; merchants trace currents
  via authored lanes. (Merchant drift is a clean later add.)

---

## 3. `src/wind.js` — the procedural wind field (replaces live weather)

### Why live weather goes

Today `LiveWeather` (`weather.js`) polls Open-Meteo at the ship's lat/lon and eases
`windBase.from/.speed` toward it (`main.js:1716`), and sets `weatherState` from the WMO
code (`main.js:1718`). But: it's the **only non-deterministic input to sailing** in a
*procedural-only, deterministic* project; it delivers a single global wind eased slowly,
not real spatial structure; and `weatherState` starts `'clear'` and is **only** changed by
live weather — so offline (the common case) the sea is **permanently fair, no storms
ever**. Removing it restores determinism and unlocks a real wind field + designed storms.

### The field

```js
windAt(x, z, t) → { from, speed }   // wind FROM direction (rad, world yaw), m/s
```

Latitude-banded climatology (the trade-wind system), a static **structural** component
plus a gentle time/longitude overlay for life:

| Band (|lat|)      | Wind FROM        | Note |
|-------------------|------------------|------|
| 0–5° (doldrums)   | light, variable  | the ITCZ calms — slow going, a real hazard on a crossing |
| 5–30° (trades)    | NE (N hem) / SE (S hem) | the easterly trades — why you leave the Caribbean going *west* |
| ~30° (horse lat)  | light, variable  | |
| 30–60° (westerlies)| SW/W (N) / NW/W (S) | the eastbound highway aloft |
| 60–90° (polar)    | E                | |

Hemisphere-mirrored. Speed also bands (the roaring **forties** blow hardest). The
**structural** part (band direction/speed) is what `lanes.js` edge cost and `route()`
read — static and deterministic. The overlay (small `t`-varying veer/gust) is cosmetic
and excluded from routing. No `Date.now`: `t` is sim time, passed in.

Seasonality (monsoon reversal in the Indian Ocean) is **out of scope** — a later authored
exception, noted in §12.

### Integration

`main.js` sets `this.wind = windAt(ship.x, ship.z, t)` (keeping `windProfile`'s offshore
speed build and `WIND_FLOOR`). Storms (§4) override the field locally.

---

## 4. `src/storms.js` — designed weather drama

### Model

A storm is a **moving low** with a deterministic track: `{ center{x,z}, r, intensity,
kind }`, a cyclonic wind vortex (CCW in N hem, CW in S — tangential + inflow), a calm eye,
raised sea state, and reduced visibility.

```js
stormsAt(t) → [ storm, … ]                 // storms alive at sim-time t (deterministic)
stormWindAt(x, z, t) → { from, speed } | null   // vortex wind if inside a storm, else null
stormFieldAt(x, z, t) → { seaScale, gloom, weatherState, danger }  // sea/sky/hazard
```

- **Hurricanes** seed in the real belts and seasons (tropical Atlantic/Caribbean, NW
  Pacific typhoons, S Indian…), tracking WNW then **recurving NE** along the trade→westerly
  steering flow. Deterministic: a seeded generator keyed on a coarse sim-time "season"
  bucket + region — same waters, same season, same storms, every session (invariant 6).
- **Standing gales** — the roaring forties as a persistent high-sea-state, high-wind band
  rather than discrete cells.

### Coupling

- **Wind:** `stormWindAt` overrides `windAt` inside a storm — speed ramps toward the
  eye-wall, calm in the eye, direction rotates cyclonically.
- **Sea + sky:** `stormFieldAt` drives `waves.setSeaState` (via `seaStateFor`) and
  `weatherState` (`'storm'`/`'rain'`/`'fog'`) → `skyfx`, replacing the retired live source.
  Feeds the existing Flying-Dutchman spawn (`dutchmanSails`).
- **Damage:** sustained time in the eye-wall accrues rig/hull damage (the existing
  `rigPct`/`hullPct` state); the crew chatter and log note it.
- **Avoidance routing:** each storm carries a **danger disc** (center + r·margin).
  `route()` (§1) detours around any disc intersecting the path; the helmsman also does
  **local avoidance** — a storm detected ahead within range makes it bear away and rejoin
  the lane once clear. Storms are the one **dynamic** routing input, so a route is
  re-planned if a storm crosses it mid-voyage (throttled, not per-frame).

Storms are transient but **deterministic**, so avoidance is reproducible and fair.

---

## 5. `src/helmsman.js` — route-follower + honest beat/run

1. **Route-following.** The existing `helmOrder(...)` (steer/tack/trim toward *one* mark)
   is retained as the tactical layer. A thin wrapper `helmRoute(state, route, windFrom, t)`
   steers toward the active route waypoint, advances within `ARRIVE_R`, calls final arrival
   at the last, and applies local storm avoidance (§4). `main.js` owns the stored route.
2. **VMG fix (the audit's Gap 1).** Replace the fixed pinch `CLOSE_HAULED = IRONS+0.12`
   (~37°, empirically 51% of achievable upwind VMG) with `BEAT = argmax_rel
   pointOfSailPower(rel)·cos(rel)` ≈ **0.87 rad (~50°)** — static (the POS curve is fixed;
   wind speed and gait scale all headings equally). The **same machinery applies
   downwind** (gybe on optimal broad reaches vs a slow dead run — the POS curve rewards
   0.9 at ~135° over 0.72 dead-run). The same VMG factor is what `lanes.js` edge cost uses,
   so router and helm agree.

The helmsman never overrides grounding, the anchor, or the captain at the wheel — those
`main.js` precedences are unchanged. **The beat/gybe angles here are the _master's_
target; `helmSkill` (§5.1) interpolates a green hand short of them, and the captain at
the wheel can exceed even a master.**

---

## 5.1 The helm hand-off & the captain's loop

An autopilot with no reason to ever steer would gut the game's core skill (pillar 1: "a
good sailor outruns a bad one"). The helmsman covers the dull legs; the captain is pulled
back whenever a moment has stakes. Two hand-off modes, decided by a small **pure** watcher
`src/helmwatch.js` that reads signals the game already computes (nearest-contact distance,
coast distance, active storm/zone, anchor depth, monster state):

- **Soft** (alert, keep sailing) — a contact or opportunity. The helmsman hails
  ("Sail on the horizon, Cap'n — orders?") and holds course; the captain may take the
  helm (T) or stay below. Encounter-gait buys the time.
- **Hard** (heave to, demand the helm) — a hazard the autopilot must never sail into. The
  helmsman rounds up / backs sail and will **not** proceed until the captain has the wheel.

```js
helmwatch.decide(state) → { mode: 'soft' | 'hard' | 'none', reason }   // pure, verify-gated
```

### Trigger table

| Trigger | Mode | Signal it reads (mostly existing) |
|---|---|---|
| Sail sighted / lookout hail | soft | contact within `LOOKOUT_R` |
| Hunted by the navy | soft | armed hunter closing (`merchants` hunt) |
| Boarding a prize / in combat | soft | contact inside encounter range |
| Port approach / pilotage | hard | low `coastDist` near a `ports` node |
| River / inland | hard | `overLand` / river distance |
| Reef, shoal, archipelago | hard | low `coastDist` + per-hull grounding |
| Unavoidable storm / lee shore | hard | `storms.stormFieldAt` danger + coast |
| The Kraken | hard | kraken active — must run for the shallows |
| Whale ram / whirlpool | hard | monster state |
| Bermuda Triangle | hard | inside the zone (the compass is unreliable) |

### Giving the course

Chart-click a destination → the router lays the lane path and draws it → sail it. Click a
**port/legend node** to snap to it. When the router has a genuine alternative (north-about
vs direct), it **offers both; the captain picks** — the wind-aware lane choice as a human
decision, not an algorithm's. Richer standing orders ("shadow that sail", "keep station")
are out of scope for v1 (§12).

### The captain's loop off the helm (mostly existing systems)

While the helmsman sails: work the **guns** (`combat.js`), the **hold / warden's writ**
(cargo, prizes), the **crew** (watches, lookout, grumbles, brain chatter), the **chart /
log / star chart**, **repairs** (rig/hull, pumps), the **crow's nest**, the **lead line**
on a shoaling approach. Travel time becomes management time (pillar 4), punctuated by the
skill moments the hand-off pulls you into (pillar 1).

### The hand at the wheel is only as good as who you signed

`helmSkill ∈ [0,1]` scales the helmsman's sailing: a **green hand** pinches and eases early
(~75% of optimal VMG); a **master helmsman** — signed at a dockyard for real coin and a
higher wage — approaches the VMG-optimal beat/gybe of §5. Crucially, the **captain at the
wheel can exceed even a master** (chasing gusts and shifts, wave-steering — things the AI
never does), so on a chase it always pays to take the helm, and buying a better hand is
real progression. `helmOrder`/`helmRoute` take a `skill` argument; the hire lives in the
existing port economy (`port.js` / `hireHand`). Ties into the crew-as-characters and wage
pillars.

---

## 6. `src/merchants.js` — lane-anchored traffic

### Spawn bias

`cellMerchants` weights berths toward nearby lanes (more sail on the highways, emptier
open ocean). Remains a pure, deterministic function of the cell.

### Role-based placement + idle movement

A static `role` per type — combat/`faction.js` attitude logic untouched; only *placement
and idle movement* differ:

| Type              | Role      | Behaviour vs lanes |
|-------------------|-----------|--------------------|
| trader, indiaman  | `traffic` | Sail the corridor at a deterministic **lateral offset** ∈ [−width, +width] (spread, not single-file); offset sign biased by travel direction ⇒ opposing traffic passes port-to-port. |
| navy (corvette)   | `patrol`  | Cruise the corridor either way as the law of the highway; existing hunt-the-black-flag layered on. |
| raider (pirate)   | `lurk`    | Do **not** run the open lane — bias toward **chokepoints** (`lanes.chokepoints()`); hold station / slow-patrol at the corridor edge; dart at prey in range. |

`merchants.js` imports the pure `lanes.js`; nearest-lane lookups throttled. Traffic stays
**ephemeral** (re-derived from the spawn table when cells re-enter range) — no global
persistent voyage sim. The payoff is *player-on-lane meets traffic-on-lane*, deadliest at
the narrows.

---

## 7. Wiring + physics

- `main.js` `onCourse` (chart click): `this.route = lanes.route(ship.x, ship.z, w.x, w.z, t)`.
- Wind each tick: `this.wind = stormWindAt(x,z,t) ?? windAt(x,z,t)`, then
  `windProfile` speed build; `weatherState`/sea from `stormFieldAt`.
- `shipphysics.stepShip(s, wind, dt, spec, gait, furl, oarDrive, current = {vx:0,vz:0})`
  — appends `current` to the world-advance, gait-scaled. Default zero ⇒ every existing
  caller and `verify-ship` unchanged.
- Remove the Open-Meteo poll and `LiveWeather` construction; retire `mapMarine`.

---

## 8. Verification (the gate must stay green)

- **`verify-lanes.mjs`** — graph connected; every mark afloat; `route()` returns an
  ordered path to the destination; off-lane falls back to Direct; edge cost provably
  prefers deep, current- and wind-favourable water; **no lane crosses a monster zone**
  (assert vs `legendfx`); storm-avoidance detours a disc on the path; determinism.
- **`verify-currents.mjs`** — tangent to the ribbon, tapers to 0 at width, 0 beyond, sane
  magnitude, deterministic; gyres form closed loops (both limbs present per ocean).
- **`verify-wind.mjs`** — trades easterly in the tropics, westerlies in mid-latitudes,
  hemisphere-mirrored, doldrums light, continuous across bands, structural part
  deterministic in `t`.
- **`verify-storms.mjs`** — vortex rotates cyclonically per hemisphere, wind ramps to the
  eye-wall and calms in the eye, sea raised, storms seed only in belts/seasons, tracks
  recurve, eye-wall accrues damage, danger disc yields an avoidance detour, deterministic.
- **`verify-helmsman.mjs`** (extend) — a multi-waypoint route arrives; beat VMG ≥ the old
  pinch's; downwind gybe beats a dead run; a route through a storm diverts and still
  arrives; a master (`skill=1`) makes more VMG than a green hand (`skill=0`), and neither
  exceeds the captain-optimal ceiling.
- **`verify-helmwatch.mjs`** — soft vs hard classification for each trigger; hard events
  never return `none`; a clear open sea returns `none`; pure and deterministic in the state.
- **`verify-weather.mjs`** — updated for the `LiveWeather`/`mapMarine` removal; the kept
  pure helpers still pass.
- **`scripts/live-lanes.mjs`** (puppeteer) — an ocean course rides a lane, and a storm on
  the course is skirted, in a real browser.
- Extend `npm run verify`; whole gate green before deploy.

---

## 9. Tuning knobs & named risks

- **Lane pull vs freedom** — `route()` diverts to a lane only past a time-saving margin;
  short hops stay direct.
- **Corridor width** — authored per segment: ~8 km default, 12–15 km blue water, 2–4 km at
  chokepoints/archipelagos. Wide by default so ships never pass beside one another; narrow
  only where geography or ambush demands.
- **Current strength** — authored `speed` × gait, tuned to ~20–30% of blue-water speed.
- **Wind vs current balance after §0** — blue water is halved; the current and a fair wind
  now carry a bigger relative share. Tune together in playtest (scenario A is the yardstick).
- **Storm frequency/severity** — few enough to be events, common enough to matter in a
  crossing; danger-disc margin sized so avoidance costs time without being unfair.
- **Routing cost at course-set** — sampling `gaitFactor`/`currentAt`/`windAt` along
  candidates touches `coastDistGame`; keep sampling coarse (every few km); it's a one-shot
  cost, except throttled storm re-plans.
- **Authoring load** — ~10–15 lanes, ~12–15 currents, the wind bands, the storm belts.
  The main *time* cost; start with Caribbean/Atlantic home waters, extend append-only.
- **Determinism of storms** — the one moving element; kept reproducible via a seeded
  season/region generator, never wall-clock or `Math.random`.
- **Off-ramp through shallows** — the off-ramp toward an inshore click defers to
  grounding/anchor logic (it already does; the helm issues orders, physics owns the sand).

---

## 10. Acceptance scenarios (what "the helmsman does his job" means)

**A. The eastward Caribbean passage** (the known pain point — beating east out of the
islands was miserable). Now solved by the systems acting together, *deterministically*:
1. **Wind field** — the easterly **trades** (5–30°) are why going straight east is a beat;
   the **westerlies** (30–60°) to the north are a fair wind east. Both are always there.
2. **The route emerges** — because the edge cost includes wind and current, the router
   *derives* the north-about route (up the Gulf Stream, across on the North Atlantic
   Current + westerlies) as genuinely cheaper than a due-east beat — no hand-declared "the"
   eastbound lane needed.
3. **VMG fix** — the initial beat out through the passages makes ~double the windward
   progress of the old pinch.
Acceptance: a Caribbean→Europe course routes north-about via the Gulf Stream and arrives
without a soul-destroying dead beat — asserted headlessly in `verify-lanes.mjs`
(north-about beats due-east on transit time) and shown in `live-lanes.mjs`. No live-weather
caveat: it holds every session.

**B. Deep-water preference** — a course between two coastal points with a faster offshore
path takes it (the audit's Gap 2). Asserted by transit-time comparison in `verify-lanes`.

**C. Storm standoff** — a course whose rhumb line runs through an active hurricane is
re-laid around it and still arrives. Asserted in `verify-lanes`/`verify-helmsman` and shown
in `live-lanes`.

**D. No regression** — a short coastal hop, or a mid-ocean click far from any lane with no
storm near, still sails the direct rhumb line.

---

## 11. Build order inside the spec (each independently verifiable)

1. `lanes.js` + `verify-lanes` — graph + `route()`, **Direct fallback only**, cost on
   gait alone at first.
2. Helmsman route-following + VMG beat/gybe + `verify-helmsman`.
3. `helmwatch.js` + `verify-helmwatch` (soft/hard hand-off); `helmSkill` scaling + the
   rated-helmsman hire (`port.js`); course-give UX (route preview + pick alternatives).
4. `wind.js` + `verify-wind`; wire the field into `main.js`; fold the wind term into lane
   edge cost. **Remove `LiveWeather`** and update `verify-weather`.
5. `currents.js` + `verify-currents`; wire current into `stepShip` and edge cost; **halve
   `GAIT_MAX` (§0)** and update its copy/verify echoes here, tuning the balance as one.
6. Dogleg-seek fallback in `route()`.
7. Merchant spawn-bias + role-based lane movement (traffic/patrol/lurk).
8. `storms.js` + `verify-storms`; wire vortex wind, sea/sky/damage, and avoidance routing.
9. `live-lanes` + full-gate green + deploy.

Phases 1–7 are the routing + hand-off core (shippable on their own); 8 is the storms
drama, stageable as a later deploy though it rides in this one spec.

## 12. Out of scope (explicit)

- Persistent origin→destination merchant voyages (a global background sim) — later.
- Merchant current/wind drift — later.
- Seasonal wind reversal / monsoons (Indian Ocean) — a later authored exception.
- Real-time real-world weather — deliberately removed (see §3); not returning.
- Richer standing orders to the helmsman ("shadow that sail", "keep station off the
  coast", "heave to here") — v1 is set-destination + pick-route only (§5.1).
- Crew skill beyond the helmsman's `helmSkill` (gun crews, lookouts, sail-handlers as
  rated hands) — later; §5.1 lays the pattern.
