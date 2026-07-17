// The sea-lore corpus + retrieval — pure, no THREE, no DOM.
// verify-crewchat.mjs guards it. Moorstead's game-facts/facts design at sea:
// a topic-tagged corpus of TRUE gameplay mechanics, and a deterministic
// lexical retriever that folds the two best-matching facts into a crew
// hand's chat context. The LLM narrates; this module decides what is true.
//
// Every fact must state the game AS IT SHIPS — numbers come from the pure
// modules and the drift guards in verify-crewchat.mjs hold them to it.

// ---- the corpus ----
// topic: the knowledge patch (sailing | navigation | combat | trade |
// geography | legends | ship | crew). keywords score 3, text hits 1.
export const SEA_FACTS = [
  {
    id: 'trim', topic: 'sailing',
    keywords: ['trim', 'mainsheet', 'sail', 'faster', 'slow', 'speed', 'green'],
    text: 'Speed lives in the trim: ease or harden the mainsheet until the trim '
      + 'bar on the HUD reads GREEN. A well-trimmed hull sails near twice as '
      + 'fast as a sloppy one on the same wind.',
  },
  {
    id: 'points-of-sail', topic: 'sailing',
    keywords: ['irons', 'tack', 'beat', 'windward', 'upwind', 'reach', 'run', 'wind'],
    text: 'She will not sail straight into the wind — that is IRONS, and she '
      + 'stalls. Beat to windward in zig-zags, tacking through the eye. A beam '
      + 'reach (wind abeam) is her fastest point of sail.',
  },
  {
    id: 'gait', topic: 'sailing',
    keywords: ['current', 'fast', 'crossing', 'ocean', 'blue water', 'gait', 'fair'],
    text: 'The fair current: clear of the coast the sea itself carries her — '
      + 'about 300 m off the beach it builds to five times sailing speed, and '
      + 'in true blue water by two and a half kilometres it runs TWENTY times, '
      + 'so an ocean crossing takes minutes. Inshore, within hailing range of '
      + 'another sail, and on rivers, the current dies and she sails at human '
      + 'pace.',
  },
  {
    id: 'helmsman', topic: 'sailing',
    keywords: ['helmsman', 'course', 'steer', 'chart', 'click', 'tiller', 'wheel'],
    text: 'With a helmsman signed aboard, click the chart (M) to set a course '
      + 'and he steers her there himself — tacks and all — while the captain '
      + 'walks the deck. No helmsman, no self-steering: the sloop berths '
      + 'exactly one hand for exactly this reason.',
  },
  {
    id: 'sweeps', topic: 'sailing',
    keywords: ['sweep', 'oar', 'row', 'stuck', 'irons', 'becalmed', 'upwind', 'tow'],
    text: 'When the wind heads you and she will not answer — in irons, boxed '
      + 'in a river, becalmed — OUT SWEEPS (the O key): the hands ship the '
      + 'oars and row her at a slow crawl in ANY direction, wind be damned. '
      + 'More hands row faster; a great hull barely creeps behind her '
      + 'longboat. She cannot row against her own anchor cable. Sails do the '
      + 'real travelling; sweeps get you out of trouble.',
  },
  {
    id: 'shallows', topic: 'sailing',
    keywords: ['shallow', 'shoal', 'beach', 'escape', 'draft', 'chase', 'corvette'],
    text: 'Thin water is a small hull’s bolt-hole: the sloop, cutter and '
      + 'schooner can run the shoals and even take the sand, and a deep-keeled '
      + 'corvette breaks off rather than follow. From the brig up she draws '
      + 'too much — the shallows become the enemy.',
  },
  {
    id: 'rivers', topic: 'geography',
    keywords: ['river', 'amazon', 'upriver', 'inland', 'panama', 'canal', 'calm'],
    text: 'The great rivers are navigable and drawn in blue ink on both '
      + 'charts — the Amazon, the Mississippi, the Panama Canal cut and more. '
      + 'River water lies near flat whatever the wind, the fair current dies '
      + 'inland, and the banks are real: stray from the channel and she '
      + 'grounds.',
  },
  {
    id: 'el-dorado', topic: 'legends',
    keywords: ['dorado', 'gold', 'gilded', 'city', 'amazon', 'expedition'],
    text: 'They say El Dorado lies far up the Amazon, near Manaus — follow '
      + 'the blue river road inland from the Atlantic mouth at about three '
      + 'degrees south. Shallow draft only; anchor and mount the expedition '
      + 'ashore (E) when the legend names itself on the HUD.',
  },
  {
    id: 'ports', topic: 'trade',
    keywords: ['port', 'harbour', 'dockyard', 'repair', 'anchorage', 'put in', 'quay'],
    text: 'Eighteen honest dockyards ring the world — Havana, Boston, '
      + 'Bristol, Lisbon, Cádiz, Cape Town, Bombay, Canton, Callao, Rio and '
      + 'more, each with a real quay and jetty. Slow to bare steerageway '
      + 'within the anchorage and press E to put in: repair, hire hands, sell '
      + 'prizes, see the shipwright.',
  },
  {
    id: 'havens', topic: 'trade',
    keywords: ['haven', 'pirate', 'fence', 'price', 'sell', 'port royal', 'nassau', 'tortuga'],
    text: 'The four pirate havens — Port Royal, Nassau, Tortuga and Île '
      + 'Sainte-Marie — fence prizes at FULL price, no questions. An honest '
      + 'dockyard’s harbourmaster asks questions and takes half.',
  },
  {
    id: 'hiring', topic: 'crew',
    keywords: ['hire', 'sign', 'hand', 'crew', 'berth', 'muster', 'cost'],
    text: 'Hands sign articles at any port for 60 doubloons each, up to the '
      + 'hull’s berths: the sloop sleeps one (the helmsman), the cutter '
      + 'four, the schooner eight, the brig twelve, and the ladder climbs to '
      + 'the galleon’s thirty-six. Hands steer, quicken the reload, weigh '
      + 'the boarding fight and crew the prizes.',
  },
  {
    id: 'prizes', topic: 'trade',
    keywords: ['prize', 'capture', 'fleet', 'column', 'sell', 'crew the prize'],
    text: 'A captured hull needs THREE hands told off as prize crew to sail '
      + 'her home in column, so the sloop cannot take prizes at all — that '
      + 'starts with the cutter. A prize fetches 400 doubloons at a haven, '
      + 'half at an honest yard.',
  },
  {
    id: 'boarding', topic: 'combat',
    keywords: ['board', 'merchant', 'strike', 'colours', 'loot', 'purse', 'indiaman'],
    text: 'Unarmed merchantmen strike without a fight: pull alongside and '
      + 'press E to board. Traders carry a modest purse; the slow fat '
      + 'Indiamen pay about treble. Armed hulls — navy corvettes and rival '
      + 'raiders — meet your boarders with a crew, and the fight weighs '
      + 'heads on each side.',
  },
  {
    id: 'navy', topic: 'combat',
    keywords: ['navy', 'corvette', 'hunt', 'blue', 'king', 'chase', 'run'],
    text: 'The blue-hulled navy corvettes hunt the black flag on sight from '
      + 'about fifteen hundred metres. They fight like the navy taught them: '
      + 'stand off at gun range and rake — they do not ram. A well-sailed '
      + 'sloop OUTRUNS them; a brig and up can trade iron and win.',
  },
  {
    id: 'chain-shot', topic: 'combat',
    keywords: ['chain', 'shot', 'rig', 'round', 'ammunition', 'slow her'],
    text: 'R swaps round shot for chain. Chain tears the RIG and slows a '
      + 'fleeing ship so you can come up with her; round shot holes the HULL '
      + 'and sinks. Chain what runs, round what stays.',
  },
  {
    id: 'wreck-rule', topic: 'ship',
    keywords: ['sink', 'crippled', 'holed', 'wreck', 'die', 'lose', 'repair'],
    text: 'Nobody dies in Saltstead, but the sea keeps accounts. Holed '
      + 'through once she is CRIPPLED and the crew heaves a third of the gold '
      + 'over; holed again before a yard mends her she SINKS — the longboat '
      + 'lands you at the nearest port with the map and a tenth of the chest, '
      + 'one rung down the ladder. Repair early.',
  },
  {
    id: 'locker', topic: 'trade',
    keywords: ['bank', 'locker', 'vault', 'safe', 'gold', 'doubloons'],
    text: 'The Locker at any port banks gold where the sea cannot count it: '
      + 'banked doubloons survive any wreck. Sail with working capital, bank '
      + 'the fortune.',
  },
  {
    id: 'treasure', topic: 'legends',
    keywords: ['treasure', 'map', 'dig', 'spade', 'buried', 'chest'],
    text: 'Treasure maps mark a real X on real land near a shore — both '
      + 'charts carry it. Anchor close, step ashore, and dig at the spot; '
      + 'the chest beats any single purse on the lanes.',
  },
  {
    id: 'derelicts', topic: 'legends',
    keywords: ['bermuda', 'triangle', 'derelict', 'dead', 'ghost', 'salvage', 'drift'],
    text: 'Inside the Bermuda Triangle the lanes go quiet and dead ships '
      + 'drift crewless — the best salvage in the Atlantic, free for the '
      + 'boarding. Living crews hang masthead lanterns after dark; a dark '
      + 'ship at night is nobody home, which is its own warning.',
  },
  {
    id: 'kraken', topic: 'legends',
    keywords: ['kraken', 'monster', 'tentacle', 'grip', 'deep'],
    text: 'The kraken keeps to her own deep waters, well offshore — she '
      + 'warns before she grips, and a gripped ship is freed faster by a '
      + 'big crew and hot guns. She tires; she does not sink you for sport.',
  },
  {
    id: 'white-whale', topic: 'legends',
    keywords: ['whale', 'white', 'mocha', 'chile', 'ram'],
    text: 'The White Whale works the water off Mocha, on the Chilean coast '
      + 'near thirty-eight south — where the real Mocha Dick rammed '
      + 'whalers. She rams; keep way on and do not give her your beam in '
      + 'open water.',
  },
  {
    id: 'star-sights', topic: 'navigation',
    keywords: ['star', 'sextant', 'sight', 'polaris', 'latitude', 'navigate', 'lost'],
    text: 'Press N under a clear night sky to take a star sight: Polaris '
      + 'stands above the horizon at exactly your latitude in the north, and '
      + 'the heavens match the chart. Cloud and rain gate the sight — no '
      + 'stars, no fix.',
  },
  {
    id: 'weather', topic: 'navigation',
    keywords: ['weather', 'wind', 'storm', 'forecast', 'rain', 'gale'],
    text: 'The weather is the REAL weather at the ship’s real coordinates '
      + '— the Azores get Azores wind. It never falls below a workable ten '
      + 'metres a second, and it builds offshore: blue water blows near '
      + 'double the inshore breeze. Off Cape Horn the williwaws never stop.',
  },
  {
    id: 'charts', topic: 'navigation',
    keywords: ['chart', 'map', 'minimap', 'colours', 'mark', 'allegiance', 'key'],
    text: 'M opens the world chart, the minimap watches the waters around '
      + 'you. Every sail wears her allegiance: blue is the King’s navy, '
      + 'black is a pirate, plain ink is honest trade, grey is a derelict, '
      + 'and the blood-red arrow is us. The world chart carries the key.',
  },
  {
    id: 'anchoring', topic: 'ship',
    keywords: ['anchor', 'cable', 'swing', 'holding', 'moor'],
    text: 'Q lets go the anchor — the cable knows its depth, snubs her '
      + 'way off, and she swings her head to wind like a real ship. Anchor '
      + 'before you step ashore or the tide of business drifts her.',
  },
  {
    id: 'ladder', topic: 'ship',
    keywords: ['shipyard', 'shipwright', 'upgrade', 'hull', 'buy', 'bigger', 'galleon', 'frigate'],
    text: 'The shipwright’s ladder climbs sloop, cutter, schooner, brig, '
      + 'corvette, frigate, galleon — each rung costs more, hits harder '
      + 'and draws deeper. The galleon alone trades speed away on purpose: '
      + 'six guns a side and nothing afloat outguns her.',
  },
  {
    id: 'survivors', topic: 'crew',
    keywords: ['survivor', 'swim', 'rescue', 'overboard', 'gratitude'],
    text: 'Souls in the water swim for a living sail. Haul them aboard and '
      + 'their gratitude follows the ship; leave them and the sharks and '
      + 'the tropics keep their own accounts.',
  },
  {
    id: 'scale', topic: 'geography',
    keywords: ['world', 'earth', 'real', 'scale', 'where', 'land'],
    text: 'The world is the real Earth — real coastlines, real rivers, '
      + 'real mountain ranges, drawn from the survey at about one '
      + 'two-hundred-and-fiftieth scale. If it is on a real map, it is out '
      + 'here: the fair current makes the distances sailable.',
  },
  {
    id: 'harbour-light', topic: 'geography',
    keywords: ['light', 'beacon', 'jetty', 'night', 'find the port'],
    text: 'Every port’s jetty head carries a harbour light — come in on '
      + 'the lamp after dark and lay her alongside the timber. The '
      + 'warehouses stand back of the stone quay.',
  },
];

// ---- retrieval (Moorstead facts.js scoring, verbatim philosophy) ----
const STOP = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'i', 'you', 'we',
  'it', 'to', 'of', 'in', 'on', 'and', 'or', 'do', 'does', 'how', 'what',
  'where', 'why', 'can', 'my', 'me', 'your', 'for', 'with', 'at', 'be',
  'her', 'his', 'she', 'him', 'they', 'them', 'this', 'that', 'get', 'not']);

function terms(q) {
  return q.toLowerCase().split(/[^a-z']+/).filter((w) => w.length > 2 && !STOP.has(w));
}

// keyword matching wants real overlap, not stray substrings: exact hit, or
// a containment where the contained side is itself a real word (>= 4 chars)
const kwMatch = (k, w) => k === w
  || (w.length >= 4 && k.includes(w)) || (k.length >= 4 && w.includes(k));

function scoreFact(f, ws) {
  let s = 0;
  const text = f.text.toLowerCase();
  for (const w of ws) {
    if (f.keywords.some((k) => kwMatch(k, w))) s += 3;
    if (text.includes(w)) s += 1;
    const stem = w.replace(/(ing|ed|s)$/, '');
    if (stem.length > 3 && stem !== w && text.includes(stem)) s += 2;
  }
  return s;
}

// which patches of the corpus a given crew ROLE speaks to with authority —
// the boost only ever LIFTS a fact that already scored on the question;
// it never fabricates relevance (verify-crewchat.mjs holds this).
export function roleAffinity(role) {
  switch (role) {
    case 'helmsman': return ['sailing', 'navigation'];
    case 'bosun': return ['ship', 'crew'];
    case 'gunner': return ['combat'];
    case 'lookout': return ['geography', 'legends'];
    case 'cook': return ['trade', 'crew'];
    case 'old salt': return ['legends', 'navigation'];
    default: return [];
  }
}

export function retrieveFacts(question, role = null, k = 2, maxChars = 620) {
  const ws = terms(question || '');
  if (!ws.length) return [];
  const patches = roleAffinity(role);
  const scored = SEA_FACTS
    .map((f) => {
      let s = scoreFact(f, ws);
      if (s > 0 && patches.includes(f.topic)) s += 2; // lift, never fabricate
      return { f, s };
    })
    .filter((e) => e.s >= 3)
    .sort((a, b) => b.s - a.s);
  const out = [];
  let used = 0;
  for (const { f } of scored) {
    if (out.length >= k || used + f.text.length > maxChars) break;
    out.push(f);
    used += f.text.length;
  }
  return out;
}

// the framing the facts ride in — the anti-recitation rule is the point
export function factsBlock(question, role = null) {
  const picked = retrieveFacts(question, role);
  if (!picked.length) return '';
  return 'True things about this sea and this ship, to draw on only if your '
    + 'character would know them and only if relevant (answer in your own '
    + 'voice, never recite this): '
    + picked.map((f) => f.text).join(' ');
}
