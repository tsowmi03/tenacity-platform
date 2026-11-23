"use strict";

// RES-102. What the question banks hold, summarised once a week so the
// resource assistant can say what's well covered without counting thousands
// of documents on every chat turn. The weekly bank job
// (scripts/questionBankWeekly.js) writes the summary; the assistant reads it.
//
// Maths: live bank questions by category (questionBank/taxonomy.js) and school
// year. English: live stimuli by text type, and how many a Years 5-6 student
// may be given (englishBank/search.js has the year rule).

const { DIAGRAM_TYPES } = require("../questionBank/taxonomy");
const { STIMULUS_TYPES } = require("../englishBank/taxonomy");
const { usableForYear } = require("../englishBank/search");

const COVERAGE_COLLECTION = "resourceCapabilities";
const COVERAGE_DOC_ID = "bankCoverage";
const MATHS_COLLECTION = "questionBank";
const ENGLISH_COLLECTION = "englishStimuli";
const CACHE_MS = 10 * 60 * 1000;

function summariseMathsQuestions(rows) {
  const byCategory = {};
  let total = 0;
  for (const row of rows) {
    if (row?.status !== "live") continue;
    const category = DIAGRAM_TYPES[row.diagramType] ? row.diagramType : "other";
    const entry = byCategory[category] || (byCategory[category] = { total: 0, byYear: {} });
    entry.total += 1;
    total += 1;
    for (const year of Array.isArray(row.years) ? row.years : []) {
      if (!Number.isInteger(year)) continue;
      entry.byYear[year] = (entry.byYear[year] || 0) + 1;
    }
  }
  return { total, byCategory };
}

function summariseEnglishStimuli(rows) {
  const byType = {};
  let total = 0;
  for (const row of rows) {
    if (row?.status !== "live") continue;
    const type = STIMULUS_TYPES[row.type] ? row.type : "other";
    const entry = byType[type] || (byType[type] = { total: 0, primaryUsable: 0 });
    entry.total += 1;
    total += 1;
    // Year 5 stands in for "a Years 5-6 student".
    if (usableForYear(row, 5)) entry.primaryUsable += 1;
  }
  return { total, byType };
}

async function buildBankCoverage(db) {
  const [maths, english] = await Promise.all([
    db.collection(MATHS_COLLECTION).select("status", "diagramType", "years").get(),
    db.collection(ENGLISH_COLLECTION).select("status", "type", "years").get(),
  ]);
  return {
    maths: summariseMathsQuestions(maths.docs.map((doc) => doc.data())),
    english: summariseEnglishStimuli(english.docs.map((doc) => doc.data())),
  };
}

async function writeBankCoverage(db, coverage, { serverTimestamp }) {
  await db.collection(COVERAGE_COLLECTION).doc(COVERAGE_DOC_ID).set({
    ...coverage,
    updatedAt: serverTimestamp(),
  });
}

let cached = null;

/** The latest summary, or null if the weekly job hasn't written one yet. */
async function loadBankCoverage(db, { now = Date.now() } = {}) {
  if (cached && now - cached.at < CACHE_MS) return cached.value;
  const snap = await db.collection(COVERAGE_COLLECTION).doc(COVERAGE_DOC_ID).get();
  const value = snap.exists ? snap.data() : null;
  cached = { at: now, value };
  return value;
}

function resetBankCoverageCache() {
  cached = null;
}

function matchesTopic(text, topic) {
  if (!topic) return true;
  const words = String(topic).toLowerCase().split(/[^a-z0-9']+/).filter((word) => word.length > 2);
  const haystack = String(text).toLowerCase();
  return !words.length || words.some((word) => haystack.includes(word));
}

/**
 * The coverage a tool call asked for, as plain lines the model can read.
 * Categories with no questions for the year are left out.
 */
function describeCoverage(coverage, { subject, year = null, topic = "" } = {}) {
  if (!coverage) {
    return "Bank coverage hasn't been summarised yet. Don't quote numbers; the generator still writes original questions on any curriculum topic.";
  }
  if (subject === "english") {
    const english = coverage.english || { total: 0, byType: {} };
    const primary = Number.isInteger(year) && year <= 6;
    const lines = Object.entries(english.byType)
      .map(([type, entry]) => ({ type, count: primary ? entry.primaryUsable : entry.total }))
      .filter((row) => row.count > 0 && matchesTopic(`${row.type} ${STIMULUS_TYPES[row.type]?.covers || ""}`, topic))
      .sort((a, b) => b.count - a.count)
      .map((row) => `- ${row.type.replace(/_/g, " ")} (${STIMULUS_TYPES[row.type]?.covers || "other"}): ${row.count}`);
    return [
      `English bank stimuli${primary ? " a Years 5-6 student may be given" : ""}: ${lines.length ? "" : "none match."}`,
      ...lines,
    ].join("\n");
  }
  const maths = coverage.maths || { total: 0, byCategory: {} };
  const lines = Object.entries(maths.byCategory)
    .map(([category, entry]) => ({
      category,
      count: Number.isInteger(year) ? entry.byYear?.[year] || 0 : entry.total,
      covers: DIAGRAM_TYPES[category]?.covers || "other questions",
    }))
    .filter((row) => row.count > 0 && matchesTopic(`${row.category} ${row.covers}`, topic))
    .sort((a, b) => b.count - a.count)
    .map((row) => `- ${row.covers}: ${row.count}`);
  return [
    `Maths bank questions with diagrams${Number.isInteger(year) ? ` for Year ${year}` : ""}${topic ? ` matching "${topic}"` : ""}: ${lines.length ? "" : "none match."}`,
    ...lines,
    "The bank only holds questions with diagrams. Any topic without bank questions is still written from scratch.",
  ].join("\n");
}

module.exports = {
  COVERAGE_COLLECTION,
  COVERAGE_DOC_ID,
  buildBankCoverage,
  describeCoverage,
  loadBankCoverage,
  resetBankCoverageCache,
  summariseEnglishStimuli,
  summariseMathsQuestions,
  writeBankCoverage,
};
