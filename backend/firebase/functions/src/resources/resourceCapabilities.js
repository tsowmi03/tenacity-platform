"use strict";

// RES-102. What the resource generator can do, for the resource assistant.
//
// A short overview goes in every system prompt (CAPABILITIES_TOKEN_BUDGET).
// The detail is behind tools the model calls when it needs them, each read
// from the code that does the work: resource-type sections from
// builder/descriptors.js, diagram types from diagramRegistry.js, bank coverage
// from the weekly summary (bankCoverage.js), and English stimulus rules from
// the English bank. Nothing here is a hand-kept list of what the generator
// supports, so the assistant can't drift from it.

const {
  RESOURCE_TYPE_DESCRIPTORS,
  descriptorFor,
  resourceTypesForSubject,
  sectionsFor,
} = require("./builder/descriptors");
const { promptVisibleDiagramEntries } = require("./diagramRegistry");
const { describeCoverage } = require("./bankCoverage");
const { STIMULUS_TYPES } = require("../englishBank/taxonomy");

// About 1,500 tokens at roughly four characters a token.
const CAPABILITIES_TOKEN_BUDGET = 1500;
const CHARS_PER_TOKEN = 4;

const ANSWER_MODE_WORDS = {
  maths: { none: "questions only", answers: "final answers", worked: "answers with full working" },
  english: { none: "no tutor copy", answers: "a marking guide", worked: "model answers with marking criteria" },
};

function subjectName(subject) {
  return subject === "english" ? "English" : "Maths";
}

function typeLine(key) {
  const descriptor = RESOURCE_TYPE_DESCRIPTORS[key];
  return `- ${key} (${descriptor.label}): ${descriptor.purpose}`;
}

/** The capabilities overview for one subject, kept inside the token budget. */
function capabilitiesOverview(subject) {
  const answers = ANSWER_MODE_WORDS[subject] || ANSWER_MODE_WORDS.maths;
  const subjectSpecific = subject === "english"
    ? [
        "English stimulus texts:",
        "- Texts come from the English bank first (past-paper and published texts used with permission, written and visual), then public-domain literature (Wikisource and Project Gutenberg) and openly licensed images (Wikimedia Commons). The generator never invents a reading text and passes it off as real.",
        "- A text still in copyright can't be reprinted unless it's already in the English bank. The tutor can attach it as a reference, but it's read for context only, not printed.",
        "- Years 7 to 12 may be given any bank stimulus; Years 5 and 6 any up to Year 10. Questions are always pitched at the student's year.",
        "- Narrative and creative writing is never planned or marked with a thesis, ETAs or TETAL; those are for analytical writing only.",
      ]
    : [
        "Maths diagrams:",
        "- Questions can carry diagrams: real textbook diagrams from the question bank first, otherwise drawn by the generator. Drawn types cover number lines, the number plane and function graphs, statistics charts, probability (spinners, tree diagrams, Venn diagrams, two-way tables), angles and parallel lines, 2D and 3D shapes and nets, and elevation and depression.",
        "- Maths is typeset as equations. Multiple choice, short answer and calculation questions, with multi-part questions.",
      ];
  return [
    `What the generator can make for ${subjectName(subject)} (Years 5 to 10):`,
    ...resourceTypesForSubject(subject).map(typeLine),
    "",
    "Settings on the form:",
    `- Answer section (types with questions only): none (${answers.none}), answers (${answers.answers}) or worked (${answers.worked}).`,
    "- Marks beside questions: on or off. On by default for practice papers.",
    "- Reference documents (up to 5: PDFs, Word, PowerPoint, Excel, photos, scans): read for topics, style, difficulty and length. A past paper makes a practice paper mirror it.",
    "- The custom prompt (the brief) steers topic focus, difficulty, length, question styles and structure within the type.",
    "",
    ...subjectSpecific,
    "",
    "Not supported, so say so and offer the closest option:",
    "- Interactive, online or auto-marked content; audio or video; slides. Output is a Word document to print.",
    "- Years 11 and 12, or other subjects.",
    "- Diagram types outside the list from get_diagram_types; free-hand sketches the student must draw are fine as an instruction.",
    "- Reproducing a specific copyrighted textbook page or exam paper word for word.",
    "",
    "Use the tools for detail before you rely on it: get_resource_types for each type's sections, get_bank_coverage for how many bank questions or texts exist for a year and topic, get_diagram_types for the exact diagram list, get_english_stimuli for stimulus types and year rules.",
  ].join("\n");
}

function estimateTokens(text) {
  return Math.ceil(String(text || "").length / CHARS_PER_TOKEN);
}

// --- tools ------------------------------------------------------------------

const SUBJECT_PROPERTY = { type: "string", enum: ["maths", "english"] };
const YEAR_PROPERTY = { type: "integer", minimum: 5, maximum: 10, description: "The student's school year, if known." };

const LOOKUP_TOOLS = Object.freeze([
  {
    name: "get_resource_types",
    description: "Every resource type the generator makes for a subject: its purpose, typical length, the sections it prints, and whether it has questions (and so an answer section and marks). Call it before recommending a type or describing a structure.",
    input_schema: {
      type: "object",
      properties: { subject: SUBJECT_PROPERTY },
      required: ["subject"],
    },
  },
  {
    name: "get_bank_coverage",
    description: "How many question-bank items exist, by category, for a year and optional topic. Maths: textbook questions with diagrams. English: stimulus texts by type. Use it to say whether real bank material is likely for a request.",
    input_schema: {
      type: "object",
      properties: {
        subject: SUBJECT_PROPERTY,
        year: YEAR_PROPERTY,
        topic: { type: "string", description: "Words to narrow the categories, e.g. \"volume\" or \"poster\"." },
      },
      required: ["subject"],
    },
  },
  {
    name: "get_diagram_types",
    description: "The exact maths diagram types the generator can draw, grouped by family. Anything not listed can't be drawn.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_english_stimuli",
    description: "The kinds of English stimulus text the generator can use, where they come from, and which a student of a given year may be given.",
    input_schema: {
      type: "object",
      properties: { year: YEAR_PROPERTY },
    },
  },
]);

function describeResourceTypes({ subject }) {
  const chosen = subject === "english" ? "english" : "maths";
  return resourceTypesForSubject(chosen).map((key) => {
    const descriptor = descriptorFor(key);
    const sections = sectionsFor(key, chosen).map((section) => `  • ${section.label}: ${section.description}`);
    const answers = descriptor.hasQuestions
      ? "  Has questions: an answer section (none, answers or worked) and marks can be set."
      : "  No questions: no answer section or marks.";
    const tutorCopy = descriptor.tutorCopy ? "  Tutor copy: answers (maths) or a marking guide (English) at the back." : null;
    return [`${key} (${descriptor.label}): ${descriptor.purpose}`, `  Length: ${descriptor.length}`, ...sections, answers, tutorCopy]
      .filter(Boolean)
      .join("\n");
  }).join("\n\n");
}

function describeDiagramTypes() {
  const byFamily = new Map();
  for (const entry of promptVisibleDiagramEntries()) {
    if (!byFamily.has(entry.family)) byFamily.set(entry.family, []);
    byFamily.get(entry.family).push(entry.type);
  }
  return [
    "Diagram types the generator can draw (a bank textbook diagram is used first when one fits):",
    ...[...byFamily].map(([family, types]) => `- ${family}: ${types.join(", ")}`),
  ].join("\n");
}

function describeEnglishStimuli({ year } = {}) {
  const primary = Number.isInteger(year) && year <= 6;
  const written = Object.entries(STIMULUS_TYPES).filter(([, type]) => type.medium === "written");
  const visual = Object.entries(STIMULUS_TYPES).filter(([, type]) => type.medium === "visual");
  const list = (rows) => rows.map(([key, type]) => `${key.replace(/_/g, " ")} (${type.covers})`).join("; ");
  return [
    `Written stimulus types: ${list(written)}.`,
    `Visual stimulus types: ${list(visual)}.`,
    "Sources, in order: the English bank (texts used with permission, reprinted under their real credits), then public-domain poems and stories (Wikisource, Project Gutenberg), then openly licensed images (Wikimedia Commons).",
    primary
      ? "This student is in Year 5 or 6: any stimulus up to Year 10 may be used, but not one tagged only Year 11 or 12."
      : "A Years 7-12 student may be given any stimulus. Questions are pitched at the student's year.",
    "Stimulus texts are used by practice papers, topic booklets, study guides, worksheets, diagnostic tests, mixed reviews, annotation tasks and essay scaffolds.",
  ].join("\n");
}

/**
 * Runs one lookup tool. Returns the text for the tool result and a short line
 * for the portal to show under the reply ("Checked ..."), so tutors can see
 * what the assistant looked at.
 */
async function runLookupTool(name, input = {}, { loadCoverage } = {}) {
  switch (name) {
    case "get_resource_types":
      return {
        content: describeResourceTypes(input),
        activity: `Checked ${subjectName(input.subject).toLowerCase() === "english" ? "English" : "maths"} resource types`,
      };
    case "get_bank_coverage": {
      const coverage = loadCoverage ? await loadCoverage() : null;
      const year = Number.isInteger(input.year) ? input.year : null;
      return {
        content: describeCoverage(coverage, { subject: input.subject, year, topic: input.topic || "" }),
        activity: `Checked the ${input.subject === "english" ? "English" : "maths"} bank${year ? ` for Year ${year}` : ""}${input.topic ? `: ${String(input.topic).slice(0, 40)}` : ""}`,
      };
    }
    case "get_diagram_types":
      return { content: describeDiagramTypes(), activity: "Checked diagram types" };
    case "get_english_stimuli":
      return { content: describeEnglishStimuli(input), activity: "Checked English stimulus sources" };
    default:
      return { content: `Unknown tool: ${name}`, activity: null, isError: true };
  }
}

module.exports = {
  CAPABILITIES_TOKEN_BUDGET,
  LOOKUP_TOOLS,
  capabilitiesOverview,
  describeDiagramTypes,
  describeEnglishStimuli,
  describeResourceTypes,
  estimateTokens,
  runLookupTool,
};
