# The passage layer — what occupies the captain while the helmsman sails

*(Spec, approved 2026-07-18. DESIGN.md names the hole: "passage time is the game's
biggest empty room". The helmsman + searoute made the room bigger: an Atlantic
crossing is ~10 minutes of watching. This layer is the furniture.)*

## The design law

**The helmsman gets you there. The captain gets you there faster, richer, and
readier.** Every passage activity converts attention into one of four currencies —
passage time, battle-readiness, intel, or gold — and AFK stays safe: nothing here
can sink, strand or bankrupt an absent captain. Opt-in depth, never chores.

Quiet is load-bearing. Target rhythm: one *push* event every 2–3 minutes, *pull*
stations always available. Don't fill all ten minutes.

Three channels: **push** (the sea interrupts you), **pull** (stations that reward
attention), **stakes** (why attention pays).

## The watch-bell spine (watchbill.js)

A **passage bell** strikes every `BELL_S` (90 s) while the helmsman sails a set
course in open water (gait > 1.3 — inshore legs belong to the encounter system).
Each bell rolls one deterministic event from `(passage seed, bell number, context)`:
yarn, dispute, bottle-sighted, raft-sighted, spectacle (breach / meteors /
St Elmo's fire) — or, at least a third of the time by construction, nothing.
Context gates: St Elmo's only in storm, meteors only on clear nights, breaches
only on clear days, disputes only with 3+ hands. No event kind repeats twice
running. The stern-chase roll (below) rides the same bell.

Same spine, later eras: the steam tiers swap the station set (stoking, boiler
pressure) without touching the bell clock.

## Push — the sea interrupts

### The stern chase (chase.js)
**Notoriety** (`heat`, 0..1, rides the save) grows with every boarding and
sinking, cools slowly with days at sea. Above `HEAT_MIN` each passage bell may
send a hunter over the horizon **astern** — a King's corvette for the black flag,
a raider for the King's colours (merchantlayer `spawnEscort` grows a type param).
The existing hostile AI does the hunting; the chase is the captain's problem:
trim and outsail her, run for shoal water, round on her — or **X: jettison a
quarter of the chest**. The hunter breaks off for the floating gold (greed is
doctrine) and the lightened hull gets a `SPRINT_S` speed edge. Deterministic,
always an out, always a price.

### Storm sailing (storms.js additions)
Storms stop being detours:
- **The outer band** (between the danger disc and the rim) multiplies the gait
  by up to `BAND_GAIN` — riding a cyclone's edge is the classic sailor's gamble,
  and the helm watch won't do it for you (it heaves to at danger ahead; band
  riding is wheel work, T).
- **Shorten sail or tear canvas**: above `REEF_WIND`, trim harder than
  `REEF_TRIM` and the rig takes damage at `canvasRisk()` per second (warned
  once per squall). The helmsman reefs himself — the honest hand never tears
  her canvas; the captain may press harder, and pays in rig.

### Flotsam, bottles, castaways (flotsam.js + flotsamlayer.js)
Deterministic drifting objects seeded per ocean cell + epoch, storms-style:
- **Crates** — boathooked automatically alongside, small gold.
- **Bottles** — E alongside: a treasure map if none is held, else a rumour
  naming an unwon legend and its bearing, else a small purse. The ocean is a
  rumour medium; maps point players at the world.
- **Rafts** — castaways (survivors.js minds): E hauls them aboard — join or
  gratitude, same law as swimmers.
Bell events also sing out a nearby object's bearing so the lookout does his job.

### Spectacles
Bell events with no mechanics and full log presence: a whale breaches under the
bow, a meteor shower on a clear night, St Elmo's fire on the yards in a storm.
The log entry is the collectible — the log is the brag sheet.

## Pull — stations for the captain

### Gun drill (gundrill.js)
**K** runs a dry-fire drill (`DRILL_S`, needs a hand, not in action). Gunnery
skill 0..`GUNNERY_MAX` rises with diminishing returns, rides the save, and cuts
the reload up to `RELOAD_CUT`. Arriving battle-ready is a currency because heat
raises the odds someone is waiting.

### Carpenter's rounds (carpenter.js)
Heavy weather works the seams open on hulls big enough to have a hold (brig up).
An open seam weeps — slow hull decay, floored at `SEAM_FLOOR` (AFK-safe: seams
never sink her, the founder rule stays combat's alone). Below decks the seam is
visible at a deterministic frame spot; stand by it and E drives the oakum home.
Bigger ship, more seams: scale turns management, as DESIGN promises.

### Fishing (fishing.js)
**P** puts the handlines out below 5 kn. A deterministic bite after 12–40 s —
"SOMETHING TAKES THE LINE" — and E strikes inside the window or loses the bait.
The catch is keyed to real waters (Grand Banks cod, North Sea herring, tropic
dorado…), accumulates aboard, and sells itself at the next port call. Geography
by stealth, income at sea — the economy rule holds.

### The chip log and the reckoning (reckoning.js)
**U** heaves the chip log: speed through the water by the 28-second glass, in
knots, because that is literally where knots come from. The first cast takes
departure — starts a **dead reckoning** advanced by heading and the *last cast's*
speed. The fair current is exactly what the log cannot see, so the reckoning
drifts from truth the way real DR drifted — set and drift ARE the error. A star
sight (N) or a landfall is a fix: the game reports how far out the reckoning ran
and corrects it. Teaches the deepest true thing in the pillar.

### Yarns, disputes, morale (yarns.js)
- **Yarns**: a hand spins a deterministic rumour on a bell — a real unwon legend
  and its true bearing, in period voice. Intel as loot.
- **Disputes**: two named hands quarrel; the captain calls it — **1** the rope's
  end (order, morale dips), **2** an extra ration (10 doubloons, morale rises).
  Ignored 45 s, the quarrel festers. Both calls are valid captaincy.
- **Morale** (0..1, rides the save): moved by events, victories, wrecks, drills,
  fish, storms ridden; drifts toward 0.65. Feeds reload speed and boarding
  weight, mildly — a happy ship fights sharper.

### The running survey (survey.js)
Coast sighted inside `SURVEY_R` inks half-degree cells into the captain's survey
(persisted, deduped, capped). The next port call buys the fair copy at
`SURVEY_RATE` a cell — hydrography was honest sea income, so "money is made at
sea" survives. Rewards hugging new coastlines instead of retreading the lane.

### Passage records
Any routed passage ≥ `RECORD_KM` logs distance, time and average speed on
arrival; the best rate rides the save and the log calls out a beaten record.
The multiplayer brag sheet, single-player first.

## Keys (new)

| Key | Act |
|---|---|
| X | jettison a quarter of the chest (only under chase) |
| K | gun drill |
| P | fishing lines out / in |
| U | heave the chip log (first cast takes departure) |
| 1 / 2 | call a dispute |

## What this is NOT

No hunger/provisioning clocks, no forced timers, no minigame disconnected from
the live simulation (instruments read the sim — DESIGN's own rule), nothing that
punishes walking away. The sea interrupts; it never nags.

## Save (all additive, version stays 1)

`heat`, `gunnery`, `morale`, `fishCatch`, `seamWear` + `seamsOpen`,
`surveyed[]`, `bests` — vetted in acceptSave like every other field; absent
fields read as a green, unremarkable, unsurveyed ship.

## Verify

Every pure module above ships with its `scripts/verify-*.mjs`:
watchbill (determinism, quiet floor, gates, no repeats), chase (heat bounds,
roll ramps, jettison maths), storms additions (band shape, canvas risk gates),
flotsam (determinism, cell caps, bottle leads), gundrill (diminish, cap,
reload cut), carpenter (cap, floor, spots inside the hold), fishing (regions,
windows, values), reckoning (advance maths, current drift, fix reset), yarns
(bounds, both dispute calls sane), survey (quantise, dedupe, cap, value).
