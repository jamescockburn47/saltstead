// Gun drill — pure, no THREE, no DOM. verify-gundrill.mjs guards it.
//
// K runs the batteries through the dry-fire dance mid-passage (docs/
// PASSAGE.md): gunnery climbs with diminishing returns to GUNNERY_MAX,
// rides the save, and cuts the live reload by up to RELOAD_CUT. Arriving
// battle-ready is a real currency — heat (chase.js) raises the odds that
// somebody is waiting at the far end of the passage.

export const GUNNERY_MAX = 0.6; // a drilled crew, not a miracle crew
export const DRILL_S = 18;      // one run through the dance
export const DRILL_COOL = 60;   // the hands want their breath between drills
export const RELOAD_CUT = 0.3;  // a fully drilled crew loads this much faster

const clampG = (g) => Math.max(0, Math.min(GUNNERY_MAX, g));

// each drill teaches less than the last — the early sessions are the cheap ones
export function drillGain(g) {
  return clampG(clampG(g) + 0.12 * (1 - clampG(g) / GUNNERY_MAX));
}

// what the drilling buys at the guns: the reload, cut in proportion
export function drillReload(base, g) {
  return base * (1 - RELOAD_CUT * (clampG(g) / GUNNERY_MAX));
}
