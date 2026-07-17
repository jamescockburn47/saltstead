// THE LEGENDS TABLE — the highlight points of the world. Append-only content
// (invariant 2): add a row, never bend control flow. Phase 1's world builder
// places each legend at its REAL geography; until then the table is the
// design contract and verify-legends.mjs keeps every row well-formed.
//
// kind:
//   boss    — a fight (the sea-monster class of highlight)
//   anomaly — the rules of the sea bend here
//   haven   — a legendary port, bigger and stranger than ordinary towns
//   hunt    — a chase/quest chain anchored to a region
//   wreck   — famous treasure to dive for
// phase — the earliest build phase that can carry it (see docs/DESIGN.md).

export const LEGEND_KINDS = ['boss', 'anomaly', 'haven', 'hunt', 'wreck'];

export const LEGENDS = [
  {
    id: 'dragons-wales', kind: 'boss', phase: 2,
    name: 'Y Ddraig Goch', lat: 53.07, lon: -4.08, radius: 45,
    pitch: 'Dragons nest on Snowdonia. They stoop on ships in the Irish Sea; '
      + 'wound one and it retreats to its crag — follow it ashore to finish '
      + 'the job and loot the hoard. The land fight pays in treasure already '
      + 'plundered from the sea, so the land-earns-nothing rule holds.',
  },
  {
    id: 'bermuda-triangle', kind: 'anomaly', phase: 1,
    name: 'The Bermuda Triangle', lat: 25.5, lon: -70.0, radius: 500,
    pitch: 'Compass spins, fog closes in, the HUD itself gets unreliable. '
      + 'Derelict ships drift here full of cargo nobody came back for — the '
      + 'best salvage in the Atlantic, if you can navigate OUT by dead '
      + 'reckoning and the sun alone.',
  },
  {
    id: 'kraken-deep', kind: 'boss', phase: 2,
    name: 'The Kraken', lat: 62.0, lon: -8.0, radius: 120,
    pitch: 'The old terror of the Norwegian deeps. Tentacles grab the hull; '
      + 'the crew hacks them off while you steer for shallow water where it '
      + 'cannot follow. The classic co-op fight — one ship can flee it, two '
      + 'can kill it.',
  },
  {
    id: 'corryvreckan', kind: 'anomaly', phase: 1,
    name: 'The Corryvreckan Whirlpool', lat: 56.15, lon: -5.72, radius: 15,
    pitch: 'A REAL permanent whirlpool off Scotland. Sail the rim for a speed '
      + 'slingshot; misjudge it and you are dismasted. A skill shrine — no '
      + 'loot, just the fastest shortcut in the Hebrides and bragging rights.',
  },
  {
    id: 'flying-dutchman', kind: 'hunt', phase: 3,
    name: 'The Flying Dutchman', lat: -34.35, lon: 18.47, radius: 200,
    pitch: 'A ghost ship rounds the Cape of Good Hope in every storm, hull '
      + 'glowing. Board her mid-tempest and her cursed cargo is yours; fail '
      + 'and your crew talk about it for weeks (the brain remembers).',
  },
  {
    id: 'port-royal', kind: 'haven', phase: 1,
    name: 'Port Royal', lat: 17.94, lon: -76.84, radius: 25,
    pitch: 'The wickedest city on earth — the Caribbean pirate capital. The '
      + 'best shipwrights, the best-paid crews, the best rumours, and the '
      + 'social hub where multiplayer crews muster.',
  },
  {
    id: 'davy-jones', kind: 'anomaly', phase: 3,
    name: "Davy Jones' Locker", lat: 11.35, lon: 142.2, radius: 80,
    pitch: 'The Mariana Trench. The deepest water in the world barely floats '
      + 'a ship — sails hang dead, engines sputter. Sinking treasure here '
      + 'BANKS it forever; the endgame vault for players with nothing left '
      + 'to buy.',
  },
  {
    id: 'plate-fleet', kind: 'wreck', phase: 2,
    name: 'The 1715 Plate Fleet', lat: 27.86, lon: -80.44, radius: 60,
    pitch: 'A REAL treasure fleet, still on the Florida seabed. Storm-wrecked '
      + 'Spanish silver in the shallows — dive it between hurricanes, race '
      + 'other crews to the richest hulls.',
  },
  {
    id: 'nassau', kind: 'haven', phase: 1,
    name: 'Nassau', lat: 25.08, lon: -77.35, radius: 25,
    pitch: 'The pirate republic on New Providence. No governor worth the name, '
      + 'a harbour too shallow for men-of-war, and a beach market where a '
      + 'prize sells with no questions asked — the Atlantic door.',
  },
  {
    id: 'tortuga', kind: 'haven', phase: 1,
    name: 'Tortuga', lat: 20.02, lon: -72.79, radius: 20,
    pitch: 'The buccaneers\u2019 first stronghold, a turtle-backed rock off '
      + 'Hispaniola. Taverns full of hands willing to sign articles, and a '
      + 'fort that never asks where the cargo came from.',
  },
  {
    id: 'sainte-marie', kind: 'haven', phase: 1,
    name: '\u00cele Sainte-Marie', lat: -16.89, lon: 49.82, radius: 25,
    pitch: 'The Indian Ocean pirate haven off Madagascar, astride the richest '
      + 'trade lane on earth. Every Red Sea raider wintered here; the far '
      + 'door, for captains who cross real oceans.',
  },
  {
    id: 'el-dorado', kind: 'hunt', phase: 3,
    name: 'El Dorado', lat: -3.1, lon: -60.0, radius: 300,
    pitch: 'The gilded city is somewhere up the Amazon. The great navigable '
      + 'river (the Moorstead river system at planetary scale) — shallow '
      + 'draft only, so the mightiest raider must anchor and send the '
      + 'longboat. Big ship is not always best: the design thesis in one '
      + 'quest.',
  },
  // ---- the second dozen: the mythology goes global (2026-07-17) ----
  {
    id: 'maelstrom', kind: 'anomaly', phase: 2,
    name: 'The Maelstrom', lat: 67.8, lon: 12.7, radius: 20,
    pitch: 'Moskstraumen, off Lofoten — THE original maelstrom, the one the '
      + 'word comes from. A second whirlpool shrine at the top of the world: '
      + 'ride the rim for the slingshot north, misjudge it and the Arctic '
      + 'takes your rig.',
  },
  {
    id: 'charybdis', kind: 'anomaly', phase: 2,
    name: 'Charybdis', lat: 38.24, lon: 15.63, radius: 12,
    pitch: 'The Strait of Messina, where Odysseus lost six men. She swallows '
      + 'the strait thrice daily; the rim-riders make the fastest passage '
      + 'between the Tyrrhenian and Ionian seas — the Mediterranean door, '
      + 'with teeth.',
  },
  {
    id: 'sirens', kind: 'anomaly', phase: 2,
    name: 'The Sirens', lat: 40.58, lon: 14.43, radius: 15,
    pitch: 'Li Galli, the Sirenusas — the singers of the Tyrrhenian. Inside '
      + 'their water the wind itself forgets to blow: the song becalms every '
      + 'sail while the rocks wait. Odysseus lashed himself to the mast; you '
      + 'get a helm that barely answers.',
  },
  {
    id: 'umibozu', kind: 'anomaly', phase: 2,
    name: 'The Umibōzu', lat: 38.5, lon: 134.5, radius: 200,
    pitch: 'The sea-monk of the Sea of Japan. The sky goes grey, the wind '
      + 'dies in the sails, and the old sailors say a vast black head '
      + 'watches from under the swell. Say nothing, touch nothing, sail '
      + 'through — the becalmed sea is the whole encounter.',
  },
  {
    id: 'roc', kind: 'boss', phase: 2,
    name: 'The Roc', lat: -11.9, lon: 50.5, radius: 120,
    pitch: 'Sinbad’s bird, north of Madagascar — a wingspan that shadows '
      + 'the whole deck. She stoops on ships like the Welsh dragon stoops, '
      + 'and three good broadsides drive her off with her talons full of '
      + 'whatever she tore loose. The Indian Ocean’s sky-boss.',
  },
  {
    id: 'leviathan', kind: 'boss', phase: 2,
    name: 'Leviathan', lat: 19.8, lon: 38.7, radius: 150,
    pitch: 'The terror of the Red Sea, older than any chart. Arms like the '
      + 'Kraken’s — the scripture-monster plays by the northern rules: '
      + 'axes, broadsides, or run for the reef shallows where it cannot '
      + 'follow.',
  },
  {
    id: 'white-whale', kind: 'hunt', phase: 2,
    name: 'The White Whale', lat: -38.37, lon: -74.03, radius: 100,
    pitch: 'Off Mocha Island, Chile — where the REAL Mocha Dick rammed '
      + 'whalers for thirty years. A pale mountain of a whale that answers '
      + 'nobody’s harpoon and stove in ships for spite. She rams. '
      + 'Leave her water or pay in planking.',
  },
  {
    id: 'mary-celeste', kind: 'wreck', phase: 2,
    name: 'The Ghost Fleet', lat: 38.0, lon: -25.0, radius: 250,
    pitch: 'The Azores water where the Mary Celeste was found — sails set, '
      + 'cargo whole, crew simply GONE. Dead ships drift here in numbers, '
      + 'holds untouched: the Atlantic’s second salvage ground, and '
      + 'nobody trades through it willingly.',
  },
  {
    id: 'fountain-of-youth', kind: 'hunt', phase: 2,
    name: 'The Fountain of Youth', lat: 25.73, lon: -79.28, radius: 30,
    pitch: 'Bimini, where Ponce de León looked and the Bahamas kept the '
      + 'secret. Heave to over the sweet-water spring and the sea itself '
      + 'mends your hull and rig — once a visit; the fountain remembers '
      + 'greedy captains.',
  },
  {
    id: 'selkie-skerries', kind: 'anomaly', phase: 2,
    name: 'The Selkie Skerries', lat: 59.35, lon: -2.4, radius: 25,
    pitch: 'Orkney’s seal-people. Ride to anchor among the skerries '
      + 'through a night and one may shed her sealskin and sign your '
      + 'articles — the finest hand on any water, and she works for the '
      + 'wonder of it.',
  },
  {
    id: 'cape-horn', kind: 'anomaly', phase: 2,
    name: 'The Horn', lat: -56.6, lon: -67.3, radius: 300,
    pitch: 'Cape Horn — no myth at all, which is the horror of it. The '
      + 'williwaws never stop, the sea never settles, and every chart just '
      + 'writes DANGER. Round it because it is there; brag forever.',
  },
  {
    id: 'ryugu', kind: 'wreck', phase: 2,
    name: 'Ryūgū-jō', lat: 26.2, lon: 127.2, radius: 60,
    pitch: 'The Dragon Palace under the East China Sea, off Okinawa — '
      + 'Urashima Tarō’s hundred years in a single night. Dive the '
      + 'palace reefs for pearl and coral tribute; each dive pays less, as '
      + 'the Dragon King’s patience thins.',
  },
];
