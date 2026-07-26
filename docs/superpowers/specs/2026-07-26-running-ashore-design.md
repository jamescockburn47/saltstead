# Running ashore — beaching that feels like sand, not a wall

Status: **spec, not built.** Written 2026-07-26 at the owner's ask: *"can we have
it so the ships run ashore instead of running aground? shallower beaches and hull
detection?"*

## Scope, and one explicit non-goal

**In scope:** the physics and feel of putting a hull on a beach. She should ride
up, take the ground, settle, and be worked off again.

**NOT in scope — decided, not overlooked:** stepping onto the land. The `ashore`
mode was deliberately retired, and `scripts/live-shore.mjs` asserts it *stays*
retired (`g.onE()` never sets `mode === 'ashore'`; no `goAshore` /
`canStepAshore` / `boardShip` API; the captain stays parented to `shipGroup`).
The owner confirmed: *"no i dont want any walking onland"*. **Those assertions
stay green.** Any implementation that revives a walk-ashore path has
misunderstood this spec.

## What happens today, and why it reads as a wall

- `shipphysics.js` floors the surface: `max(waveHeight, ground + draft + keel)`,
  so a hull over land rides on the sand rather than sinking through it. Correct,
  but it is a *floor*, not a *contact model* — nothing about it costs her way or
  her steering.
- `main.js` supplies `groundAt` only when `coastDist < 400 || overLand`.
- `g.aground` is a **boolean**. She is either swimming or stopped.
- Getting off already works and is good: `toggleOars()` → the crew calls
  `POLES OUT` / `KEDGE`, then `SHE SWIMS` (`live-searoute.mjs` covers it).
- The nearshore terrain shelves steeply enough that the transition from floating
  to stopped happens in about a metre of travel.

Three faults follow, and they are the whole of this work:

1. **A point test, not a hull.** Grounding is decided for the ship as a single
   object, so she cannot touch forefoot-first, pivot on the point that grounds,
   or list to the side that takes the sand.
2. **A flag, not a degree.** There is no state between swimming and stopped, so
   there is no graze, no drag, no slow rise up the sand — the two states abut and
   the boundary reads as a collision with nothing.
3. **The beach is too steep** to give the other two room to be felt.

## The design

### 1. Hull contact from the points she already has

`shipAttitude` samples four hull points (bow/stern/port/starboard at
`length·0.42`, `beam·0.45`) against the sea. Sample the **same four** against the
ground and return, per point, the clearance `waterDepth − draft`. From those:

- `groundedFrac ∈ [0,1]` — how much of her keel is bearing, from the count and
  depth of the points in contact. This replaces the boolean; `g.aground` becomes
  `groundedFrac > 0` for compatibility with existing readers.
- **Attitude follows contact.** The grounded points stop rising with the swell
  while the free points keep floating, which by construction pitches her by the
  head as she rides up and lists her toward the side that grounded first. No new
  attitude code — it falls out of the existing four-point solve once the ground
  floor is applied per point rather than to the hull as a whole.

### 2. Progressive grounding

- **Way:** ground resistance ∝ `groundedFrac × speed`, so a graze scrubs speed
  and a full run-up brings her up short. She keeps making ground while any part
  of her floats.
- **Steering:** rudder authority falls with `groundedFrac` — a grounded forefoot
  is a pivot, so she slews toward the shoal rather than answering the helm. This
  is the tell that a player should learn to read.
- **Run-up distance** is a consequence, not a parameter: speed at contact against
  the resistance curve decides how far up she goes. Tune so a fast run-up on a
  gentle beach carries tens of metres.

### 3. Shallower beaches

Ease the nearshore terrain slope inside the surf band so the depth passes through
a hull's draft over tens of metres instead of one or two. This is what buys the
other two mechanics their room. Note the coast field is already smoothed and
jittered (`coastmaplayer.js`) — the change belongs in the terrain's nearshore
profile, not in the coast distance field.

### 4. Working her off — and the swell that helps

The existing poles/kedge path scales naturally: the work required rises with
`groundedFrac`, so a graze frees on the first heave and a hard run-up takes
several. **New, and only possible since sea v2:** the sea is now big enough
(significant height ~1.9 m, rollers to 3 m) that a swell can *lift* her. A
grounded hull should knock — rise on the crest, touch again in the trough — and
a big enough swell under a lightly-grounded hull should float her free without
poles. That is both physically right and the most satisfying thing in this whole
feature.

## Gates — before the physics, per house rule

1. **`verify-beaching.mjs`** (new, pure): the contact solve is pure maths over
   (hull points, ground heights, draft) with no THREE/DOM, so it is gated
   headlessly. Assert: `groundedFrac` is 0 in deep water, 1 with all four points
   on sand, monotone in between; resistance monotone in `groundedFrac` and speed;
   rudder authority monotone-decreasing; attitude tilts *toward* the grounded
   point; a graze frees with less work than a run-up; and the run-up distance
   rises with contact speed.
2. **`verify-seamotion.mjs` must stay green — this is the sharp risk.** The
   surface floor `max(waveHeight, ground + …)` is a **C⁰ discontinuity**: its
   derivative jumps at the moment of contact, and a hull crossing it on a 3 m
   swell is exactly the shape of a judder. The motion gate exists because a
   juddering sea passed 60 other checks; **extend it with a beaching scenario**
   (approach a shelving beach under swell, touch, settle) and require the same
   bounded acceleration and step-fraction limits. Smooth the contact transition
   until it passes — do not widen the limits.
3. **`verify-ship.mjs`**: pitch/roll bounds still hold. A beached hull may
   legitimately sit at a greater list than a floating one; if a bound must move,
   re-derive it by measurement and say so. She may not clip through the sand and
   may not capsize.
4. **`live-shore.mjs`**: the retirement assertions stay green (see Scope), and
   the inshore-calm checks — currently red from the swell fix and being repaired
   in a separate session — must be green *before* beaching is tuned, since
   beaching is tuned against nearshore wave behaviour.

## Named risks

- **Contact judder** (above). The single most likely way this ships broken.
- **Two hands on the nearshore.** The inshore-calm repair is in flight in the
  same area. Land that first; tuning beaching against a sea that is about to
  change is wasted tuning.
- **Shallower beaches move the waterline.** Shore decoration, terrain streaming
  and the surf envelope all key off the nearshore profile; check
  `verify-shoredecor` and the surf band after re-slope.
- **`groundLine` semantics.** Existing code and live scripts compare
  `elevation > spec.groundLine + 0.1`. Keep that meaning valid, or update every
  reader — `live-searoute.mjs` depends on it for the pole-off test.
