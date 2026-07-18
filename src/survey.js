// The running survey — pure, no THREE, no DOM. verify-survey.mjs guards it.
//
// Coast sighted inside SURVEY_R inks half-degree cells into the captain's
// survey (docs/PASSAGE.md); the next port call buys the fair copy at
// SURVEY_RATE a cell. Hydrography was honest sea income — the Admiralty
// paid real money for a well-run coastline — so "money is made at sea"
// survives, and hugging a NEW coast beats retreading the lane. The cells
// ride the save (capped); sold cells are gone from the book.

export const SURVEY_R = 1200;   // the coast must be in sight to survey it
export const SURVEY_RATE = 6;   // doubloons a cell — steady work, not plunder
export const SURVEY_CAP = 600;  // the book is finite: sell before it fills
export const SURVEY_MIN_SALE = 5; // fewer cells than this aren't worth the ink

// half-degree cells, keyed as integers so the save stays compact
export function cellOf(lat, lon) {
  return `${Math.floor(lat * 2)}:${Math.floor(lon * 2)}`;
}

// mark the cell if it's new and the book has room. Mutates cells (an array —
// it rides the save). Returns true only for fresh ink.
export function markCell(cells, lat, lon) {
  if (cells.length >= SURVEY_CAP) return false;
  const key = cellOf(lat, lon);
  if (cells.includes(key)) return false;
  cells.push(key);
  return true;
}

export function surveyValue(n) {
  return n * SURVEY_RATE;
}

// a vetted copy of a saved survey: well-formed keys only, capped
export function acceptSurvey(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((k) => typeof k === 'string' && /^-?\d+:-?\d+$/.test(k))
    .slice(0, SURVEY_CAP);
}
