# Saltstead

A procedural sea-rover game on a scaled real-world Earth, playable in the browser at
**[www.saltstead.app](https://www.saltstead.app)**. Alt-history premise: piracy never
died. You start as a pirate-age sloop captain off Port Royal and climb the shipwright's
ladder on a planet built from real geography.

Sibling project to [Moorstead](https://www.moorstead.app) — same identity:
**browser-first, procedural-only, zero asset files, deterministic worlds,
verify-gated**. Every hull, sail, wave, plank texture and sound is synthesized in code;
the repository contains no binary assets.

**Read [docs/DESIGN.md](docs/DESIGN.md) first** — the founding design document: the
"piracy never died" era ladder, the non-uniform Earth scale, the sea-must-not-be-boring
pillar, the phase plan and named risks.

## The world

The map is the REAL world: Natural Earth coastlines, rivers and mountain ranges baked
into code (`scripts/build-earthdata.mjs` → `src/earthdata.js`), streamed as low-poly
terrain around the ship. Land is 1:250; the **open-sea gait** picks up ~300 m off the
beach and runs 20× by ~2.5 km, so ocean crossings compress while inshore sailing
stays 1:1. Biomes follow
latitude, real rivers run as channels, and Snowdonia has crags because the dragons
need them.

The sky is a working instrument: a 30-minute day/night cycle, a real star catalogue
that tilts with latitude (Polaris sinks as you sail south), and **live weather** —
the game fetches the real forecast at your ship's true coordinates and dresses the
sky to match: cumulus drifting downwind, rain streaking past in a squall. The wind
never drops below 10 m/s (a becalmed game is a boring game), and from dusk to dawn
every living ship hangs a **masthead lantern** — a far-off point of light is how
you find a sail at night.

## How to play

### The basics

- **WASD** walks the deck; drag to orbit the camera, wheel to zoom.
- **T** takes the tiller (and hands it back). At the helm: **A/D** steer,
  **W/S** sheet in / ease the sails.
- Trim matters: the mainsheet bar glows green when your trim suits your point of
  sail. In irons you stall; a beam reach is king. A good sailor outruns a bad one.
- **E** is the doing key: board, capture, dig, dive, bank, step ashore, put in at
  port. **F** fires the broadside, **R** swaps round/chain shot.
- **M** world chart, **L** ship's log, **N** star chart, **H** help book.

### Making a living (the sloop years)

Your starting sloop is the fastest, shallowest thing afloat — and no warship. Run
down unarmed **merchantmen** and board them; chase the fat, slow **Indiamen** for
treble purses; dig up **treasure maps**; salvage the derelicts of the Bermuda
Triangle. When a blue-hulled **navy corvette** turns toward you, run — you are
faster than her, and **shallow water ends every chase** (her keel dare not follow
yours). The **Captain's Briefing** pops on every new voyage and every new hull
with the survival doctrine for what you sail.

### Ports and the shipwright's ladder

Four pirate **havens** (Port Royal, Nassau, Tortuga, Île Sainte-Marie) fence prizes
at full price, no questions asked. Beyond them, **dockyards ring the whole world** —
Havana to Nagasaki, Lisbon to Valparaíso — and every one repairs, signs on hands,
and keeps a **shipwright**, so a voyage never beats back to the Caribbean for a
topmast. Honest ports pay only half for a prize, though.

Get rich and the shipwright builds you up the **ladder**: the **brig** throws two
guns a side with twenty berths, but turns slowly and draws too much to beach. Every
hull changes how you survive.

### Sinking — what it costs

Nobody dies in Saltstead, but the sea keeps accounts, in two doses:

1. **Foundering** (holed through once): the crew heaves **a third of your gold**
   overboard to keep her afloat, and she limps on **CRIPPLED** until a yard mends
   her.
2. **Wrecked** (holed through again while crippled): **she sinks.** Everyone lives —
   the longboat lands the crew, your map, the log and **a tenth of the chest** at
   the nearest port — but the ship, the prizes astern and the rest of the gold
   belong to the sea, and you drop **a rung down the ladder** (a wrecked sloop
   captain is staked a patched sloop; the voyage always goes on).

Damage and the crippled flag ride the save — refreshing the page repairs nothing.
The defense against ruin is seamanship plus two habits: **repair early**, and
**bank what you can't bear to lose** in Davy Jones' Locker (banked gold is beyond
the sea's reach, wreck or no wreck).

### The legends

Highlights of the world at their real geography: the Bermuda Triangle scrambles
your instruments among salvage-rich derelicts, the Kraken haunts the Norwegian
deeps, dragons stoop from Snowdonia, the Corryvreckan whirlpool slingshots the
brave and dismasts the greedy, the Flying Dutchman rounds the Cape in storms, the
1715 Plate Fleet lies in Florida's shallows, El Dorado hides up the Amazon, and
Davy Jones' Locker over the Mariana Trench banks treasure forever.

## Run it locally

```
npm install
npm run dev        # Vite dev server
npm run verify     # the headless gate — must be green before any deploy
npm run build      # production build
```

`window.saltstead` is the live game handle in the dev console (`.ship`, `.gold`,
`.hullId`, `.ocean.uniforms`, …).

To regenerate the Earth data (the generated file is committed; raw downloads are not):

```
curl -L -o tools/ne_50m_land.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson
curl -L -o tools/ne_50m_rivers.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_rivers_lake_centerlines.geojson
curl -L -o tools/ne_10m_regions.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_geography_regions_polys.geojson
node scripts/build-earthdata.mjs
```

## The verify gate

Same contract as Moorstead: pure game logic lives in modules that import no THREE or
DOM (waves, sailing, ship physics, the earth model, combat, merchants, plunder,
treasure, ports, the shipyard ladder, monsters, legends…), and each is defended by a
headless script in `scripts/verify-*.mjs`. `npm run verify` runs all of them (29
checks at the time of writing) and **must be green before any deploy**. Every feature
lands with a verify script; the gate is the contract.

## Footage

The title screen is a live diorama — a sloop running before the wind at golden hour,
rendered by the same engine that runs the game. For marketing clips,
`saltstead.showreel()` in the dev console tours the legends (the Triangle, the
Corryvreckan, the Kraken, the dragon, the Dutchman) and records the bare canvas to a
clean 1080p `.webm`; `node scripts/capture-showreel.mjs` does the same headlessly
into `media/` (dev server running, puppeteer devDependency).

## Deploy

`npm run deploy` — gates on a clean tree, on-main, and pushed; runs verify + build;
patch-bumps; commits; ships to Vercel (saltstead.app → www.saltstead.app). Never
deploy with a red gate.
