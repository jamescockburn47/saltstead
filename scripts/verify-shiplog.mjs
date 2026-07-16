// verify-shiplog: the ship's log keeps honest pages — real watch names on
// real boundaries, positions in degrees and minutes, the book capped, and
// saved pages vetted on the way back in.
import {
  LOG_CAP, watchName, voyageDay, fmtPos, makeEntry, pushEntry, logLine, acceptLog,
} from '../src/shiplog.js';
import { DAY_LENGTH } from '../src/skymath.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };
const atHour = (h) => (DAY_LENGTH * h) / 24;

// the traditional watch system, checked at centres and boundaries
ok(watchName(atHour(2)) === 'Middle watch', '02:00 is the Middle watch');
ok(watchName(atHour(6)) === 'Morning watch', '06:00 is the Morning watch');
ok(watchName(atHour(10)) === 'Forenoon watch', '10:00 is the Forenoon watch');
ok(watchName(atHour(14)) === 'Afternoon watch', '14:00 is the Afternoon watch');
ok(watchName(atHour(17)) === 'First dog watch', '17:00 is the First dog');
ok(watchName(atHour(19)) === 'Last dog watch', '19:00 is the Last dog');
ok(watchName(atHour(22)) === 'First watch', '22:00 is the First watch');
ok(watchName(atHour(0)) === 'Middle watch', 'midnight starts the Middle watch');
ok(watchName(atHour(4)) === 'Morning watch', '04:00 sharp relieves the Middle');
ok(watchName(atHour(24 + 2)) === 'Middle watch', 'the watches wrap with the day');

// voyage days count from 1
ok(voyageDay(0) === 1, 'the voyage begins on day 1');
ok(voyageDay(DAY_LENGTH * 2.5) === 3, 'two and a half days in = day 3');

// positions the way a master wrote them
ok(fmtPos(17.85, -76.9) === '17\u00b051\u2032N 76\u00b054\u2032W',
  `Port Royal reads 17\u00b051'N 76\u00b054'W (got ${fmtPos(17.85, -76.9)})`);
ok(fmtPos(0, 0) === '0\u00b000\u2032N 0\u00b000\u2032E', 'the origin is 0/0 N/E');
ok(fmtPos(-33.86, 151.21) === '33\u00b052\u2032S 151\u00b013\u2032E', 'Sydney reads S and E');
ok(fmtPos(10.9999, 0) === '11\u00b000\u2032N 0\u00b000\u2032E', 'minute 60 carries into the degree');

// entries + the cap
const e = makeEntry(atHour(14), 17.85, -76.9, 'Boarded a merchantman');
ok(e.d === 1 && e.w === 'Afternoon watch' && e.x === 'Boarded a merchantman',
  'entry carries day, watch, and the tale');
ok(logLine(e) === 'Day 1, Afternoon watch \u2014 17\u00b051\u2032N 76\u00b054\u2032W \u2014 Boarded a merchantman',
  `the page line reads right (got "${logLine(e)}")`);

const book = [];
for (let i = 0; i < LOG_CAP + 40; i++) pushEntry(book, makeEntry(atHour(i), 0, 0, `entry ${i}`));
ok(book.length === LOG_CAP, `the book holds ${LOG_CAP} pages, no more`);
ok(book[book.length - 1].x === `entry ${LOG_CAP + 39}`, 'the newest page survives');
ok(book[0].x === 'entry 40', 'the oldest pages fall away first');

// saved pages are vetted on the way back in
ok(acceptLog(null).length === 0 && acceptLog('rot').length === 0, 'garbage reads as a blank book');
const round = acceptLog(JSON.parse(JSON.stringify(book)));
ok(round.length === LOG_CAP && round[0].x === book[0].x
  && round[round.length - 1].w === book[book.length - 1].w, 'a saved book round-trips whole');
const dirty = [{ d: 1, w: 'First watch', p: '0\u00b000\u2032N 0\u00b000\u2032E', x: 'good' },
  { d: 'one', w: 5, p: null, x: 'bad' }, null, 42];
ok(acceptLog(dirty).length === 1 && acceptLog(dirty)[0].x === 'good',
  'malformed pages are torn out, good ones kept');

if (failed) { console.error(`verify-shiplog: ${failed} FAILED`); process.exit(1); }
console.log('verify-shiplog: OK — watches on the bells, positions in minutes, book capped, saves vetted');
