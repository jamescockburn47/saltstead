# Passage Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans.
> Executed inline in the authoring session (autonomous run, 2026-07-18).

**Goal:** Build everything in docs/PASSAGE.md — the watch-bell spine plus eleven
passage features — each as a pure verify-gated module wired into main.js.

**Architecture:** Repo house rules. Pure logic modules (no THREE/DOM), seeded
determinism via noise.js `unit2`, one `scripts/verify-*.mjs` per module chained
into `npm run verify`, additive save fields (version stays 1), wiring in
main.js only, bodies (flotsam) in a `*layer.js` with THREE.

**Tech stack:** Vite + Three.js, plain ESM JS, Node verify scripts.

---

### Task order (one commit each; verify green at every step)

1. **watchbill.js + verify-watchbill** — `BELL_S=90`; `bellEvent(seed, n, ctx,
   prevKind)` → `{kind}`|null with gates (stelmo:storm, meteor:clear night,
   breach:clear day, dispute:crew≥3, raft rare); ≥⅓ bells quiet; no immediate
   repeats; `passageStats(km, s)` → {km, min, kmMin} for records.
2. **yarns.js + verify-yarns** — morale state (`newMorale`, `moveMorale`,
   `driftMorale`, bounds 0..1, drift target .65); `moraleReload(m)` 1.12−0.24m;
   `moraleBoard(m)` 0.85+0.3m; `yarnFor(seed, legends)` period-voiced rumour
   with true bearing; `disputeFor(seed, personaA, personaB)`;
   `resolveDispute(choice, gold)` → {dMorale, dGold, text}; fester penalty.
3. **chase.js + verify-chase** — `HEAT_MIN=.25`; `heatFromPlunder(h, gold)`;
   `coolHeat(h, days)`; `hunterDue(seed, n, heat)` deterministic ramped roll;
   `hunterBerth(px, pz, yaw, seed)` astern ±jitter, r=1800;
   `JETTISON_FRAC=.25`, `SPRINT_S=90`, `SPRINT_MULT=1.15`,
   `jettisonPlan(gold)` → {cost, keep}|null (min chest 40).
   merchantlayer.spawnEscort gains `type='navy'` param (raider for navy player).
4. **storms.js additions + verify-storms additions** — `stormBandAt(x,z,t)` →
   gait mult (1 outside, up to `BAND_GAIN=1.35` between danger disc and rim, 1
   inside danger disc); `REEF_WIND=19`, `REEF_TRIM=0.5`,
   `canvasRisk(windSpeed, trim)` → rig-decay/s (0 unless wind>REEF_WIND and
   trim>REEF_TRIM, ramps with both).
5. **fishing.js + verify-fishing** — `FISH_SPEED=2.5` m/s, `biteAfter(seed)`
   12–40 s, `STRIKE_S=4`; `catchFor(seed, lat, lon)` region table (Grand Banks
   cod, North Sea herring, Med tuna, tropic dorado, Southern Ocean toothfish,
   default mackerel), values 5–30.
6. **gundrill.js + verify-gundrill** — `GUNNERY_MAX=.6`, `DRILL_S=18`,
   `DRILL_COOL=60`, `RELOAD_CUT=.3`; `drillGain(g)` diminishing to cap;
   `drillReload(base, g)`.
7. **carpenter.js + verify-carpenter** — `seamSpots(spec, seed, k)` inside
   holdFor bounds; `SEAM_MAX=2`, `WEAR_PER_SEAM=45` s heavy weather,
   `SEAM_RATE=.0004`/s, `SEAM_FLOOR=.55`; `accrueWear`, `seamDue`,
   `seamDecay(hull, nOpen, dt)` floored.
8. **reckoning.js + verify-reckoning** — `chipLog(seed, speedMs)` ±6% in kn,
   period line; `newReckoning(x, z)`, `stepReckoning(rk, yaw, estMs, dt)`
   (through-water only — the current is the unmodelled error);
   `reckonErrorKm(rk, x, z)`; fix = reset.
9. **survey.js + verify-survey** — `SURVEY_R=1200`, half-degree `cellOf`,
   `markCell(set, lat, lon)` dedupe + `SURVEY_CAP=600`; `SURVEY_RATE=6`,
   `surveyValue(n)`.
10. **flotsam.js + verify-flotsam + flotsamlayer.js** — 3000 m cells, 300 s
    epochs, ≤1 object per cell-epoch (crate 12% / bottle 5% / raft 1.5%);
    `flotsamNear(t, px, pz)`; `crateValue(seed)` 8–30;
    `bottleLead(seed, hasMap, legends)` map/rumour/purse; raft souls 1–2 with
    survivors.js join minds. Layer: procedural crate/bottle/raft bodies riding
    waveHeight, culled past 2600 m.
11. **seafacts additions** — ~9 new facts (chase/heat, jettison, storm band,
    reefing, fishing, drill, seams, chip log, bottles, survey); drift guards in
    verify-crewchat for stated numbers.
12. **save.js + main.js wiring + index.html** — additive fields (heat, gunnery,
    morale, fishCatch, seamWear/seamsOpen, surveyed, bests) through
    snapshotSave/acceptSave + verify-login additions; all frame-loop wiring;
    keys X/K/P/U/1/2; hint lines; help book rows; passage records on MARK MADE;
    fish/survey pay out in putIn(); DESIGN.md pointer to PASSAGE.md;
    package.json verify chain.
13. **Gate** — `npm run verify` green, `npm run build`, dev-server boot smoke
    (console clean), commit.
