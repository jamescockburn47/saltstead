// verify-shanties: the ship's music holds its shape — every tune well-formed
// and singable, the two repertoires genuinely different, the whole musical
// mind (rotation, plan, score, mood) deterministic, and the module pure.
import { readFileSync } from 'node:fs';
import {
  TUNES, tunesFor, tuneById, parseMelody, scaleOf, scaleStep, MODES,
  rotationOrder, planFor, renderScore, moodFor, hash32, roll,
} from '../src/shanties.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// purity: the musical mind imports no THREE, no DOM, no WebAudio
{
  const src = readFileSync(new URL('../src/shanties.js', import.meta.url), 'utf8');
  ok(!/from 'three'|require\(|document\.|window\.|AudioContext/.test(src),
    'shanties.js is pure — no THREE, no DOM, no WebAudio');
  const code = src.replace(/\/\/[^\n]*/g, ''); // comments may SAY it; code may not DO it
  ok(!/Math\.random/.test(code), 'and deterministic — no Math.random in the musical mind');
}

// the notation reads true
{
  const m = parseMelody('C D2 ^F0.5 _B, c z2 | G,,1.5');
  ok(m.length === 7, `parseMelody reads every token (${m.length}/7)`);
  ok(m[0].p === 60 && m[0].b === 1, 'C is middle C, one beat');
  ok(m[1].p === 62 && m[1].b === 2, 'D2 holds two beats');
  ok(m[2].p === 66 && m[2].b === 0.5, '^F sharpens');
  ok(m[3].p === 58, '_B, flattens and drops the octave');
  ok(m[4].p === 72, 'lowercase c sits the octave above');
  ok(m[5].p === null && m[5].b === 2, 'z2 is two beats of silence');
  ok(m[6].p === 43 && m[6].b === 1.5, 'double-comma drops two octaves, decimals hold');
}

// the scale walker
{
  const scale = scaleOf({ root: 62, mode: 'dorian' }); // D dorian: D E F G A B C
  ok(scale.includes(2) && scale.includes(5) && scale.includes(9) && !scale.includes(6),
    'D dorian carries F natural and B natural, never F#');
  ok(scaleStep(69, scale, 2) === 65, 'two steps down from A lands on F (thirds live here)');
  ok(scaleStep(62, scale, -1) === 64, 'one step up from D is E (the cut note)');
}

// THE TABLE: every row well-formed, every melody singable
const SIDES = ['pirate', 'navy', 'shared'];
const KINDS = ['shanty', 'forebitter', 'march', 'hornpipe', 'air', 'jig'];
const seen = new Set();
for (const t of TUNES) {
  ok(t.id && !seen.has(t.id), `tune id unique: ${t.id}`);
  seen.add(t.id);
  ok(SIDES.includes(t.side), `${t.id}: side is a real side (${t.side})`);
  ok(KINDS.includes(t.kind), `${t.id}: kind is a real kind (${t.kind})`);
  ok(MODES[t.mode === 'minor' ? 'aeolian' : t.mode] !== undefined || t.mode === 'minor',
    `${t.id}: mode known (${t.mode})`);
  ok(t.root >= 48 && t.root <= 79, `${t.id}: root in a singable octave (${t.root})`);
  ok([2, 3, 4, 6].includes(t.meter), `${t.id}: meter is honest time (${t.meter})`);
  // 6/8 rows count eighths, so a jig's bpm runs to ~330; nothing runs faster
  ok(t.bpm >= 55 && t.bpm <= 340, `${t.id}: tempo a human gait (${t.bpm})`);
  ok(typeof t.year === 'number' && t.year <= 1920,
    `${t.id}: traditional and out of copyright (${t.year})`);
  const mel = parseMelody(t.m);
  ok(mel.length >= 12, `${t.id}: a real melody, not a fragment (${mel.length} notes)`);
  const pitches = mel.filter((n) => n.p !== null);
  ok(pitches.length > 0, `${t.id}: has pitched notes`);
  for (const n of pitches) {
    ok(n.p >= 43 && n.p <= 91, `${t.id}: pitch on an instrument (${n.p})`);
    ok(n.b > 0 && n.b <= 8, `${t.id}: note lengths sane (${n.b})`);
  }
  // the melody should sit near its printed key: most notes on the scale
  const scale = scaleOf(t);
  const inScale = pitches.filter((n) => scale.includes(((n.p % 12) + 12) % 12)).length;
  ok(inScale / pitches.length > 0.8,
    `${t.id}: the tune lives in its mode (${inScale}/${pitches.length} on-scale)`);
  // and a whole number of bars — a truncated transcription would drop a beat
  const total = mel.reduce((a, n) => a + n.b, 0);
  ok(Math.abs(total / t.meter - Math.round(total / t.meter)) < 1e-6,
    `${t.id}: whole bars (${total} beats over meter ${t.meter})`);
}

// TWO REPERTOIRES, both broad — the variety the deck was promised
{
  const p = tunesFor('pirate'), n = tunesFor('navy');
  ok(p.length >= 12, `the fo'c's'le knows at least a dozen (${p.length})`);
  ok(n.length >= 9, `the King's music runs deep too (${n.length})`);
  const pOnly = TUNES.filter((t) => t.side === 'pirate');
  const nOnly = TUNES.filter((t) => t.side === 'navy');
  ok(pOnly.length >= 8 && nOnly.length >= 6,
    `each flag owns music of its own (pirate ${pOnly.length}, navy ${nOnly.length})`);
  // the pirate's sea is modal; the navy's is squared-off and major
  const modalP = pOnly.filter((t) => t.mode !== 'major').length;
  ok(modalP / pOnly.length >= 0.4, `the black flag leans modal (${modalP}/${pOnly.length})`);
  const majorN = nOnly.filter((t) => t.mode === 'major').length;
  ok(majorN / nOnly.length >= 0.6, `the King's music leans major (${majorN}/${nOnly.length})`);
  ok(nOnly.some((t) => t.kind === 'march' || t.kind === 'hornpipe'),
    'the navy marches; the deck gets its hornpipe');
  ok(pOnly.some((t) => t.kind === 'shanty') && pOnly.some((t) => t.kind === 'forebitter'),
    "the fo'c's'le works and the fo'c's'le rests");
}

// rotation: deterministic, complete, and different day to day
{
  const a = rotationOrder(7, 'pirate'), b = rotationOrder(7, 'pirate');
  ok(a.join() === b.join(), 'the same day deals the same order on every deck');
  ok(a.length === tunesFor('pirate').length && new Set(a).size === a.length,
    'every tune dealt once');
  const c = rotationOrder(8, 'pirate');
  ok(a.join() !== c.join(), 'a new day, a new order');
  ok(rotationOrder(7, 'navy').join() !== a.join()
    || tunesFor('navy').length !== tunesFor('pirate').length,
    'the two flags do not share a set list');
}

// the plan: deterministic, and honest about its ranges
{
  const t0 = TUNES[0];
  const p1 = planFor(42, t0, 'pirate'), p2 = planFor(42, t0, 'pirate');
  ok(JSON.stringify(p1) === JSON.stringify(p2), 'the same seed plans the same night');
  let differs = false;
  for (let s = 0; s < 8; s++) {
    const p = planFor(s * 977, t0, 'pirate');
    ok(p.transpose >= -2 && p.transpose <= 2, `transpose within a tone (${p.transpose})`);
    ok(p.tempoMul > 0.9 && p.tempoMul < 1.1, `tempo within a stride (${p.tempoMul})`);
    ok(p.repeats >= 1 && p.repeats <= 2, `once or twice through (${p.repeats})`);
    ok(p.gapS >= 45 && p.gapS <= 165, `a real silence follows (${p.gapS})`);
    if (JSON.stringify(p) !== JSON.stringify(p1)) differs = true;
  }
  ok(differs, 'different nights, different arrangements');
}

// the score: sorted, in-range, and the drone/drum obey the plan
{
  const t0 = TUNES[0];
  const plan = { ...planFor(3, t0, 'pirate'), drone: true, perc: true, repeats: 2,
    harmony: true, hum: true };
  const { events, totalBeats } = renderScore(t0, plan);
  ok(events.length > 0 && totalBeats > 0, 'a rendition renders');
  let sorted = true, last = -1;
  for (const e of events) { if (e.t < last) sorted = false; last = e.t; }
  ok(sorted, 'events land in time order');
  ok(events.every((e) => e.t >= 0 && e.t < totalBeats + 1e-6), 'nothing plays after the end');
  ok(events.some((e) => e.voice === 'drone'), 'the plan asked a drone and got one');
  ok(events.some((e) => e.voice === 'percLow'), 'and the drum answers too');
  ok(events.some((e) => e.voice === 'harmony'), 'and the second voice');
  const hums = events.filter((e) => e.voice === 'hum');
  ok(hums.length > 0, 'and the watch hums along');
  ok(hums.every((h) => events.some((e) => e.voice === 'lead'
    && Math.abs(e.t - h.t) < 0.13 && e.midi === h.midi + 12)),
    'the hum tracks the tune an octave below');
  const leads = events.filter((e) => e.voice === 'lead');
  ok(leads.every((e) => e.midi >= 40 && e.midi <= 96), 'every lead note on an instrument');
  ok(leads.some((e) => e.rep === 1), 'the second pass is marked for the response voice');
  const silent = { ...plan, drone: false, perc: false, harmony: false, hum: false, repeats: 1 };
  const s2 = renderScore(t0, silent);
  ok(!s2.events.some((e) => e.voice !== 'lead'), 'a bare plan renders a bare tune');
}

// the mood policy: guns, gales and groundings silence the band
{
  ok(moodFor({ hostileDist: 300 }).play === false, 'an enemy in range stands the band down');
  ok(moodFor({ storm: true }).play === false, 'so does a storm');
  ok(moodFor({ aground: true }).play === false, 'so does the sand');
  const sail = moodFor({ hostileDist: 5000, swell: 1.2 });
  const port = moodFor({ hostileDist: 5000, swell: 1.2, portDist: 400 });
  ok(sail.play && port.play, 'fair sailing and harbour both carry music');
  ok(port.level > sail.level, 'the harbour is the fullest the band gets');
  ok(sail.level <= 0.12 && port.level <= 0.12, 'and none of it is loud — background, always');
  const night = moodFor({ hostileDist: 5000, swell: 1.2, nightness: 1 });
  ok(night.level < sail.level, 'the night watch keeps it lower still');
  const hard = moodFor({ hostileDist: 5000, swell: 2.0 });
  ok(hard.level < sail.level, 'a hard sea thins the band before the storm silences it');
}

// the dice: stable across runs and platforms
ok(hash32(1234) === hash32(1234) && hash32(1) !== hash32(2), 'the hash holds');
ok(roll(9, 3) >= 0 && roll(9, 3) < 1 && roll(9, 3) === roll(9, 3), 'the roll is a fair 0..1');

if (failed) { console.error(`verify-shanties: ${failed} FAILED`); process.exit(1); }
console.log(`verify-shanties: OK — ${TUNES.length} tunes, two honest repertoires, `
  + 'the musical mind deterministic and pure');
