# Marsstead — the data & adopted-work register

Every external source the game bakes from, with URL, licence, and what it
becomes. The family rule, restated for Mars: **adopt public-domain data and
published algorithms freely; adopt techniques by learning, never by copying
incompatible code; ship no binary asset — everything arrives as quantized
tables in code** (the `earthdata.js` discipline).

## The adoption rules

1. **Data**: NASA/USGS planetary data is public domain (US government work) —
   bake it. Always record the exact product ID and retrieval date in the
   build script's header, the way `build-earthdata.mjs` names its Natural
   Earth inputs.
2. **Algorithms**: implement from the *published equations* with a citation in
   the module header (Allison & McEwen below is the model case). A paper's
   maths is adoptable; a repo's code carries its licence.
3. **Code**: study open-source projects for technique (LOD schemes, DEM
   handling); **never copy from GPL sources** (e.g. MarsJS is GPLv3 —
   incompatible with shipping-in-code here). Everything in `src/` is written
   fresh, like its siblings.
4. **Imagery: never.** Colour is synthesised from shape + latitude + season
   (invariant 1). The DEM is shape, not imagery — it's in; photos are out.

## The sources

### 1. Topography — MOLA MEGDR *(the Natural Earth of Marsstead)*

- **What:** MGS Mars Orbiter Laser Altimeter Mission Experiment Gridded Data
  Record — the canonical global Mars DEM, gridded at 4/16/32/64/128 px/deg.
- **Where:** PDS Geosciences Node,
  `https://pds-geosciences.wustl.edu/missions/mgs/megdr.html` — e.g.
  `meg004/megt90n000cb.img` (+ `.lbl`), 4 px/deg (0.25°), big-endian Int16
  metres vs the areoid. Higher-res tiles (16–128 px/deg) available for later
  detail passes.
- **Licence:** public domain (NASA/PDS).
- **Becomes:** `scripts/build-marsdata.mjs` → the elevation table in
  `src/marsdata.js`. The 4 px/deg product is 1440×720×2 B ≈ 2 MB raw — small
  enough to quantize/pack whole; the −8,200…+21,900 m range fits Int16 raw
  metres, no offset. Start at 4 px/deg; revisit 16 px/deg (≈33 MB raw, needs
  harder packing or regional tiles) if the skeleton wants more truth.

### 2. Names — USGS Gazetteer of Planetary Nomenclature

- **What:** the IAU-approved names of every crater, mons, vallis, planitia and
  fossa on Mars, with center lat/lon, diameter, feature type — downloadable
  point files (CSV/shapefile).
- **Where:** `https://www.usgs.gov/tools/gazetteer-planetary-nomenclature`
  (also mirrored on NASA Open Data).
- **Licence:** public domain (USGS).
- **Becomes:** the named-features table in `marsdata.js` (filtered by size so
  the chart isn't 2,000 craters deep) feeding `mars.named()`, the chart UI,
  and the anchor rows of `marslegends.js`.

### 3. Caves — the Mars Global Cave Candidate Catalog (MGC³)

- **What:** 1,000+ **real** candidate cave entrances — lava-tube skylights,
  atypical pit craters, deep fractures — each with lat/lon, type, and a
  confidence rating, surveyed from MRO CTX/HiRISE imagery.
- **Where:** USGS Astrogeology,
  `https://astrogeology.usgs.gov/search/map/mars_global_cave_candidate_catalog_v1_cushing`
  (PDS-archived; apparent-depth profiles for many features on Zenodo).
- **Licence:** public domain (USGS/PDS).
- **Becomes:** the skylight table in `marsdata.js`. **This is a design
  upgrade discovered in sourcing:** the underground's doors are not invented —
  every enterable skylight in Marsstead is a *real catalogued candidate cave
  on Mars*, the way every Saltstead cove is real coastline. The mystery's
  vault sites are chosen from high-confidence MGC³ rows (Tharsis lava-tube
  skylights first), and the game quietly teaches that these places exist.

### 4. Weather — the Montabone dust-climatology (the Open-Meteo of Mars)

- **What:** daily gridded maps of real column dust optical depth (τ) covering
  Mars Years 24–36 — 3°×3°, one map per sol — including **MY34, the 2018
  global dust storm**, as it actually spread, sol by sol.
- **Where:** LMD, `https://www-mars.lmd.jussieu.fr/mars/dust_climatology/`
  (NetCDF); NASA PDS Atmospheres node
  (`https://atmos.nmsu.edu/data_and_services/atmospheres_data/MARS/montabone.html`).
- **Licence:** openly published research dataset (cite Montabone et al.); bake
  a *heavily quantized derivative* (per-sol zonal τ curves + the storm-year
  event track), not the dataset itself.
- **Becomes:** the τ tables behind the climate model. Saltstead eases live
  Open-Meteo into its sails; Marsstead **replays a real Mars year**: the
  game's weather truth is an actual recorded year of Martian dust (MY34 for
  drama), mapped onto the in-game calendar deterministically — same sol, same
  sky, every client. Real weather, no fetch, no dependency — the family's
  weather-live rule with the liveness swapped for history. The global storm
  in the game is *the* global storm, arriving where and when it really did.

### 5. Time — the Mars24 algorithm (Allison & McEwen 2000)

- **What:** the published, worked-example-documented recipe for Mars
  timekeeping: areocentric solar longitude Lₛ to 0.01°, equation of time,
  local true solar time, subsolar point — the standard NASA GISS algorithm.
- **Where:** `https://www.giss.nasa.gov/tools/mars24/help/algorithm.html`
  (step-by-step equations + worked examples, maintained with errata).
- **Licence:** published equations — implement fresh, cite in the header.
- **Becomes:** `src/marstime.js` (pure): the sol clock, the seasons (Lₛ
  drives the climate model and the frost line), sunrise/sunset, and the
  subsolar point the light rig hangs from. **The worked examples become the
  verify script** — `verify-marstime` asserts our implementation reproduces
  the paper's own numbers, the strongest kind of check the gate has.

### 6. The moons — Phobos & Deimos

- **What:** simple circular-orbit ephemerides — Phobos (period 7.65 h, rises
  in the *west*), Deimos (30.3 h) — sufficient for sky rendering and
  Phobos-light; precision ephemerides are overkill for a low-poly sky.
- **Where:** element values from the Mars24 technical notes / standard
  references; implemented fresh in `src/marssky.js` maths.
- **Becomes:** the two moving lights of the night sky, verified for period
  and direction of motion (`verify-marssky`).

## Prior art studied (technique only, no code adopted)

- **MarsJS** (`github.com/KonscienceGit/MarsJS`, GPLv3) — confirms
  MOLA-as-displacement works beautifully in vanilla WebGL; its
  height→normal-map pipeline is the standard approach. *Studied, not copied*
  (licence rule 3) — and Marsstead's CPU/GPU one-truth rule needs a custom
  path anyway.
- **civilizemars/mars** — react-three-fiber Mars globe using the USGS
  HRSC+MOLA blended DEM; flags that blend product as an alternative skeleton
  if MEGDR shows seams.
- **Rewind the Red Planet** (OpenNews write-up) — editorial Mars terrain
  streaming in the browser; good notes on DEM warping pitfalls.
- **The family's own repos** — the deepest prior art: `build-earthdata.mjs`
  (bake shape), `terraingen/terrain` (stream it), `waves` (one-truth
  CPU/GPU), Moorstead's brain relay (VESPER's chassis). Marsstead adopts
  these *by inheritance*, which is the licence we like best.
