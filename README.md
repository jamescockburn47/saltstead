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
- **E** is the doing key: board, capture, dig, dive, bank, put in at
  port. **F** fires the broadside, **R** swaps round/chain shot.
- **M** world chart, **L** ship's log, **N** star chart, **H** help book.

### Making a living (the sloop years)

Your starting sloop is the fastest, shallowest thing afloat — and no warship. The
**lookout sings out** every sail that comes in range ("SAIL HO!" with a compass
point), and sighted ships ink onto the minimap — merchants in ink, the navy in
blue, dead ships in grey. Run
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

Get rich and the shipwright builds you up the **seven-rung ladder**:

| | ship | guns/side | berths | the trade |
|---|---|---|---|---|
| 1 | **Sloop** | 1 | 12 | fastest, shallowest, beaches — speed is her armour |
| 2 | **Cutter** | 1 | 14 | the smuggler's legs, still beaches |
| 3 | **Schooner** | 2 | 16 | first real broadside, last hull that touches sand |
| 4 | **Brig** | 2 | 20 | square-rigged, fast in a line, too deep to beach |
| 5 | **Corvette** | 3 | 26 | the navy's own class — the hunt becomes a fair fight |
| 6 | **Frigate** | 4 | 34 | three masts, blue-water queen, ends most arguments |
| 7 | **Galleon** | 6 | 45 | sterncastle, slower than the frigate ON PURPOSE — nothing outguns her |

Every hull changes how you survive, and each one is visibly her class on the
water: square courses on the big rigs, a towering sterncastle on the galleon, and
a **real row of cannon** at the rail — the guns you see are the broadside you throw.
NPC ships sail the same ladder (traders are schooners, Indiamen three-masted
square-riggers, the navy corvettes), with **visible crews** working their decks.

And when you want to stop somewhere and STAY stopped, use the **anchor**: press
**Q** in soundings (up to ~20 m of water — work in near a coast) with the way off
her, and the cable roars out the hawse. She stops dead over the ground, swings
head to wind, and rides there while you go below, dig, dive, or sleep — through
a save and back. Q again and the hands walk the capstan: anchor's aweigh. Over
deep water the lead finds no bottom, and at speed the cable would part — the
game tells you both.

From the brig up, every hull carries a **whole environment below decks**: press
**E** on the hatch grating abaft the mainmast and the companionway takes you down
into a lantern-lit hold — ribs and deck beams, lashed cargo, the spare broadside
bowsed to the walls on the fighting classes, and the galleon's great-cabin corner
with its chart table and strongboxes. E climbs back up; T runs you straight from
the hold to the tiller.

### Battle

Broadsides fire off the **beam** — you turn the ship to bear, that's the whole
skill. Round shot holes hulls, chain tears rigs, and the fight now happens at
**real distance** (the guns carry 420 m; a long ball hangs in the air long enough
to watch fall, muzzle flash and all). Hulls are solid: **collision detection** is
live, and a hard ram wounds both ships through the same damage model a broadside
uses — the lighter hull pays more, so aim your galleon's bow with intent and keep
your sloop's out of everyone's way. A hunting corvette holds off at gun range and
circles — she rakes, she does not ram.

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
headless script in `scripts/verify-*.mjs`. `npm run verify` runs all of them (30
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
