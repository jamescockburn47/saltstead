// Sea battles — the pure gunnery and damage model, no THREE, no DOM.
// verify-combat.mjs guards it. The design (docs/DESIGN.md "Sea battles"):
// broadsides not turrets, damage is STATES not hitpoints-on-screen, and
// boarding is an autobattle the sailing already won. Every roll is a
// deterministic function of its seed (invariant 6).

import { unit2 } from './noise.js';

export const GUN_RANGE = 420;      // metres — long guns duel at real distance now;
                                   // beyond this the sea takes the ball
export const BROADSIDE_ARC = 0.6;  // rad off the beam a gun can be laid
export const RELOAD_BASE = 8;      // s for the captain alone at the guns
export const NAVY_RELOAD = 11;     // s between a corvette's broadsides
export const SHOT_KINDS = ['round', 'chain'];

// the crew runs the reload dance — every hand shortens it
export function reloadTime(crew) {
  return RELOAD_BASE / (1 + 0.09 * crew);
}

const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// where a target lies relative to the shooter's BROADSIDE: which side its
// bearing favours, and how far off that beam it sits. Guns fire perpendicular
// to the hull — you TURN the ship to bear, that's the whole skill.
export function beamBearing(yaw, dx, dz) {
  const rel = wrapPi(Math.atan2(dx, dz) - yaw); // bow = 0, starboard = +
  const side = rel >= 0 ? 1 : -1;
  const off = Math.abs(wrapPi(rel - side * Math.PI / 2));
  return { side, off };
}

export function inArc(off) {
  return off <= BROADSIDE_ARC;
}

// point-blank nearly always tells; at the range limit it's a prayer
export function hitChance(dist) {
  if (dist > GUN_RANGE) return 0;
  return Math.max(0.18, Math.min(0.95, 1.05 - (0.95 * dist) / GUN_RANGE));
}

export function rollHit(seed, dist) {
  return unit2(seed * 1.13, 27.7) < hitChance(dist);
}

// ---- damage states (rig and hull, 1 = whole, 0 = gone) ----
// chain shot tears sails and rigging — slows her. round shot holes the
// hull — sinks her. Each is visible in how she sails: the enemy TELLS you
// how hurt she is.
export const CHAIN_RIG = 0.34, CHAIN_HULL = 0.05;
export const ROUND_HULL = 0.3, ROUND_RIG = 0.07;

export function newHullState() {
  return { rig: 1, hull: 1 };
}

export function applyShot(st, kind) {
  if (kind === 'chain') {
    st.rig = Math.max(0, st.rig - CHAIN_RIG);
    st.hull = Math.max(0, st.hull - CHAIN_HULL);
  } else {
    st.hull = Math.max(0, st.hull - ROUND_HULL);
    st.rig = Math.max(0, st.rig - ROUND_RIG);
  }
  return st;
}

// torn sails can't drive her: rig 0 leaves her all but dead in the water
export function speedFactor(st) {
  return 0.12 + 0.88 * st.rig;
}

export function isSinking(st) {
  return st.hull <= 0;
}

export const SINK_TIME = 12;  // s from holed-through to gone

// a sunk prize sends most of her cargo down; a fraction floats as salvage
export function salvageValue(purse) {
  return Math.round(purse * 0.45);
}

// ---- the boarding autobattle ----
// The player's job was DELIVERING the boarding; the crews fight it out by
// weight of numbers. The captain counts as a hand (and then some).
export function boardingOdds(atkCrew, defCrew) {
  const atk = atkCrew + 1.5; // the captain leads the party
  return Math.max(0.1, Math.min(0.95, atk / (atk + defCrew * 1.15)));
}

// seed -> { won, losses } — losses are hands the fight cost YOU
export function autoBattle(seed, atkCrew, defCrew) {
  const odds = boardingOdds(atkCrew, defCrew);
  const won = unit2(seed * 2.31, 43.9) < odds;
  let losses = 0;
  if (defCrew > 0 && atkCrew > 0) {
    const risk = won ? 0.35 * (1 - odds) : 0.75;
    if (unit2(seed * 3.17, 71.3) < risk) losses = 1;
    if (!won && atkCrew > 1 && unit2(seed * 5.03, 19.1) < 0.4) losses = 2;
  }
  return { won, losses: Math.min(losses, atkCrew), odds };
}

// ---- foundering and wrecking (the two-stage rule) ----
// There is no death in Saltstead; there is expensive humiliation — in two
// escalating doses:
//
// 1. FOUNDERING (hull to 0, first time): the crew keeps her afloat by
//    heaving cargo over the side — a third of the chest goes to the fishes,
//    the hull is patched to CRIPPLED_HULL, and she is CRIPPLED until a yard
//    makes her whole. The warning shot.
// 2. WRECKED (holed through again while still crippled): the sea takes her.
//    Everyone lives — the longboat carries the crew, a tithe of the chest
//    (WRECK_KEEP), the treasure map and the log to the nearest port — but
//    the hull, the prize fleet astern, and the rest of the gold go down.
//    Gold banked in Davy Jones' Locker is untouchable: that is the point.
//    A wrecked hull drops you a rung on the shipwright's ladder
//    (shipyard.js prevHull); a wrecked sloop gets a patched sloop staked by
//    the harbour, so the game can never dead-end.
export const CRIPPLED_HULL = 0.3; // what the emergency patch holds at
export const WRECK_KEEP = 0.1;    // the longboat carries a tithe of the chest

export function founderCost(gold) {
  return Math.round(gold / 3);
}

// the wreck's ledger: what the longboat lands with. Pure numbers, the Game
// mutates state.
export function wreckSpoils(gold) {
  const kept = Math.round(gold * WRECK_KEEP);
  return { kept, lost: gold - kept };
}

// repairs at a haven: the yard bills by what's missing
export const REPAIR_RATE = 150; // doubloons to make a whole rig OR hull from nothing
export function repairCost(st) {
  return Math.round((2 - st.rig - st.hull) * REPAIR_RATE);
}
