# Saltstead

*(working title)*

A sea-rover game on a scaled real-world Earth: plunder at sea, climb from a coble to a
modern raider, crew of NPCs, every player their own ship. Sibling project to
[Moorstead](https://www.moorstead.app) — same identity: browser-first, procedural-only,
zero asset files, kid-safe multiplayer, deterministic worlds.

**Read [docs/DESIGN.md](docs/DESIGN.md) first** — the founding design document: the
"piracy never died" era ladder, the non-uniform Earth scale, the sea-must-not-be-boring
pillar, what ports from Moorstead, the phase plan and named risks.

## Status: Phase 1 — the real Earth

Phase 0 (the sailing prototype — deck, helm, wind, waves, third-person camera) passed
its kill/go gate. The world is now the REAL world: Natural Earth 50m coastlines baked
into code (`scripts/build-earthdata.mjs` → `src/earthdata.js`, 1,415 rings), streamed
as low-poly terrain chunks around the ship. You spawn off Port Royal, Jamaica. Shallow
water grounds you; past ~800 m offshore the **open-sea gait** ramps to 4× so crossings
compress while inshore sailing stays 1:1.

Land has real relief: mountain ranges rise where Natural Earth says ranges are
(Snowdonia included — the dragons need crags), real rivers carve valleys and run as
blue channels, and biomes follow latitude (tropics, desert belts, snowline, polar ice).
The sky is Moorstead's ported to a planetary frame: 30-minute day/night cycle, golden
hours, an accelerated moon calendar, and a real star catalogue that tilts with your
latitude — Polaris sinks as you sail south and the Southern Cross rises, so the stars
are a working navigation instrument.

To regenerate the Earth data (generated file committed; raw downloads are not):

```
curl -L -o tools/ne_50m_land.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson
curl -L -o tools/ne_50m_rivers.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_rivers_lake_centerlines.geojson
curl -L -o tools/ne_10m_regions.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_geography_regions_polys.geojson
node scripts/build-earthdata.mjs
```

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
