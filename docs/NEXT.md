# Saltstead — the next phase plan

Drafted 2026-07-17, after the two-flags release (v0.0.28). DESIGN.md remains the
founding document; this is the working plan for what gets built next and in what
order. Same rules as everything else: procedural-only, zero assets, pure logic
modules with no THREE/DOM imports, a verify script with every feature, live
puppeteer checks for anything that only exists in a browser.

The organising idea for the phase: **the sea is now busy — make it feel
inhabited.** The lanes carry four kinds of sail and two navies' worth of
politics, but nobody aboard any of them has a voice, a sinking is just a hull
going under, and the Kraken is the flagship legend wearing placeholder
geometry. Close those three gaps and the world stops being a simulation you
watch and starts being a place you're IN.

---

## A. Little details that bring the sea alive (first — cheap, high yield)

Each is small, independent, and testable headlessly. Order within the list is
suggested build order.

1. **Sharks gather at a sinking.** When a hull starts going down
   (merchantlayer `startSinking`), 2–4 fins converge on the wreck site from
   outside the frame, circle it tightening for a few minutes, then disperse.
   The fin already exists in wildlifelayer; the new pure bit is a
   `wreckFrenzy(t, elapsed, i)` orbit — spiral-in radius, decorrelated phases.
   The pod scatters while the frenzy runs (dolphins leave when sharks feed);
   gulls wheel over the flotsam. A sinking becomes an EVENT the sea attends.
2. **Gulls perch.** At anchor or in port approaches, the wheeling gulls land:
   on yards, on the rail, one on the masthead truck. They lift when you make
   sail. Pure: a `perchPoints(def, scale)` table off the ship frame.
3. **Whales in the deep blue.** Rare, far off, blue-water-only (coastDist >
   4000): a spout column, a dark back that rolls, a fluke on the dive. A
   navigation instrument like everything else in the water: whales mean the
   abyss. (One breach animation, three beats, minutes apart.)
4. **Flying fish in the tropics.** |lat| < 25, ship making way: little silver
   darts skip out of the bow wave in bursts of three to six. Pure arc maths,
   instanced meshes, no physics.
5. **Bioluminescent wake at night.** In warm water (|lat| < 30) on dark nights
   the foam layer tints blue-green and brightens with hull speed — the wake
   becomes the most beautiful thing on a moonless sea (and it pairs with the
   new moonlit-night rig: bright moon = silver wake, new moon = green fire).
   Foam already has a `setLight` channel; this is a second `setGlow` uniform.
6. **St Elmo's fire.** In storms, cold blue-violet points crawl the masttops
   and yardarm tips. Storm detection exists (weatherState); the fx is emissive
   dots with a flicker drive in lightrig (pure, verifiable envelope).
7. **Crew that WORK the ship.** The hands you hire currently stand about. Give
   them stations: hauling at the mast when trim changes, pointing to windward
   when the lookout hails a sail, ducking when a broadside lands, one at the
   pumps when hull < 60%. Pure: `crewBusiness(event) -> posture targets`;
   captain.js pose maths already shows the pattern.
8. **Port approaches read as PORTS.** Two or three anchored hulls in each
   basin (deterministic from the port seed), a stone mole, cranes on the quay,
   warm windows after dark. Ports currently exist as trade UI + geography;
   this makes them a destination you can SEE from a mile out.

Verify: one `verify-alive.mjs` covering the pure drives (frenzy orbits
converge, perch points sit on the frame, flying-fish arcs clear the water,
glow envelope bounded); a `live-alive.mjs` staging a sinking and asserting the
fins converge, plus screenshots.

## B. The Kraken deserves its billing (visual overhaul)

The Kraken is the marquee legend and currently the least visually convincing
thing in the game. Keep the fight logic (monsters.js is verify-gated and
sound); rebuild the body in monsterlayer:

- **Articulated tentacles.** Eight arms, each a chain of 8–10 tapering
  segments driven by a pure `tentacleSpine(t, i, grip)` curve — idle coils,
  a rising strike that hangs over the rail, a slam. The maths goes in
  monsters.js (pure, verified: spine length constant, strike envelope
  bounded); the layer just skins cylinders onto the spine.
- **The sea reacts.** A churn ring of foam where arms pierce the surface;
  slow whirl of the water inside the grip (ocean uniform nudge); spray on a
  slam.
- **The head breaks water when it tires.** Mantle + one huge eye surfacing
  for the final stage — the "cut it loose arm by arm" fight gets a face to
  beat.
- **Ink.** When it disengages (beaten or fled-from), a black bloom spreads
  and fades on the water — readable exit, no fade-pop.
- **Night pass.** Faint bioluminescent speckle down the arms after dark,
  tying into the moonlit-night palette.

Same treatment later for the dragon (membrane wings, fire cone, a shadow that
crosses the deck) — Kraken first, it's the one players meet in the starting
era's reach.

## C. NPCs with voices (the EVO earns its keep)

The infrastructure is already sitting there: the EVO runs
`llama-server-moorstead` (Gemma, `--parallel 32`) for Moorstead's villagers,
the UMA pool has ~50 GiB headroom, and Saltstead's CSP already whitelists
`saltstead.sovren.xyz` for the future relay. The Moorstead pattern (worldsvc
relay + brain + per-character memory) ports almost directly.

1. **The crew speak.** Walk up to a hired hand, press E (the doing key,
   nothing in reach = talk): a compact dialogue panel. Each hand gets a
   deterministic identity at hiring (name, home port, role — bosun, cook,
   gunner, sailmaker — and a temperament seed). The brain prompt carries the
   LIVE ship state: weather, point of sail, hull damage, gold, faction, the
   last three log entries — so the cook grumbles about the storm you are
   actually in and the gunner boasts about the corvette you actually sank.
   **Fallback is first-class:** a canned-line table per role/mood (pure,
   verify-gated) so the game reads fine offline or if the relay is down —
   the LLM is a layer, never a dependency (the Moorstead weather-live rule).
2. **Hail a passing sail.** Within hailing range at matched speed, E hails:
   traders trade news, and the news is TRUE — drawn from world state ("a
   navy squadron works the Biscay lanes" = the actual spawn table; "the
   fence at Tortuga pays honest rates" = the actual port tier; occasionally
   a treasure rumour that seeds a real map). A navy player gets respectful
   reports; a black flag gets terrified ones. One exchange per ship,
   template + brain-garnish, cheap tokens.
3. **Port figures.** The harbourmaster (paperwork voice: prices, heat,
   warrants), the tavern keeper (rumours for coin — the paid rumour is the
   brain's one creative job, grounded in a real fact the game hands it),
   the shipwright (banter keyed to your hull class and damage).
4. **Server side.** `~/saltstead/brain/` on the EVO — either share
   llama-server-moorstead (Gemma handles both games' registers fine;
   `--parallel 32` has room) or give Saltstead its own 8–12 GiB model from
   UMA headroom if contention shows. Relay follows Moorstead's worldsvc
   shape: rate-limited, per-pid queues, canned-fallback pass-through, LAN
   ledger on the Admiralty Board (:8099 gets a "brain" card for Saltstead
   like Moorstead's).

Verify: prompt-assembly and canned-fallback tables are pure modules
(`verify-voices.mjs`); a live check with the relay stubbed asserting the
panel opens, the fallback lines fire, and no game-state leak (the prompt
builder only ever reads the whitelisted state fields).

## D. Systems that deepen the two flags (after A–C land)

The faction release created the sides; these make the choice keep mattering:

1. **Notoriety / commendation.** One meter, opposite signs per side. Pirate:
   every prize raises heat — more corvettes on the lanes near your crimes
   (spawn-table bias by recent-plunder cells), ports of the Crown refuse the
   fence, pirate havens pay better; lie low or bribe it down. Navy: raiders
   sunk earn commendation — bigger signal answers (3, then 4 sail), the
   Admiralty's escort arrives faster, prize court pays a bonus rank by rank.
2. **False colours.** Fly the other side's flag (a port purchase): honest
   trade doesn't flee, corvettes don't hunt — until you open gun ports
   inside hailing range: instant unmasking, heat spike, and the witness
   flees to raise the coast. High-risk closing tool, straight from the age
   of sail's actual playbook.
3. **Convoy work (navy's income loop).** An indiaman asks for escort between
   two real ports; raiders converge on HER (the assist-quarry machinery,
   pointed the other way); delivery pays by cargo value. Gives the navy a
   positive loop beyond bounty-hunting.
4. **Storm seamanship.** Over-canvassed in a gale (trim high + storm) starts
   tearing the rig — the sail-handling skill the game teaches finally has
   teeth. Pure threshold drive in sailing.js, verified.

## E. Visual polish pass (continuous, slotted between features)

- Sea states: whitecap density and spray follow the live wind properly;
  swell direction aligns to weather, not just amplitude.
- Battle scars: rig damage shows as torn sail panels (vertex alpha, no
  assets); hull < 50% trails thin smoke from below decks.
- Golden hour: crepuscular shafts when the sun sits low behind cloud.
- Horizon towns: port glow domes visible at night from sea (pairs with A8).
- The ensign/black flag ripples (two-bone wave on the flag plane — it's a
  static board today).

## Sequencing

| Order | Block | Why first |
|-------|-------|-----------|
| 1 | A1–A5 (sharks at sinkings, perching gulls, whales, flying fish, glow wake) | Pure-logic + layer work, no server, each an afternoon; the world feels different immediately |
| 2 | B (Kraken overhaul) | Flagship legend; pure spine maths reuses the A-block pattern |
| 3 | A6–A8 (St Elmo's, working crew, port approaches) | The crew work sets up C's crew identities |
| 4 | C (voices: crew → hails → port figures) | Needs the EVO relay stood up; biggest single differentiator |
| 5 | D1–D2 (notoriety, false colours) | Systems on top of a now-alive world |
| 6 | D3–D4 + E ongoing | Convoys close the navy loop; polish rides along |

Multiplayer (DESIGN.md's standing phase) stays after C: the relay stood up
for voices is the same box the shared ocean will ride.
