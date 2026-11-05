"use strict";

// RES-77. Finding stimuli in the English bank (RES-66): each live stimulus
// carries an OpenAI embedding of what it is, and a search ranks the stimuli
// that pass the filters by how close they are to a free-text brief. Used by
// the generator (RES-78) and tutor search (RES-68).
//
// Year rule (set by Tom, 2026-11-06): a stimulus's year level doesn't limit
// who can use it. A Years 7-12 student can be given any stimulus. A Years 5-6
// student can be given any stimulus up to Year 10, so one tagged only Year 11
// or 12 is left out. A stimulus with no year can be given to anyone.
// Questions are still pitched at the student's year.
//
// Firestore pre-filters only on status and medium (the two vector indexes in
// firestore.indexes.json); the other filters run on the nearest candidates,
// so a narrow filter is given more candidates to choose from.

const { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, createEmbedder } = require("../questionBank/search");
const { GUIDES_COLLECTION, QUESTIONS_COLLECTION, STIMULI_COLLECTION } = require("./records");

const MAX_CANDIDATES = 1000; // Firestore's findNearest limit
const PRIMARY_MAX_YEAR = 6;
const PRIMARY_STIMULUS_MAX_YEAR = 10;
// Enough of a passage to say what it is about without its whole length.
const EMBED_TEXT_CHARS = 1500;
const FIRESTORE_IN_LIMIT = 30;

// Fields a search returns. The embedding itself is left out.
const RESULT_FIELDS = [
  "status", "sourceId", "sourcePath", "label", "type", "medium", "title", "author", "publication", "text", "wordCount",
  "visualDescription", "pages", "pageCrops", "techniques", "techniqueIds", "themes", "yearLevel", "years", "difficulty",
];

/** The text a stimulus is embedded from: what kind of text it is, what it's about and how it opens. */
function embeddingText(stimulus) {
  const text = typeof stimulus.text === "string" ? stimulus.text.trim() : "";
  return [
    [stimulus.type, stimulus.title, stimulus.author].filter(Boolean).join(" / "),
    stimulus.themes?.length ? `Themes: ${stimulus.themes.join(", ")}` : "",
    stimulus.techniqueIds?.length ? `Techniques: ${stimulus.techniqueIds.join(", ")}` : "",
    stimulus.visualDescription,
    text.length > EMBED_TEXT_CHARS ? `${text.slice(0, EMBED_TEXT_CHARS)}…` : text,
  ]
    .filter((part) => typeof part === "string" && part.trim())
    .join("\n");
}

/** Whether a student in this school year may be given this stimulus (see the year rule above). */
function usableForYear(stimulus, studentYear) {
  if (!Number.isFinite(studentYear) || studentYear > PRIMARY_MAX_YEAR) return true;
  const years = (stimulus.years || []).filter(Number.isFinite);
  return !years.length || years.some((year) => year <= PRIMARY_STIMULUS_MAX_YEAR);
}

const lower = (value) => String(value || "").trim().toLowerCase();

/**
 * Whether a stimulus passes every filter that was given. Hidden stimuli never do.
 *
 * filters: studentYear, medium, type (a value or a list), techniques and
 * themes (any overlap; a theme matches when either contains the other),
 * minWords, maxWords, excludeIds.
 */
function matchesFilters(stimulus, filters = {}) {
  if (stimulus.status !== "live") return false;
  const oneOf = (value, wanted) => wanted === undefined || wanted === null || (Array.isArray(wanted) ? !wanted.length || wanted.includes(value) : value === wanted);
  if (!oneOf(stimulus.medium, filters.medium)) return false;
  if (!oneOf(stimulus.type, filters.type)) return false;
  if (!usableForYear(stimulus, filters.studentYear)) return false;
  if (filters.techniques?.length && !(stimulus.techniqueIds || []).some((id) => filters.techniques.includes(id))) return false;
  if (filters.themes?.length) {
    const wanted = filters.themes.map(lower).filter(Boolean);
    const has = (stimulus.themes || []).map(lower);
    if (!has.some((theme) => wanted.some((want) => theme.includes(want) || want.includes(theme)))) return false;
  }
  // Word counts apply to written stimuli; a visual has none.
  if (stimulus.medium === "written") {
    if (Number.isFinite(filters.minWords) && !(stimulus.wordCount >= filters.minWords)) return false;
    if (Number.isFinite(filters.maxWords) && !(stimulus.wordCount <= filters.maxWords)) return false;
  }
  if (filters.excludeIds?.length && filters.excludeIds.includes(stimulus.id)) return false;
  return true;
}

function narrowFilterCount(filters) {
  const set = (value) => value !== undefined && value !== null && !(Array.isArray(value) && !value.length);
  let count = ["type", "techniques", "themes", "minWords", "maxWords"].filter((key) => set(filters[key])).length;
  // About seven in ten stimuli are Year 12 only, out of reach of Years 5-6.
  if (Number.isFinite(filters.studentYear) && filters.studentYear <= PRIMARY_MAX_YEAR) count += 2;
  return count;
}

async function inChunks(values, fetch) {
  const out = [];
  for (let start = 0; start < values.length; start += FIRESTORE_IN_LIMIT) out.push(...(await fetch(values.slice(start, start + FIRESTORE_IN_LIMIT))));
  return out;
}

/** Each stimulus's questions (by stimulus ID) and those questions' marking-guide entries. */
async function linkedRecords(db, stimulusIds) {
  const questionsByStimulus = new Map(stimulusIds.map((id) => [id, []]));
  for (const id of stimulusIds) {
    const snapshot = await db.collection(QUESTIONS_COLLECTION).where("stimulusIds", "array-contains", id).get();
    for (const doc of snapshot.docs) {
      const data = doc.data();
      if (data.status !== "live") continue;
      questionsByStimulus.get(id).push({ id: doc.id, label: data.label, text: data.text, marks: data.marks ?? null, questionType: data.questionType, skill: data.skill, techniques: data.techniques || [], pageNumber: data.pageNumber });
    }
  }
  const questionIds = [...new Set([...questionsByStimulus.values()].flat().map((question) => question.id))];
  const guides = await inChunks(questionIds, async (ids) => {
    const snapshot = await db.collection(GUIDES_COLLECTION).where("questionId", "in", ids).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((guide) => guide.status === "live");
  });
  const guidesByQuestion = new Map();
  for (const guide of guides) guidesByQuestion.set(guide.questionId, [...(guidesByQuestion.get(guide.questionId) || []), { id: guide.id, criteria: guide.criteria ?? null, sampleAnswer: guide.sampleAnswer ?? null }]);
  return { questionsByStimulus, guidesByQuestion };
}

/**
 * Stimuli that pass the filters, nearest to the brief first. Without a brief
 * the filters alone decide, in no particular order. With withLinks, each
 * result carries its questions, and each question its guide entries.
 */
async function searchStimuli({ db, embed, brief, filters = {}, limit = 20, candidates, withLinks = false }) {
  let query = db.collection(STIMULI_COLLECTION).where("status", "==", "live");
  if (typeof filters.medium === "string") query = query.where("medium", "==", filters.medium);
  const pool = Math.min(MAX_CANDIDATES, candidates || limit * 10 * (1 + narrowFilterCount(filters)));

  let docs;
  if (brief && brief.trim()) {
    const [queryVector] = await embed([brief.trim()]);
    const snapshot = await query
      .findNearest({ vectorField: "embedding", queryVector, limit: pool, distanceMeasure: "COSINE", distanceResultField: "distance" })
      .get();
    docs = snapshot.docs;
  } else {
    docs = (await query.select(...RESULT_FIELDS).limit(pool).get()).docs;
  }

  const results = [];
  for (const doc of docs) {
    const data = doc.data();
    const stimulus = { id: doc.id };
    for (const field of RESULT_FIELDS) if (data[field] !== undefined) stimulus[field] = data[field];
    if (typeof data.distance === "number") stimulus.distance = data.distance;
    if (matchesFilters(stimulus, filters)) results.push(stimulus);
    if (results.length >= limit) break;
  }

  if (withLinks && results.length) {
    const { questionsByStimulus, guidesByQuestion } = await linkedRecords(db, results.map((stimulus) => stimulus.id));
    for (const stimulus of results) {
      stimulus.questions = (questionsByStimulus.get(stimulus.id) || []).map((question) => ({ ...question, guide: guidesByQuestion.get(question.id) || [] }));
    }
  }
  return results;
}

module.exports = {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  RESULT_FIELDS,
  createEmbedder,
  embeddingText,
  matchesFilters,
  searchStimuli,
  usableForYear,
};
