"use strict";

// RES-60. Puts questions from the question bank (RES-54) into a generated
// maths resource, with their original diagrams exactly as printed.
//
// Generation runs as before. Then, depending on the tutor's setting (none,
// some or mostly), some of the questions that carry a diagram are swapped for
// bank questions on the same skill:
//
//   1. search: the bank questions nearest the generated question, for the
//      student's year and the difficulty its position calls for;
//   2. choose and solve: the model sees up to three candidate crops, picks one
//      whose diagram fits and is complete, and either restates the original
//      question or (about a third of the time) asks a new question about the
//      same diagram, then solves it;
//   3. check: a second, independent solve must agree with that answer, or the
//      generated question stays.
//
// Anything that goes wrong on a slot leaves the generated question in place,
// so the bank can only ever improve a resource, never fail it.

const { searchQuestions, createEmbedder } = require("../questionBank/search");
const { pngSize, SOURCE_IMAGE } = require("./sourceImages");

const QUESTION_BANK_MODES = Object.freeze(["none", "some", "mostly"]);
const SOME_SHARE = 0.35;
const MAX_SLOTS = 8;
const NEW_ASK_EVERY = 3; // every third bank question asks something new about its diagram
const CANDIDATES = 3;
const CONCURRENCY = 4;
const BANK_MODEL = "claude-sonnet-5-5";
const BANK_MAX_TOKENS = 16000;
// The job has a fixed 540s budget and generation has already used much of it.
// Slots still running when this runs out keep their generated question.
const DEFAULT_BUDGET_MS = 150000;

const SYSTEM_PROMPT = "You choose, adapt and solve questions from NSW school maths textbooks for a tutor's worksheet. Each question is shown with its original printed diagram. Put expressions and equations in LaTeX between $...$ (for example $V = \\pi r^2 h$). Write single numbers and units as plain text, with square and cubic units as cm², m³ and so on, never cm^2 or $^2$. Separate lines of working with line breaks. Answers state units and follow the rounding the question asks for.";

const CHOOSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["choice", "reason", "stem", "answer", "workingOut"],
  properties: {
    choice: { type: "integer" },
    reason: { type: "string" },
    stem: { type: "string" },
    answer: { type: "string" },
    workingOut: { type: "string" },
  },
};

const CHECK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "agrees", "note"],
  properties: { answer: { type: "string" }, agrees: { type: "boolean" }, note: { type: "string" } },
};

/**
 * The questions a bank question could replace: a numbered question with a
 * diagram and no sub-parts, not multiple choice, whose answer row (if the
 * resource has answers) can be found unambiguously.
 */
function bankSlots(parsed) {
  const owners = [];
  const walk = (node, inQuestions) => {
    if (Array.isArray(node)) {
      node.forEach((child) => walk(child, inQuestions));
      return;
    }
    if (!node || typeof node !== "object") return;
    if (inQuestions && Number.isInteger(node.number) && node.diagram && typeof node.diagram === "object") owners.push(node);
    for (const [key, value] of Object.entries(node)) {
      if (key === "answers" || key === "diagram") continue;
      walk(value, key === "questions");
    }
  };
  walk(parsed, false);

  const counts = new Map();
  for (const owner of owners) counts.set(owner.number, (counts.get(owner.number) || 0) + 1);
  const answers = Array.isArray(parsed?.answers) ? parsed.answers : null;
  if (!answers && parsed?.answers) return []; // nested answer groups (topic booklets) restart numbering

  const slots = [];
  for (const owner of owners) {
    if (counts.get(owner.number) > 1) continue;
    if (Array.isArray(owner.parts) && owner.parts.length) continue;
    if (owner.type === "multiple-choice" || owner.diagram.type === SOURCE_IMAGE) continue;
    let answerRow = null;
    if (answers) {
      const rows = answers.filter((row) => row?.questionNumber === owner.number);
      if (rows.length !== 1 || rows[0].partLabel) continue;
      answerRow = rows[0];
    }
    slots.push({ owner, answerRow });
  }
  return slots;
}

/** Which slots to fill: none, about a third spread through the resource, or all of them. */
function pickSlots(slots, mode) {
  if (mode === "mostly") return slots.slice(0, MAX_SLOTS);
  if (mode !== "some" || !slots.length) return [];
  const count = Math.min(MAX_SLOTS, Math.max(1, Math.round(slots.length * SOME_SHARE)));
  const step = slots.length / count;
  return Array.from({ length: count }, (_, i) => slots[Math.min(slots.length - 1, Math.floor(i * step + step / 2))]);
}

/** Questions get harder through a resource: first third easy, then medium, then hard. */
function difficultyAt(index, total) {
  if (total < 3) return null;
  const position = index / total;
  return position < 1 / 3 ? "easy" : position < 2 / 3 ? "medium" : "hard";
}

function questionBankModeFor(job) {
  if (job?.subject !== "maths") return "none";
  return QUESTION_BANK_MODES.includes(job?.questionBank) ? job.questionBank : "none";
}

function imageBlock(png) {
  return { type: "image", source: { type: "base64", media_type: "image/png", data: png.toString("base64") } };
}

// Some answers come back with escaped line breaks ("\\n" as text). Turn those
// into real ones without touching LaTeX commands such as \neq.
function tidy(text) {
  return typeof text === "string" ? text.replace(/\\n(?![a-z])/g, "\n").trim() : text;
}

function choosePrompt({ job, topic, slot, candidates, askNew }) {
  const owner = slot.owner;
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
  return `A Year ${job.year} maths resource on "${topic}" has this question, worth ${owner.marks} mark(s):
${owner.stem}

Replace it with a question built on one of these original textbook diagrams. The images follow in candidate order.

${listing}

Choose a candidate only if a question on its diagram tests the same skill as the question above: the same quantity found in the same way (the area of a triangle is not the volume of a prism, and a perimeter is not an area). It must also suit Year ${job.year} and be complete: every label, measurement and marking the question needs is visible, and nothing from a neighbouring question is in the crop. Return choice 0 if no candidate meets all of this; a near miss is worse than keeping the original question. With choice 0, leave the other fields empty.

${task} The stem must not describe the diagram, because the student sees it. Pitch it at ${owner.marks} mark(s). Solve it from the diagram with clear working.`;
}

function checkPrompt({ stem, answer }) {
  return `Solve this question from its diagram independently, then say whether the proposed answer is correct: the same value and units, within the rounding the question asks for. If the diagram does not give enough information to answer it, it is not correct.

Question: ${stem}

Proposed answer: ${answer}`;
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

/**
 * Swaps some diagram questions in `parsed` for bank questions, in place.
 * Returns what was used, for the job record (RES-61 flags against it).
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
  const result = { mode, slots: 0, used: [], skipped: [] };
  if (mode === "none" || !db || !bucket || !callAi) return result;

  const slots = bankSlots(parsed);
  const chosen = pickSlots(slots, mode);
  result.slots = chosen.length;
  if (!chosen.length) return result;

  const embedText = embed || (openaiApiKey ? createEmbedder({ client: new (require("openai").default)({ apiKey: openaiApiKey }) }) : null);
  if (!embedText) return result;
  const topic = parsed.topic || (Array.isArray(parsed.topics) ? parsed.topics.join(", ") : "") || parsed.title || "maths";
  const deadline = now() + budgetMs;

  // Searches run one after another so no two slots are offered the same question.
  const used = new Set();
  const plans = [];
  for (const slot of chosen) {
    const index = slots.indexOf(slot);
    const brief = `${topic}: ${slot.owner.stem}`;
    const base = { years: [job.year], excludeIds: [...used] };
    try {
      let candidates = await searchQuestions({ db, embed: embedText, brief, filters: { ...base, difficulty: difficultyAt(index, slots.length) }, limit: CANDIDATES * 2 });
      if (candidates.length < CANDIDATES) {
        const more = await searchQuestions({ db, embed: embedText, brief, filters: base, limit: CANDIDATES * 2 });
        candidates = [...candidates, ...more.filter((q) => !candidates.some((c) => c.id === q.id))];
      }
      candidates = candidates.filter((q) => (q.figures || []).length === 1 && q.figures[0].storagePath).slice(0, CANDIDATES);
      candidates.forEach((q) => used.add(q.id));
      if (candidates.length) plans.push({ slot, candidates, askNew: (plans.length + 1) % NEW_ASK_EVERY === 0 });
      else result.skipped.push({ questionNumber: slot.owner.number, reason: "no_candidates" });
    } catch (err) {
      result.skipped.push({ questionNumber: slot.owner.number, reason: `search_failed: ${String(err?.message || err).slice(0, 120)}` });
    }
  }

  const call = (userMessage, schema, effort) =>
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
    }).then(({ parsed: out }) => out);

  const outcomes = await mapLimited(plans, CONCURRENCY, async (plan) => {
    const run = async () => {
      const crops = [];
      for (const candidate of plan.candidates) {
        const [png] = await bucket.file(candidate.figures[0].storagePath).download();
        crops.push(png);
      }
      const chosenOut = await call(
        [...crops.map(imageBlock), { type: "text", text: choosePrompt({ job, topic, slot: plan.slot, candidates: plan.candidates, askNew: plan.askNew }) }],
        CHOOSE_SCHEMA,
        "high"
      );
      const pick = Number(chosenOut?.choice);
      if (!Number.isInteger(pick) || pick < 1 || pick > plan.candidates.length || !chosenOut.stem || !chosenOut.answer) {
        return { skip: "none_suitable", reason: chosenOut?.reason };
      }
      const stem = tidy(chosenOut.stem);
      const answer = tidy(chosenOut.answer);
      const png = crops[pick - 1];
      const check = await call([imageBlock(png), { type: "text", text: checkPrompt({ stem, answer }) }], CHECK_SCHEMA, "medium");
      if (!check?.agrees) return { skip: "check_disagreed", reason: check?.note };
      return { candidate: plan.candidates[pick - 1], png, stem, answer, workingOut: tidy(chosenOut.workingOut) };
    };
    try {
      if (now() >= deadline) return { skip: "out_of_time" };
      const out = await withDeadline(run(), deadline);
      return out?.timedOut ? { skip: "out_of_time" } : out;
    } catch (err) {
      if (err?.name === "AbortError" || err?.resourceControl) throw err;
      return { skip: `failed: ${String(err?.message || err).slice(0, 120)}` };
    }
  });

  plans.forEach((plan, index) => {
    const out = outcomes[index];
    const { owner, answerRow } = plan.slot;
    if (!out || out.skip) {
      result.skipped.push({ questionNumber: owner.number, reason: out?.skip || "failed", detail: out?.reason ? String(out.reason).slice(0, 200) : undefined });
      return;
    }
    const { width, height } = pngSize(out.png);
    owner.stem = out.stem;
    owner.options = null;
    owner.diagram = { type: SOURCE_IMAGE, image: out.png, width, height, storagePath: out.candidate.figures[0].storagePath, questionBankId: out.candidate.id };
    owner.diagramRequired = true;
    if (answerRow) {
      answerRow.answer = out.answer;
      if (typeof answerRow.workingOut === "string") answerRow.workingOut = out.workingOut || answerRow.workingOut;
    }
    result.used.push({ questionNumber: owner.number, questionId: out.candidate.id, kind: plan.askNew ? "new" : "original" });
  });

  logger.info?.("[resource] question bank applied", { jobId: job.jobId, mode, slots: result.slots, used: result.used.length, skipped: result.skipped.map((s) => s.reason) });
  return result;
}

module.exports = {
  BANK_MODEL,
  QUESTION_BANK_MODES,
  applyQuestionBank,
  bankSlots,
  difficultyAt,
  pickSlots,
  questionBankModeFor,
};
