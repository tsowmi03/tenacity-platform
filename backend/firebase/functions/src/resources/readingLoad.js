"use strict";

// RES-89. How much a student can be asked to read in a sitting.
//
// The assumptions, by year level:
//  - careful reading speed: 120 words a minute up to Year 6, 150 in Years 7-8,
//    180 in Years 9-10 and 200 in Years 11-12;
//  - a 60-minute paper gives one text at most 300, 450, 600 or 800 words for
//    those year groups, scaled with the sitting time;
//  - the first reading of all the texts together takes at most 12% of the
//    sitting, leaving the time for rereading, planning and writing.
// A text is a prose passage or speech. Poems are short and are never cut.

const READING_SHARE = 0.12;

function bandFor(year) {
  const y = Number(year);
  if (y <= 6) return { wordsPerMinute: 120, textWords: 300 };
  if (y <= 8) return { wordsPerMinute: 150, textWords: 450 };
  if (y <= 10) return { wordsPerMinute: 180, textWords: 600 };
  return { wordsPerMinute: 200, textWords: 800 };
}

function readingBudget({ year, minutes = null } = {}) {
  const band = bandFor(year);
  const scale = minutes ? Math.min(1.25, Math.max(0.6, minutes / 60)) : 1;
  return {
    wordsPerMinute: band.wordsPerMinute,
    perTextWords: Math.round((band.textWords * scale) / 10) * 10,
    totalWords: minutes ? Math.round(band.wordsPerMinute * minutes * READING_SHARE) : null,
  };
}

// The most words one of `textCount` texts may run to.
function textWordLimit(budget, textCount = 1) {
  if (!budget) return null;
  const count = Math.max(1, Number(textCount) || 1);
  return budget.totalWords ? Math.min(budget.perTextWords, Math.floor(budget.totalWords / count)) : budget.perTextWords;
}

module.exports = { READING_SHARE, readingBudget, textWordLimit };
