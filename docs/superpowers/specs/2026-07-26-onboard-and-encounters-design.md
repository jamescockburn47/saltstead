# Onboard activities and the encounter approach — audit and design

*(Spec, 2026-07-26. Two commissions from the owner, investigated together because they
share a root: a number the game computes but nothing consequential reads.)*

> "we did build onboard activities but they dont seem to have been implemented. they
> need to be genuinely needed for game mechanics."
>
> "make the slow/approach distance to other ships smaller, still need a chase mechanic,
> but currently slow too far away and have to crawl towards the other ship."

Docs only. No source touched. Line numbers are from the working tree at `26d46ce`
(v0.0.66) as read while writing — but **`src/main.js`, `src/wind.js` and `src/weather.js`
were under concurrent edit by another agent**, so `main.js` references may have drifted a
line or two since; grep the quoted symbol rather than trusting the number. Everything
quoted from a pure module is stable.

---

## Part 0 — the headline

**Nothing is unimplemented.** Every advertised key is bound, every handler reaches its
pure module, every module is verify-gated, and `git log -S` finds no symbol that was
wired and later unwired. The passage layer landed in three commits on 2026-07-18
(`73eb101` spec, the modules, `ef1ffe2` the wiring) and has not regressed since.

What is true instead — and it is a worse problem, because it looks like working code:

1. **The whole push channel is behind a door most players never open.** Yarns,
   disputes, spectacles, bottles and the stern chase all ride `this.passage`, and
   `this.passage` is created in exactly one place: laying a course on the chart
   (`src/main.js:480-483`). Sail under your own hand and the bell never strikes.
   Worse, the helm watch is *designed* to hand the ship back on any of ten hazards,
   and doing so nulls it (`src/main.js:2609`). The two systems undercut each other
   by construction, in the same commit.
2. **Three activities are gated out of the starting ship.** `START_CREW = 0`
   (`src/fleet.js:5`) so gun drill refuses (`src/main.js:1680`); the sloop has one
   berth (`src/shipyard.js:27`) so a dispute — `crew >= 3` (`src/watchbill.js:26`) —
   can never fire; and fishing needs the ship below `FISH_SPEED = 2.5` m/s
   (≈4.9 kn, `src/fishing.js:13`, gate at `src/main.js:1655`), i.e. it is mutually
   exclusive with making a passage.
3. **The HUD gives away, for free and more accurately, exactly what two instruments
   exist to estimate.** `src/main.js:3292` prints `ship.speed * 1.944` in knots every
   frame — the chip log's entire product, with the *identical* conversion constant and
   without the ±6 % error (`src/reckoning.js:19,26`). `src/main.js:3313-3315` prints
   latitude to 0.01° every frame — the star sight's entire product, which is accurate
   only to Polaris's 0.736° offset. Both readouts sit in `#panel`
   (`index.html:269-283`), which nothing ever hides.
4. **The consequences that do exist are sub-perceptual.** Morale's realistic band
   (0.55–0.85, homed at 0.65 by `driftMorale` every frame, `src/main.js:2659`) moves
   reload time by about 7 % (`src/yarns.js:31`) and boarding odds by ~3.7 percentage
   points (`src/yarns.js:32` through the `Math.round` at `src/main.js:1561`). There is
   no morale readout anywhere in `src/main.js` or `index.html`.
5. **Every verify script tests its module and none tests the wiring.** All twelve
   passage scripts would still pass with `startDrill()`, `toggleLines()` and
   `heaveChipLog()` deleted from `main.js`. That is precisely why four activities could
   rot in place with a green gate — and it is the house law being broken: a rule that
   must never fail belongs in an instrument, and "the key still does something" is
   such a rule.

So the owner's instinct is right, but the diagnosis is not "unbuilt". It is: *built,
wired, gated out of reach, and reporting numbers the HUD already gave away.*

---

## Part 1 — the audit

Legend: **Wired** = key bound and handler reaches the module. **Load-bearing** = the
game is measurably harder or poorer if you never press it.

| Activity | Code | Wired? | Verify | Load-bearing? | Orphaned? |
|---|---|---|---|---|---|
| **Gun drill (K)** | `src/gundrill.js` complete: `GUNNERY_MAX 0.6`, `DRILL_S 18`, `DRILL_COOL 60`, `RELOAD_CUT 0.3`; `drillGain` `:17`, `drillReload` `:22` | **Yes.** `main.js:375` → `startDrill()` `:1678`; clock resolves `:2688` | `verify-gundrill.mjs` — maths only, never imports main.js | **YES.** `main.js:1556` `drillReload(reloadTime(crew), gunnery) * moraleReload(morale)` is the *only* reload truth, consumed at all three fire sites (`:1864, :1878, :1930`). 30 % cut, visible on the HUD (`:3337`) | No. `ef1ffe2` wired it, never touched since |
| **Fishing (P)** | `src/fishing.js` complete: 6 real grounds `:24-36`, `biteAfter` 12–40 s `:18`, `STRIKE_S 4` | **Yes.** `main.js:376` → `toggleLines()` `:1647`; bite `:2673`; E strike first in `onE()` `:1388`; `landFish()` `:1665` | `verify-fishing.mjs` — maths only | **Half.** `fishCatch` → gold 1:1 at `main.js:1130-1134`. But **the speed gate makes it unreachable on a passage** (`:1655`, and an auto-haul above 3.5 m/s at `:2669`), and 5–28 doubloons is noise beside a prize | No |
| **The chip log / reckoning (U)** | `src/reckoning.js` complete and correct; the drift genuinely *is* the current's set (`stepReckoning :48` advances by logged speed, `shipphysics.js:145` advances truth by speed + current) | **Yes.** `main.js:377` → `heaveChipLog()` `:1691`; stepped `:2720`; fixed `:1233`, `:3278` | `verify-reckoning.mjs` — maths only, and its hand-rolled "truth" integrator predates the beam-set cap (`shipphysics.js:143`) and passes by a 0.04 m/s coincidence | **NO — decorative.** Eight reads of `this.reckoning`; every one is a toast or a log line. `mapui.js` and `chart.js` never mention it. It measures the number `main.js:3292` prints for free. Not in `save.js` | No — but it never grew a consumer, and `23c616b` rewrote the very current model it is blind to without revisiting it |
| **The star sight (N)** | `src/navigation.js` + `src/skymath.js` + `src/starchartui.js` — real astronomy, 26 catalogue stars, shares `celestialAngles` with the 3D sky | **Yes.** `main.js:513` → `toggleStars()` `:1222` | `verify-navigation.mjs`, `verify-sky.mjs` — rigorous maths, zero wiring | **Planisphere: YES, real content.** **Sight: NO — decorative.** It round-trips the true latitude through Polaris and returns it 0.736° coarser than `#latlon`. Two bugs: the "ragged sight" branch (`navigation.js:45`) is unreachable (max `off` = 0.736° over every lat/hour), and the gate reads `this.gloom` (`main.js:1226`) while the sky renders `gloomEff` (`:3215`) — so inside the Triangle (`TRIANGLE_GLOOM 0.55`) and at the Cape (`STORM_GLOOM 0.5`) the navigator shoots a star through a blackout and the caption reads "a fair sight" | No. One commit, `f51f86e`, ten days untouched |
| **The crew (B)** | `src/crewchat.js` is real work — 24 grounded state rows, caps enforced, drift-guarded | **Yes.** `main.js:372` → `hailCrew()` `:955` → `openCrewChat()` `:974` | `verify-crewchat.mjs` — thorough on the pure layer; **never imports `brainclient.js`** | **NO.** It is a one-hand LLM chat box with a hard network dependency and a *single* fallback string (`main.js:1077-1080`): relay down, every hand forever says "the brain ashore didn't answer". `brainOnline()` (`brainclient.js:23`) is documented as the pre-flight ping and is **never called**. Nothing a hand says changes any number. **There is no crew management at all** — no watches, no rations, no assignments; `crewPersona(i)` is a pure function of the berth index | No |
| **The log (L)** | `src/shiplog.js` + `src/logui.js`; `acceptLog` is the strictest validator in the save layer (`shiplog.js:64-74`) | **Yes.** `main.js:512`; 70 `logEvent()` call sites | `verify-shiplog.mjs` — the tightest of the twelve, correctly scoped | **NO — and honestly so.** Five reads of `this.log`: two display, two persistence, one render. Nothing in the codebase reads `log.length` or tests for an entry. Its own header calls it "education by furniture" | No |
| **Morale + the watch bell** | `src/yarns.js`, `src/watchbill.js`; `BELL_S 90`, `QUIET 0.38` | **Yes**, but see the gate chain below | `verify-yarns.mjs:31,33` *proves the mildness* ("but never decisively"); `verify-watchbill.mjs` asserts every module gate, none of the main.js gate chain | **Barely.** Two mechanical reads (`main.js:1556`, `:1561`). Dispute yield: `passage` × `course` × `crew≥1` × `gait>1.3` × 90 s × 62 % (not quiet) × 2/13 weight × `crew≥3` ⇒ **~one dispute per 16 minutes of chart-routed open-water sailing on a hull the starting player does not own**, and the reward (+0.06 morale for 10 gold) is worth 1.4 % on reload and usually zero hands on `effCrew`. `this.dispute` and `this.passage` are not saved | No |
| **Carpenter's seams (E below)** | `src/carpenter.js` | **Yes.** wear `main.js:2699`, opens `:2700`, drains `:2706`, oakum `:1365`, HUD `:3365` | `verify-carpenter.mjs` | **YES — the most load-bearing of the lot.** `SEAM_RATE 0.0004`/s per seam toward `SEAM_FLOOR 0.55`: 45 % of hull is a repair bill you feel. Brig-and-up only, floored so it cannot sink you. Fully saved | No |
| **The running survey** | `src/survey.js` | **Yes.** inked `main.js:2329`, sold `:1136` | `verify-survey.mjs` | **YES.** Real gold at 6/cell, min 5, cap 600. Saved and regex-vetted | No |
| **Sweeps (O)** | `src/oars.js` (visible half only) | **Yes.** `main.js:373` → `:936`; drive `:2937` | `verify-oars.mjs` | **YES as a feature** (it is how you get off a beach); the module itself is cosmetic by design | No |
| **The helm watch** | `src/helmwatch.js` | **Yes.** `main.js:2557-2613` | `verify-helmwatch.mjs` | **YES** — and it is the chief *destroyer* of the push channel: a hard verdict nulls `this.passage` (`:2609`) | No |

### The one dead branch and the two live bugs found in passing

- `src/navigation.js:45` — `'rough seas made it a ragged sight'` is unreachable. Swept
  every latitude −89…89 at quarter-hour steps: `off` never exceeds 0.7360°, and south
  of the line it is exactly 0 by construction (`:38`).
- `src/main.js:1226` vs `:3215` — `canSight` reads `this.gloom`, the sky renders
  `gloomEff`. `TRIANGLE_GLOOM = 0.55` and `STORM_GLOOM = 0.5` both exceed the 0.45
  threshold, so the two zones where a sight *should* be impossible are the two where
  it silently succeeds against a black chart.
- `src/starchartui.js:31-101` — `update()` never touches `this.cap`, so the caption is
  set once on toggle and goes stale: open the chart at dusk and "the sun owns the sky"
  stays on screen all night.
- `src/main.js:1388` precedes `:1415` — anchored at a haven with a fish on the line, E
  lands the fish instead of putting in.
- `src/save.js:86` clamps `gunnery` to 1 while the domain cap is `GUNNERY_MAX = 0.6`.
  Harmless only because `clampG` defends the module.

---

## Part 2 — making each one needed

The organising move, and the reason this is one spec and not five: **the game currently
answers the navigator's questions for him.** Take the answers off the HUD and four of
these activities become the only way to know where you are and how fast you are going —
which is what a real crew on a long passage actually spent its day establishing. Nothing
below is a minigame; each is the consequence of withdrawing a free readout or of
charging a real running cost.

### 2.1 The keystone — the chart tells you what you have *worked out*, not what is true

Today `mapui.js:326-328` (minimap, every frame) and `:386-388` (world chart) both plot
`worldToLatLon(ship.x, ship.z)`, and `#latlon` prints it to 0.01°. Proposal, graded so
close-quarters sailing is never harmed:

- **The minimap stays honest.** It is the pilotage view — coast shape, the harbour you
  are entering, the shoal under your lee. Withdrawing that is a usability tax, not a
  lesson.
- **The world chart (M) plots the reckoned position** with an uncertainty disc whose
  radius grows with `reckoning.since`, and the *true* ship is not drawn. `#latlon`
  reads the reckoning, labelled `BY THE RECKONING`, and reads `NO DEPARTURE TAKEN`
  until the first cast of the log.
- **Latitude is fixable, longitude is not.** A star or sun sight corrects latitude only
  — which is period-true (longitude needed a chronometer) and is exactly why 1700s
  navigators *sailed down the latitude*: run down the parallel, then turn along it.
  Longitude closes only on a landfall, a port, or a survey cell. Teaching that one
  asymmetry is worth more than any minigame; it is the deepest true thing in the pillar
  and the spec already claims it (`docs/PASSAGE.md:95-102`).
- **Bounded and AFK-safe.** Cap the error; a landfall always fixes (`main.js:3278`
  already does); the helmsman steers a *heading*, so a set course still arrives — it
  just may arrive on the wrong parallel, which is the honest consequence and is
  recoverable by a sight. Nobody strands, nobody dies (Saltstead's law).
- **Implementation risk to flag:** `searoute`/`helmsman` plan in true world coordinates.
  For the error to propagate honestly the router must plan from the *reckoned*
  position, while arrival must still test the *true* one — otherwise you get "passage
  made" in the wrong ocean. That asymmetry needs its own assertion.
- **Bonus:** the Bermuda Triangle's instrument-scramble (`compassJitter`,
  `main.js:3309`) stops being cosmetic and becomes the scariest water in the game.

**This is the load-bearing decision in the whole spec.** Everything in 2.2 and 2.3
depends on it.

### 2.2 The chip log (U) — earns its place *if and only if* 2.1 lands

With the chart lying, `U` is the sole input to the only position you have: the reckoning
advances on the *last cast's* speed (`reckoning.js:48`), so a cast you never made means
a book running on stale way. Changes:

- **Add a cooldown** (~30 s, one glass). Without it the ±6 % error is averaged away by
  hammering the key — the instrument's only teeth, gone in seconds.
- **Persist it.** `reckoning` and `castSeed` are absent from `save.js` while every other
  passage field is present (`:47-52`). A refresh silently discards the departure and
  replays an identical error sequence from seed 1.
- **Speed rides the book, not the hull.** `#speed` should read the *last logged* speed,
  ageing visibly, not `ship.speed` live.

**Verdict: keep — conditionally. If 2.1 is rejected, retire U.** It cannot be saved any
other way: an instrument that estimates a number the HUD prints exactly, with the same
constant, is not a mechanic and no amount of decoration will make it one.

### 2.3 The stars (N) — the sight becomes the only latitude you can trust

Same condition. With the chart lying, a sight is the one act that closes half your
uncertainty, and the weather gate (`canSight`) becomes a genuine constraint rather than
a shrug: a week of overcast is a week sailing blind, which is what it was.

- **Keep the planisphere as-is.** It is real content, correct, hemisphere-aware, and
  shows something no other UI shows. It earns its key on its own.
- **Give the sight a real error term** so `navigation.js:45` stops being dead code: sea
  state (the swell band already exists), the crew's quality, and the star's altitude.
  A sight taken in a gale should be ragged; that is the lesson the branch was written
  for.
- **Fix the gloom gate** to read `gloomEff` — and prefer a *sun* sight by day (noon
  altitude gives latitude too) so N is not a night-only key. A real navigator's
  principal fix was the noon sight, not Polaris.
- **Log the sight's residual**, not just the fact of it.

**Verdict: keep the chart unconditionally; the sight keeps its mechanical claim only
under 2.1.**

### 2.4 Fishing (P) — provisions, without a hunger clock

`docs/PASSAGE.md:135-139` forbids provisioning clocks, and rightly: nothing may punish
an absent captain. But there is a version that respects both that rule and the owner's
test, because in Saltstead nobody dies — so short commons costs *temper and hands*, never
lives.

- **`victuals` (days of food) rides the save**, consumed per hand per day at sea,
  restocked cheaply at any port. A solo sloop barely notices; a manned brig on an
  Atlantic crossing must think about it. Scale becomes management, as DESIGN promises.
- **On short commons morale falls as a drift override**, not an event — and at the floor
  some hands sign off *at the next port call* (never below the hull's minimum, and the
  captain always sails alone, so the game cannot dead-end and an AFK captain loses
  nothing but goodwill).
- **Fish are the answer**, not a lottery ticket: a catch adds days of victuals as well
  as gold, and lifts temper.
- **Fix the speed gate — this is the change that makes P a passage activity at all.**
  Handlines worked under way in period; a trolled line at 6–8 knots is how you take
  dorado and tuna. So: no hard speed refusal. Instead make the *catch* speed-dependent —
  trolling under way takes pelagics slowly (keyed to real waters, as now), lying-to on a
  real bank takes groundfish fast. Today's `FISH_SPEED = 2.5` m/s means the one activity
  advertised for a crossing cannot be performed during one.
- **Add a persistent HUD badge while the lines are out.** Between P and the bite there
  are 12–40 s with nothing on screen once the toast expires; the player concludes it
  did not work. That single missing badge is probably a large share of "doesn't seem to
  have been implemented".

**Verdict: keep, and it becomes one of the three strongest activities.**

### 2.5 Gun drill (K) — already load-bearing; make it *maintenance*

It is the one activity that already passes the owner's test. Two changes turn "a nice
bonus you take once" into "something that needs doing":

- **Decay.** Gunnery erodes with days since the last drill, and **dilutes when you sign
  on hands** — historically exact: a new hand is a hole in a gun crew. Then drilling is
  upkeep, not a one-off purchase, and the number matters again after every port call.
- **Unlock it for the starting ship.** `START_CREW = 0` means a first-voyage player can
  never press K and only ever reads the refusal (`main.js:1680`). Gate on *guns*, not
  hands: a lone captain dry-firing one gun is a real thing and should earn a reduced
  gain.

**Verdict: keep. Strongest of the five.**

### 2.6 The crew (B) — repurpose the key as the crew board; demote the chat

The honest finding is that B is an LLM chat with a hard network dependency and a
one-line degradation, offering no crew management whatever. Two moves:

- **B becomes the crew board** — the panel a captain actually kept: the **watch bill**,
  the **ration state**, **morale with a number on it**, gunnery, victuals, and each
  hand by name and role. From it you *command* the other activities: set watches, raise
  or shorten the ration, order a drill, order the lines out. That gives morale the
  readout it has never had and makes the crossing something you administer.
- **The watch bill is the missing real mechanic, and the best candidate in this spec
  for "genuinely needed on a long passage".** A real crossing's central chore was
  dividing the hands into watches so the ship is manned around the clock. Leave it
  unset and the same hands stand every watch: they tire, and a tired crew is slow on
  the sheets and slow at the guns. It is a period-true verb with a felt consequence and
  it costs no new art. (`watchbill.js` currently means the event clock, not the bill —
  the name is free for its historical meaning, or the new module takes a distinct one.)
- **Morale needs teeth to be worth managing.** Widen reload to about ±20 % (from ~7 %
  in the realistic band), keep boarding weight, and add the thing the player feels every
  single tack: **sail-handling speed** — a sullen or exhausted crew is slow on the
  sheets and slow round a tack. That is felt without a stopwatch, which is the test
  morale currently fails.
- **The chat moves behind the board, per hand**, and does not ship as a headline key
  until it has the canned-line fallback table its own plan already promises
  (`docs/NEXT.md`, block C1: "Fallback is first-class… the LLM is a layer, never a
  dependency"). Until then B advertises a feature that is mute offline. Also: call
  `brainOnline()` — it exists, it is documented as the pre-flight ping, and it is never
  called, so the player waits up to 90 s to be told the brain is asleep.

**Verdict: keep the key, replace its content. RETIRE the chat as an advertised
activity** until it has a voice with the relay down.

### 2.7 The log (L) — **retire it as an activity; keep it as furniture**

This is the retirement the owner asked to be offered. The log is well fed (70 call
sites), well validated, and completely inert — and its own header says it was never
meant to be otherwise. Do not prop it up with an invented mechanic; that would be the
worst outcome in this document.

- **Take L off the advertised activities line** (`main.js:3439`). A journal is not a
  chore, and listing it beside "fire" and "anchor" is what creates the impression that
  the activities do nothing.
- **Give it the one honest job it can hold:** it is the record the game already promises
  and never shows. `bests` is saved and vetted (`save.js:52`) and displayed *nowhere* —
  read once at `main.js:2261` and written into a log line. Fold the brag sheet into the
  log view and the log becomes the trophy cabinet it was designed to be, with no fake
  gating.

**Verdict: retire as an activity, promote as a record.**

### 2.8 Fix the door, not just the rooms — `this.passage`

No amount of activity design survives the fact that the entire push channel requires a
chart course and is deleted by the helm watch. Three changes, all cheap:

1. **A passage exists whenever the ship is making way in open water**, course or no
   course. The bell is the *sea's* clock, not the router's.
2. **A hard handback must not null it.** Heaving to for a squall is part of a passage,
   not the end of one; today `main.js:2609` ends the crossing's brag sheet and its
   events because the helmsman did his job.
3. **Persist `passage` and `dispute`.** A refresh mid-crossing currently kills the bell
   loop silently and discards a live quarrel with its penalty.

---

## Part 3 — the encounter approach: measured

### 3.1 The mechanism

`src/earth.js:352-378`. Two stages, both pure:

```
GAIT_MAX = 10
gaitFactor(coastDist) = 1 + 4·smooth01((d−300)/700) + 5·smooth01((d−1000)/1500)
ENCOUNTER_NEAR = 400, ENCOUNTER_FAR = 1600
encounterGait(gait, dist) = 1 + (gait−1)·smooth01((dist−400)/1200)
```

`main.js:2546-2552` feeds it `min(contactDist, whaleDist)` where `contactDist` is the
minimum over **every** live contact — players, `merchants.contacts()`, and
`legendFx.contacts()`. `merchantlayer.js:215-219` returns *every* live hull with no
filter, so a looted hulk, a sinking ship or a drifting derelict slackens the current
exactly as hard as the frigate you are chasing.

The gait multiplies ground displacement only (`shipphysics.js:145-146`); trim and turn
feel are identical at ×1 and ×10. **Merchants receive no gait at all** —
`merchantlayer.js:171` calls `stepMerchant` with no multiplier, by design
(`merchants.js:21`). So the ease does not slow "both ships"; it deletes the player's
10× ground advantage.

### 3.2 The numbers

Offshore the wind floors at 19 m/s (`weather.js` at HEAD: `WIND_FLOOR 10`, ×1.9 by
1.5 km), so `speedTarget`'s `windFactor` saturates at 2 (`sailing.js:110`) and a sloop's
honest hull speed is `2 × 8.5 × power`:

| Point of sail | power | hull speed |
|---|---|---|
| beam reach | 1.00 | 17.0 m/s (33 kn) |
| broad reach | 0.90 | 15.3 m/s |
| dead run | 0.72 | 12.2 m/s |
| close-hauled | 0.55 | 9.4 m/s |

Ground speed and closing rate against a trader (cruise 3.6, panic 5.4 m/s inside
`FLEE_R = 800`), sloop on a beam reach:

| range | gait | ground speed | closing rate |
|---|---|---|---|
| 1600 m | ×10.00 | 170 m/s | 164.6 m/s |
| 1200 m | ×7.67 | 130 m/s | 124.9 m/s |
| 1000 m | ×5.50 | 93.5 m/s | 88.1 m/s |
| 800 m | ×3.33 | 56.7 m/s | 51.3 m/s |
| 600 m | ×1.67 | 28.3 m/s | 22.9 m/s |
| 500 m | ×1.18 | 20.0 m/s | 14.6 m/s |
| **400 m** | **×1.00** | **17.0 m/s** | **11.6 m/s** |

**Time to close 1600 m → boarding range (25 m), numerically integrated:**

| Point of sail | total | of which inside 400 m |
|---|---|---|
| beam reach | **59.1 s** | 32.3 s |
| broad reach | 68.4 s | 37.8 s |
| dead run | **95.9 s** | 54.8 s |
| close-hauled | **157.0 s** | 95.0 s |

Against a fleeing corvette (panic 6.0) close-hauled it is **179 s**. Against an
indiaman on a beam reach, 55 s.

**That last column is the owner's complaint.** The decompressed leg is 375 m of honest
water crossed in 32–95 s depending on point of sail, after a 10× deceleration cliff at
the moment the sail is sighted. It is not that 17 m/s is slow — it is 33 knots. It is
that the ground was moving at 170 m/s one second earlier, and that the duration of the
crawl scales as 1/closing-speed, so the *worst* points of sail produce the *longest*
dead time. A beat becomes a minute and a half of nothing.

### 3.3 The finding the complaint does not name: traffic pinning

Because the ease reads the **nearest** contact rather than the target, the current dies
for sails you are not chasing. Measured over the deterministic spawn table
(`cellMerchants`), 16 209 Atlantic blue-water samples at `coastDist ≥ 3000`, 3×3 cells
scanned per sample (covering `ACTIVE_R = 9000`):

| | |
|---|---|
| Blue-water positions with a sail inside `ENCOUNTER_FAR` | **50.3 %** |
| Positions pinned at hailing speed (inside 400 m) | 4.4 % |
| Nominal mean gait | ×10.00 |
| **Effective mean gait** | **×7.71** |
| **Crossing speed lost to the encounter ease** | **22.9 %** |

Caribbean home waters: 34.7 % inside 1600 m, effective ×9.43.

**Over half of blue-water sailing happens with the current slackened, and nearly a
quarter of the Atlantic's design crossing speed is being spent on ships the player is
not interested in.** This is the "slow too far away" in its purest form. It also
suppresses the passage layer, because the bell's own gate is `gait > 1.3`
(`main.js:2622`) — tightening the ease raises the yield of every push event as a side
effect.

### 3.4 What actually needs honest water

Worth stating, because the answer is much less than 1600 m:

- **Boarding** — `BOARD_DIST 25` m, `BOARD_SPEED 3` m/s relative (`plunder.js:10-11`).
  Relative geometry only.
- **Gunnery** — `GUN_RANGE 420` m, but the hit is resolved **at fire time**
  (`combat.js:43` `rollHit(seed, dist)`); the ball is a pure visual interpolating to a
  fixed world point (`combatlayer.js:59, 76-78`), flight 0.4–1.7 s. So the *mechanic*
  needs no decompression at all — only the ball's **visual** does, and one line
  advecting the impact point would fix that.
- **Ramming** (`collide.js:74`, `RAM_HURT 2.2`) and the navy's `NAVY_STANDOFF 130` m
  circle — relative geometry only.

Every one of those is a *relative* quantity. Which is the hinge of the fix.

---

## Part 4 — the encounter fix

### 4.1 Under the current model, the ease is almost unnecessary — and that is the fix

The owner has accepted reframing the compression as an honest **current**: hull speed
through the water stays believable and drives wake, handling and visuals; the current
supplies ground speed and the wave field advects with it.

The consequence nobody has written down yet: **in a shared current, the current cancels
out of relative motion.** If both ships are advected by the same field, the closing rate
is the difference of their *hull* velocities — the current's magnitude does not appear.
Boarding, ramming, turning to bear, matching speed to grapple: all unchanged whether the
current runs at ×1 or ×6.

Which means the crawl and the chase are **separable**, and they have never been
separated before:

> The owner's "crawl" is the **ground going still**, not the chase being long. Advect
> every floating thing by the same current and you can keep ×4–6 running right through
> a boarding action — the sea tears past, the wake roars, the horizon moves — while the
> chase closes at exactly the same honest 11.6 m/s it closes at today. The dead crawl
> disappears without shortening the chase by a single second.

That is the recommendation. It requires one prerequisite, and getting the order wrong
is a bug:

**Hard sequencing rule.** The encounter floor must stay ×1 until *every* floating thing
is advected by the same current — merchant hulls (`merchantlayer.js:171`), monsters,
flotsam, whales, and the ball's impact point. Raise the floor first and the chase
becomes 4× faster while `BOARD_SPEED = 3` m/s stays 3 m/s: you would arrive alongside at
68 m/s ground speed against her 5.4 and be unable to grapple at all. **This ordering
belongs in a gate, not in this paragraph.**

### 4.2 Phase 1 — tighten the geometry and gate it on closing (no current model needed)

Shippable now, independent of 4.1, and it fixes the traffic pinning outright.

```js
export const FIGHT_R = 260;   // honest water: the boarding + close-action disc
export const EASE_R  = 520;   // the ramp's outer edge (was 1600)
export const TTC_MIN = 5;     // s of honest water guaranteed before the disc

export function encounterGait(gait, dist, closing = Infinity) {
  if (dist <= FIGHT_R) return 1;
  if (!(closing > 0)) return gait;                 // she's opening — sail on
  const byRange = 1 + (gait - 1) * smooth01((dist - FIGHT_R) / (EASE_R - FIGHT_R));
  const byTime  = (dist - FIGHT_R) / (TTC_MIN * closing);
  return Math.min(gait, byRange, Math.max(1, byTime));
}
```

Three ideas in it:

1. **The ramp collapses from 1200 m to 260 m.** Nothing in the game needs decompressed
   water at 1600 m; the furthest thing that does is a broadside's visual at 420 m, and
   the fighting *happens* at 200–260 m where `hitChance` is worth having
   (`combat.js:38-41`).
2. **The ease is gated on closing, not on range.** Passing traffic on a diverging or
   steady bearing costs nothing. This is what kills the 50 % pinning.
3. **The time-to-contact cap makes the crawl a constant, not a function of point of
   sail.** Inside the band, ground closing is `slack / TTC_MIN`, so `slack` decays
   exponentially with time constant `TTC_MIN` — the transition takes the same few
   seconds whether you are on a beam reach or beating. Today a beat costs 95 s of dead
   time and a reach costs 32 s; the *bad* case is punished hardest, which is backwards.

Continuity holds by construction: at `dist → FIGHT_R⁺`, `byTime → 0`, so the floor
returns 1 with no step.

**Measured effect (same integration as §3.2):**

| Point of sail | today | Phase 1 | saved |
|---|---|---|---|
| beam reach | 59.1 s | **38.9 s** | 20.1 s (34 %) |
| broad reach | 68.4 s | 43.1 s | 25.3 s (37 %) |
| dead run | 95.9 s | **55.7 s** | 40.2 s (42 %) |
| close-hauled | 157.0 s | **85.7 s** | 71.3 s (45 %) |

The decompressed leg falls from 375 m to 235 m. And on the crossing:

| | today | Phase 1 |
|---|---|---|
| Blue water with a sail inside the ease radius | 50.3 % | **7.3 %** |
| Effective mean gait (Atlantic) | ×7.71 | **×9.14** |
| Crossing speed recovered | — | **+18.5 %** |

(The ×9.14 is the worst case: it assumes *every* contact is closing at 11.6 m/s. With
the closing gate applied to real bearings it is higher.)

**The chase survives.** Closing 235 m at 11.6 m/s is 20 s of real manoeuvring on a
reach and 60 s beating; a corvette on her panic leg still outruns a badly-sailed sloop
entirely (`closing ≤ 0` ⇒ she is never caught); and escape stays a legal outcome — the
release radius simply moves from 1600 m to `EASE_R`, so outsailing her to 520 m puts you
back in the current. Point of sail still decides everything, because the closing rate is
still `hull(power) − her speed`.

### 4.3 Phase 2 — advect everything, then raise the floor

Once merchants, monsters, whales, flotsam and the shot ride the same current:

```js
export const ENCOUNTER_FLOOR = 4;   // the current never dies entirely
// ...same shape, floored at ENCOUNTER_FLOOR instead of 1
```

| floor | ground speed while closing | closing time 520 → 25 m |
|---|---|---|
| ×1 | 12 m/s (24 kn) | 72 s |
| ×2 | 24 m/s (48 kn) | **72 s** |
| ×4 | 49 m/s (95 kn) | **72 s** |
| ×6 | 73 m/s (143 kn) | **72 s** |

The closing time is *identical* at every floor — that is the current-invariance of
relative motion, and it is the whole argument. The player gets a sea that never stops
moving during a fight, and a chase whose length is set purely by seamanship.

Under this model the framing also becomes honest in prose, which matters for a game
that teaches: there is no "encounter gait" any more. There is a current, both ships are
in it, and closing on her is a matter of sailing better than she does. The residual ease
exists only to keep the *ground* frame sane close inshore — and `gaitFactor` already
does that, since the current is ×1 within 300 m of a coast.

### 4.4 Two smaller fixes that belong with it

- **Filter `contacts()`.** `merchantlayer.js:215-219` returns looted hulks, sinking
  ships and derelicts. A ship you have already taken should not slacken the current.
- **The whale ease should be its own, tighter radius.** `main.js:2545-2547` folds
  `whaleDist` into the same 400/1600 m as a sail. Sailing among a pod is a lovely thing
  and worth decompressing for, but a 19 m animal does not need 1600 m of warning; and it
  should not steal the current from a chase.

---

## Part 5 — the gates this needs

The audit's single most important structural finding: **twelve verify scripts, zero
wiring assertions.** All of them would pass with the handlers deleted. That is a rule
living in prose that must live in an instrument.

1. **`verify-stations.mjs` (new, the one that matters).** A table of
   `(key, binding line, handler, output field, consumer expression)` asserted statically
   against `src/main.js` source text — the drift-guard idiom `verify-crewchat.mjs:66-92`
   already uses. For each advertised activity: the key binding exists, the handler
   exists, and the output field appears in at least one *non-display* read. Fails the
   moment an activity is orphaned or a key is advertised that does nothing. This is the
   check whose absence let four activities rot behind a green gate.
2. **`verify-earth.mjs` — the new `encounterGait`.** Continuity at `FIGHT_R`
   (no step), monotone in range, `closing ≤ 0` ⇒ no ease at all, floor never below the
   configured floor, symmetry under equal mutual range, and the ramp bounded by
   `TTC_MIN`. The existing assertions at `:133-144` all need rewriting for the new
   signature.
3. **`verify-encounter.mjs` (new) — the pinning statistic as a gate.** Over a fixed
   deterministic sample of blue-water positions, assert the effective mean gait stays
   ≥ 0.9 × nominal. Cheap, fully deterministic (the spawn table is), and it gates
   *exactly* what the owner complained about, so it can never silently regress.
4. **The current-invariance law (Phase 2).** Assert that for any floor, the integrated
   time to close a given range at given hull speeds is identical. This is the assertion
   that makes raising the floor safe, and it is the sequencing rule from §4.1 made
   mechanical: if some floating thing is not advected, this test fails.
5. **`live-chase.mjs` (new puppeteer check).** Spawn a fleeing trader at 1600 m: close
   to boarding within a bound on a broad reach, *and* prove she escapes a badly-sailed
   pursuit (closing ≤ 0 ⇒ never caught). Both halves matter — the second is the one that
   proves the chase was not simply deleted.
6. **The reckoning gate (if §2.1 lands).** Assert the world chart's marker reads the
   *reckoned* position and the router plans from it, while arrival tests the *true* one.
   And replace `verify-reckoning.mjs`'s hand-rolled integrator with `stepShip` itself —
   it currently passes against a toy model by a 0.04 m/s coincidence
   (`shipphysics.js:143`'s beam-set cap postdates it).
7. **A HUD-redundancy assertion.** Once the instruments are load-bearing, assert
   `#speed` and `#latlon` do *not* read live truth. The failure mode this whole document
   is about is a free readout quietly reappearing.

---

## Part 6 — recommended order

| # | Change | Why here |
|---|---|---|
| 1 | Encounter Phase 1 (§4.2) + `contacts()` filter + the whale radius | Self-contained, pure, ~20 lines, +18.5 % crossing speed and −45 % dead time. Also raises every passage event's yield via the `gait > 1.3` bell gate |
| 2 | `verify-stations.mjs` (§5.1) | Before any activity work, so the next four changes cannot rot the same way |
| 3 | Fix the door: `passage` on any open-water passage, survive the handback, persist it (§2.8) | Nothing else in the push channel matters until this lands |
| 4 | The cheap unlocks: drill gated on guns not hands, fishing's speed gate replaced by speed-dependent catch, the LINES OUT badge, the gloom gate, the stale caption, the E priority | Hours of work; turns "nothing happens" into "something happens" for a first-voyage player |
| 5 | The crew board + the watch bill + morale with teeth and a readout (§2.6) | The biggest genuinely-new mechanic, and the panel the other activities are commanded from |
| 6 | The lying chart (§2.1), and with it the chip log and the sight (§2.2–2.3) | The keystone, but the most invasive and the one that touches the router — last, and behind gate §5.6 |
| 7 | Victuals (§2.4) | Wants the crew board to display it |
| 8 | Encounter Phase 2: advect everything, raise the floor (§4.3) | Rides the sea-v2 current work; blocked on gate §5.4 |

**Retirements recommended:** the ship's log as an *advertised activity* (§2.7 — promote
it to the brag sheet instead); the crew chat as B's headline content (§2.6 — it is mute
offline); and the chip log **only if** the lying chart is rejected (§2.2 — it cannot be
saved any other way). Better three needed activities than five decorative ones.
