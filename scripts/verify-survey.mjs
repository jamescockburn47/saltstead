// verify-survey: half-degree cells key cleanly across both hemispheres, ink
// is deduped and capped, the fair copy pays by the cell, and a saved book
// is vetted like every other save field.
import {
  cellOf, markCell, surveyValue, acceptSurvey,
  SURVEY_R, SURVEY_RATE, SURVEY_CAP, SURVEY_MIN_SALE,
} from '../src/survey.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// quantisation: half-degree cells, hemisphere-safe
ok(cellOf(50.2, -4.1) === cellOf(50.4, -4.3), 'one half-degree cell, one key');
ok(cellOf(50.2, -4.1) !== cellOf(50.7, -4.1), 'the next half-degree is new ink');
ok(cellOf(-33.9, 18.4) !== cellOf(33.9, 18.4), 'south is not north');
ok(cellOf(-0.1, -0.1) !== cellOf(0.1, 0.1), 'the equator crossing keys clean');

// dedupe + cap
{
  const book = [];
  ok(markCell(book, 50.2, -4.1), 'fresh coast is fresh ink');
  ok(!markCell(book, 50.4, -4.3), 'the same cell inks once');
  ok(book.length === 1, 'the book holds one entry for it');
  const full = [];
  for (let i = 0; i < SURVEY_CAP; i++) full.push(`${i}:0`);
  ok(!markCell(full, 80, 80) && full.length === SURVEY_CAP, 'a full book takes no more ink');
}

// the fair copy
ok(surveyValue(10) === 10 * SURVEY_RATE, 'the Admiralty pays by the cell');
ok(SURVEY_MIN_SALE > 1, 'a scrap of coast is not worth the ink');
ok(SURVEY_R > 400 && SURVEY_R < 3000, 'the coast must genuinely be in sight');

// the vetted save
{
  const good = acceptSurvey(['100:-8', '-67:359', 'junk', 42, null, '1:2:3']);
  ok(good.length === 2 && good[0] === '100:-8', 'only well-formed keys survive the load');
  ok(acceptSurvey('not an array').length === 0, 'garbage reads as a blank book');
  ok(acceptSurvey(Array.from({ length: SURVEY_CAP + 50 }, (_, i) => `${i}:0`)).length === SURVEY_CAP,
    'a bloated save is capped on the way in');
}

if (failed) { console.error(`verify-survey: ${failed} FAILED`); process.exit(1); }
console.log('verify-survey: OK — clean cells, deduped ink, capped book, honest rate, vetted load');
