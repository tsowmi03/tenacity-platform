"use strict";

// RES-60 / RES-71 / RES-80. Every maths diagram comes from the question bank
// (RES-54) first; a drawn diagram is the fallback.
//
// Runs after the questions are written and before any diagram is drawn. Every
// question or part that asks for a diagram is a slot. The generated question
// only sets the slot's broad skill ("area of composite shapes"), difficulty
// and marks; the textbook diagram decides the question (RES-80):
//
//   1. search: the bank questions nearest the slot's skill and diagram type,
//      from the student's year and the years either side, ranked by how close
//      their year and difficulty are to the slot's (RES-76). Every slot is
//      searched before any is filled, with nothing held back, and the
//      searches are saved so a later worker does not search again;
//   2. choose and write: hardest slots first, the model sees up to four crops
//      no other slot has taken or is considering, picks one that carries the
//      skill, is complete and is taught by the student's year, and writes the
//      question on it at the slot's difficulty and marks, then solves it;
//   3. check: a second, independent solve must agree with that answer.
//
// Before RES-80 the model had to find a crop testing the same skill as the
// generated question, in the same way; multi-step questions almost never
// matched, so the hardest ones were nearly always drawn.
//
// A slot that finds no passing match keeps its generated question and its
// diagram is drawn as before. The job records every slot's outcome. Anything
// that goes wrong on a slot leaves it to be drawn, so the bank can never fail
// a resource.

const { createHash } = require("crypto");
const { searchQuestions, createEmbedder } = require("../questionBank/search");
const { pngSize, SOURCE_IMAGE } = require("./sourceImages");
const { sameAnswer } = require("../questionBank/answerKeys");
const { systemFlag } = require("../questionBank/review");
const { noteProgress } = require("./progressModel");

// Older clients still send a mode. RES-71 made every maths job bank-first, so
// the value is accepted and ignored.
const QUESTION_BANK_MODES = Object.freeze(["none", "some", "mostly", "first"]);
const BANK_FIRST = "first";
// Crops shown to the model at once.
const CANDIDATES = 4;
// Searched before ranking by year and difficulty, so a close match on level
// can outrank a slightly nearer question on wording.
const SEARCH_POOL = 16;
// Ranked crops kept per slot, so a slot whose best crops another slot took
// still has others to look at.
const POOL_KEEP = 8;
const HARDEST_FIRST = Object.freeze({ hard: 0, medium: 1, easy: 2 });
// RES-76. Year and difficulty on one scale: a hard Year 8 question sits level
// with an easy Year 9 one. Candidates more than one step away are dropped.
const DIFFICULTY_OFFSET = Object.freeze({ easy: -0.5, medium: 0, hard: 0.5 });
const MAX_LEVEL_GAP = 1;
const BRIEF_LIMIT = 1500;
const CONCURRENCY = 4;
const BANK_MODEL = "claude-sonnet-5-5";
const BANK_MAX_TOKENS = 16000;
// Measured on production (2026-11-05): at high effort one slow slot took the
// whole step to 133 s of its 150 s; medium keeps the choice and the solve
// within budget, and the independent check still guards every answer.
const CHOOSE_EFFORT = "medium";
const CHECK_EFFORT = "medium";
const SEARCH_TIMEOUT_MS = 20000;
// One worker's share of the step. Searches and calls are saved as they finish,
// so slots still running when this runs out carry on in the next worker.
const DEFAULT_BUDGET_MS = 150000;

const SYSTEM_PROMPT = "You choose, adapt and solve questions from NSW school maths textbooks for a tutor's worksheet. Each question is shown with its original printed diagram. Put expressions and equations in LaTeX between $...$ (for example $V = \\pi r^2 h$). Write single numbers and units as plain text, with square and cubic units as cm², m³ and so on, never cm^2 or $^2$. Separate lines of working with line breaks. Write the complement of a set or event as A' or (A \\cup B)', never with a bar over it, which is kept for the mean. Answers state units and follow the rounding the question asks for.";

const CHOOSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["choice", "reason", "approach", "stem", "options", "answer", "workingOut"],
  properties: {
    choice: { type: "integer" },
    reason: { type: "string" },
    // RES-76: the model decides, per question, whether the original fits as
    // printed or needs adapting to the skill and difficulty wanted.
    approach: { type: "string", enum: ["original", "adapted"] },
    stem: { type: "string" },
    // Multiple choice only; empty otherwise.
    options: { type: "array", items: { type: "string" } },
    answer: { type: "string" },
    workingOut: { type: "string" },
  },
};

const RESOLVE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "workingOut"],
  properties: { answer: { type: "string" }, workingOut: { type: "string" } },
};
// Medium, like the other bank calls: at high effort Sonnet refused the
// re-solve ("reasoning_extraction") every time it was tried (2026-11-05).
const RESOLVE_EFFORT = "medium";

const SAME_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["same"],
  properties: { same: { type: "boolean" } },
};

// RES-63: shown in the tutor copy when the book and two independent solves
// all disagree, and the book's answer is printed anyway.
const UNCONFIRMED_NOTE = "Not confirmed: two independent solves disagreed with the book's answer, which is shown. Check before use.";

const CHECK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "agrees", "note"],
  properties: { answer: { type: "string" }, agrees: { type: "boolean" }, note: { type: "string" } },
};

// RES-82: a check's answer is its whole solution. When it disagrees, its
// final answer is taken from that solution in a text-only call, to be offered
// to a second check. Asking the check itself to set out its working
// separately was refused ("reasoning_extraction") 13–17 times per booklet
// (2026-11-06).
// `answered` is false when the solution finds the question itself broken
// ("the conditions are inconsistent"). A second check once agreed with such a
// verdict, and the broken question went into a booklet with it as its answer.
const FINAL_ANSWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answered", "answer"],
  properties: { answered: { type: "boolean" }, answer: { type: "string" } },
};
const FINAL_ANSWER_EFFORT = "low";

// Where a node's questions sit, and how its answers are addressed. A topic
// booklet restarts numbering in each sub-topic and quiz section, so its answer
// rows carry the sub-topic or section they belong to.
const QUESTION_LISTS = new Set(["questions", "practiceQuestions"]);

function wantsDiagram(node) {
  if (node.diagram && typeof node.diagram === "object") return node.diagram.type !== SOURCE_IMAGE;
  return typeof node.diagramType === "string" && node.diagramType !== "none";
}

function answerRowsFor(parsed, group) {
  const answers = parsed?.answers;
  if (Array.isArray(answers)) return group ? null : answers;
  if (!answers || typeof answers !== "object" || !group) return null;
  const rows = answers[group.answersKey];
  return Array.isArray(rows) ? rows : null;
}

function hasAnswerRows(answers) {
  if (Array.isArray(answers)) return answers.length > 0;
  return Boolean(answers && typeof answers === "object" && Object.values(answers).some((rows) => Array.isArray(rows) && rows.length));
}

function rowsMatching(rows, { number, partLabel, group }) {
  const label = (value) => String(value || "").replace(/[()]/g, "");
  return rows.filter((row) => row?.questionNumber === number &&
    (partLabel === undefined || label(row.partLabel) === label(partLabel)) &&
    (!group || row[group.field] === group.value));
}

/**
 * Every question or part that asks for a diagram, with what a swap must
 * change: the question (and, for a question whose parts share its diagram,
 * all of those parts) and the answer rows that go with it. Slots that cannot
 * be swapped safely are returned in `ineligible` with the reason, so the job
 * can say why their diagram was drawn.
 */
function bankSlots(parsed) {
  const owners = [];
  const walk = (node, context) => {
    if (Array.isArray(node)) return node.forEach((child) => walk(child, context));
    if (!node || typeof node !== "object") return;
    if (context.list && Number.isInteger(node.number)) {
      if (wantsDiagram(node)) owners.push({ node, number: node.number, group: context.group, kind: Array.isArray(node.parts) && node.parts.length ? "whole" : "question" });
      for (const part of Array.isArray(node.parts) ? node.parts : []) {
        if (part && typeof part === "object" && wantsDiagram(part)) owners.push({ node: part, parent: node, number: node.number, partLabel: part.label, group: context.group, kind: "part" });
      }
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === "answers" || key === "diagram" || key === "markingGuide") continue;
      if (key === "subTopics" && Array.isArray(value)) {
        value.forEach((topic) => walk(topic, { list: false, group: { field: "subTopicTitle", value: topic?.title, answersKey: "subTopicAnswers" } }));
      } else if (key === "endQuiz" && value && typeof value === "object") {
        (value.sections || []).forEach((section) => walk(section, { list: false, group: { field: "section", value: section?.title, answersKey: "endQuizAnswers" } }));
      } else {
        walk(value, { list: QUESTION_LISTS.has(key), group: context.group });
      }
    }
  };
  walk(parsed, { list: false, group: null });

  // RES-109. A resource made with no answers still carries an empty answer
  // list. Counting that as answers sent every slot looking for a row that
  // could never exist, so no-answers resources never used the bank.
  const hasAnswers = hasAnswerRows(parsed?.answers);
  const slots = [];
  const ineligible = [];
  // A booklet's sub-topic and quiz section can share a title; their answers
  // live in different lists, so the list is part of the key.
  const keyOf = (owner) => [owner.group?.answersKey || "", owner.group?.value || "", owner.number, owner.partLabel || ""].join("|");
  const counts = new Map();
  for (const owner of owners) counts.set(keyOf(owner), (counts.get(keyOf(owner)) || 0) + 1);
  for (const owner of owners) {
    const where = slotWhere(owner);
    if (counts.get(keyOf(owner)) > 1) { ineligible.push({ ...where, reason: "ambiguous_number" }); continue; }
    let answerRows = [];
    if (hasAnswers) {
      const rows = answerRowsFor(parsed, owner.group);
      if (!rows) { ineligible.push({ ...where, reason: "answer_row_unclear" }); continue; }
      answerRows = owner.kind === "whole"
        ? rowsMatching(rows, { number: owner.number, group: owner.group })
        : rowsMatching(rows, { number: owner.number, partLabel: owner.kind === "part" ? owner.partLabel : null, group: owner.group });
      if (owner.kind !== "whole" && answerRows.length !== 1) { ineligible.push({ ...where, reason: "answer_row_unclear" }); continue; }
      if (owner.kind === "whole" && !answerRows.length) { ineligible.push({ ...where, reason: "answer_row_unclear" }); continue; }
    }
    slots.push({ ...owner, owner: owner.node, answerRows, answers: hasAnswers ? answerRowsFor(parsed, owner.group) : null });
  }
  return { slots, ineligible };
}

// A booklet's sub-topic and quiz section can share a title and number; the
// answer list they belong to keeps their saved searches apart.
function searchKey(slot) {
  return JSON.stringify({ ...slotWhere(slot), list: slot.group?.answersKey || null });
}

function slotWhere(slot) {
  const where = { questionNumber: slot.number };
  if (slot.partLabel) where.partLabel = String(slot.partLabel);
  if (slot.group?.value) where.section = String(slot.group.value);
  return where;
}

/**
 * Only for questions the generator left without a difficulty: assume they get
 * harder through the resource, first third easy, then medium, then hard.
 */
function difficultyAt(index, total) {
  if (total < 3) return null;
  const position = index / total;
  return position < 1 / 3 ? "easy" : position < 2 / 3 ? "medium" : "hard";
}

const isDifficulty = (value) => Object.prototype.hasOwnProperty.call(DIFFICULTY_OFFSET, value);

/**
 * The difficulty a slot asks for: the generator's label on the question or
 * part (RES-76), then its parent question's, then its position as a fallback.
 */
function slotDifficulty(slot, index, total) {
  if (isDifficulty(slot.owner?.difficulty)) return slot.owner.difficulty;
  if (isDifficulty(slot.parent?.difficulty)) return slot.parent.difficulty;
  return difficultyAt(index, total);
}

/**
 * How far a bank question is from what a slot wants, on one scale of year and
 * difficulty. A question tagged with several years counts at the one nearest
 * the student's; one without a difficulty counts as medium.
 */
function levelGap(question, year, difficulty) {
  const years = (question.years || []).filter((y) => Math.abs(y - year) <= 1);
  if (!years.length) return Infinity;
  const nearest = years.reduce((best, y) => (Math.abs(y - year) < Math.abs(best - year) ? y : best));
  const level = nearest + (DIFFICULTY_OFFSET[question.difficulty] ?? 0);
  const target = year + (DIFFICULTY_OFFSET[difficulty] ?? 0);
  return Math.abs(level - target);
}

/**
 * Candidates ranked by level first, in half-step bands, and by closeness of
 * wording within a band (search order), dropping any more than a step away.
 */
function rankByLevel(questions, year, difficulty) {
  return questions
    .map((question, rank) => ({ question, rank, gap: levelGap(question, year, difficulty) }))
    .filter((entry) => entry.gap <= MAX_LEVEL_GAP)
    .sort((a, b) => a.gap - b.gap || a.rank - b.rank)
    .map((entry) => ({ ...entry.question, levelGap: entry.gap }));
}

function candidateYear(question, year) {
  const years = (question.years || []).filter((y) => Math.abs(y - year) <= 1);
  return years.includes(year) ? year : years[0] ?? null;
}

/** Every maths resource is bank-first (RES-71); other subjects have no bank. */
function questionBankModeFor(job) {
  return job?.subject === "maths" ? BANK_FIRST : "none";
}

function imageBlock(png) {
  return { type: "image", source: { type: "base64", media_type: "image/png", data: png.toString("base64") } };
}

// Some answers come back with escaped line breaks ("\\n" as text). Turn those
// into real ones without touching LaTeX commands such as \neq.
function tidy(text) {
  return typeof text === "string" ? text.replace(/\\n(?![a-z])/g, "\n").trim() : text;
}

function slotMarks(slot) {
  if (slot.kind !== "whole") return slot.owner.marks;
  const parts = (slot.owner.parts || []).reduce((sum, part) => sum + (Number(part?.marks) || 0), 0);
  return Number(slot.owner.marks) || parts || 1;
}

function slotQuestionText(slot) {
  if (slot.kind === "part") return `${slot.parent?.stem ? `${slot.parent.stem}\n` : ""}(${slot.partLabel}) ${slot.owner.stem}`;
  if (slot.kind === "whole") return [slot.owner.stem, ...(slot.owner.parts || []).map((part) => `(${part.label}) ${part.stem}`)].join("\n");
  return slot.owner.stem;
}

/**
 * A crop's printed question: the parts of one textbook question ("Exercise 8G
 * Q4a", "Q4d") share a page and a number, and usually a scenario. Once one is
 * used the others are not, so a resource never asks the same thing twice.
 */
function questionFamily(candidate) {
  const number = String(candidate.label || "").match(/\d+/)?.[0] ?? candidate.label ?? candidate.id;
  return `${candidate.sourcePath}|${candidate.pageNumber}|${number}`;
}

/**
 * The broad skill a slot tests (RES-80): the generator's label on the part or
 * question, then the parent question's. Empty for questions written before the
 * field existed; those search on the question itself.
 */
function slotSkill(slot) {
  const clean = (value) => (typeof value === "string" ? value.trim() : "");
  return clean(slot.owner?.skill) || clean(slot.parent?.skill);
}

function choosePrompt({ job, topic, slot, candidates, difficulty }) {
  const marks = slotMarks(slot);
  const multipleChoice = slot.owner.type === "multiple-choice";
  const skill = slotSkill(slot);
  const listing = candidates
    .map((candidate, index) => [
      `Candidate ${index + 1} (image ${index + 1}): ${candidate.sourcePath} p${candidate.pageNumber} ${candidate.label || ""}`.trim(),
      candidate.stem ? `Instruction: ${candidate.stem}` : null,
      candidate.text ? `Question: ${candidate.text}` : null,
      `What it asks: ${candidate.description}`,
      candidate.year || candidate.difficulty ? `Printed for: ${[candidate.year ? `Year ${candidate.year}` : null, candidate.difficulty].filter(Boolean).join(", ")}` : null,
    ].filter(Boolean).join("\n"))
    .join("\n\n");
  const brief = typeof job.customPrompt === "string" && job.customPrompt.trim()
    ? `\n\nThe tutor asked for: "${job.customPrompt.trim().slice(0, BRIEF_LIMIT)}"`
    : "";
  const level = difficulty ? `${difficulty} for a Year ${job.year} student` : `suitable for a Year ${job.year} student`;
  // Without a skill (a question written before RES-80) the question itself is
  // the only statement of what the slot tests.
  const wanted = skill ? `testing ${skill}` : "testing the same skill as the question below";
  const replaced = skill ? "" : `\n\nThe question it replaces:\n${slotQuestionText(slot)}`;
  const task = `Then write the question. Set approach to "original" and restate the textbook question as a single standalone question, keeping its wording and any rounding instruction ("Find the area of each shape." becomes "Find the area of this shape."), when it already fits the skill, the difficulty and the marks. Otherwise set approach to "adapted" and write one question about the diagram that does: for example a different unknown, working backwards from the answer, a real-world context, or extra steps such as a cost or a unit conversion to make it harder, using only the measurements and labels printed on the diagram. It may ask for more than one thing.`;
  const format = multipleChoice
    ? " It is multiple choice: give exactly four options as plain text without letters, one of them correct and the others plausible mistakes, and give the correct option's text as the answer."
    : " Leave options empty.";
  return `A Year ${job.year} maths resource on "${topic}" needs a question ${wanted}, ${level}, worth ${marks} mark(s).${brief}${replaced}

Write it on one of these original textbook diagrams. The images follow in candidate order.

${listing}

Choose the candidate whose diagram best carries that question. The question must stay on that skill and the resource's topic: extra steps may add a context, a cost, a unit conversion or working backwards, but must not bring in a different topic (no algebra, circles or trigonometry unless the skill or the topic calls for them). It must refer only to the diagram, never to a table, row or other question on the textbook page. Its content must be taught by Year ${job.year}: a diagram printed for the year above is fine only if a Year ${job.year} student has learned what the question needs. The diagram must be complete: every label, measurement and marking the question needs is visible, and nothing from a neighbouring question is in the crop. Return choice 0 only if no candidate can carry such a question; with choice 0, leave the other fields empty.

${task}${format} The stem must not describe the diagram, because the student sees it. Pitch it at ${marks} mark(s). Solve it from the diagram with clear working.`;
}

// It shows only the question and one proposed answer. Measured 2026-11-05: a
// version that also showed earlier answers and a checker's note was refused
// ("reasoning_extraction") 8 times in 8.
function checkPrompt({ stem, options, answer }) {
  return `Solve this question from its diagram independently, then say whether the proposed answer is correct: the same value and units, within the rounding the question asks for. If the diagram does not give enough information to answer it, it is not correct.

Question: ${stem}${options?.length ? `\nOptions: ${options.join(" | ")}` : ""}

Proposed answer: ${answer}`;
}

// A plain, independent solve, used against a book's printed answer (RES-63).
// Measured 2026-11-05: a version that showed the model the earlier answers and
// the checker's note was refused ("reasoning_extraction") 8 times in 8; this
// wording went through 8 in 8.
function resolvePrompt({ stem, options }) {
  return `Solve this question from its diagram, checking each calculation and the rounding the question asks for. Give the final answer with units, and clear working.${options?.length ? " It is multiple choice: the answer is the correct option's text." : ""}

Question: ${stem}${options?.length ? `\nOptions: ${options.join(" | ")}` : ""}`;
}

// Text only: no diagram, and nothing to solve or judge.
function finalAnswerPrompt({ stem, options, solution }) {
  return `Here is a maths question and a worked solution to it. Set answered to true only if the solution reaches a definite value for every part of the question; set it to false if the solution says the question cannot be answered, has no valid value, is inconsistent or lacks information. Then write only the solution's final answer: the value with units, every part of the question answered${options?.length ? ", or for multiple choice the correct option's text" : ""}. Do not change it, even if you would have answered differently.

Question: ${stem}${options?.length ? `\nOptions: ${options.join(" | ")}` : ""}

Solution: ${solution}`;
}

async function withDeadline(promise, deadline) {
  let timer;
  const remaining = Math.max(0, deadline - Date.now());
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => { timer = setTimeout(() => resolve({ timedOut: true }), remaining); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// The fields of a search hit a later worker needs to rebuild the same prompt.
function savedCandidate(q, year) {
  const saved = { id: q.id, sourcePath: q.sourcePath || "", pageNumber: q.pageNumber ?? null, label: q.label || "", stem: q.stem || "", text: q.text || "", description: q.description || "", year: candidateYear(q, year), difficulty: q.difficulty || null, figures: (q.figures || []).map((f) => ({ storagePath: f.storagePath })) };
  if (q.bookAnswer?.answer) saved.bookAnswer = { answer: String(q.bookAnswer.answer) };
  return saved;
}

/**
 * Searches are saved per resource (RES-71), so the workers that carry a job
 * on after a hand-off reuse them instead of searching every slot again.
 */
function searchStore({ bucket, job, slots, topic }) {
  if (!bucket || !job?.jobId) return { load: async () => ({}), save: async () => {} };
  const key = createHash("sha256").update(JSON.stringify([job.year, topic, slots.map((slot) => [searchKey(slot), slotQuestionText(slot)])])).digest("hex").slice(0, 32);
  const file = bucket.file(`resources/checkpoints/${job.jobId}/bank-search-${key}.json`);
  return {
    load: async () => {
      try { const [bytes] = await file.download(); return JSON.parse(bytes.toString("utf8")) || {}; }
      catch { return {}; }
    },
    save: async (value) => {
      try { await file.save(JSON.stringify(value), { resumable: false, metadata: { contentType: "application/json" } }); }
      catch { /* a lost save only costs a repeat search */ }
    },
  };
}

function applySwap(slot, out) {
  const { width, height } = pngSize(out.png);
  const owner = slot.owner;
  owner.stem = out.stem;
  owner.options = owner.type === "multiple-choice" && out.options?.length >= 2 ? out.options : null;
  if (owner.type === "multiple-choice" && !owner.options) owner.type = "short-answer";
  owner.diagram = { type: SOURCE_IMAGE, image: out.png, width, height, storagePath: out.candidate.figures[0].storagePath, questionBankId: out.candidate.id };
  delete owner.diagramType;
  owner.diagramRequired = true;
  if (slot.kind === "whole") {
    owner.marks = slotMarks(slot);
    owner.parts = null;
  }
  const rows = [];
  if (slot.answers && slot.answerRows.length) {
    const first = slot.answerRows[0];
    if (slot.kind === "whole") {
      const index = slot.answers.indexOf(first);
      for (const row of slot.answerRows.slice(1)) slot.answers.splice(slot.answers.indexOf(row), 1);
      const merged = { ...first, partLabel: null, answer: out.answer };
      // The merged row stands for every part, so it carries the question's
      // total marks; a mark scheme prints them (practice papers do).
      if ("marks" in first) merged.marks = owner.marks;
      if (typeof first.workingOut === "string") merged.workingOut = out.workingOut || first.workingOut;
      slot.answers[index] = merged;
      rows.push(merged);
    } else {
      first.answer = out.answer;
      if (typeof first.workingOut === "string") first.workingOut = out.workingOut || first.workingOut;
      rows.push(first);
    }
  }
  return rows;
}

/**
 * Swaps diagram questions in `parsed` for bank questions, in place. Returns
 * what was used and why every other slot keeps a drawn diagram, for the job
 * record (RES-61 flags against it), and the answer rows the bank wrote, which
 * the answer checker must leave alone: it cannot see the crop.
 */
async function applyQuestionBank({
  job,
  parsed,
  db,
  bucket,
  callAi,
  embed,
  openaiApiKey,
  providerBudget,
  anthropicApiKey,
  signal,
  logger = console,
  budgetMs = DEFAULT_BUDGET_MS,
  now = Date.now,
}) {
  const mode = questionBankModeFor(job);
  const result = { mode, slots: 0, used: [], skipped: [], answerRows: [] };
  if (mode === "none") return result;

  const { slots, ineligible } = bankSlots(parsed);
  result.slots = slots.length;
  result.skipped.push(...ineligible);
  if (!slots.length || !db || !bucket || !callAi) {
    if (slots.length) result.skipped.push(...slots.map((slot) => ({ ...slotWhere(slot), reason: "bank_unavailable" })));
    return result;
  }

  const defaultEmbed = openaiApiKey && !embed
    ? createEmbedder({ client: new (require("openai").default)({ apiKey: openaiApiKey, ...(providerBudget ? { maxRetries: 0 } : {}) }) })
    : null;
  const embedText = embed || (defaultEmbed && providerBudget
    ? (text) => providerBudget.run("openai", () => defaultEmbed(text))
    : defaultEmbed);
  if (!embedText) {
    result.skipped.push(...slots.map((slot) => ({ ...slotWhere(slot), reason: "bank_unavailable" })));
    return result;
  }
  const topic = parsed.topic || (Array.isArray(parsed.topics) ? parsed.topics.join(", ") : "") || parsed.title || "maths";
  const deadline = now() + budgetMs;

  // Every slot is searched before any is filled, and nothing is held back: a
  // crop is shared out only when a slot chooses it (below). Before RES-80 each
  // search excluded every crop already offered to an earlier slot, chosen or
  // not, which left the last (hardest) slots with the weakest crops. Searches
  // are saved so a later worker carries on where this one ended.
  const store = searchStore({ bucket, job, slots, topic });
  const saved = await store.load();
  const searched = saved.searched || {};
  let searchedNew = false;
  const plans = [];
  for (const [index, slot] of slots.entries()) {
    const slotKey = searchKey(slot);
    let entry = searched[slotKey];
    if (!entry) {
      if (now() >= deadline) { result.skipped.push({ ...slotWhere(slot), reason: "out_of_time" }); continue; }
      // The skill and the diagram it needs lead; the resource's topic list
      // ("area, surface area and volume") otherwise outweighs a 2D question
      // and returns 3D candidates. A question written without a skill searches
      // on its own wording, as before RES-80.
      const diagramType = slot.owner.diagramType || slot.owner.diagram?.type || "";
      const brief = `${slotSkill(slot) || slotQuestionText(slot)}${diagramType ? `\nDiagram: ${diagramType}` : ""}\nTopic: ${topic}`;
      // RES-76: the years either side too, ranked below by year and difficulty.
      const filters = { years: [job.year - 1, job.year, job.year + 1] };
      const difficulty = slotDifficulty(slot, index, slots.length);
      // A Firestore call once hung for 328 s on production (2026-11-05); every
      // search is bounded by the step's budget and its own cap.
      try {
        const found = await withDeadline(searchQuestions({ db, embed: embedText, brief, filters, limit: SEARCH_POOL }), Math.min(deadline, now() + SEARCH_TIMEOUT_MS));
        if (found?.timedOut) throw new Error("search timed out");
        const withOneDiagram = found.filter((q) => (q.figures || []).length === 1 && q.figures[0].storagePath);
        const candidates = rankByLevel(withOneDiagram, job.year, difficulty)
          .slice(0, POOL_KEEP)
          .map((q) => savedCandidate(q, job.year));
        entry = { candidates, difficulty };
        searched[slotKey] = entry;
        searchedNew = true;
      } catch (err) {
        if (err?.resourceControl) {
          if (searchedNew) await store.save({ searched });
          throw err;
        }
        result.skipped.push({ ...slotWhere(slot), reason: `search_failed: ${String(err?.message || err).slice(0, 120)}` });
        continue;
      }
    }
    if (entry.candidates.length) plans.push({ slot, pool: entry.candidates, difficulty: entry.difficulty ?? slotDifficulty(slot, index, slots.length) });
    else result.skipped.push({ ...slotWhere(slot), reason: "no_candidates" });
  }
  if (searchedNew) await store.save({ searched });

  // Each call is saved as it finishes. Bank calls run four at a time and are
  // best effort: a failed one is recorded and the slot is drawn instead.
  const request = (userMessage, schema, effort, stageLabel) =>
    callAi({
      model: BANK_MODEL,
      anthropicApiKey,
      maxTokens: BANK_MAX_TOKENS,
      effort,
      systemPrompt: SYSTEM_PROMPT,
      userMessage,
      signal,
      responseSchema: schema,
      mathBearing: true,
      bestEffort: true,
      concurrent: true,
      stageLabel,
      progressPhase: "diagrams",
    }).then(({ parsed: out }) => out);
  // Measured 2026-11-06: Sonnet refused 0–3 bank calls per resource
  // ("reasoning_extraction"), at random; the same prompt usually goes through
  // the second time. One retry, then the slot is drawn.
  const call = async (...args) => {
    try {
      return await request(...args);
    } catch (err) {
      if (err?.refusal !== true) throw err;
      logger.info?.("[resource] question bank call refused, retrying once", { jobId: job.jobId, stage: args[3] });
      return request(...args);
    }
  };

  // Hardest slots first: they have the fewest crops that can carry them.
  // Slots are filled in waves of four, each shown its best crops that no slot
  // in an earlier wave kept; a crop a slot looked at but did not keep stays
  // free. Slots in one wave may choose the same crop: the harder (earlier)
  // keeps it and the others try again in the next wave without it, up to one
  // try per slot in a wave, since each wave settles at least one of them. The
  // waves are worked out the same way on every worker, so a worker that
  // carries a job on replays the saved calls instead of making new ones.
  // RES-84. The progress bar counts settled diagram questions: slots with no
  // candidate settle now, the rest as their wave finishes.
  const settledEarly = slots.length - plans.length;
  noteProgress(job, { diagramCount: slots.length, diagramsDone: settledEarly });
  const queue = plans
    .map((plan, index) => ({ plan, index, tries: 0 }))
    .sort((a, b) => (HARDEST_FIRST[a.plan.difficulty] ?? 1) - (HARDEST_FIRST[b.plan.difficulty] ?? 1) || a.index - b.index);
  const chosen = new Set();
  const outcomes = new Array(plans.length);
  while (queue.length) {
    const wave = queue.splice(0, CONCURRENCY);
    for (const entry of wave) {
      entry.tries += 1;
      entry.plan.candidates = entry.plan.pool.filter((c) => !chosen.has(questionFamily(c))).slice(0, CANDIDATES);
    }
    // A capacity yield in one slot must not leave sibling provider calls
    // running after the worker releases its claim.
    const settled = await Promise.allSettled(wave.map(({ plan }) => fillSlot(plan)));
    const failed = settled.find((entry) => entry.status === "rejected");
    if (failed) throw failed.reason;
    const results = settled.map((entry) => entry.value);
    const again = [];
    wave.forEach((entry, i) => {
      const out = results[i];
      if (out?.candidate && chosen.has(questionFamily(out.candidate))) {
        if (entry.tries < CONCURRENCY) { again.push(entry); return; }
        outcomes[entry.index] = { skip: "crop_taken" };
        return;
      }
      outcomes[entry.index] = out;
      if (out?.candidate) chosen.add(questionFamily(out.candidate));
    });
    queue.unshift(...again);
    noteProgress(job, { diagramsDone: settledEarly + outcomes.filter(Boolean).length });
  }

  async function fillSlot(plan) {
    if (!plan.candidates.length) return { skip: "no_candidates" };
    const run = async () => {
      const crops = [];
      for (const candidate of plan.candidates) {
        const [png] = await bucket.file(candidate.figures[0].storagePath).download();
        crops.push(png);
      }
      const where = slotWhere(plan.slot);
      const label = `Question ${where.questionNumber}${where.partLabel ? where.partLabel : ""}`;
      const chosenOut = await call(
        [...crops.map(imageBlock), { type: "text", text: choosePrompt({ job, topic, slot: plan.slot, candidates: plan.candidates, difficulty: plan.difficulty }) }],
        CHOOSE_SCHEMA,
        CHOOSE_EFFORT,
        `Finding a textbook diagram for ${label}`
      );
      const pick = Number(chosenOut?.choice);
      if (!Number.isInteger(pick) || pick < 1 || pick > plan.candidates.length || !chosenOut.stem || !chosenOut.answer) {
        return { skip: "none_suitable", reason: chosenOut?.reason };
      }
      const stem = tidy(chosenOut.stem);
      const answer = tidy(chosenOut.answer);
      const options = Array.isArray(chosenOut.options) ? chosenOut.options.map(tidy).filter(Boolean) : [];
      const png = crops[pick - 1];
      const candidate = plan.candidates[pick - 1];
      // RES-63: the book's printed answer settles a question restated as
      // printed; an adapted question has no book answer and is checked below.
      const book = chosenOut.approach !== "adapted" ? tidy(candidate.bookAnswer?.answer) : null;
      if (book) return settleWithBook({ candidate, png, stem, options, book, first: { answer, workingOut: tidy(chosenOut.workingOut) }, label });
      const check = await call([imageBlock(png), { type: "text", text: checkPrompt({ stem, options, answer }) }], CHECK_SCHEMA, CHECK_EFFORT, `Checking the textbook question for ${label}`);
      const approach = chosenOut.approach === "adapted" ? "adapted" : "original";
      if (check?.agrees) return { candidate: plan.candidates[pick - 1], png, stem, options, answer, approach, workingOut: tidy(chosenOut.workingOut) };
      // The writer and the check disagree. Reviewed 2026-11-06 (RES-82): in
      // 19 of 20 such questions the check was right and the writer's
      // arithmetic wrong, and a fresh third solve repeated the writer's kind
      // of slip. So the check's own answer is offered to a second,
      // independent check, and used only if that agrees: two independent
      // solves in agreement, as before. The check's solution is the working.
      const solution = tidy(check?.answer);
      if (!solution) return { skip: "check_disagreed", reason: check?.note };
      const final = await call([{ type: "text", text: finalAnswerPrompt({ stem, options, solution }) }], FINAL_ANSWER_SCHEMA, FINAL_ANSWER_EFFORT, `Reading the check's answer for ${label}`);
      const checkAnswer = tidy(final?.answer);
      if (final?.answered !== true || !checkAnswer) return { skip: "check_disagreed", reason: check?.note };
      const recheck = await call([imageBlock(png), { type: "text", text: checkPrompt({ stem, options, answer: checkAnswer }) }], CHECK_SCHEMA, CHECK_EFFORT, `Re-checking the textbook question for ${label}`);
      if (!recheck?.agrees) return { skip: "check_disagreed", reason: recheck?.note || check?.note };
      return { candidate: plan.candidates[pick - 1], png, stem, options, answer: checkAnswer, approach, workingOut: solution };
    };
    // RES-63. The book's printed answer against independent solves:
    //   1. the first solve agrees with the book: the book's answer, that working;
    //   2. otherwise a second, independent solve:
    //      - agrees with the book: the book's answer, the second working;
    //      - agrees with the first: the solves win and the book is flagged;
    //   3. all three disagree: the book's answer, its working marked
    //      unconfirmed, and the question flagged.
    const agree = async (a, b, stem) => {
      const quick = sameAnswer(a, b);
      if (quick !== null) return quick;
      const out = await call([{ type: "text", text: `Question: ${stem}\n\nAnswer A: ${a}\nAnswer B: ${b}\n\nDo A and B give the same answer (allowing for equivalent forms and the rounding the question asks for)?` }], SAME_SCHEMA, CHECK_EFFORT, "Comparing with the book's answer");
      return Boolean(out?.same);
    };
    const settleWithBook = async ({ candidate, png, stem, options, book, first, label }) => {
      const base = { candidate, png, stem, options, approach: "original" };
      if (await agree(first.answer, book, stem)) return { ...base, answer: book, workingOut: first.workingOut, answerSource: "book" };
      const second = await call([imageBlock(png), { type: "text", text: resolvePrompt({ stem, options }) }], RESOLVE_SCHEMA, RESOLVE_EFFORT, `Re-solving the textbook question for ${label}`);
      const secondAnswer = tidy(second?.answer);
      const secondWorking = tidy(second?.workingOut);
      if (secondAnswer && await agree(secondAnswer, book, stem)) return { ...base, answer: book, workingOut: secondWorking, answerSource: "book" };
      if (secondAnswer && await agree(secondAnswer, first.answer, stem)) {
        return { ...base, answer: first.answer, workingOut: first.workingOut, answerSource: "solves", flag: `Two independent solves gave ${first.answer}; the book's answer is ${book}. Likely a misprint or a wrong answer link.` };
      }
      return { ...base, answer: book, workingOut: [UNCONFIRMED_NOTE, secondWorking || first.workingOut].filter(Boolean).join("\n"), answerSource: "book_unconfirmed",
        flag: `The book's answer (${book}) and two independent solves (${first.answer}; ${secondAnswer || "none"}) all disagree.` };
    };
    try {
      if (now() >= deadline) return { skip: "out_of_time" };
      const out = await withDeadline(run(), deadline);
      return out?.timedOut ? { skip: "out_of_time" } : out;
    } catch (err) {
      if (err?.name === "AbortError" || (err?.resourceControl && err.code !== "RESOURCE_STAGE_TIMEOUT")) throw err;
      return { skip: `failed: ${String(err?.code || err?.message || err).slice(0, 120)}` };
    }
  }

  const flags = [];
  plans.forEach((plan, index) => {
    const out = outcomes[index];
    if (!out || out.skip) {
      // Firestore rejects undefined fields, so detail is added only when there is one.
      const skipped = { ...slotWhere(plan.slot), reason: out?.skip || "failed" };
      if (out?.reason) skipped.detail = String(out.reason).slice(0, 200);
      result.skipped.push(skipped);
      return;
    }
    const rows = applySwap(plan.slot, out);
    // Without a working column, the answer itself says it is unconfirmed.
    if (out.answerSource === "book_unconfirmed") for (const row of rows) if (typeof row.workingOut !== "string") row.answer = `${row.answer} (book's answer, not confirmed)`;
    result.answerRows.push(...rows);
    // "new" keeps the value the portal already shows as a new question on a
    // textbook diagram.
    const usedEntry = { ...slotWhere(plan.slot), questionId: out.candidate.id, kind: out.approach === "adapted" ? "new" : "original" };
    if (plan.difficulty) usedEntry.difficulty = plan.difficulty;
    if (out.candidate.year) usedEntry.questionYear = out.candidate.year;
    if (out.answerSource) usedEntry.answerSource = out.answerSource;
    result.used.push(usedEntry);
    if (out.flag) flags.push({ questionId: out.candidate.id, note: out.flag });
  });
  // A flag is best effort: losing one never fails the resource.
  await Promise.all(flags.map((f) => systemFlag({ db, questionId: f.questionId, jobId: job.jobId, note: f.note })));

  logger.info?.("[resource] question bank applied", { jobId: job.jobId, mode, slots: result.slots, used: result.used.length, skipped: result.skipped.map((s) => s.reason) });
  return result;
}

module.exports = {
  BANK_FIRST,
  BANK_MODEL,
  QUESTION_BANK_MODES,
  applyQuestionBank,
  bankSlots,
  difficultyAt,
  levelGap,
  questionBankModeFor,
  rankByLevel,
  slotDifficulty,
};
