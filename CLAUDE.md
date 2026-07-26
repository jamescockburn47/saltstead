# Saltstead — working instructions

Procedural sea-rover game on a scaled real-world Earth (Vite + Three.js) — sibling to
Moorstead (`C:\Users\James\Desktop\Moorcraft`), same identity: **procedural-only, zero
assets, browser-first, deterministic, verify-gated**. Public client:
**www.saltstead.app** (Vercel project `saltstead`, GitHub `jamescockburn47/saltstead`).

## Start here

- **[docs/DESIGN.md](docs/DESIGN.md)** — game identity, era-ladder progression, world
  model (1:250 land / gait-compressed ocean), phase plan, named risks.
- `src/` modules are small and single-purpose; pure logic modules (waves, oceannoise,
 glitter, sailing,
 shipphysics, shipframe, foam, earth, terraingen, shoredecor, flora, skymath,
 lightrig, woodgrain, legends, legendfx, combat, monsters, merchants, plunder,
 treasure, fleet, port, ports, shipyard, noise, searoute, shanties, whales;
 showreel's pose maths)
 have **no THREE/DOM imports** and each is guarded by a `scripts/verify-*.mjs`
 check (flora is guarded inside verify-shoredecor).
- `src/earthdata.js` is **generated** by `scripts/build-earthdata.mjs` from Natural
  Earth (coastlines, rivers, mountain ranges) — never edit by hand. Enforced: a
  PreToolUse hook (`.claude/settings.json` → `scripts/hook-guard-earthdata.mjs`)
  denies Edit/Write to it and shell writes at it (redirects, `sed -i`, `tee`,
  `cp`/`mv` onto it, `rm`, `Set-Content`…); reads and regeneration pass.

## Working discipline

- **Guarantees are instruments, not prose.** A rule that must never fail belongs in a
  verify script, a hook, or a deploy gate — a CLAUDE.md sentence has a nonzero failure
  rate. Before adding a "never/always" rule here, ask whether it should be a check.
- **Big sweeps get delegated.** Multi-module audits/reviews: per-file subagent passes,
  then one cross-file integration pass — one context over dozens of files dilutes
  attention. Trivial single-file changes: just do them, no ceremony.
- **Review is a fresh pair of eyes.** The session that wrote a change is a poor
  reviewer of it; use an independent subagent or /code-review before deploy-worthy work.
- **Long explorations persist findings as they go** — write phase summaries to a
  scratchpad/doc before moving on, not after context is already thin.

## Build & verify

- `npm run verify` — the headless gate (65 checks). **Must be green before deploy.**
 Add a verify script with every feature; prefer testing pure modules headlessly over
 eyeballing.
- **THE SEA'S SHAPE AND ITS FOAM ARE ONE FUNCTION EACH, AND BOTH ARE GATED.**
 Cresting is the Stokes second harmonic in `src/waves.js` — `sin(phi) - q cos(2 phi)`,
 which keeps the surface a HEIGHT FIELD (Gerstner is rejected: horizontal
 displacement would break the fragment shader's exact per-pixel normals and a
 dozen CPU consumers). It costs no transcendental, because
 `cos(2 phi) = 1 - 2 sin(phi)^2`. There is a MATHEMATICAL SAFETY LINE at q = 1/4,
 where the trough dimples and the wave grows a second crest; `verify-crest.mjs`
 holds the worst component at the band caps against it (0.139, 56% of the line)
 and COUNTS the extrema through the emitted arithmetic, with q = 0.30 as a
 counter-example. Whitecaps are `breaking(x, z, t)` — ONE closed-form field driving
 both the shader's foam and the hull's breaker shove, replacing a height threshold
 that could not tell a wave's face from its back. Its coverage is a CALCULATION
 (Rayleigh envelope x a fixed phase duty) and lands on Monahan's photographed
 ladder: field mean 0.07% in the doldrums, 0.97% in a working breeze, 3.0% in the
 fifties, against a photographed 0.09 / 1.0 / 3.9. **The FIELD's mean and the
 DRAWN white area are two different numbers** and the gate holds each on its own
 ladder — the shading gain is 3, so the painted area (0.09 / 1.9 / 5.8%) is
 several times the mean by construction.
 **AND THE TIER LEVER MAY NOT REACH INSIDE THE SUMS.** `uWaveLOD` once lived in an
 `if` inside `oWaveGradShort` and in an `oWaveWindLod` twin of the height, which
 took the sub-20 m components away from the BREAK FIELD as well: measured, the
 plain tier's foam was a 4x weaker field than the hull's with pointwise
 divergences of 0.89, and the one assertion guarding it read `+ 1e9` for `+ 1e-9`.
 Every emitted wave function is now LOD-independent (asserted numerically AND
 structurally) and ocean.js applies the lever to the SHADING gradient at the call
 site. Cost of the fix: plain 2.47 -> 2.76 ms at 3200x1800.
 `scripts/live-crest.mjs` is the pixel half: crest-line orientation against the
 wind heading at three strengths and two bearings (measured 0.1-5.9 deg out,
 veering 61-66 deg when the wind veers 60), the break field's downwind bias in
 situ, both tiers, and the burn.
- **LIGHT ON THE WATER IS PHYSICS, AND PHYSICS HAS A DATUM.** The sun/moon glitter
 path lives in `src/glitter.js` (pure, emits its own GLSL, `verify-glitter.mjs`).
 Its roughness sits on Cox & Munk's 1954 sea-surface slope fit, re-parameterised
 through weather.js's own wind-to-chop map, because the drawn spectrum stops at a
 5.7 m component and carries under a third of a real sea's slope sd. Three lessons
 the gate now holds: a lobe tuned by exponent (the retired `pow(..., 260.0)`) is a
 2-degree mirror and cannot draw a corridor that asks for 5; a light direction
 REBUILT from a scalar is not the light direction (the old rebuild capped elevation
 at 60.41° and stood 29.6° off the real sun at noon); and **a shader emitted from a
 module is only guarded if the gate runs the ARITHMETIC, not the constants** —
 verify-glitter transliterates the emitted GLSL into JS and holds it against the
 twins bit-for-bit, with nine mutations of the emitted arithmetic as
 counter-examples, because a
 string search cannot see a swapped sigma or a dropped Jacobian. Brightness is
 bounded in BOTH directions (a contrast ratio rises as a corridor saturates, so it
 cannot tell a bright road from a flooded one). `scripts/live-glitter.mjs` measures
 the corridor in pixels from the DEFAULT camera at four sun/moon elevations, with a
 uSparkle=0 ablation so the excess is attributed and not merely observed, and the
 wake's answer to the sun by sailing her both ways past it.
- **AND A MEAN IS NOT A PICTURE. THE ROAD IS MADE OF GLINTS, AND THE GLINTS ARE
 GEOMETRY.** The lobe above is the right MEAN and it draws a soft continuous
 smear — a searchlight beam — because real glitter is thousands of independent
 binary events. A thresholded noise lattice multiplied onto it (the retired
 "shatter") was texture painted on a smooth function, with a duty constant that
 knew nothing about the light or the water, and it still read as blobs. The path
 is now TWO terms over the two facet populations a pixel covers: the ENVELOPE is
 the Cox & Munk lobe at FULL width over the MEAN surface (it decides where a road
 can be at all — the part a mirror provably cannot draw), and the GLINT is the
 retired `pow(...,260)` mirror restored against the EXACT per-pixel drawn normal,
 NORMALISED so `floor + (1 - floor) * E[glint] = 1` by construction. No duty
 constant is measured anywhere; the mean is preserved by algebra. It softens with
 the pixel footprint AND NOTHING ELSE, so it is as hard as the mirror close
 aboard and returns to the smooth lobe down the road. **The appearance gate is now
 measured ON THE WATER** (verify-glitter section 8 builds a real stretch of road
 over waves.js's own surface and counts separated maxima): 6.65 glints/m2 at 10.3x
 the water between them, against a smooth lobe with no maximum anywhere that
 stands twice its own median. The lesson that made this necessary: the previous
 appearance gate measured the NOISE FIELD in isolation, went green at 3.72
 maxima/m2, and the rendered road was still a smear. A glint field's peaks clip
 where a smooth road's do not, so `glintFloor` carries half the corridor smooth
 and `gain` went 1.50 -> 1.90 to put live-glitter's MEAN figures back within 1-4%
 of where they stood. Cost at 3200x1800: fine 8.53 -> 8.61 ms, plain 3.00 -> 3.03.
- **Hs HAS TWO MEANINGS AND ONLY ONE OF THEM IS THE SEA.** `significantHeight()`
 reads the component table and nothing else — a constant of the spectrum at band
 gain 1 — so `setSeaState(1.9)` and `setSeaBands(1.54, 1.05)` both leave it at
 1.93 m, and those are a 3.67 m sea and a 2.88 m one. `seaSignificantHeight()` is
 the live figure (both bands at their gains, in quadrature); verify-waves holds
 the two apart. Anything quoting "the sea's Hs" wants the second.
- **Shader arithmetic gets a gate too.** GPU floats are 32-bit and play happens
 15–80 km from the world origin, so anything that feeds a raw world coordinate into
 a `fract` hash loses its mantissa and the "noise" degenerates into world-axis
 stripes. That was the east-west grating (2026-07-26): `verify-oceannoise.mjs`
 now proves the water's fbm keeps both dimensions across the globe, and
 `scripts/live-grating.mjs` measures it in pixels from a grazing player view
 (sub-metre band, pixel diffs per layer, isotropy not amplitude). Any new shader
 noise wants the same two checks.
- `scripts/live-classes.mjs` (puppeteer, needs the dev server) smoke-tests
 the seven ship classes, a long-range battle and a ramming in a real browser;
 `scripts/live-hold.mjs` does the same for below-decks and the warden's writ;
 `scripts/live-searoute.mjs` sails a course laid around Florida, the breakers-ahead
 handback, and the pole-off in a real browser; `scripts/live-shore.mjs` checks the
 shore-aware sea, the decorated coasts (Caribbean + Norway) and that the retired
 ashore mode stays retired; `scripts/live-whales.mjs` finds a real pod on the
 mid-Atlantic grounds and proves the animals hold a WORLD course while the ship
 manoeuvres, run the whole blow/cruise/sounding/absence cycle, and ride the
 swell (screenshots to `media/whale-*.png`); `scripts/live-wind.mjs` measures the
 wind AND the sea at seven real places — doldrums, trades, horse latitudes, the
 Channel, the forties, the fifties — and proves they differ (shots plus
 `media/wind-by-latitude.json`); `scripts/live-crest.mjs` measures whether the WIND
 IS READABLE off the water from main.js's own camera rig at six wind states, and
 carries the frame-cost burn and both tiers' screenshots
 (`media/crest-*.png`, `media/crest-readability-after.json`).
- Dev: `npm run dev` (port 5173). `window.saltstead` is the live Game handle
  (`.ship`, `.cam`, `.aground`, `.coastDist`, `.dayStart`, `.ocean.uniforms`).
  Wardens teleport by SHIFT-CLICKING the world chart (M) — the far writ drops
  the ship in the nearest safe water to any place on earth (the
  coast-inspection tool); `saltstead.goTo(lat, lon)` / `goTo('port royal')`
  is the same door for scripts.
- Marketing footage: `saltstead.showreel()` in the live console records the
  legend tour to a clean 1080p `.webm` (src/showreel.js, Moorstead's rig);
  `scripts/capture-showreel.mjs` runs the same reel headless into `media/`.

## Deploy

Use **`npm run deploy`** (`scripts/deploy.mjs`, inherited from Moorstead) — not bare
`vercel`. Gates on clean tree / on-main / pushed, runs verify + build, patch-bumps,
commits, pushes, ships to Vercel. Domains: saltstead.app → www.saltstead.app.

## The EVO (home server) — hardware facts, verified 2026-07-16

The EVO X2 is an **AMD Ryzen AI MAX+ 395 (Radeon 8060S) with 128 GB of UNIFIED
memory (UMA)**, carved as ~96 GiB GPU + ~32 GiB system. **`free -h` only shows the
32 GiB CPU side — do not conclude the box is out of RAM from it.** Check the GPU pool
with `rocm-smi --showmeminfo vram` (as of writing: ~46 GiB of 96 used by four
llama-servers, so ~50 GiB model headroom). CPU load is negligible (32 cores, idle).

Reachable via `ssh evo-tailscale` (anywhere) or `ssh evo-wifi` (LAN); passwordless
`sudo -n`. Verify server-side questions there, don't disclaim them. Moorstead's relay
(`~/moorstead/worldsvc/`), brain, and dashboard live there; Saltstead's future relay
will too (CSP already whitelists `saltstead.sovren.xyz`). Crew-NPC brains can share
`llama-server-moorstead` (Gemma, `--parallel 32`) or afford their own model — the
UMA headroom allows either.

### The Admiralty Board — ALL admin, both games (:8099)

`http://evo:8099/` (or `http://100.90.66.54:8099/` over Tailscale) is the ONE
admin page: Moorstead + Saltstead side by side with EVO vitals (UMA-aware RAM/
VRAM cards), every service state, and collapsible detail panels. Mint/copy/
revoke invite codes for BOTH games there (Saltstead crew/warden; Moorstead
per-room incl. bairns), approve Moorstead invite requests, read both feedback
ledgers, players, and natters. It holds no data: everything proxies to the two
ledger apps below. Code: `~/admin/app.py` (repo copy `tools/admin-app.py`),
unit `evo-admin`, LAN/Tailscale only — never routed through the tunnel.
Moorstead's ledger gained LAN-only `/api/codes-full`, `/api/mint`,
`/api/revoke` for the board (repo copy `tools/moorstead-dash-app.py`, EVO
backup `app.py.bak-20260717-admiralty`); the Caddy `/dash/*` allowlist does
NOT include them, so they stay private.

### Saltstead's harbourmaster ledger (invite codes + warden)

`~/saltstead/dash/app.py` on the EVO (repo copy: `tools/dash-app.py`), systemd unit
`saltstead-dash` on **:8097**. Day-to-day minting now happens on the Admiralty
Board (:8099, above); the :8097 ledger UI still works — **LAN/Tailscale only**. Two endpoints are public:
`POST /auth/claim` (invites) and `POST /feedback` (in-game feedback tool +
`reportQuiet` telemetry, `src/feedback.js`): Vercel rewrites `/dash/*` →
`saltstead.sovren.xyz` (Cloudflare tunnel) → Caddy `:8091` (allowlist) → :8097.
Caddy's global `trusted_proxies private_ranges` keeps the real player IP in
x-forwarded-for (the feedback rate cap is per-IP, 8/day). Codes minted with
`warden: true` grant warden standing (gold hatband + epaulettes on the captain,
`isWarden(auth)` in `identity.js`); the claim response carries `warden` into the
auth blob. Wardens press **Y** in-game to materialise the next ship class (cycles
the whole shipyard ladder, free) — the inspection tool for any hull on any water. Caddy backups: `Caddyfile.bak-20260716-saltstead`, `-feedback`; tunnel
backup: `config.yml.bak-20260716-saltstead`.

## Setting

Alt-history "piracy never died": pirate-age start, ship tiers climb through eras.
Highlight legends (Welsh dragons, Bermuda Triangle, Kraken…) live in `src/legends.js`
— append-only data table.
