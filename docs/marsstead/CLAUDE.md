# Marsstead — working instructions

Procedural survival-homesteading game on the real Mars (Vite + Three.js) —
third sibling to Moorstead (`C:\Users\James\Desktop\Moorcraft`) and Saltstead
(`jamescockburn47/saltstead`), same identity: **procedural-only, zero assets,
browser-first, deterministic, verify-gated**. Public client:
**www.marsstead.app** (Vercel project `marsstead`, GitHub `jamescockburn47/marsstead`).

## Start here

- **[docs/DESIGN.md](docs/DESIGN.md)** — the founding contract: the two USPs (the
  AI co-star VESPER; the terrifying descent), the beautiful-and-dangerous physics
  pillar (0.38 g, dust, harsh day/night), the real-Mars world model, base-building,
  the panspermia mystery, the phase plan and named risks.
- `src/` modules are small and single-purpose. Pure logic modules (mars, marsdata
  decode, marsterrain height, physics, noise, dust, marslight, steadparts,
  steadsim, marslegends, marssky maths, vesper prompt+fallback) have **no
  THREE/DOM imports** and each is guarded by a `scripts/verify-*.mjs` check.
- `src/marsdata.js` is **generated** by `scripts/build-marsdata.mjs` from public
  NASA/USGS data (MOLA global topography + the USGS Gazetteer of Planetary
  Nomenclature) — never edit by hand. No binary asset files at runtime, ever.

## The two USPs (don't let a feature erode them)

1. **VESPER, the AI co-star.** A real LLM (the Moorstead brain/relay pattern) is
   the player's only companion — with a first-class, verify-gated **canned voice**
   underneath so the game is never dependent on the relay. The LLM is a layer,
   never a dependency. VESPER never turns on the player (design rule).
2. **The terrifying aim.** The mystery pulls the player *down* into genuine
   horror — atmospheric, never graphic; opt-in by depth; always escapable (no
   death). Beautiful and dangerous, always fun, always kid-safe.

## Build & verify

- `npm run verify` — the headless gate. **Must be green before deploy.** Add a
  verify script with every feature; prefer testing pure modules headlessly over
  eyeballing. Live puppeteer checks (`scripts/live-*.mjs`, need the dev server)
  cover anything that only exists in a browser (the low-g walk, the streamer, the
  descent).
- Dev: `npm run dev` (Vite). `window.marsstead` is the live handle.

## Deploy

Use **`npm run deploy`** (`scripts/deploy.mjs`, inherited from the siblings) — not
bare `vercel`. Gates on clean tree / on-main / pushed, runs verify + build,
patch-bumps, commits, pushes, ships to Vercel. Domain: marsstead.app → www.marsstead.app.

## The EVO (home server) and VESPER

VESPER rides the family's EVO X2 (AMD Ryzen AI MAX+ 395, 128 GB unified memory).
Either share `llama-server-moorstead` (Gemma, `--parallel 32`) or give VESPER its
own model from UMA headroom if contention shows. The relay follows Moorstead's
`worldsvc` shape (rate-limited, per-pid queues, canned-fallback pass-through); the
Admiralty Board (`:8099`) gets a Marsstead "brain" card like Moorstead's. The CSP
already whitelists the family tunnel pattern. Reachable via `ssh evo-tailscale`.

## Identity invariants (inherited, non-negotiable)

1. Browser-first, procedural-only, **zero binary assets**. Low-poly flat-shaded,
   `BufferGeometry` in code.
2. Kid-safe shared worlds: server-authoritative caps, `escHtml` everywhere, no
   griefing surface, horror never graphic, add-only shared steads.
3. The verify gate is the contract: pure logic imports no THREE/DOM so Node runs it.
4. Determinism: terrain/weather/ore/mystery from stable seeds + baked tables.
   Never `Math.random()` for anything shared. The two authored non-deterministic
   things — the player's stead and VESPER's live speech — carry explicit data and
   a deterministic floor respectively.
