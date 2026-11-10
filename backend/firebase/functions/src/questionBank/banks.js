"use strict";

// RES-104. The five kinds of record in the bank, described once so the admin
// actions in admin.js can treat them alike: which collection each lives in,
// the fields a list needs, how filters map to a query, and what an admin may
// correct.

const { yearsOf } = require("./search");
const { DIAGRAM_TYPES, skillsFor } = require("./taxonomy");
const { GUIDES_COLLECTION, QUESTIONS_COLLECTION: ENGLISH_QUESTIONS_COLLECTION, SET_TEXTS_COLLECTION, STIMULI_COLLECTION } = require("../englishBank/collections");
const { ALL_TECHNIQUES, DIFFICULTIES, QUESTION_TYPES, SKILLS, STIMULUS_TYPE_IDS, mediumOf } = require("../englishBank/taxonomy");
const { invalid, oneOf, optionalText, requiredText, text } = require("./validate");

// Same as extraction.QUESTIONS_COLLECTION; extraction loads the PDF libraries.
const MATHS_COLLECTION = "questionBank";
const SET_TEXT_FORMS = ["novel", "play", "poem", "short_story", "nonfiction", "other"];
const PREVIEW_CHARS = 240;

// Written stimuli by length, in words.
const LENGTHS = { short: [0, 299], medium: [300, 799], long: [800, Infinity] };

const preview = (value) => (value ? String(value).replace(/\s+/g, " ").trim().slice(0, PREVIEW_CHARS) : "");
const wordCount = (value) => {
  const words = String(value || "").replace(/\s+/g, " ").trim();
  return words ? words.split(" ").length : 0;
};
const nullableDifficulty = (value, field) => (value === null ? null : oneOf(value, field, DIFFICULTIES));
const marks = (value) => {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 0 || value > 100) throw invalid("marks must be a whole number from 0 to 100");
  return value;
};
const stringList = (value, field, maxItems, maxLength) => {
  if (!Array.isArray(value) || value.length > maxItems) throw invalid(`${field} must be a list of at most ${maxItems}`);
  return [...new Set(value.map((entry) => text(entry, field, maxLength)).filter(Boolean))];
};

/** Runs each field through its validator and returns what to write. */
function validated(validators, updates) {
  if (!updates || typeof updates !== "object" || Array.isArray(updates)) throw invalid("updates are required");
  const fields = {};
  for (const [field, value] of Object.entries(updates)) {
    if (!Object.hasOwn(validators, field)) throw invalid(`${field} cannot be edited`);
    fields[field] = validators[field](value, field);
  }
  if (!Object.keys(fields).length) throw invalid("updates are required");
  return fields;
}

// What an admin may correct on a maths question. The source, crop and ids stay as extracted.
const MATHS_EDITABLE = {
  stem: (v) => (v === null ? null : text(v, "stem", 4000)),
  text: (v) => text(v, "text", 4000),
  description: (v) => text(v, "description", 500),
  topic: (v) => text(v, "topic", 200),
  yearLevel: (v) => (v === null ? null : text(v, "yearLevel", 60)),
  context: (v) => oneOf(v, "context", ["abstract", "real_world"]),
  steps: (v) => oneOf(v, "steps", ["single", "multi"]),
  difficulty: (v) => oneOf(v, "difficulty", ["easy", "medium", "hard"]),
  kind: (v) => oneOf(v, "kind", ["question", "worked_example"]),
  diagramType: (v) => oneOf(v, "diagramType", Object.keys(DIAGRAM_TYPES)),
  skill: (v) => text(v, "skill", 80),
};

/** Checks an admin's edits to a maths question and returns the fields to write. */
function validateUpdates(question, updates) {
  const fields = validated(MATHS_EDITABLE, updates);
  const diagramType = fields.diagramType || question.diagramType;
  if (fields.diagramType || fields.skill) {
    const skill = fields.skill || question.skill;
    if (!skillsFor(diagramType).includes(skill)) throw invalid(`${skill} is not a skill of ${diagramType}`);
    if (fields.diagramType && !fields.skill) fields.skill = skill;
  }
  return fields;
}

/** The fields a maths edit writes: years follow the year level, because search filters on them. */
function mathsEdit(question, updates) {
  const fields = validateUpdates(question, updates);
  if (Object.hasOwn(fields, "yearLevel")) fields.years = yearsOf(fields.yearLevel, question.sourcePath);
  return fields;
}

function firstCrops(paths, max) {
  return paths.filter(Boolean).slice(0, max);
}

const BANKS = Object.freeze({
  maths: {
    collection: MATHS_COLLECTION,
    flaggable: true,
    listFields: ["status", "sourcePath", "pageNumber", "label", "stem", "text", "topic", "yearLevel", "diagramType", "skill", "difficulty", "kind", "figures"],
    summary: (q) => ({
      sourcePath: q.sourcePath || null,
      pageNumber: q.pageNumber || null,
      label: q.label || null,
      preview: preview([q.stem, q.text].filter(Boolean).join(" ")),
      topic: q.topic || "",
      yearLevel: q.yearLevel || null,
      diagramType: q.diagramType || null,
      skill: q.skill || null,
      difficulty: q.difficulty || null,
      kind: q.kind || null,
      hasImage: Boolean(q.figures?.[0]?.storagePath),
    }),
    detail: (q) => ({
      stem: q.stem || null,
      text: q.text || "",
      description: q.description || "",
      context: q.context || null,
      steps: q.steps || null,
      bookAnswer: q.bookAnswer?.answer ? String(q.bookAnswer.answer) : null,
      otherEditions: Math.max(0, (q.sources?.length || 0) - 1),
    }),
    crops: (q) => firstCrops((q.figures || []).map((figure) => figure.storagePath), 3),
    filters: (f) => ({
      clauses: [
        Number.isInteger(f.year) && ["years", "array-contains", f.year],
        f.diagramType && ["diagramType", "==", f.diagramType],
        f.skill && ["skill", "==", f.skill],
        f.difficulty && ["difficulty", "==", f.difficulty],
      ].filter(Boolean),
      keep: null,
    }),
    edit: mathsEdit,
  },

  stimuli: {
    collection: STIMULI_COLLECTION,
    listFields: ["status", "sourcePath", "pages", "label", "type", "medium", "title", "author", "publication", "text", "visualDescription", "wordCount", "techniqueIds", "themes", "yearLevel", "difficulty", "pageCrops"],
    summary: (s) => ({
      sourcePath: s.sourcePath || null,
      pageNumber: s.pages?.[0] || null,
      label: s.label || null,
      title: s.title || null,
      author: s.author || null,
      preview: preview(s.text || s.visualDescription),
      type: s.type || null,
      medium: s.medium || null,
      wordCount: s.wordCount ?? null,
      yearLevel: s.yearLevel || null,
      difficulty: s.difficulty || null,
      techniqueIds: s.techniqueIds || [],
      themes: s.themes || [],
      hasImage: s.medium === "visual" && Boolean(s.pageCrops?.[0]?.storagePath),
    }),
    detail: (s) => ({
      text: s.text || "",
      publication: s.publication || null,
      visualDescription: s.visualDescription || null,
      pages: s.pages || [],
      techniques: (s.techniques || []).map((entry) => ({ technique: entry.technique, evidence: entry.evidence })),
    }),
    crops: (s) => (s.medium === "visual" ? firstCrops((s.pageCrops || []).map((crop) => crop.storagePath), 4) : []),
    filters: (f) => {
      const year = Number.isInteger(f.year) ? ["years", "array-contains", f.year] : null;
      // Firestore allows one array-contains per query, so with a year the
      // technique is checked on the results instead.
      const techniqueClause = f.technique && !year ? ["techniqueIds", "array-contains", f.technique] : null;
      const theme = f.theme ? f.theme.toLowerCase() : "";
      const range = LENGTHS[f.length] || null;
      const memoryTechnique = f.technique && year ? f.technique : null;
      const keep = theme || range || memoryTechnique
        ? (s) => {
          if (memoryTechnique && !(s.techniqueIds || []).includes(memoryTechnique)) return false;
          if (theme && !(s.themes || []).some((entry) => String(entry).toLowerCase().includes(theme))) return false;
          if (range && !(s.medium === "written" && s.wordCount >= range[0] && s.wordCount <= range[1])) return false;
          return true;
        }
        : null;
      return { clauses: [year, f.type && ["type", "==", f.type], techniqueClause].filter(Boolean), keep };
    },
    edit: (stimulus, updates) => {
      const fields = validated({
        title: optionalAt(300),
        author: optionalAt(300),
        publication: optionalAt(300),
        text: optionalAt(100000),
        visualDescription: optionalAt(4000),
        yearLevel: optionalAt(60),
        difficulty: nullableDifficulty,
        themes: (v, f) => [...new Set(stringList(v, f, 30, 120).map((theme) => theme.toLowerCase()))],
        type: (v, f) => {
          const type = oneOf(v, f, STIMULUS_TYPE_IDS);
          if (mediumOf(type) !== stimulus.medium) throw invalid("A written stimulus cannot become a visual one, or the reverse");
          return type;
        },
      }, updates);
      if (Object.hasOwn(fields, "text")) fields.wordCount = wordCount(fields.text);
      if (Object.hasOwn(fields, "yearLevel")) fields.years = yearsOf(fields.yearLevel, stimulus.sourcePath);
      return fields;
    },
  },

  englishQuestions: {
    collection: ENGLISH_QUESTIONS_COLLECTION,
    listFields: ["status", "sourcePath", "pageNumber", "label", "text", "marks", "questionType", "skill", "techniques", "difficulty"],
    summary: (q) => ({
      sourcePath: q.sourcePath || null,
      pageNumber: q.pageNumber || null,
      label: q.label || null,
      preview: preview(q.text),
      marks: q.marks ?? null,
      questionType: q.questionType || null,
      skill: q.skill || null,
      difficulty: q.difficulty || null,
      techniques: q.techniques || [],
      hasImage: false,
    }),
    detail: (q) => ({ text: q.text || "", stimulusIds: q.stimulusIds || [] }),
    crops: () => [],
    filters: (f) => ({
      clauses: [
        f.questionType && ["questionType", "==", f.questionType],
        f.skill && ["skill", "==", f.skill],
        f.difficulty && ["difficulty", "==", f.difficulty],
        f.technique && ["techniques", "array-contains", f.technique],
      ].filter(Boolean),
      keep: null,
    }),
    edit: (_question, updates) => validated({
      text: requiredAt(8000),
      marks,
      questionType: (v, f) => oneOf(v, f, QUESTION_TYPES),
      skill: (v, f) => oneOf(v, f, SKILLS),
      difficulty: nullableDifficulty,
      techniques: (v, f) => stringList(v, f, 40, 60).map((technique) => oneOf(technique, f, ALL_TECHNIQUES)),
    }, updates),
  },

  guides: {
    collection: GUIDES_COLLECTION,
    listFields: ["status", "sourcePath", "pages", "questionLabel", "marks", "criteria", "sampleAnswer", "questionId"],
    summary: (g) => ({
      sourcePath: g.sourcePath || null,
      pageNumber: g.pages?.[0] || null,
      label: g.questionLabel || null,
      preview: preview(g.criteria || g.sampleAnswer),
      marks: g.marks ?? null,
      questionId: g.questionId || null,
      hasImage: false,
    }),
    detail: (g) => ({ criteria: g.criteria || "", sampleAnswer: g.sampleAnswer || "", pages: g.pages || [] }),
    crops: () => [],
    filters: () => ({ clauses: [], keep: null }),
    edit: (_guide, updates) => validated({ criteria: optionalAt(20000), sampleAnswer: optionalAt(40000), marks }, updates),
  },

  setTexts: {
    collection: SET_TEXTS_COLLECTION,
    listFields: ["status", "sourcePath", "title", "author", "form", "summary", "themeNames"],
    summary: (t) => ({
      sourcePath: t.sourcePath || null,
      pageNumber: null,
      label: null,
      title: t.title || null,
      author: t.author || null,
      preview: preview(t.summary),
      form: t.form || null,
      themes: t.themeNames || [],
      hasImage: false,
    }),
    detail: (t) => ({
      summary: t.summary || "",
      context: t.context || "",
      characters: (t.characters || []).map((entry) => entry.name),
      quoteCount: (t.quotes || []).length,
    }),
    crops: () => [],
    filters: (f) => ({ clauses: [f.form && ["form", "==", f.form]].filter(Boolean), keep: null }),
    edit: (_text, updates) => validated({
      title: requiredAt(300),
      author: optionalAt(300),
      form: (v, f) => oneOf(v, f, SET_TEXT_FORMS),
      summary: requiredAt(20000),
      context: optionalAt(20000),
    }, updates),
  },
});

function optionalAt(max) {
  return (value, field) => optionalText(value, field, max);
}

function requiredAt(max) {
  return (value, field) => requiredText(value, field, max);
}

const FILTER_OPTIONS = () => ({
  diagramTypes: Object.fromEntries(Object.keys(DIAGRAM_TYPES).map((type) => [type, skillsFor(type)])),
  difficulties: DIFFICULTIES,
  stimulusTypes: STIMULUS_TYPE_IDS,
  techniques: ALL_TECHNIQUES,
  questionTypes: QUESTION_TYPES,
  englishSkills: SKILLS,
  setTextForms: SET_TEXT_FORMS,
});

module.exports = { BANKS, FILTER_OPTIONS, MATHS_COLLECTION, validateUpdates, wordCount };
