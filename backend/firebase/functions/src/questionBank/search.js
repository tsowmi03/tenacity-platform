"use strict";

// RES-59. Finding questions in the bank: each live question carries an OpenAI
// embedding of what it asks, and a search ranks the questions that pass the
// tutor's filters by how close they are to a free-text brief.
//
// Firestore pre-filters only on status and diagram type (the two vector
// indexes in firestore.indexes.json); the remaining filters run on the nearest
// candidates, so a narrow filter is given more candidates to choose from.

// Same as extraction.QUESTIONS_COLLECTION; extraction requires this module.
const QUESTIONS_COLLECTION = "questionBank";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 512;
const MAX_CANDIDATES = 1000; // Firestore's findNearest limit

// Fields a search returns. The embedding itself is left out.
const RESULT_FIELDS = [
  "status", "sourceId", "sourcePath", "pageNumber", "kind", "label", "diagramType", "diagramTypes", "skill",
  "description", "context", "steps", "difficulty", "topic", "yearLevel", "years", "stem", "text", "figures", "sources",
];

const STAGE_YEARS = { 1: [1, 2], 2: [3, 4], 3: [5, 6], 4: [7, 8], 5: [9, 10], 6: [11, 12] };

function yearsIn(text) {
  if (!text) return [];
  const years = new Set();
  const add = (from, to = from) => {
    for (let year = from; year <= to && year <= 12; year += 1) if (year >= 1) years.add(year);
  };
  for (const match of String(text).matchAll(/\b(?:years?|yrs?)\s*(\d{1,2})(?:\s*(?:-|–|\/|and|&|to)\s*(\d{1,2}))?(?!\d)/gi)) {
    const from = Number(match[1]);
    add(from, match[2] ? Number(match[2]) : from);
  }
  for (const match of String(text).matchAll(/\bstage\s*([1-6])(?:\.\d)?\b/gi)) add(...STAGE_YEARS[match[1]]);
  if (!years.size && /\b(hsc|preliminary|extension\s*[12]|ext\s*[12]|mathematics (advanced|standard))\b/i.test(text)) add(11, 12);
  return [...years].sort((a, b) => a - b);
}

/**
 * The school years a question is for, as numbers, so a search for Year 9
 * finds "Year 9", "Years 9-10" and "Stage 5.2" alike. The model's year level
 * comes first; the file path fills in when it gives none.
 */
function yearsOf(yearLevel, sourcePath) {
  const fromLevel = yearsIn(yearLevel);
  if (fromLevel.length) return fromLevel;
  const mathletics = /\/Mathletics\/(\d{2})\//i.exec(sourcePath || "");
  if (mathletics) return yearsIn(`Year ${Number(mathletics[1])}`);
  return yearsIn(sourcePath);
}

/** The text a question is embedded from: what it asks, in words a tutor's brief would use. */
function embeddingText(question) {
  return [
    question.topic,
    question.description,
    `${question.diagramType} / ${question.skill}`,
    question.stem,
    question.text,
    ...(question.figures || []).map((figure) => figure.description),
  ]
    .filter((part) => typeof part === "string" && part.trim())
    .join("\n");
}

/** Whether a question passes every filter that was given. Hidden and merged questions never do. */
function matchesFilters(question, filters = {}) {
  if (question.status !== "live") return false;
  const oneOf = (value, wanted) => wanted === undefined || wanted === null || (Array.isArray(wanted) ? wanted.includes(value) : value === wanted);
  if (!oneOf(question.diagramType, filters.diagramType)) return false;
  if (!oneOf(question.skill, filters.skill)) return false;
  if (!oneOf(question.context, filters.context)) return false;
  if (!oneOf(question.steps, filters.steps)) return false;
  if (!oneOf(question.difficulty, filters.difficulty)) return false;
  if (!oneOf(question.kind, filters.kind)) return false;
  if (filters.years?.length && !(question.years || []).some((year) => filters.years.includes(year))) return false;
  if (filters.excludeIds?.length && filters.excludeIds.includes(question.id)) return false;
  return true;
}

function narrowFilterCount(filters) {
  return ["skill", "context", "steps", "difficulty", "kind", "years"].filter((key) => {
    const value = filters[key];
    return value !== undefined && value !== null && !(Array.isArray(value) && !value.length);
  }).length;
}

/** Turns texts into vectors with OpenAI, in order, 100 at a time. */
function createEmbedder({ client, model = EMBEDDING_MODEL, dimensions = EMBEDDING_DIMENSIONS, batchSize = 100 }) {
  return async function embed(texts) {
    const vectors = [];
    let tokens = 0;
    for (let start = 0; start < texts.length; start += batchSize) {
      const input = texts.slice(start, start + batchSize);
      const response = await client.embeddings.create({ model, input, dimensions });
      const ordered = [...response.data].sort((a, b) => a.index - b.index);
      if (ordered.length !== input.length) throw new Error(`Expected ${input.length} embeddings, got ${ordered.length}`);
      vectors.push(...ordered.map((item) => item.embedding));
      tokens += response.usage?.total_tokens || 0;
    }
    embed.tokens = (embed.tokens || 0) + tokens;
    return vectors;
  };
}

/**
 * Questions that pass the filters, nearest to the brief first. Without a brief
 * the filters alone decide, in no particular order.
 *
 * filters: diagramType, skill, context, steps, difficulty, kind (a value or a
 * list), years (any overlap), excludeIds.
 */
async function searchQuestions({ db, embed, brief, filters = {}, limit = 20, candidates }) {
  let query = db.collection(QUESTIONS_COLLECTION).where("status", "==", "live");
  if (typeof filters.diagramType === "string") query = query.where("diagramType", "==", filters.diagramType);
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
    const question = { id: doc.id };
    for (const field of RESULT_FIELDS) if (data[field] !== undefined) question[field] = data[field];
    if (typeof data.distance === "number") question.distance = data.distance;
    if (matchesFilters(question, filters)) results.push(question);
    if (results.length >= limit) break;
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
  searchQuestions,
  yearsOf,
};
