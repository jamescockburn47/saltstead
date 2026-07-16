# Saltstead

*(working title)*

A sea-rover game on a scaled real-world Earth: plunder at sea, climb from a coble to a
modern raider, crew of NPCs, every player their own ship. Sibling project to
[Moorstead](https://www.moorstead.app) — same identity: browser-first, procedural-only,
zero asset files, kid-safe multiplayer, deterministic worlds.

**Read [docs/DESIGN.md](docs/DESIGN.md) first** — the founding design document: the
"piracy never died" era ladder, the non-uniform Earth scale, the sea-must-not-be-boring
pillar, what ports from Moorstead, the phase plan and named risks.

## Status: Phase 0 — the sailing prototype (kill/go gate)

One ocean, one sloop, wind, waves, a walkable moving deck, a helm, third-person camera.
If sailing isn't fun in isolation, we stop and rethink before building the planet.

- Walk the deck with WASD, drag to orbit the camera, wheel to zoom.
- Stand near the tiller and press **E** to take the helm.
- At the helm: **A/D** steer, **W/S** sheet in / ease the mainsail.
- Trim matters: the mainsheet bar glows green when your trim is right for your
  point of sail. In irons you stall; beam reach is king.
- `window.saltstead` is the live game handle in the console.

## Run

```
npm install
npm run dev        # Vite dev server
npm run verify     # the headless gate — must be green before any deploy
npm run build      # production build
```

## The verify gate

Same contract as Moorstead: pure logic lives in modules that import no THREE/DOM
(`src/waves.js`, `src/sailing.js`, `src/shipframe.js`, `src/shipphysics.js`), and each
has a headless script defending it:

| Script | Defends |
|---|---|
| `verify-waves` | CPU/GPU wave parity — the sea the eye sees is the sea the hull feels |
| `verify-sailing` | the point-of-sail curve; "a good sailor outruns a bad one" |
| `verify-shipframe` | ship-local frame round-trips; deck clamp; the helm is reachable |
| `verify-ship` | speed convergence, stalling in irons, rudder bite, buoyancy bounds |
