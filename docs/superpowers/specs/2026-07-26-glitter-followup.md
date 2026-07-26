# Glitter, pass two — the sun at noon, from the deck

Status: **spec, not built.** Queued behind cresting (both live in `ocean.js`).
Follows `68e8eae` (the Cox & Munk corridor), which fixed the low-sun road and
left the rest of the day bland.

## The owner's findings, in their words

1. *"i still think there would be more solar glitter/reflection off waves even at
   noon. it seems a bit bland compared to the excellent water dynamics."*
2. *"also account for camera angle. i can see the sun's reflection if i look
   top-down, but users will mostly use the fixed angle. there should still be
   reflections of a noon sun when looking at a wave from eye level etc."*

The second is the load-bearing one, and it reframes the first.

## Why the high sun is bland — measured, not guessed

From the independent review of `68e8eae`:

- **At a 45° sun the lobe is a 1–3% lift.** `lit` runs 0.0066 (300 m) to 0.0248
  (6 m) — nearly flat, and what sparkle a player sees comes from the **twinkle
  noise**, not the lobe. The gate guarding this case (`best(45) > 0`) would pass
  at 1e-30.
- **The near field is the darkest part**, and with a high sun it is exactly where
  the light belongs: at 8 m the lobe sits at 8.7% of its far-field peak, and the
  corridor only opens around 22–30 m.
- `energyCap = 3` clips the brightest cases (calm water asks 3.96).
- The twinkle that carries high-sun sparkle rides `uDetailAmp`, which is **0 on
  the plain tier** — so a demoted machine has no noon sparkle at all.

## The camera-angle finding — the real defect

The tuning and both probes were validated on geometry the player does not use.
`live-glitter` measures from a fixed low camera looking *out toward the horizon*,
and the earlier spectral work used a nadir camera. The owner reports the noon
reflection is visible **top-down** but not from the fixed chase camera at eye
level. That is the whole gap.

**The physics the current model misses.** The lobe asks for a facet tilt of
`beta = (elevation - atan(h/d)) / 2`. From a low eye looking at nearby water with
a high sun, that demands tilts of tens of degrees, against a per-axis slope sd of
~0.049 rad (2.8°) — so a Gaussian returns nothing, correctly. But a real sea at
eye level glints anyway, for two reasons the model does not carry:

1. **Real slope distributions are fat-tailed, not Gaussian.** Cox & Munk measured
   skewness and peakedness themselves; breaking crests, steep chop and capillary
   water on wave faces all put far more energy in the tails than a Gaussian
   allows. The existing "broad non-Gaussian tail" term is evidently too weak to
   bridge tens of degrees.
2. **The large tilts are already in the geometry, exactly.** The fragment shader
   computes the *analytic per-pixel normal* of the drawn spectrum. A nearby wave
   face genuinely tilted toward the sun should light up from the surface normal
   alone — this is not a statistical question for the resolved waves, only for the
   unresolved ones. If those faces are not lighting, the lobe is being evaluated
   in a way that discards the resolved tilt, or the residual roughness is too
   narrow to close the gap. **Establish which before changing anything.**

## What pass two must do

1. **Diagnose the eye-level noon case first**, from the DEFAULT camera, in the
   real game. Is the resolved wave normal reaching the lobe? Is the tail too
   narrow, or is the geometry being dropped? No tuning until that is answered.
2. **Fatten the tail** so a wave face turned toward a high sun glints, without
   letting the low-sun corridor bloom into haze.
3. **Light the near field** (0–30 m), which is where a high sun's patch lives.
4. **Revisit `energyCap`** so calm water stops clipping.
5. **Fix the plain tier's noon case** — if the twinkle is the sparkle, a tier
   without it has no sparkle.

## Gates — the instrument was the problem, so it changes too

- **Every acceptance measurement moves to the DEFAULT camera** at the default
  height and pitch. A probe camera the player never uses cannot certify what the
  player sees. This is the same class of error as the spectral probe searching
  1.2–80 m for a sub-metre artifact, and the third time in this project that an
  instrument's framing hid the defect.
- Replace `best(45) > 0` with a real far-field floor at high sun.
- Add a **noon, eye-level, nearby-wave** case to the live probe with a measured
  glint statistic (count and peak of local maxima on wave faces within 30 m),
  before and after.
- Keep the existing low-sun and moon numbers from `68e8eae` as regression floors:
  sunward ratio 1.54 low / 1.85 golden / 3.50 moon, road coverage 46 / 61 / 75%.
  Pass two must not buy noon by spending dusk.
