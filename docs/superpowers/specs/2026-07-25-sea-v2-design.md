# Sea v2 — the rebuild

Status: **spec, not built.** Supersedes the wave model in `src/waves.js`, keeps
its architecture. Written 2026-07-25 after the east-west grating investigation
and the reverted wind-turn attempt (`48b05ae` reverts `1d38aca`).

## The benchmark, and why the game misses it

James's benchmark: *"the water and reflections on the landing page video look
amazing, the real world game water now doesn't."*

**The landing page and the game run the SAME renderer.** `titlescene.js` builds
the same `Ocean` class, the same shader, the same wave table. The differences
are four settings — and one of them is the whole answer:

| | title scene | the game, in playable water |
|---|---|---|
| swell band | **1.9** | **0.1 – 0.2** (measured, Channel, 10 m/s) |
| chop band | 1.9 | ~1.0 |
| fog | 120 → 620 m | 120 → 620 m (same) |
| fresnel | 0.45 | 0.45 fine / 0.28 plain |

The title scene sails a sea with **ten to twenty times the long-swell
amplitude** the player is ever given near a coast. That is the benchmark gap.
It is not shading, not reflections, not the tier.

The cause is `weather.js seaBandsFor`:

```
swell = clamp(0.24 * (windMs - 4), 0, 2.4) * (0.15 + 0.85 * smooth01((coastDist - 400) / 3600))
```

The fetch term only reaches full strength ~4000 m offshore. Players sail
coasts, ports, islands, the Caribbean — where fetch sits near its 0.15 floor,
so the rollers never arrive. What is left is chop alone: short, fast, low —
precisely the regime where the pairwise beat stripes dominate the image and
nothing majestic rolls under the hull. **The game has been showing a
swell-less sea to almost every player, almost always.**

This must be fixed in v2 and it is cheap: a floor under the swell in open
water regardless of fetch, fetch reaching full strength far sooner, and the
shore field (which already calms inshore water properly) doing the sheltering
instead of the fetch curve doing it twice.

## What v1 got right — keep all of it

1. **The parity doctrine.** One table generates both the CPU evaluator and the
   GLSL; `verify-waves` proves they agree. The sea the hull feels IS the sea
   the eye sees. Non-negotiable, carried forward whole.
2. **The two-band split** (swell vs wind-sea, scaled apart).
3. **The shore field**: wavefronts riding the coast-distance field's level
   sets, so surf lies parallel to any shoreline by construction; the strait
   gate standing surf down in sheltered channels.
4. **Analytic per-pixel normals** and the wavelength-banded shading LOD.
5. **The instruments**: `live-spectrum.mjs`, and the gate culture generally.

## What v1 got wrong — the three root faults

### Fault 1 — world-absolute phase

Phase is `k · p` with `p` in world metres. Off England that is ~22 km from
origin; mid-ocean, more. Consequences:

- **The sea cannot turn.** Rotating a direction pivots the field about the
  world origin: at 22 km, 1e-4 rad of rotation slews the phase under the hull
  by over a radian. This is what made the ship judder violently in the
  reverted attempt — not a tuning error, a structural one.
- **Float32 is marginal.** `k·p` reaches 1e5 radians; a GPU float carries ~7
  digits, so the drawn sea and the felt sea drift where nobody measured.
- **Nothing can be tuned in place.** Any change to a heading or wavelength
  teleports the entire field.

**v2: evaluate in a LOCAL frame.** Phase is computed from `p - origin`, where
`origin` is the ocean mesh's already-snapped following origin. Each train
carries a phase accumulator so that when the origin jumps a snap step, or a
direction turns, the accumulator absorbs the difference and the surface under
the hull is continuous. Rotation becomes free; precision becomes a non-issue.

### Fault 2 — a handful of infinite plane waves is a grating

Seven trains give 21 pairwise beats. Each is an exact, world-locked stripe
family, and the sea's nonlinear shading (foam thresholds, fresnel) renders the
second-order beat as if it were a third wave train. Measured: the narrow
east-west bands died ONLY when the wave table was zeroed (stripe power 17100
→ 65 with every effect layer still live). The 2026-07-24 "grating lesson" fix
spread the swell across three trains and the beats simply moved.

**v2: a spectrum, not a table.** 24–32 components drawn deterministically
(seeded, never `Math.random`) from a wind-driven distribution — amplitude by a
Pierson-Moskowitz-shaped envelope, directional spreading about the wind for
the wind-sea band and about the swell's own heading for the rollers, phases
seeded per component. Dense incoherent beats read as sea texture; sparse
coherent ones read as a grid. The component count is the knob: enough to kill
the grating, few enough for the fragment shader's per-pixel re-evaluation
(the existing shader already evaluates the full sum twice per pixel — budget
must be measured, and the shading LOD bands already drop the short components
at distance, which is where the count hurts).

### Fault 3 — the fixed table cannot answer the wind

Headings are constants, so the sea looks identical in a gale from the north
and a gale from the south. The player has no way to read the wind off the
water. With Fault 1 fixed, the wind-sea's spreading axis simply follows the
wind (eased over a minute or two); the swell keeps its own heading and turns
far more slowly, so a shift leaves a genuine crossed sea.

## v2 features, in build order

### Phase A — the foundation (no visible feature, everything depends on it)
Local-frame phase with per-train accumulators; spectrum generator replacing
the table; parity and motion gates written FIRST. Ship behind a flag
(`saltstead.seaV2 = true`) so v1 and v2 can be A/B'd in one session.

### Phase B — the wind's sea
Wind-following directional spreading, swell/wind-sea crossed seas, the
sea-state model fixed per the benchmark section above (swell floor in open
water, fetch reaching full strength sooner, sheltering left to the shore
field). Deliverable: the player reads wind direction and strength off the
water.

### Phase C — cresting
Stokes second-harmonic crest sharpening (sharp crests, flat troughs, still a
height field — Gerstner is rejected: horizontal displacement breaks the
height-field property the per-pixel normals and all twelve CPU consumers
depend on). A `breaking(x, z, t) ∈ [0,1]` field combining per-component
steepness, crest phase and the shore's depth-limited criterion, driving BOTH
the shader's foam and the ship's motion. Foam leads the crest down the
forward face, with an analytic trailing-decay window so it lingers without
state.

### Phase D — the ship in a breaking sea
Crest events: a shove along the wave direction and a roll kick when a breaker
lands on the beam; no capsize, no death — a broach costs way and heading. The
helm watch can hail it.

### Phase E — the wake
Not sea v2 proper, but the measured dominant visual artifact at speed: the
Kelvin pattern is scaled by speed² and the game's gait compression drives
speeds it was never meant for, so the churn paints enormous white bands
around and ahead of the hull. Speed clamp, confinement, weight — and a
bounded metric so it can never silently return.

## Waves over the bulwarks

James: *"ideally it would also stop the waves riding over the side of the
boat, but that may be a boat mechanic (collision detection) instead of a wave
mechanic."*

It is a **rendering-order** problem, not collision. The ocean is one
continuous mesh drawn through the hull's position; nothing clips it to the
hull's interior, so wherever the local water height exceeds a bulwark's
height, sea is drawn inside the boat. Three candidate fixes, cheapest first:

1. **Freeboard damping** — attenuate the wave sum inside the hull's footprint
   (a smooth well around the ship's local frame). Cheap, procedural, no new
   passes; the boat sits in a slight hollow, which is also physically what a
   floating hull does.
2. **Stencil / depth mask** — draw the hull's interior into the stencil buffer
   and reject ocean fragments there. Exact, one extra pass, standard.
3. **Clip plane** per hull. Precise but awkward with a curved deck.

Recommend (1), with (2) held in reserve for the largest hulls. Either way it
belongs in v2's scope, because the freeboard damping wants to live in the wave
evaluator where the parity doctrine can guard it.

## The gates — written before the sea

Three axes, because v1's failure was gating on one:

1. **Parity** (carried over): CPU vs emitted GLSL, gradient vs finite
   difference, at non-zero wind rotation and at world coordinates ≥ 40 km.
2. **Spatial** (`live-spectrum.mjs`, extended): no single orientation may
   carry more than a bounded share of narrow-band energy, measured with the
   weather pinned, the ship stopped and the wake ablated. Flat-sea floor is
   ~40; v1's sea sits at 12,700.
3. **Motion** (NEW — the axis that let the judder through): hull vertical
   acceleration distribution over a simulated transit must stay bounded and
   smooth, with no frame-to-frame discontinuity, across a wind shift, a snap
   of the ocean origin, and a coast approach. A juddering sea must fail the
   gate headlessly, before anyone sails it.

## Named risks

- **Fragment cost.** 24–32 components evaluated per pixel, twice. The shading
  LOD bands mitigate; must be measured on the `plain` tier before Phase A is
  called done, with a component-count fallback per tier.
- **Determinism across clients.** The spectrum must be generated from a fixed
  seed and a quantised wind state, or two players see different seas. The
  phase accumulators are per-session state and must be derivable from
  (origin, wind history) — or reset deterministically at snap boundaries.
- **The revert lesson.** No sea change lands on main without all three gates
  green AND a human look at the ship moving. v1's judder passed 60 headless
  checks.
