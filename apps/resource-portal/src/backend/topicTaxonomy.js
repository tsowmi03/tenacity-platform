/**
 * Frontend mirror of the resource topic taxonomy.
 *
 * The authoritative copy lives in the Cloud Functions package at
 * backend/firebase/functions/src/resources/topicTaxonomy.js, which normalises
 * the topics
 * stored on each job. This file mirrors the same canonical lists and alias map
 * so the tutor's typed prompt can be turned into the same canonical query terms
 * on the client. Keep the two in sync when editing the vocabulary.
 */

export const MATHS_TOPICS = [
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
  "data collection and representation",
  "data analysis",
  "measures of location and spread",
  "probability",
];

export const ENGLISH_SKILLS = [
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
];

export const TOPIC_ALIASES = {
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
};

const STOPWORDS = new Set([
  "a", "an", "and", "for", "the", "with", "this", "that", "these", "those",
  "make", "create", "generate", "build", "give", "need", "want", "please",
  "year", "student", "students", "exam", "test", "paper", "worksheet",
  "resource", "questions", "question", "about", "covering", "focused", "focus",
  "include", "including", "based", "from", "into", "some", "more", "their",
]);

function canonicalTopicsForSubject(subject) {
  return String(subject || "").toLowerCase() === "english"
    ? ENGLISH_SKILLS
    : MATHS_TOPICS;
}

/**
 * Normalise a single raw topic to its canonical form: lowercase, collapse
 * whitespace, resolve aliases. Non-canonical free text (e.g. "macbeth") is
 * returned lowercased as-is so text titles still match.
 */
export function normaliseTopic(raw) {
  if (typeof raw !== "string") return "";
  const cleaned = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!cleaned) return "";
  return TOPIC_ALIASES[cleaned] || cleaned;
}

function wordRegex(term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i");
}

/**
 * Turn a tutor's free-text prompt into canonical query terms for the
 * suggestion system.
 *  - Canonical topics and aliases that appear as whole words/phrases → canonical.
 *  - For English, significant words (likely text titles like "Macbeth") are
 *    also added as free-text candidates.
 * Returns up to `limit` deduped terms (Firestore array-contains-any caps at 10).
 */
export function extractQueryTopics(text, subject, { limit = 10 } = {}) {
  const original = String(text || "");
  const lower = original.toLowerCase();
  if (!lower.trim()) return [];

  const terms = new Set();
  const isEnglish = String(subject || "").toLowerCase() === "english";

  // 1. Canonical vocabulary + aliases present in the prompt.
  const vocabulary = [
    ...canonicalTopicsForSubject(subject).map((t) => [t, t]),
    ...Object.entries(TOPIC_ALIASES),
  ];
  for (const [variant, canonical] of vocabulary) {
    if (wordRegex(variant).test(lower)) terms.add(canonical);
  }

  // 2. English text-title candidates: significant words from the prompt.
  if (isEnglish) {
    const words = lower.match(/\b[a-z][a-z'’]{3,}\b/g) || [];
    for (const word of words) {
      if (!STOPWORDS.has(word)) terms.add(word);
    }
  }

  return [...terms].slice(0, limit);
}

/**
 * Score how well a job's stored topics overlap the query terms. Used to rank
 * suggestions client-side after the Firestore array-contains-any query.
 */
export function topicOverlapScore(jobTopics, queryTopics) {
  if (!Array.isArray(jobTopics) || !queryTopics?.length) return 0;
  const wanted = new Set(queryTopics);
  let score = 0;
  for (const topic of jobTopics) {
    if (wanted.has(normaliseTopic(topic))) score += 1;
  }
  return score;
}
