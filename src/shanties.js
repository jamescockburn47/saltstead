// THE SHIP'S MUSIC — the shanty registry and the arrangement brain. Pure: no
// THREE, no DOM, no WebAudio (verify-shanties.mjs runs every function headless).
//
// Two musical cultures share this table, split by the flag (faction.js):
//
//   PIRATE — the fo'c's'le repertoire. Work shanties and forebitters: modal,
//     rowdy, fiddle and concertina and a droned open fifth — the music a crew
//     makes for itself between hauls.
//
//   NAVY — the King's music. Naval airs, marches and hornpipes: major-key,
//     squared-off, fife and drum and a brass-band swell — the music an
//     institution provides. Spanish Ladies is the navy's own (a homeward-bound
//     capstan song of the fleet); the trade split follows the history.
//
// Every tune is traditional and safely public domain (the year is the tune's
// documented appearance in print or earlier). Melodies are transcribed into a
// small ABC-flavoured notation (parseMelody below) — data, not assets, per the
// founding identity. The table is append-only content: add a row, never bend
// control flow.
//
// The playback engine (shantybox.js) owns the WebAudio; THIS module owns every
// decision — which tune, which key, which instruments, which ornaments — so the
// whole musical mind is deterministic and testable under Node.

// ---------------------------------------------------------------------------
// notation: an ABC-flavoured melody string.
//   C D E F G A B  — the octave from middle C (C4)     c d e f g a b — above
//   ,  after a note drops it an octave; ' raises it (stackable)
//   ^C sharpens, _B flattens (that note only — spelling is always explicit)
//   a number after = length in beats (decimals fine: G1.5 A0.5); default 1
//   z = a rest (z2 = two beats of silence); | barlines are ignored eye-candy
// parseMelody returns [{ p: midiPitch|null, b: beats }] — null pitch = rest.

const LETTER_SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function parseMelody(str) {
  const out = [];
  const re = /([\^_]?)([A-Ga-gz])([,']*)(\d*\.?\d*)/g;
  let m;
  while ((m = re.exec(str)) !== null) {
    if (m[0] === '') { re.lastIndex++; continue; }
    const [, acc, letter, octs, len] = m;
    const beats = len ? parseFloat(len) : 1;
    if (letter === 'z') { out.push({ p: null, b: beats }); continue; }
    const upper = letter === letter.toLowerCase();
    let midi = 60 + LETTER_SEMITONE[letter.toUpperCase()] + (upper ? 12 : 0);
    for (const o of octs) midi += o === "'" ? 12 : -12;
    if (acc === '^') midi += 1; else if (acc === '_') midi -= 1;
    out.push({ p: midi, b: beats });
  }
  return out;
}

// the modes the repertoire actually uses — semitone steps from the root.
// (phrygian earns its row for one tune: Boney, collected in G phrygian —
// the rarest colour in the canon and worth keeping true.)
export const MODES = {
  major:      [0, 2, 4, 5, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  dorian:     [0, 2, 3, 5, 7, 9, 10],
  aeolian:    [0, 2, 3, 5, 7, 8, 10],
  phrygian:   [0, 1, 3, 5, 7, 8, 10],
};

// scale membership as pitch classes for a tune (root is a midi note)
export function scaleOf(tune) {
  const steps = MODES[tune.mode] || MODES.major;
  const rootPc = ((tune.root % 12) + 12) % 12;
  return steps.map((s) => (rootPc + s) % 12);
}

// walk n scale-steps down (n>0) or up (n<0) from a midi pitch, staying in-scale.
// A pitch OFF the scale first snaps to the nearest scale tone below.
export function scaleStep(midi, scale, n) {
  let p = midi;
  while (!scale.includes(((p % 12) + 12) % 12)) p--;
  const dir = n >= 0 ? -1 : 1;
  let left = Math.abs(n);
  while (left > 0) {
    p += dir;
    while (!scale.includes(((p % 12) + 12) % 12)) p += dir;
    left--;
  }
  return p;
}

// ---------------------------------------------------------------------------
// the deterministic dice — the same Mulberry32-step hash carols.js proved.
// No Math.random anywhere in the musical mind.
export function hash32(n) {
  let h = (n | 0) + 0x6d2b79f5;
  h = Math.imul(h ^ (h >>> 15), h | 1);
  h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
  return ((h ^ (h >>> 14)) >>> 0);
}

// a 0..1 roll from a seed and a salt (stable across platforms)
export function roll(seed, salt) {
  return hash32(Math.imul(seed | 0, 0x9e3779b1) + salt) / 4294967296;
}

// ---------------------------------------------------------------------------
// THE TUNES — the traditional repertoire, transcribed from collected sources
// (folkinfo/Hugill/Oxford Book of Sea Songs ABC mirrors; per-row year = the
// tune's documented appearance or era). All safely public domain; the
// arrangements are ours and procedural. The split is HISTORY, not flavour:
// the Royal Navy banned singing at work (orders must be heard) — her music
// is composed, instrumental, major-key, fife-and-drum. Shanties are the
// merchant/free-trader canon: anonymous, modal, call-and-response. In a
// world where piracy never died, that is the black flag's own music.
//
// side: 'pirate' | 'navy' | 'shared'. kind flavours the arrangement (march
// wants the drum, an air wants none of it). meter is beats to the bar in the
// tune's own counting unit; bpm is that unit's rate (6/8 rows count eighths,
// so their bpm runs high). Append-only content: add a row, never bend flow.
export const TUNES = [
  // ---- the fo'c's'le: work shanties and forebitters ----
  {
    id: 'drunken-sailor', name: 'Drunken Sailor', side: 'pirate', kind: 'shanty',
    root: 62, mode: 'mixolydian', meter: 2, bpm: 116, year: 1839,
    m: 'A A|A.5 D.5 ^F.5 A.5|G.5 G.5 G.5 G.5|G.5 C.5 E.5 G.5'
      + '|A A|A.5 B.5 c.5 d.5|c.5 A.5 G.5 E.5|D D'
      + '|A.5 A.25 A.25 A.5 A.25 A.25|A.5 D.5 ^F.5 A.5|G.5 G.25 G.25 G.5 G.25 G.25|G.5 C.5 E.5 G.5'
      + '|A.5 A.25 A.25 A.5 A.25 A.25|A.5 B.5 c.5 d.5|c.5 A.5 G.5 E.5|D D',
  },
  {
    id: 'leave-her-johnny', name: 'Leave Her, Johnny', side: 'pirate', kind: 'shanty',
    root: 65, mode: 'major', meter: 2, bpm: 72, year: 1870,
    m: 'z1.5 F.25 G.25|A.5 A.5 A.25 G.25 F.25 G.25|A.5 A.25 G.25 F|G.5 G.5 G.75 F.25'
      + '|A.5 c c.5|d.5 d.5 c.5 A.5|A.5 A.25 G.25 F.5 c.5|A.75 F.25 A.75 G.25|G.5 F1.5',
  },
  {
    id: 'blow-the-man-down', name: 'Blow the Man Down', side: 'pirate', kind: 'shanty',
    root: 62, mode: 'major', meter: 3, bpm: 140, year: 1860,
    m: 'z D ^F|A B A|^F D ^F|A B A|^F D ^F|A3|B3|G1.5 ^F.5 G|E2 B'
      + '|B B B|B G E|^C E G|B2 d|A A A|A2 G|^F1.5 E.5 ^F|D3',
  },
  {
    id: 'haul-away-joe', name: 'Haul Away Joe', side: 'pirate', kind: 'shanty',
    root: 63, mode: 'major', meter: 6, bpm: 220, year: 1850,
    m: '_E3 _E2 _B,|D3 z2 _B|_A2 D D2 _E|F2 _A _B3'
      + '|_e3 _e2 _B|d3 z2 _B|_A2 _A _B3|_E6',
  },
  {
    id: 'south-australia', name: 'South Australia', side: 'pirate', kind: 'shanty',
    root: 60, mode: 'major', meter: 4, bpm: 120, year: 1870,
    m: 'C E G G|F E D2|C E G2|A E G1.5 A.5|C E G G.5 G.5|F E D D.5 E.5|E1.5 E.5 G E|D C3'
      + '|c1.5 c.5 c G|A.75 B.25 c.75 A.25 G2|E D D2|E D D2'
      + '|c1.5 c.5 c G|A.75 B.25 c.75 A.25 G C.5 D.5|E1.5 E.5 G E|D C3',
  },
  {
    id: 'santiana', name: 'Santiana', side: 'pirate', kind: 'shanty',
    root: 64, mode: 'aeolian', meter: 4, bpm: 92, year: 1850,
    m: 'z3 B|E1.5 ^F.5 G A|B A.5 G.5 A2|d2 B2|E3 ^F|G2 A2'
      + '|A1.5 ^F.5 A1.5 ^F.5|A.5 G.5 ^F.5 E.5 D E.5 ^F.5|G E ^F B|B, E E2',
  },
  {
    id: 'randy-dandy-o', name: 'Randy Dandy-O', side: 'pirate', kind: 'shanty',
    root: 62, mode: 'aeolian', meter: 6, bpm: 240, year: 1860,
    m: 'f2 f.5 f.5 e f e|d1.5 e.5 d A3|d3 e3|d2 c A2 A.5 _B.5'
      + '|c1.5 d.5 c c _B A|G G G C2 F.5 G.5|A1.5 _B.5 A A2 G|F2 D D3'
      + '|f2 f e2 e|d2 d A3|d3 e3|d2 c A2 A'
      + '|c1.5 d.5 c c _B A|G G G C2 F.5 G.5|A1.5 _B.5 A A2 G|F2 D D3',
  },
  {
    id: 'bully-in-the-alley', name: 'Bully in the Alley', side: 'pirate', kind: 'shanty',
    root: 67, mode: 'major', meter: 4, bpm: 144, year: 1860,
    m: 'z3 D|G G G G|B.5 B.5 d.5 d.5 B G|c1.5 B.25 A.25 B1.5 A.25 G.25|A.5 A.5 A.5 G.5 E G.5 D.5'
      + '|G G G G|B.5 B.5 d.5 d.5 B G|D.5 D.5 D.5 D.5 E ^F|G4',
  },
  {
    id: 'roll-the-old-chariot', name: 'Roll the Old Chariot', side: 'pirate', kind: 'shanty',
    root: 63, mode: 'major', meter: 4, bpm: 240, year: 1860,
    m: 'z2 G G|_B _B G G|_B2 G G|_B _B G G|_E2 F F|_A _A F F|_A2 F F|_A _A F F|D2 G G'
      + '|_B _B G G|_B2 G G|_B _B G G|_E2 F G|_A2 G2|F2 _B,2|_E4|G2 _A2'
      + '|_B2 G2|_B2 G G|_B _B G G|_E2 F G|_A2 F2|_A2 F F|_A _A F F|D2 G _A'
      + '|_B2 G2|_B2 G G|_B _B G G|_E2 F G|_A2 G2|F2 _B,2|_E4',
  },
  {
    id: 'john-kanaka', name: 'John Kanaka', side: 'pirate', kind: 'shanty',
    root: 65, mode: 'major', meter: 4, bpm: 140, year: 1860,
    m: 'z1.5 c.5 c1.5 A.5|c1.5 A.5 F G|A2 F z.5 G.5|A.5 A.5 A.5 A.5 G C'
      + '|F1.5 c.5 c1.5 A.5|c1.5 A.5 A.5 F G.5|A2 F z.5 G.5|A.5 A.5 A.5 A.5 G C'
      + '|F1.5 z.5 c A|c f d A|c2 F z.5 G.5|A.5 A.5 A.5 A.5 G C|F4',
  },
  {
    id: 'sally-brown', name: 'Sally Brown', side: 'pirate', kind: 'shanty',
    root: 60, mode: 'major', meter: 4, bpm: 144, year: 1850,
    m: 'z3 G|C E G c.5 B.5|A G E1.5 G.5|c2 d c.5 d.5|e d c2'
      + '|e d c A|G E D.5 C1.5|G G G.5 G.5 G|A B c2',
  },
  {
    id: 'whiskey-johnny', name: 'Whiskey Johnny', side: 'pirate', kind: 'shanty',
    root: 67, mode: 'major', meter: 4, bpm: 104, year: 1850,
    m: 'z3 D|G B B D|G B B2|G B3|G B2 d|c c A A|^F A D2|^F A c1.5 c.5|B G3',
  },
  {
    id: 'lowlands-away', name: 'Lowlands Away', side: 'pirate', kind: 'forebitter',
    root: 60, mode: 'dorian', meter: 4, bpm: 80, year: 1860,
    m: 'c2 G2|c.5 d.5 _e.5 d.5 c _B|G3 F|_B1.5 c.5 d _B|c _B F _B.5 A.5|G2 F _E|C3 C'
      + '|_E.5 F.5 G.5 _E.5 F.5 _E.5 C|c2 G2|c.5 d.5 _e.5 d.5 c _B|G3 F'
      + '|_B1.5 c.5 d _B|c _B F _B.5 A.5|G2 F _E|C4',
  },
  {
    id: 'stormalong', name: 'Mister Stormalong', side: 'pirate', kind: 'forebitter',
    root: 67, mode: 'mixolydian', meter: 4, bpm: 84, year: 1850,
    m: 'z3 G|E1.5 F.5 G A.5 B.5|c d.5 c.5 G A.5 B.5|c G c G|E3 c.5 B.5'
      + '|A A A D.5 E.5|F A A2|A A A G.5 F.5|E G G2',
  },
  {
    id: 'boney', name: 'Boney', side: 'pirate', kind: 'shanty',
    root: 67, mode: 'phrygian', meter: 4, bpm: 132, year: 1815,
    m: '_B A _B c|_B G _E2|_B2 c2|_A3 z.5 _A.5|_B _A F _E|D F c2|_B _B _B2|G2 z2',
  },
  {
    id: 'wellerman', name: 'The Wellerman', side: 'pirate', kind: 'forebitter',
    root: 64, mode: 'aeolian', meter: 4, bpm: 100, year: 1866,
    m: 'B.5 E.5 E.25 E.25 G.5 B.5 B.5 B.75 B.25|c.5 A.5 A.25 A.25 c.5 e.5 B.5 B'
      + '|E.5 E.25 E.25 E.5 G.5 B.5 B.5 B.75 B.25|B.5 A.5 G.5 ^F.5 E2'
      + '|e e.75 c.25 d.5 B.5 B.75 B.25|c.5 A.5 A.25 A.25 c.5 e.5 B.5 B'
      + '|e e.5 c.25 c.25 d.25 d.25 B.5 B.75 B.25|B.5 A.5 G.5 ^F.5 E2',
  },
  {
    id: 'a-roving', name: 'A-Roving (Maid of Amsterdam)', side: 'pirate', kind: 'forebitter',
    root: 62, mode: 'major', meter: 4, bpm: 100, year: 1850,
    m: 'z3 A,|D D E.5 ^F.5 G|^F.5 G.5 ^F.5 E.5 D A,|D1.5 E.5 ^F G|A3 A'
      + '|B B G B|A.5 B.5 A.5 G.5 ^F A|G ^F E D.5 E.5|^F D B, A,'
      + '|D1.5 E.5 ^F G|A d.5 ^c.5 B G|^F2 E2|D3 A'
      + '|B2 G B|A2 ^F A|G ^F E D.5 E.5|^F D B, A,'
      + '|D1.5 E.5 ^F G|A d.5 ^c.5 B G|^F2 E2|D4',
  },
  {
    id: 'cape-cod-girls', name: 'Cape Cod Girls', side: 'pirate', kind: 'shanty',
    root: 67, mode: 'major', meter: 2, bpm: 108, year: 1860,
    m: 'B.5 B.5 d.5 d.5|G.5 G.5 D|G.75 B.25 d|e.75 B.25 d'
      + '|B.5 B.5 d.5 d.5|G.5 G.5 D|G.5 A.5 B.25 d.5 B.25|A.5 G.5 G'
      + '|g.5 g.5 g.5 e.5|d.25 e.25 d.25 B.25 G|G.75 B.25 d|e.75 B.25 d'
      + '|g.5 g.5 g.5 e.5|d.25 e.25 d.25 B.25 G|G.5 A.5 B.25 d.5 B.25|A.5 G.5 G',
  },
  {
    id: 'reuben-ranzo', name: 'Reuben Ranzo', side: 'pirate', kind: 'shanty',
    root: 67, mode: 'mixolydian', meter: 2, bpm: 108, year: 1850,
    m: 'z d|B.5 d.5 c.5 B.5|A.5 G.5 B|A.5 A.5 A|B.5 A B.25 A.25'
      + '|G.5 A.5 G.5 E.5|E D|G.5 B.5 d|A.5 G1.5',
  },

  // ---- the King's music: composed, instrumental, on the beat ----
  {
    id: 'heart-of-oak', name: 'Heart of Oak', side: 'navy', kind: 'march',
    root: 60, mode: 'major', meter: 4, bpm: 112, year: 1759,
    m: 'z3.5 G.5|c c.5 c.5 c e.5 d.5|c B.5 A.5 G z.5 G.5|A A.5 B.5 c c.5 d.5|e f.5 d.5 e z.5 G.5'
      + '|c E.5 F.5 G A.5 B.5|c E.5 F.5 G z.5 d.5|e d.5 c.5 g B.5 c.5|d d.5 D.5 G d.75 d.25'
      + '|d B.5 c.5 d e.75 e.25|e c.5 d.5 e z.5 e.5|d.5 c.5 B.5 e.5 c.5 A.5 z'
      + '|c.25 c.75 G E.25 C.75 z.5 G.5|A.5 B.5 c.5 d.5 e d.5 c.5|g G.5 B.5 c2',
  },
  {
    id: 'rule-britannia', name: 'Rule, Britannia!', side: 'navy', kind: 'march',
    root: 62, mode: 'major', meter: 4, bpm: 88, year: 1740,
    m: 'z3.5 A.5|d d d.25 e.25 ^f.25 g.25 a.5 d.5|e g ^f z.5 A.5'
      + '|d.25 e.25 d.25 e.25 ^f.25 g.25 ^f.25 g.25 a.5 e.5 ^f.5 e.5|d.5 e.25 ^f.25 e.5 d.5 ^c z.5 A.5'
      + '|e d.5 ^c.5 a.5 ^g.25 ^f.25 e.25 d.25 ^c.25 B.25|A B A z'
      + '|d d.5 A.5 B.5 G.5 z.5 ^f.5|g.5 ^f.5 e.5 d.5 ^c z.5 e.5'
      + '|a g ^f.25 d.25 g.25 e.25 a.25 ^f.25 e.25 d.25|A e d2'
      + '|^f1.5 ^f.5 g.25 ^f.25 g.5 z.5 ^f.5|g.5 ^f.5 e.5 d.5 ^c z'
      + '|a g ^f.25 d.25 g.25 e.25 a.25 ^f.25 e.25 d.25|A e d2',
  },
  {
    id: 'lillibullero', name: 'Lillibullero', side: 'navy', kind: 'march',
    root: 67, mode: 'major', meter: 6, bpm: 320, year: 1689,
    m: 'G A G B2 B|A B A c3|B d G c2 B|A G ^F G2 D'
      + '|G A G B2 B|A B A c3|B d G c2 B|A G ^F G3'
      + '|g2 ^f g2 d|d e f e2 d|d e ^f g d e|d c B A2 d'
      + '|e d c B c d|e d c B c d|e.5 ^f.5 g G c2 B|A G ^F G3',
  },
  {
    id: 'portsmouth', name: 'Portsmouth', side: 'navy', kind: 'hornpipe',
    root: 67, mode: 'major', meter: 4, bpm: 120, year: 1701,
    m: 'z3 D|G1.5 A.5 B.5 A.5 G.5 ^F.5|E2 e2|d B c.5 B.5 A.5 G.5|A3 D'
      + '|G1.5 A.5 B.5 A.5 G.5 ^F.5|E2 e2|d B c.5 B.5 A.5 B.5|G3 d'
      + '|g1.5 a.5 b.5 a.5 g.5 ^f.5|g d B d|g B c.5 B.5 A.5 G.5|A3 D'
      + '|G1.5 A.5 B.5 A.5 G.5 ^F.5|E2 e2|d B c.5 B.5 A.5 B.5|G4',
  },
  {
    id: 'keel-row', name: 'The Keel Row', side: 'navy', kind: 'hornpipe',
    root: 65, mode: 'major', meter: 2, bpm: 100, year: 1770,
    m: 'z1.5 _B.5|A.75 A.25 F.75 A.25|_B G.75 _B.25|A F.75 A.25|G.75 E.25 C.5 _B.5'
      + '|A.75 A.25 F.75 A.25|_B G.75 _B.25|A.75 F.25 G.75 E.25|F1.5 c.5'
      + '|A.25 c.75 c.75 f.25|d c.75 _B.25|A F.75 A.25|G.75 E.25 C.5 c.5'
      + '|A.25 c.75 c.75 f.25|d c.75 _B.25|A.75 F.25 G.75 E.25|F2',
  },
  {
    id: 'spanish-ladies', name: 'Spanish Ladies', side: 'navy', kind: 'air',
    root: 67, mode: 'aeolian', meter: 3, bpm: 92, year: 1796,
    m: 'z2 D|G G ^F|G2 G.5 A.5|_B A G|^F D1.5 D.5|G G ^F|G2 G.5 A.5|_B A G|A2 A.5 A.5'
      + '|_B A G|c _B A|d G G.5 A.5|^F.5 E.5 D d.5 c.5|_B A G|^F D D|D G ^F|G3',
  },

  // ---- shared water: ballads and airs both cultures kept ----
  {
    id: 'henry-martin', name: 'Henry Martin', side: 'shared', kind: 'air',
    root: 62, mode: 'mixolydian', meter: 3, bpm: 90, year: 1810,
    m: 'z2 D|E ^F A|A ^F A|A G E|D z D|G ^F G|A d ^c|A3|A z D'
      + '|A d d|^c B A|A D E|^F E D|c2 d.75 c.25|A z D|^F A c.5 B.5|A1.5 G.5 E|D3',
  },
  {
    id: 'high-barbary', name: 'The Coasts of High Barbary', side: 'shared', kind: 'air',
    root: 70, mode: 'major', meter: 6, bpm: 200, year: 1795,
    m: 'z5 D|D2 G G2 A|_B3 c2 _B|A3 _B2 A|D3 z2 D'
      + '|D5 D|d5 D|G2 A _B2 c|d3 d2 _B'
      + '|d2 d _B2 d|c2 c A2 c|_B2 _B A2 G|D3 _B,2 C'
      + '|D2 G _B2 A|G3 G2 F|D3 G2 ^F|G6',
  },
  {
    id: 'greensleeves', name: 'Greensleeves', side: 'shared', kind: 'air',
    root: 67, mode: 'aeolian', meter: 4, bpm: 100, year: 1580,
    m: '_B2 d _B|c A F2|_B2 G G|A ^F D2|_B1.5 c.5 d _B|c A F F|_B G A ^F|G2 G2'
      + '|f2 f d|c A F2|_B1.5 _B.5 G G|A F D2|f2 f d|c A F F|_B G A ^F|G G G2',
  },
];

// every tune a side may play (its own rows + the shared ones)
export function tunesFor(side) {
  return TUNES.filter((t) => t.side === side || t.side === 'shared');
}

// rotationOrder(daySeed, side) → a permutation of that side's tune ids.
// Seeded Fisher-Yates, one shuffle per in-game day: variety without repeats,
// and the same order for every client that shares the seed (carols.js law).
export function rotationOrder(daySeed, side) {
  const seed = Math.floor(daySeed) | 0;
  const ids = tunesFor(side).map((t) => t.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = hash32(seed * 0x9e3779b1 + i * 131 + (side === 'navy' ? 7 : 0)) % (i + 1);
    const t = ids[i]; ids[i] = ids[j]; ids[j] = t;
  }
  return ids;
}

export function tuneById(id) {
  return TUNES.find((t) => t.id === id) || null;
}

// ---------------------------------------------------------------------------
// the ARRANGEMENT PLAN — how this rendition, tonight, on this deck, differs
// from the last one. All of it rolled deterministically from (seed, tune).
//
// lead instrument pools per side and kind: the navy's marches belong to the
// fife and the band; her quieter airs to the wardroom fiddle. The fo'c's'le
// swaps lead between fiddle, concertina and whistle, with the plucked box
// (a rough cigar-box strummer) underneath when the dice favour it.
const LEADS = {
  pirate: { default: ['fiddle', 'concertina', 'whistle', 'fiddle'], air: ['whistle', 'fiddle', 'concertina'] },
  navy:   { default: ['fife', 'fiddle', 'brass', 'fife'], air: ['fiddle', 'fife', 'fiddle'],
            march: ['fife', 'brass', 'fife'] },
};

export function planFor(seed, tune, side) {
  const s = Math.imul(seed | 0, 31) + hash32(tune.id.length * 97 + tune.root);
  const pools = LEADS[side] || LEADS.pirate;
  const pool = pools[tune.kind] || pools.default;
  const lead = pool[hash32(s) % pool.length];
  const isMarch = tune.kind === 'march' || tune.kind === 'hornpipe';
  const isAir = tune.kind === 'air';
  // call-and-response: on a second pass the tune may cross the deck to a
  // different instrument (shanties ARE call-and-response — this reads true)
  const response = pool.find((i) => i !== lead) || lead;
  return {
    lead,
    responseLead: roll(s, 9) < 0.5 ? response : lead,
    transpose: (hash32(s + 1) % 5) - 2,            // -2..+2 semitones: a new key each night
    tempoMul: 0.92 + roll(s, 2) * 0.16,           // ±8% — a tired crew drags, a merry one drives
    repeats: isAir ? 1 : 1 + (hash32(s + 3) % 2), // once or twice through
    harmony: !isAir && roll(s, 4) < 0.4,          // a second voice in thirds on the repeat
    drone: side === 'pirate' ? roll(s, 5) < 0.55  // the fo'c's'le loves an open fifth
      : roll(s, 5) < 0.2,
    // the watch below hums along, wordless — mostly a fo'c's'le habit; the
    // King's people only allow themselves it on an air, and rarely
    hum: side === 'pirate' ? roll(s, 10) < 0.4 : (isAir && roll(s, 10) < 0.15),
    perc: !isAir && (side === 'navy' ? roll(s, 6) < (isMarch ? 0.9 : 0.45) // the King's drum
      : roll(s, 6) < 0.25),                       // a knuckle on the capstan head
    ornaments: isAir ? 0.15 : roll(s, 7) * 0.45,  // cut-note density on the long notes
    gapS: 50 + roll(s, 8) * 110,                  // the silence after — music is a visitor
  };
}

// ---------------------------------------------------------------------------
// moodFor(state) → how the music should sit this frame. Pure, so the whole
// gating policy is verify-testable. level is the master-gain target (already
// subtle — the mix rule is: mute it and the deck feels emptier, unmute and
// nobody looks for the band). play=false also asks the box to abandon any
// rendition in flight (a fight or a gale is not a segue).
//   state: { hostileDist, storm, swell, portDist, anchored, nightness, aground }
//   (swell rides waves.js units: a calm sea reads ~1.2, hard weather 2)
export function moodFor(state) {
  const { hostileDist = Infinity, storm = false, swell = 1.2, portDist = Infinity,
    anchored = false, nightness = 0, aground = false } = state || {};
  // an enemy in gun-danger or a storm on the ship: the music stands down —
  // the wind and the guns own those minutes
  if (hostileDist < 700) return { play: false, level: 0, mode: 'danger' };
  if (storm) return { play: false, level: 0, mode: 'storm' };
  if (aground) return { play: false, level: 0, mode: 'aground' };
  // a hard sea short of a storm thins the band (the wind masks it anyway)
  const seaHush = Math.max(0.55, Math.min(1, 1.55 - 0.45 * swell));
  // riding to anchor or standing into harbour: the fullest the music gets
  if (anchored || portDist < 900) {
    return { play: true, level: 0.10 * (1 - nightness * 0.3), mode: 'harbour' };
  }
  // the open sea underway: barely-there, quieter still by night
  return { play: true, level: 0.055 * seaHush * (1 - nightness * 0.35), mode: 'sail' };
}

// ---------------------------------------------------------------------------
// renderScore(tune, plan) → the full rendition as flat, sorted note events:
//   [{ t, dur, midi, voice, vel }]  (t and dur in BEATS; the box scales by bpm)
// voices: 'lead' | 'harmony' | 'drone' | 'percLow' | 'percHigh'
// Everything here is deterministic — same tune + plan, same score, any machine.
export function renderScore(tune, plan) {
  const melody = parseMelody(tune.m);
  // the scale must follow the transposition — harmony and cuts live in the
  // KEY OF THE NIGHT, not the printed key
  const scale = scaleOf({ root: tune.root + plan.transpose, mode: tune.mode });
  const events = [];
  const seed = hash32(tune.root * 131 + Math.round(plan.tempoMul * 1000));
  let t = 0;

  for (let rep = 0; rep < plan.repeats; rep++) {
    let noteIx = 0;
    for (const n of melody) {
      if (n.p !== null) {
        const midi = n.p + plan.transpose;
        // the downbeat leans, the offbeat lightens — a played feel, not a grid
        const inBar = t % tune.meter;
        const vel = (inBar < 0.01 ? 1.0 : inBar === Math.floor(inBar) ? 0.85 : 0.72)
          * (rep > 0 ? 0.96 : 1);
        // a cut (grace note a scale-step up) on the longer notes, by the dice
        const wantCut = n.b >= 1.5 && roll(seed + rep * 8191, noteIx) < plan.ornaments;
        if (wantCut) {
          // negative n walks UP the scale — the cut sits one step above its note
          events.push({ t, dur: 0.12, midi: scaleStep(midi, scale, -1), voice: 'lead', vel: vel * 0.6, rep });
        }
        const gd = wantCut ? 0.12 : 0;
        events.push({ t: t + gd, dur: Math.max(0.1, n.b - gd) * 0.92, midi, voice: 'lead', vel, rep });
        // the second voice: parallel thirds below, on the repeat pass only
        // (or throughout when the tune is played once) — quieter, a friend
        const harmNow = plan.harmony && (plan.repeats === 1 || rep === plan.repeats - 1);
        if (harmNow && n.b >= 0.5) {
          events.push({ t: t + gd, dur: Math.max(0.1, n.b - gd) * 0.92,
            midi: scaleStep(midi, scale, 2), voice: 'harmony', vel: vel * 0.45 });
        }
        // the watch below hums the tune an octave down — only the long notes,
        // legato (the full length, no clipped consonants: there are none)
        if (plan.hum && n.b >= 1) {
          events.push({ t, dur: n.b, midi: midi - 12, voice: 'hum', vel: vel * 0.5 });
        }
      }
      t += n.b;
      noteIx++;
    }
  }
  const total = t;

  // the drone: root + fifth held under everything, re-bowed every four bars
  if (plan.drone) {
    const root = tune.root + plan.transpose - 12;
    const span = tune.meter * 4;
    for (let d = 0; d < total; d += span) {
      const dur = Math.min(span, total - d) * 0.98;
      events.push({ t: d, dur, midi: root, voice: 'drone', vel: 0.5 });
      events.push({ t: d, dur, midi: root + 7, voice: 'drone', vel: 0.35 });
    }
  }

  // the drum: a march gets the field pattern, a shanty a knuckle on the beat.
  // 6/8 swings on 1 and 4; common time walks 1-2-3-4 with the weight on 1 and 3.
  if (plan.perc) {
    const six = tune.meter === 6;
    for (let bar = 0; bar * tune.meter < total; bar++) {
      const b0 = bar * tune.meter;
      if (six) {
        events.push({ t: b0, dur: 0.2, midi: 0, voice: 'percLow', vel: 0.9 });
        if (b0 + 3 < total) events.push({ t: b0 + 3, dur: 0.2, midi: 0, voice: 'percHigh', vel: 0.55 });
      } else {
        for (let q = 0; q < tune.meter && b0 + q < total; q++) {
          const low = q % 2 === 0;
          events.push({ t: b0 + q, dur: 0.2, midi: 0,
            voice: low ? 'percLow' : 'percHigh', vel: q === 0 ? 0.9 : low ? 0.6 : 0.4 });
        }
      }
    }
  }

  events.sort((a, b) => a.t - b.t || (a.voice < b.voice ? -1 : 1));
  return { events, totalBeats: total };
}
