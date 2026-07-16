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
    id: 'el-dorado', kind: 'hunt', phase: 3,
    name: 'El Dorado', lat: -3.1, lon: -60.0, radius: 300,
    pitch: 'The gilded city is somewhere up the Amazon. The great navigable '
      + 'river (the Moorstead river system at planetary scale) — shallow '
      + 'draft only, so the mightiest raider must anchor and send the '
      + 'longboat. Big ship is not always best: the design thesis in one '
      + 'quest.',
  },
];
