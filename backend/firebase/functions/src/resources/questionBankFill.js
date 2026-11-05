"use strict";

// RES-60 / RES-71. Every maths diagram comes from the question bank (RES-54)
// first; a drawn diagram is the fallback.
//
// Runs after the questions are written and before any diagram is drawn. Every
// question or part that asks for a diagram is a slot:
//
//   1. search: the bank questions nearest the generated question, for the
//      student's year and the difficulty its position calls for (saved, so a
//      later worker does not search again);
//   2. choose and solve: the model sees up to three candidate crops, picks one
//      whose diagram fits and is complete, and either restates the original
//      question or (about a third of the time) asks a new question about the
//      same diagram, then solves it;
//   3. check: a second, independent solve must agree with that answer.
//
// A slot that finds no passing match keeps its generated question and its
// diagram is drawn as before. The job records every slot's outcome. Anything
// that goes wrong on a slot leaves it to be drawn, so the bank can never fail
// a resource.

const { createHash } = require("crypto");
const { searchQuestions, createEmbedder } = require("../questionBank/search");
const { pngSize, SOURCE_IMAGE } = require("./sourceImages");

// Older clients still send a mode. RES-71 made every maths job bank-first, so
// the value is accepted and ignored.
const QUESTION_BANK_MODES = Object.freeze(["none", "some", "mostly", "first"]);
const BANK_FIRST = "first";
const NEW_ASK_EVERY = 3; // every third bank question asks something new about its diagram
const CANDIDATES = 4;
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

const SYSTEM_PROMPT = "You choose, adapt and solve questions from NSW school maths textbooks for a tutor's worksheet. Each question is shown with its original printed diagram. Put expressions and equations in LaTeX between $...$ (for example $V = \\pi r^2 h$). Write single numbers and units as plain text, with square and cubic units as cm², m³ and so on, never cm^2 or $^2$. Separate lines of working with line breaks. Answers state units and follow the rounding the question asks for.";

const CHOOSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["choice", "reason", "stem", "options", "answer", "workingOut"],
  properties: {
    choice: { type: "integer" },
    reason: { type: "string" },
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

const CHECK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "agrees", "note"],
  properties: { answer: { type: "string" }, agrees: { type: "boolean" }, note: { type: "string" } },
};

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

  const hasAnswers = Boolean(parsed?.answers);
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

/** Questions get harder through a resource: first third easy, then medium, then hard. */
function difficultyAt(index, total) {
  if (total < 3) return null;
  const position = index / total;
  return position < 1 / 3 ? "easy" : position < 2 / 3 ? "medium" : "hard";
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

function choosePrompt({ job, topic, slot, candidates, askNew }) {
  const marks = slotMarks(slot);
  const multipleChoice = slot.owner.type === "multiple-choice";
  const listing = candidates
    .map((candidate, index) => [
      `Candidate ${index + 1} (image ${index + 1}): ${candidate.sourcePath} p${candidate.pageNumber} ${candidate.label || ""}`.trim(),
      candidate.stem ? `Instruction: ${candidate.stem}` : null,
      candidate.text ? `Question: ${candidate.text}` : null,
      `What it asks: ${candidate.description}`,
    ].filter(Boolean).join("\n"))
    .join("\n\n");
  const task = askNew
    ? "Write one NEW question about the chosen diagram that tests the same skill as the question above but differs from the diagram's original question (for example a different unknown, or working backwards from the answer), using only measurements and labels printed on the diagram."
    : "Restate the chosen original question as a single standalone question, keeping its wording and any rounding instruction (\"Find the area of each shape.\" becomes \"Find the area of this shape.\").";
  const shape = slot.kind === "whole"
    ? " The question above has parts; write the replacement as one question (it may ask for more than one thing) worth the same total marks."
    : "";
  const format = multipleChoice
    ? " It is multiple choice: give exactly four options as plain text without letters, one of them correct and the others plausible mistakes, and give the correct option's text as the answer."
    : " Leave options empty.";
  return `A Year ${job.year} maths resource on "${topic}" has this question, worth ${marks} mark(s):
${slotQuestionText(slot)}

Replace it with a question built on one of these original textbook diagrams. The images follow in candidate order.

${listing}

Choose a candidate only if a question on its diagram tests the same skill as the question above: the same quantity found in the same way (the area of a triangle is not the volume of a prism, and a perimeter is not an area). It must also suit Year ${job.year} and be complete: every label, measurement and marking the question needs is visible, and nothing from a neighbouring question is in the crop. Return choice 0 if no candidate meets all of this; a near miss is worse than keeping the original question. With choice 0, leave the other fields empty.

${task}${shape}${format} The stem must not describe the diagram, because the student sees it. Pitch it at ${marks} mark(s). Solve it from the diagram with clear working.`;
}

function checkPrompt({ stem, options, answer }) {
  return `Solve this question from its diagram independently, then say whether the proposed answer is correct: the same value and units, within the rounding the question asks for. If the diagram does not give enough information to answer it, it is not correct.

Question: ${stem}${options?.length ? `\nOptions: ${options.join(" | ")}` : ""}

Proposed answer: ${answer}`;
}

// A plain, independent solve. Measured 2026-11-05: a version that showed the
// model the earlier answers and the checker's note was refused
// ("reasoning_extraction") 8 times in 8; this wording went through 8 in 8.
function resolvePrompt({ stem, options }) {
  return `Solve this question from its diagram, checking each calculation and the rounding the question asks for. Give the final answer with units, and clear working.${options?.length ? " It is multiple choice: the answer is the correct option's text." : ""}

Question: ${stem}${options?.length ? `\nOptions: ${options.join(" | ")}` : ""}`;
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

async function mapLimited(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  }));
  return results;
}

// The fields of a search hit a later worker needs to rebuild the same prompt.
function savedCandidate(q) {
  return { id: q.id, sourcePath: q.sourcePath || "", pageNumber: q.pageNumber ?? null, label: q.label || "", stem: q.stem || "", text: q.text || "", description: q.description || "", figures: (q.figures || []).map((f) => ({ storagePath: f.storagePath })) };
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

  const embedText = embed || (openaiApiKey ? createEmbedder({ client: new (require("openai").default)({ apiKey: openaiApiKey }) }) : null);
  if (!embedText) {
    result.skipped.push(...slots.map((slot) => ({ ...slotWhere(slot), reason: "bank_unavailable" })));
    return result;
  }
  const topic = parsed.topic || (Array.isArray(parsed.topics) ? parsed.topics.join(", ") : "") || parsed.title || "maths";
  const deadline = now() + budgetMs;

  // Searches run one after another so no two slots are offered the same
  // question, and are saved so a later worker carries on where this one ended.
  const store = searchStore({ bucket, job, slots, topic });
  const saved = await store.load();
  const searched = saved.searched || {};
  const used = new Set(Object.values(searched).flatMap((entry) => (entry.candidates || []).map((c) => c.id)));
  let searchedNew = false;
  const plans = [];
  for (const [index, slot] of slots.entries()) {
    const slotKey = searchKey(slot);
    let entry = searched[slotKey];
    if (!entry) {
      if (now() >= deadline) { result.skipped.push({ ...slotWhere(slot), reason: "out_of_time" }); continue; }
      // The question and the diagram it needs lead; the resource's topic list
      // ("area, surface area and volume") otherwise outweighs a 2D question
      // and returns 3D candidates.
      const diagramType = slot.owner.diagramType || slot.owner.diagram?.type || "";
      const brief = `${slotQuestionText(slot)}${diagramType ? `\nDiagram: ${diagramType}` : ""}\nTopic: ${topic}`;
      const base = { years: [job.year], excludeIds: [...used] };
      // A Firestore call once hung for 328 s on production (2026-11-05); every
      // search is bounded by the step's budget and its own cap.
      const search = async (filters) => {
        const out = await withDeadline(searchQuestions({ db, embed: embedText, brief, filters, limit: CANDIDATES * 2 }), Math.min(deadline, now() + SEARCH_TIMEOUT_MS));
        if (out?.timedOut) throw new Error("search timed out");
        return out;
      };
      try {
        let candidates = await search({ ...base, difficulty: difficultyAt(index, slots.length) });
        if (candidates.length < CANDIDATES) {
          const more = await search(base);
          candidates = [...candidates, ...more.filter((q) => !candidates.some((c) => c.id === q.id))];
        }
        candidates = candidates.filter((q) => (q.figures || []).length === 1 && q.figures[0].storagePath).slice(0, CANDIDATES).map(savedCandidate);
        entry = { candidates };
        searched[slotKey] = entry;
        searchedNew = true;
        candidates.forEach((q) => used.add(q.id));
      } catch (err) {
        result.skipped.push({ ...slotWhere(slot), reason: `search_failed: ${String(err?.message || err).slice(0, 120)}` });
        continue;
      }
    }
    if (entry.candidates.length) plans.push({ slot, candidates: entry.candidates, askNew: (plans.length + 1) % NEW_ASK_EVERY === 0 });
    else result.skipped.push({ ...slotWhere(slot), reason: "no_candidates" });
  }
  if (searchedNew) await store.save({ searched });

  // Each call is saved as it finishes. Bank calls run four at a time and are
  // best effort: a failed one is recorded and the slot is drawn instead.
  const call = (userMessage, schema, effort, stageLabel) =>
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

  const outcomes = await mapLimited(plans, CONCURRENCY, async (plan) => {
    const run = async () => {
      const crops = [];
      for (const candidate of plan.candidates) {
        const [png] = await bucket.file(candidate.figures[0].storagePath).download();
        crops.push(png);
      }
      const where = slotWhere(plan.slot);
      const label = `Question ${where.questionNumber}${where.partLabel ? where.partLabel : ""}`;
      const chosenOut = await call(
        [...crops.map(imageBlock), { type: "text", text: choosePrompt({ job, topic, slot: plan.slot, candidates: plan.candidates, askNew: plan.askNew }) }],
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
      const check = await call([imageBlock(png), { type: "text", text: checkPrompt({ stem, options, answer }) }], CHECK_SCHEMA, CHECK_EFFORT, `Checking the textbook question for ${label}`);
      if (check?.agrees) return { candidate: plan.candidates[pick - 1], png, stem, options, answer, workingOut: tidy(chosenOut.workingOut) };
      // The two solves disagree, most often over arithmetic in the first. A
      // good diagram is worth a third, independent solve; its answer is used
      // only if a fresh check agrees with it (two of three in agreement).
      const resolved = await call([imageBlock(png), { type: "text", text: resolvePrompt({ stem, options }) }], RESOLVE_SCHEMA, RESOLVE_EFFORT, `Re-solving the textbook question for ${label}`);
      const fixedAnswer = tidy(resolved?.answer);
      if (!fixedAnswer) return { skip: "check_disagreed", reason: check?.note };
      const recheck = await call([imageBlock(png), { type: "text", text: checkPrompt({ stem, options, answer: fixedAnswer }) }], CHECK_SCHEMA, CHECK_EFFORT, `Re-checking the textbook question for ${label}`);
      if (!recheck?.agrees) return { skip: "check_disagreed", reason: recheck?.note || check?.note };
      return { candidate: plan.candidates[pick - 1], png, stem, options, answer: fixedAnswer, workingOut: tidy(resolved.workingOut) };
    };
    try {
      if (now() >= deadline) return { skip: "out_of_time" };
      const out = await withDeadline(run(), deadline);
      return out?.timedOut ? { skip: "out_of_time" } : out;
    } catch (err) {
      if (err?.name === "AbortError" || (err?.resourceControl && err.code !== "RESOURCE_STAGE_TIMEOUT")) throw err;
      return { skip: `failed: ${String(err?.code || err?.message || err).slice(0, 120)}` };
    }
  });

  plans.forEach((plan, index) => {
    const out = outcomes[index];
    if (!out || out.skip) {
      // Firestore rejects undefined fields, so detail is added only when there is one.
      const skipped = { ...slotWhere(plan.slot), reason: out?.skip || "failed" };
      if (out?.reason) skipped.detail = String(out.reason).slice(0, 200);
      result.skipped.push(skipped);
      return;
    }
    result.answerRows.push(...applySwap(plan.slot, out));
    result.used.push({ ...slotWhere(plan.slot), questionId: out.candidate.id, kind: plan.askNew ? "new" : "original" });
  });

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
  questionBankModeFor,
};
