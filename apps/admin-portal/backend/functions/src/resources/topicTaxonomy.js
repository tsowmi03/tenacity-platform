"use strict";

/**
 * Controlled topic vocabulary for the resource suggestion system.
 *
 * Free-text AI tags are inconsistent ("logs" vs "logarithms" vs "log
 * functions"), and Firestore `array-contains` is an exact string match. To make
 * topic matching reliable we:
 *  1. Give the AI a canonical list of topic names to choose from (injected into
 *     the system prompt by promptBuilder.js).
 *  2. Normalise every stored and queried topic through the same alias map, so
 *     even when the AI or a tutor drifts from the canonical wording the value
 *     collapses back to a single canonical string.
 *
 * Maths topics follow the NSW Mathematics K-10 syllabus across Stage 3
 * (Years 5-6), Stage 4 (Years 7-8) and Stage 5 (Years 9-10). English uses a
 * skills/forms vocabulary; specific text titles (e.g. "macbeth") are NOT listed
 * here — they are stored as normalised free text (lowercased) alongside the
 * canonical skills.
 *
 * NOTE: This list is a pragmatic starting point and should be reviewed against
 * the current NSW syllabus before wide rollout.
 */

const MATHS_TOPICS = Object.freeze([
  // Number & algebra
  "whole numbers",
  "fractions",
  "decimals",
  "percentages",
  "ratios and rates",
  "integers",
  "indices",
  "surds",
  "scientific notation",
  "financial mathematics",
  "algebraic techniques",
  "equations",
  "inequalities",
  "linear relationships",
  "simultaneous equations",
  "quadratic equations",
  "polynomials",
  "logarithms",
  "functions",
  "coordinate geometry",
  "graphs of functions",
  // Measurement & geometry
  "length and perimeter",
  "area",
  "surface area",
  "volume",
  "time",
  "angles",
  "triangles",
  "quadrilaterals",
  "polygons",
  "congruence",
  "similarity",
  "pythagoras' theorem",
  "trigonometry",
  "circle geometry",
  "transformations",
  // Statistics & probability
  "data collection and representation",
  "data analysis",
  "measures of location and spread",
  "probability",
]);

const ENGLISH_SKILLS = Object.freeze([
  "reading comprehension",
  "close reading",
  "annotation",
  "textual analysis",
  "language techniques",
  "persuasive writing",
  "narrative writing",
  "creative writing",
  "imaginative writing",
  "discursive writing",
  "analytical writing",
  "essay writing",
  "poetry analysis",
  "visual literacy",
  "characterisation",
  "theme",
  "context",
  "grammar",
  "punctuation",
  "spelling",
  "vocabulary",
  "text structure",
  "speech writing",
  "comparative study",
]);

/**
 * Alias map: common abbreviations and variant spellings a tutor (or the AI)
 * might use, mapped to the canonical topic string. Keys are matched after the
 * input is lowercased and trimmed. Extend freely — this is the cheapest place
 * to improve match rate.
 */
const TOPIC_ALIASES = Object.freeze({
  // Maths
  trig: "trigonometry",
  trigonometric: "trigonometry",
  quads: "quadratic equations",
  quadratic: "quadratic equations",
  quadratics: "quadratic equations",
  parabolas: "quadratic equations",
  logs: "logarithms",
  logarithm: "logarithms",
  "log functions": "logarithms",
  pythagoras: "pythagoras' theorem",
  "pythagoras theorem": "pythagoras' theorem",
  "pythagorean theorem": "pythagoras' theorem",
  algebra: "algebraic techniques",
  "algebraic expressions": "algebraic techniques",
  "sim equations": "simultaneous equations",
  simultaneous: "simultaneous equations",
  stats: "statistics",
  statistics: "data analysis",
  prob: "probability",
  probabilities: "probability",
  index: "indices",
  "index laws": "indices",
  percentage: "percentages",
  fraction: "fractions",
  decimal: "decimals",
  ratio: "ratios and rates",
  rates: "ratios and rates",
  perimeter: "length and perimeter",
  length: "length and perimeter",
  areas: "area",
  volumes: "volume",
  "linear equations": "linear relationships",
  linear: "linear relationships",
  circles: "circle geometry",
  "coordinate plane": "coordinate geometry",
  cartesian: "coordinate geometry",
  // English
  persuasive: "persuasive writing",
  persuasion: "persuasive writing",
  narrative: "narrative writing",
  creative: "creative writing",
  imaginative: "imaginative writing",
  discursive: "discursive writing",
  analytical: "analytical writing",
  essay: "essay writing",
  essays: "essay writing",
  poetry: "poetry analysis",
  poems: "poetry analysis",
  comprehension: "reading comprehension",
  techniques: "language techniques",
  "literary techniques": "language techniques",
  "language features": "language techniques",
  character: "characterisation",
  themes: "theme",
});

const CANONICAL_TOPIC_SET = new Set([...MATHS_TOPICS, ...ENGLISH_SKILLS]);

function canonicalTopicsForSubject(subject) {
  return String(subject || "").toLowerCase() === "english"
    ? ENGLISH_SKILLS
    : MATHS_TOPICS;
}

/**
 * Render the canonical topic list for injection into a system prompt.
 */
function canonicalTopicList(subject) {
  return canonicalTopicsForSubject(subject).join(", ");
}

/**
 * Normalise a single raw topic string to its canonical form.
 *  - lowercases and collapses whitespace
 *  - resolves through the alias map
 * Returns "" for empty/non-string input. Strings that are neither canonical nor
 * aliased (e.g. text titles like "macbeth") are returned lowercased as-is, so
 * free-text titles still match each other.
 */
function normaliseTopic(raw) {
  if (typeof raw !== "string") return "";
  const cleaned = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!cleaned) return "";
  return TOPIC_ALIASES[cleaned] || cleaned;
}

/**
 * Normalise an array of raw topics: drop empties, resolve aliases, dedupe,
 * preserve first-seen order. Caps the result to avoid pathological documents.
 */
function normaliseTopics(values, { limit = 25 } = {}) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const topic = normaliseTopic(value);
    if (!topic || seen.has(topic)) continue;
    seen.add(topic);
    result.push(topic);
    if (result.length >= limit) break;
  }
  return result;
}

function isCanonicalTopic(topic) {
  return CANONICAL_TOPIC_SET.has(normaliseTopic(topic));
}

module.exports = {
  CANONICAL_TOPIC_SET,
  ENGLISH_SKILLS,
  MATHS_TOPICS,
  TOPIC_ALIASES,
  canonicalTopicList,
  canonicalTopicsForSubject,
  isCanonicalTopic,
  normaliseTopic,
  normaliseTopics,
};
