// The two flags — pure, no THREE, no DOM. verify-faction.mjs guards it.
//
// The player chooses a side at the title screen and the whole sea reads
// differently for it (DESIGN.md: the world is an instrument — so is your
// flag). The two advantages are DELIBERATELY different in kind:
//
//   PIRATE — the individual edge. A lawless hull sails leaner and hungrier:
//     faster than her rated class, and a stripped prize bleeds richer. She
//     answers to nobody — and nobody comes when she whistles.
//
//   NAVY — the institutional edge. Her rated speed is her rated speed and
//     the prize court takes its accounting, but she is never alone: a
//     signal rocket (G) brings the squadron. Corvettes in range converge
//     on her quarry, and if the sea is empty, the Admiralty SENDS one.
//
// Attitude matrix: what each sail on the lanes does about the player.

export const FACTIONS = {
  pirate: {
    id: 'pirate',
    name: 'the Brethren of the Coast',
    tag: 'the Black Flag',
    speedMult: 1.12,    // the individual edge: she outsails her own class
    plunderMult: 1.3,   // and strips a prize to her bones
    hostileType: 'navy', // who works their guns at the sight of her
    flag: 'black',
  },
  navy: {
    id: 'navy',
    name: 'the Royal Navy',
    tag: "the King's Colours",
    speedMult: 1.0,
    plunderMult: 1.0,
    hostileType: 'raider',
    flag: 'ensign',
    signalRange: 4500,  // a rocket is seen this far
    signalMax: 2,       // squadron mates that answer one signal
  },
};

export function factionOf(id) {
  return FACTIONS[id] || FACTIONS.pirate;
}

// what a merchant TYPE does about the player's flag: 'hunt' | 'flee' | 'neutral'.
// Pirate: honest trade runs, the King's corvettes hunt, a rival black flag
// keeps her own counsel. Navy: the lanes sail easy under your protection —
// only the raiders fight.
export function attitude(type, factionId) {
  if (factionId === 'navy') {
    return type === 'raider' ? 'hunt' : 'neutral';
  }
  // the black flag (and any unknown id falls back to it)
  if (type === 'navy') return 'hunt';
  if (type === 'raider' || type === 'derelict') return 'neutral';
  return 'flee';
}

// may the player board this type? A pirate boards ANYTHING she can lay
// alongside. The navy boards her lawful quarry: pirates, and dead ships
// under salvage law — never the honest trade she exists to protect.
export function canBoardType(type, factionId) {
  if (factionId !== 'navy') return true;
  return type === 'raider' || type === 'derelict';
}

// where a fresh voyage begins — each side weighs anchor in its OWN home
// waters: the black flag off Port Royal (the pirate republic's harbour),
// the King's commission at SPITHEAD — the fleet anchorage in the lee of
// the Isle of Wight, the most Royal Navy water on earth. (NOT the Bristol
// Channel: the whole of it sits inside the dragons-wales legend zone, and
// a stooping dragon is the wrong welcome for a fresh captain.) yaw is the
// bow's opening heading (0 = south; pirate 0.5 faces the Jamaican coast,
// navy 4.7 points her west down the Channel toward open water).
export function homeAnchorage(factionId) {
  return factionId === 'navy'
    ? { name: 'Spithead', lat: 50.5, lon: -1.0, yaw: 4.7 }
    : { name: 'Port Royal', lat: 17.85, lon: -76.9, yaw: 0.5 };
}

// the signal rocket: which navy sails answer, and whether the Admiralty
// must send one over the horizon. sails: [{ id, type, x, z }]; returns
// { converge: [id...nearest first], spawn: true when fewer than max answered }.
export function signalAnswer(sails, px, pz, range, max) {
  const near = sails
    .filter((s) => s.type === 'navy')
    .map((s) => ({ id: s.id, d: Math.hypot(s.x - px, s.z - pz) }))
    .filter((s) => s.d <= range)
    .sort((a, b) => a.d - b.d)
    .slice(0, max)
    .map((s) => s.id);
  return { converge: near, spawn: near.length < max };
}

// where an answering ship comes over the horizon: deterministic offset from
// the signal position (seed decorrelates repeat signals), far enough out to
// ARRIVE rather than materialise.
export function escortBerth(px, pz, seed = 0) {
  const ang = (seed * 2.399963) % (Math.PI * 2); // golden-angle walk
  const r = 1800; // minutes away under a pressed corvette, not a materialisation
  return { x: px + Math.sin(ang) * r, z: pz + Math.cos(ang) * r };
}
