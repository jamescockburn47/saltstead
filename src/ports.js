// The world's dockyards — pure data, no THREE, no DOM. verify-ports.mjs
// guards it (every yard near a real coast, every ocean served).
//
// The four pirate HAVENS (legends.js) fence prizes at full price and ask no
// questions. These are the HONEST ports: real age-of-sail harbours where any
// captain can repair, sign hands, and pay the shipwright — so a voyage can
// round the world without beating back to the Caribbean for a new topmast.
// The harbourmaster asks questions here, though: prizes fence at half value.
//
// Append-only, like legends.js: add a row, never bend control flow.

export const PORTS = [
  { id: 'havana', kind: 'dockyard', name: 'Havana', lat: 23.15, lon: -82.36,
    pitch: 'The Spanish crown\u2019s great arsenal of the Indies \u2014 the best-stocked yard west of Cádiz.' },
  { id: 'boston', kind: 'dockyard', name: 'Boston', lat: 42.33, lon: -70.85,
    pitch: 'Cold water, hard men, good oak. The North Atlantic\u2019s door.' },
  { id: 'bristol', kind: 'dockyard', name: 'Bristol', lat: 51.3, lon: -3.4,
    pitch: 'Shipshape and Bristol fashion \u2014 England\u2019s western yard, cradle of half the trade.' },
  { id: 'lisbon', kind: 'dockyard', name: 'Lisbon', lat: 38.6, lon: -9.35,
    pitch: 'The Tagus roads, where the carracks of two empires refit for the long routes.' },
  { id: 'cadiz', kind: 'dockyard', name: 'Cádiz', lat: 36.5, lon: -6.4,
    pitch: 'The treasure fleet\u2019s home port \u2014 riggers who have seen everything the sea can break.' },
  { id: 'marseille', kind: 'dockyard', name: 'Marseille', lat: 43.2, lon: 5.3,
    pitch: 'The Mediterranean\u2019s old workhorse harbour, trading since the Greeks.' },
  { id: 'cape-town', kind: 'dockyard', name: 'Cape Town', lat: -33.85, lon: 18.35,
    pitch: 'The Tavern of the Seas, under Table Mountain \u2014 last yard before the roaring forties.' },
  { id: 'zanzibar', kind: 'dockyard', name: 'Zanzibar', lat: -6.1, lon: 39.3,
    pitch: 'Monsoon crossroads \u2014 dhow-wrights who can scarf a sprung plank by feel.' },
  { id: 'bombay', kind: 'dockyard', name: 'Bombay', lat: 18.9, lon: 72.7,
    pitch: 'The Wadia yards \u2014 teak hulls that outlive their captains.' },
  { id: 'batavia', kind: 'dockyard', name: 'Batavia', lat: -6.0, lon: 106.8,
    pitch: 'The Company\u2019s eastern capital \u2014 every spice road runs through this roadstead.' },
  { id: 'canton', kind: 'dockyard', name: 'Canton', lat: 22.1, lon: 113.7,
    pitch: 'The Pearl River anchorage \u2014 silk, tea, and shipwrights past counting.' },
  { id: 'manila', kind: 'dockyard', name: 'Manila', lat: 14.55, lon: 120.85,
    pitch: 'The galleon harbour \u2014 where the Pacific trade turns for Acapulco.' },
  { id: 'nagasaki', kind: 'dockyard', name: 'Nagasaki', lat: 32.7, lon: 129.8,
    pitch: 'The one open door of Japan \u2014 a deep, sheltered bay and quiet, exact work.' },
  { id: 'sydney', kind: 'dockyard', name: 'Sydney Cove', lat: -33.8, lon: 151.3,
    pitch: 'The far side of the world \u2014 a young harbour with timber to spare.' },
  { id: 'acapulco', kind: 'dockyard', name: 'Acapulco', lat: 16.8, lon: -99.9,
    pitch: 'The Manila galleon\u2019s landfall \u2014 the eastern Pacific\u2019s only real yard.' },
  { id: 'callao', kind: 'dockyard', name: 'Callao', lat: -12.05, lon: -77.2,
    pitch: 'Lima\u2019s port and the silver coast\u2019s harbour \u2014 all Peru ships from here.' },
  { id: 'valparaiso', kind: 'dockyard', name: 'Valparaíso', lat: -33.0, lon: -71.7,
    pitch: 'The Vale of Paradise \u2014 first shelter after the Horn, and it feels like it.' },
  { id: 'rio', kind: 'dockyard', name: 'Rio de Janeiro', lat: -22.9, lon: -43.1,
    pitch: 'Guanabara Bay \u2014 the South Atlantic\u2019s great harbour, deep enough for any keel.' },
];
