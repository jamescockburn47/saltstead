# Sea v2 — the rebuild

Status: **Phases A, B, C and D BUILT, 2026-07-26.** E (the wake) remains spec.

## What Phase C + D measured

The owner's ask: *"what about cresting and wind direction showing on the wave tops
etc?"* — and, earlier, *"ideally they will react to the wind direction, to give a
visual clue to the player of wind direction and speed."*

The framing that shaped the work: **the wind was already in the height field and
the player could not see it.** Phase B turned the wind-sea's spreading axis to
follow the wind and the wind became a real latitude field, so Phase C is a shading
and foam job that reveals data already present, not new simulation.

| | before | after | gate |
|---|---|---|---|
| elevation skewness: river / 10 m/s / storm | 0 / 0 / 0 | 0.009 / 0.049 / 0.067 | `verify-crest` |
| ...against second-order theory from the spectrum | — | 0.000 / 0.040 / 0.060 | `verify-crest` |
| crest/trough curvature ratio, same three | 1.000 | 1.002 / 1.039 / 1.067 | `verify-crest` |
| top-1% over bottom-1% elevation | 1.000 | 1.003 / 1.038 / 1.053 | `verify-crest` |
| worst per-component q at the band caps | n/a | 0.139 (56% of the 1/4 dimple line) | `verify-crest` |
| break FIELD mean: doldrums / 10 m/s / fifties / storm | height threshold, chop-gated | 0.067 / 0.973 / 3.02 / 9.64 % | `verify-crest` |
| DRAWN white area, same four | — | 0.09 / 1.89 / 5.82 / 16.7 % | `verify-crest` |
| Monahan & O'Muircheartaigh's photographed area | — | 0.09 / 1.0 / 3.9 % | the reference |
| break field: downwind face over upwind | n/a | 1.44-2.24x | `verify-crest` + `live-crest` |
| break-field correlation across the wind / along it, 8 m | n/a | 0.49 / 0.00 | `verify-crest` |
| crest-line bearing vs the wind's demand, in PIXELS | n/a | 0.1-5.9 deg out | `live-crest` |
| ...and when the wind veers 59.7 deg the crests veer | n/a | 61.0 and 65.6 deg | `live-crest` |
| fragment cost, 3200x1800, fine (default camera) | 8.58 ms | 8.38 ms | measured |
| fragment cost, 3200x1800, plain (default camera) | 2.47 ms | 2.76 ms | measured |
| motion gate worst heave rate / accel | 6.21 m/s / 21.2 | 6.37 / 21.9 | `verify-seamotion` |

**Not one motion threshold was widened**, and the judder proof still convicts
(611 failures and exit 1 under the in-memory world-origin pivot). Grating isotropy
unchanged: ANISO 0.81/0.74/0.74 against a 2.2 ceiling (before 0.84/0.69/0.60).

### What the cold review changed, and it changed real things

Two findings would have shipped as defects.

**The plain tier was drawing a different sea from the one the hull felt.**
`uWaveLOD` used to sit INSIDE the emitted sums — an `if` in `oWaveGradShort` and a
whole `oWaveWindLod` twin of the height. The break field is built from the wind
band's height AND its along-wind slope, so on `plain` BOTH of its inputs lost every
component under 20 m: the very ones carrying the steepness the criterion is made
of. Measured, working breeze: field mean 1.064% on fine against 0.262% on plain,
with pointwise divergences to 0.89 — the same square metre fully breaking on one
tier and dead flat on the other. And the one assertion that should have caught it
read `+ 1e9` instead of `+ 1e-9`, so it was true of every finite pair of metres of
water. The lever is now what its own uniform comment always said it was: a SHADING
multiplier applied by `ocean.js` at the call site. Every emitted function is
LOD-independent, asserted numerically AND structurally, and the shader's whole break
path is reassembled from the emitted functions and held against `breaking()` at both
settings of the lever (worst 0 — identical). It costs the plain tier 2.47 -> 2.76 ms
at 3200x1800, +12%, which is the honest price of the claim.

**The surf had become sheets of white instead of lines.** The shore set is two
COHERENT trains at deliberately high steepness (rms local steepness 0.062 against
the wind band's 0.041), so its first threshold pair (0.70/1.70 x rms) broke nearly
every crest of both at once: 30% of the water white sixty metres off the sand, and
visibly broad white bands across the whole inshore approach at the Palisadoes. The
retired code had said exactly why that is wrong — "sheets of white read as artifact,
a line of white reads as surf". 1.40/2.60 halves it and keeps a ladder: nothing on a
calm belt's beach, 9% white in a working breeze, 27% in a storm.

**And Phase D could not tell a head sea from a following one.** Both the way loss
and the slew went as |sin(relative angle)|, which is symmetric fore and aft, so the
classic broach — a breaking sea on the quarter — cost nothing, and the gate's own
"head to it" case was a following sea mislabelled. It is now one term:
`d(yaw)/dt = +yawRate sin(rel)`, which has an UNSTABLE fixed point running with the
sea and a STABLE one head to it.

### Known, and stated rather than smoothed over

The gale's windrows are built and gated structurally (wind-frame sampling,
anisotropic scales, a chop gate re-anchored from 1.25-1.75 to 1.10-1.50 because chop
only reaches 1.75 at 22.7 m/s and a real 16 m/s gale engaged the old one 20%) — but
the PIXEL signal is small: the white water's along/across correlation ratio rises
from 0.509 in a breeze to 0.568 in a gale, and only one of the two bearings
separates cleanly. Third and weakest of the three cues.

The FOAM'S RENDERED BRIGHTNESS has no trustworthy instrument yet and is reported
rather than gated. Two measurements disagree: binned by break strength at
nearest-pixel sampling, luminance runs 122 counts unbroken, 130-132 through the
middle of the field's range and 117 in the STRONGEST bin; the bilinear statistic
pooled over six frames reads no lift at all. What the disagreement does establish is
a real defect for a follow-up — the hardest-breaking water rendering DARKER than
unbroken water is geometry, not noise: the steepest forward face is the facet tilted
furthest from the sky and foam keeps only 45% of the sky reflection
(`GLITTER.foamSkyKeep`). The whitest water in a gale ought to be the breaking crest.

`live-glitter.mjs` is red, and it was red before this change (4 failing clauses at
HEAD: the high sun twice and the moon twice — the deficiency
`2026-07-26-glitter-followup.md` was written to address). This change moves it:
the low sun's sunward contrast 1.509 -> 1.431, its reach 272 -> 204 m and its road
coverage 0.444 -> 0.393 (a new failing clause), the high sun 1.656 -> 1.741 and the
moon's corridor from failing to passing. The mechanism is not subtle and not a bug:
whitecaps whiten the water the corridor is measured AGAINST, so a contrast-ratio
metric necessarily falls. `verify-glitter` is green.

> **CORRECTION, 2026-07-26 — the grating was never in the waves.** Fault 2 below
> blames the east-west banding on the wave table's pairwise beats, on the strength
> of an ablation: "the stripes died ONLY when the wave table was zeroed". That
> ablation conflated cause with modulation. Zeroing the table also flattens the
> surface, removes the grazing geometry and silences every layer gated by wave
> state — including the one that actually owned the artifact. Sea v2 duly rebuilt
> the whole wave model, the measured beat energy fell 50-fold, **and James
> reported "exactly the same grating as before"**, which is the tell.
>
> The grating was `ocean.js`'s own decorative fbm running out of float32
> mantissa. Its hash multiplied the raw world lattice index by 234 and 435; at
> the noise scales the water uses (2.3, 1.9, 1.35 per metre) and the coordinates
> the earth hands it (`M_PER_DEG` is 444, so play sits 15–80 km out), the product
> lands past 2^24 and `fract` returns a handful of levels or exactly zero. The
> hash then collapses to a function of ONE coordinate and the noise loses a
> dimension: a 0.4–0.7 m staircase locked to a world axis. Which axis depends on
> where you are — north-south in the Channel, east-west in the tropics — and
> where both channels die the sea has no detail and no whitecaps at all.
>
> Measured in the owner's own grazing view (`scripts/live-grating.mjs`), sub-metre
> structure along a world axis versus along a diagonal: **26.3x in the Channel,
> 6.0x in the Indian Ocean, 1.3x at 0N 0E** — the control being the one place on
> earth where the hash still had its bits. After the fix (`src/oceannoise.js`:
> wrapped lattice index, small-multiplier hash, per-octave rotation): 0.70x,
> 0.91x, 1.11x. The wake map — the leading hypothesis, and a good one — was
> cleared by its own pixel difference at 1.01x and 1.10x.
>
> Two lessons, both now instruments rather than prose. **The spatial probe was
> blind by construction**: `live-spectrum.mjs` searched 1.2–80 m and the artifact
> lives at 0.4–1.8 m, from a nadir camera where the fresnel term that amplifies it
> is ~0. **And the sea v2 local-frame lesson stopped at the water's edge** — the
> waves were moved to a local frame precisely because "a GPU float carries ~7
> digits", and nobody carried that across to the shader sitting next to them.
> `verify-oceannoise.mjs` now fails a build that lets any of it back in.
Supersedes the wave model in `src/waves.js`, keeps its architecture. Written
2026-07-25 after the east-west grating investigation and the reverted wind-turn
attempt (`48b05ae` reverts `1d38aca`).

## What Phase A + B actually measured

Built as specified: local-frame phase with per-component accumulators, a seeded
28-component Pierson-Moskowitz spectrum with directional spreading, wind-
following band axes, and a much bigger, longer sea. Like-for-like against
`4d990ab` with the same probe, same water, same weather:

| | v1 | v2 | gate |
|---|---|---|---|
| EW-stripe peak, wake ablated | 18600 | 370 | `live-spectrum.mjs` (floor 30) |
| EW-band total | 41740 | 2914 | floor 1931 |
| worst bin's share of the band | 0.447 | 0.127 | — |
| significant height, bands (1,1) | 1.12 m | 1.93 m | `verify-waves` |
| mean roller wavelength | ~45 m | 124 m | `verify-waves` (100-250 m) |
| rollers, ordinary 10 m/s offshore | 1.5 m | 2.80 m | `verify-seamotion` §9 |
| worst heave acceleration | 26.7 m/s² | 21.2 m/s² | `verify-seamotion` (60) |
| CPU/GPU parity, worst | 2e-3 contract | 1.8e-6 headless, 2.6e-6 live | `verify-waves` |
| origin snap changes the felt sea by | n/a (no local frame) | 1.4e-12 m | `verify-seamotion` §7 |
| a 180° sea turn vs the worst steady sea | 11x (reverted build) | 1.12x | `verify-seamotion` §8 |
| fragment cost, 3200x1800, ocean filling frame | 26.3 ms | 25.5 ms | measured, not gated |

**Not one motion threshold was widened.** The sea grew hard and the motion went
DOWN in acceleration, because heave rate goes as H·ω_e and acceleration as
H·ω_e², and ω_e falls with wavelength: a longer sea is a gentler sea. The
thinnest margin is now heave RATE at 1.4x (6.21 m/s against a 9.0 limit), left
where it is deliberately as a tripwire on further growth.

**Deliberately not built.** The freeboard damping under "Waves over the
bulwarks" below was skipped: a well in the wave sum around the hull is also a
well under the four points `shipAttitude` samples, so it trades the ship's
motion for the water-inside-the-bulwarks artifact, and it wants a ship-position
uniform inside the parity contract. Instead the WIND-SEA band was deliberately
held near v1's level (Hs 0.53 -> 0.64 m) while the swell grew sevenfold, because
water over the bulwarks is driven by the SHORT waves and the hull's own length,
not by the rollers. The artifact should therefore be no worse than it was; if it
is still objectionable, the stencil mask (option 2) is the honest fix.

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

### Phase A — the foundation (no visible feature, everything depends on it) — **BUILT**
Local-frame phase with per-train accumulators; spectrum generator replacing
the table; parity and motion gates written FIRST. Ship behind a flag
(`saltstead.seaV2 = true`) so v1 and v2 can be A/B'd in one session.

### Phase B — the wind's sea — **BUILT**
Wind-following directional spreading, swell/wind-sea crossed seas, the
sea-state model fixed per the benchmark section above (swell floor in open
water, fetch reaching full strength sooner, sheltering left to the shore
field). Deliverable: the player reads wind direction and strength off the
water.

### Phase C — cresting — **BUILT**
Stokes second-harmonic crest sharpening (sharp crests, flat troughs, still a
height field — Gerstner is rejected: horizontal displacement breaks the
height-field property the per-pixel normals and all twelve CPU consumers
depend on). A `breaking(x, z, t) ∈ [0,1]` field combining per-component
steepness, crest phase and the shore's depth-limited criterion, driving BOTH
the shader's foam and the ship's motion. Foam leads the crest down the
forward face, with an analytic trailing-decay window so it lingers without
state.

### Phase D — the ship in a breaking sea — **BUILT**
Crest events: a shove along the wave direction and a roll kick when a breaker
lands on the beam; no capsize, no death — a broach costs way and heading. The
helm watch can hail it.

Built as `shipphysics.breakerEffect`. Measured, two seconds of a FULL breaker on a
sloop that started at 6.80 m/s: beam-on she is down to **2.40 m/s** with **32.5
degrees of heading gone** — a real broach — and staggering 10.7 degrees; head to it
she keeps **6.80 m/s** and **exactly zero** degrees of heading, and does not
stagger at all. So heading into a breaking sea is safe and dramatic and taking it
on the beam in a gale makes the player want to bear away, which was the ask. The
worst stagger any hull can take is 12.6 degrees by construction; a galleon takes
0.45 of what a sloop does, through the same steadiness term `shipAttitude` uses.
The way loss is an exact exponential, so a second of the same breaker costs the
same at 20 Hz as at 144 (0.05% apart, which is the coupling between the slew and
the loss and nothing else).

The roll is applied beside the wind heel in main.js and deliberately NOT inside
`shipAttitude`, because `shipAttitude`'s four samples ARE the sea and
`verify-seamotion`'s thresholds measure exactly that surface — dressing put in
there would be measured as if the water had done it, and verify-crest asserts it
is not there.

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
