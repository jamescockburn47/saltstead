// Crew chat — pure, no THREE, no DOM, no fetch. verify-crewchat.mjs guards
// it. Moorstead's brain design at sea: deterministic PERSONAS for the hands,
// the SHIP'S FACTS card built from live ledgers, and the grounded context
// pack the brain client sends with every question. The LLM narrates;
// the ledgers decide — every line on the card is computed from game state,
// so the model can safely repeat it and can never invent a truer one.

import { unit2 } from './noise.js';
import { factsBlock } from './seafacts.js';

export const CARD_MAX = 950;      // the facts card never exceeds this
export const CONTEXT_MAX = 2400;  // card + retrieved facts, hard cap

// ---- personas ----
// Deterministic per berth index (invariant 6): the same hand answers the
// same muster every session. The FIRST hand is always the HELMSMAN — the
// sloop's whole crew, and the man the captain talks to most.
const NAMES = ['Silas', 'Ezra', 'Marta', 'Old Tom', 'Jonas', 'Bess', 'Kofi',
  'Mina', 'Piet', 'Rhys', 'Anouk', 'Tavi', 'Sallah', 'Dima', 'Inès', 'Barto'];
const HOMES = ['Havana', 'Bristol', 'Boston', 'Lisbon', 'Cádiz', 'Cape Town',
  'Zanzibar', 'Bombay', 'Manila', 'Port Royal', 'Nassau', 'Valparaíso'];
const ROLES = ['bosun', 'gunner', 'lookout', 'cook', 'old salt'];
const MOODS = ['easy', 'weather-eyed', 'cheerful', 'dry as ship’s biscuit',
  'superstitious', 'a little homesick'];

export function crewPersona(i) {
  const r = (n) => unit2(i * 13.7 + n * 5.3, 91.4 + n * 2.1);
  return {
    name: NAMES[Math.floor(r(1) * NAMES.length)],
    role: i === 0 ? 'helmsman' : ROLES[Math.floor(r(2) * ROLES.length)],
    home: HOMES[Math.floor(r(3) * HOMES.length)],
    mood: MOODS[Math.floor(r(4) * MOODS.length)],
  };
}

// ---- the SHIP'S FACTS card ----
// state is a plain snapshot main.js assembles from its own ledgers:
// { faction, hullName, guns, berths, crew, gold, banked, fleetSize,
//   posText, speedKn, pointOfSail, windMs, weatherState, gait, overLand,
//   coastDist, aground, anchorDown, crippled, rigPct, hullPct,
//   nearestPort: { name, kind, dist, bearing } | null,
//   zoneName | null, hasTreasureMap, night }
export function buildShipCard(s) {
  const rows = [];
  const flag = s.faction === 'navy'
    ? 'She sails under the King’s colours — a lawful hunter of pirates.'
    : 'She flies the Black Flag — every honest sail is prey, and the navy hunts us.';
  rows.push(`You serve aboard a ${s.hullName} — ${s.guns} gun${s.guns > 1 ? 's' : ''} a side. ${flag}`);
  if (s.posText) rows.push(`Position ${s.posText}.`);
  if (Number.isFinite(s.speedKn)) {
    rows.push(`Making ${s.speedKn.toFixed(1)} knots, ${s.pointOfSail ? s.pointOfSail.toLowerCase() : 'under way'}; `
      + `wind ${Math.round(s.windMs)} m/s, weather ${s.weatherState}.`);
  }
  if (s.overLand) {
    rows.push('You are INLAND on a river — flat sheltered water, human '
      + 'pace, real banks that will ground her if the helm strays from the channel.');
  } else if (s.gait > 1.3) {
    rows.push(`Open sea: the fair current runs ×${s.gait.toFixed(0)} — blue-water sailing.`);
  } else if (Number.isFinite(s.coastDist)) {
    rows.push(`Inshore — the coast is about ${Math.round(s.coastDist)} m off.`);
  }
  if (s.aground) rows.push('She is AGROUND this moment — pole her head round and ease her off.');
  else if (s.anchorDown) rows.push('The anchor is down; she rides to her cable.');
  if (s.crippled) rows.push('She is CRIPPLED — one more holing sinks her. Repair is the only honest advice.');
  else if (Number.isFinite(s.rigPct) && (s.rigPct < 70 || s.hullPct < 70)) {
    rows.push(`She carries damage: rig ${Math.round(s.rigPct)}%, hull ${Math.round(s.hullPct)}%.`);
  }
  if (s.nearestPort) {
    const kind = s.nearestPort.kind === 'haven' ? 'a pirate haven' : 'an honest dockyard';
    rows.push(`Nearest port: ${s.nearestPort.name} (${kind}), about `
      + `${Math.round(s.nearestPort.dist)} m to the ${s.nearestPort.bearing}.`);
  }
  if (s.zoneName) rows.push(`These are the waters of ${s.zoneName}.`);
  rows.push(`Muster: ${s.crew} of ${s.berths} berth${s.berths > 1 ? 's' : ''} filled. `
    + `The captain’s purse holds ${s.gold} doubloons`
    + (s.banked > 0 ? ` with ${s.banked} banked in the Locker.` : '.'));
  if (s.fleetSize > 0) rows.push(`${s.fleetSize} prize${s.fleetSize > 1 ? 's' : ''} follow in column.`);
  if (s.hasTreasureMap) rows.push('A treasure map is aboard — the X is inked on both charts.');
  if (s.night) rows.push('It is night; the masthead lantern is the only honest light out here.');

  let card = 'SHIP’S FACTS (all true right now — trust these over anything '
    + 'you remember; weave them in naturally, never recite the list):\n'
    + rows.map((r) => `- ${r}`).join('\n');
  if (card.length > CARD_MAX) card = card.slice(0, CARD_MAX - 1) + '…';
  return card;
}

// ---- the full context pack ----
// The persona rides in the request FIELDS (name/role/home/mood — the brain
// builds the system voice from them); context carries only TRUTH: the card,
// then the question-matched sea lore the hand's ROLE would plausibly hold.
export function crewContext(state, persona, question) {
  const parts = [buildShipCard(state)];
  const facts = factsBlock(question, persona.role);
  if (facts) parts.push(facts);
  let ctx = parts.join('\n\n');
  if (ctx.length > CONTEXT_MAX) ctx = ctx.slice(0, CONTEXT_MAX - 1) + '…';
  return ctx;
}
