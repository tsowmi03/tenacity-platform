"use strict";

// RES-49. A look at the finished resource as it prints.
//
// Every earlier check reads the resource's content. None of them sees the
// pages: a near-blank page, a diagram cut off at the page edge or printed too
// small to read, answer lines that don't fit the question, or maths that
// reached the page as raw LaTeX. So the built DOCX is converted to PDF (the
// same converter as the portal preview, pdfPreview.js) and Claude reads the
// pages against a short checklist.
//
// Each fault names a page and, where it belongs to one, a question. Faults
// with a known fix are applied to the resource data once (a diagram printed
// smaller or larger, more or fewer answer lines, lines swapped for blank
// space, flagged notation sent through the maths repair) and the document is
// rebuilt. Anything else, or a fix that can't be placed, becomes a tutor
// warning naming the page. The check never fails a resource: without a
// converter, a model or a reply, the resource is delivered as before.

const { chatModel, providerForModel, sourcePlannerModel } = require("./modelRegistry");

const VISUAL_CHECK_STAGE_ID = "visual.check.v1";
// Thinking tokens come out of this too; the fault list itself is small.
const VISUAL_CHECK_MAX_TOKENS = 8000;
// More faults than this and the document needs a person, not patching.
const MAX_FAULTS = 20;
const MAX_ANSWER_LINES = 24;
const MIN_ANSWER_LINES = 2;

const FAULT_KINDS = Object.freeze([
  "blank_page",
  "content_cut_off",
  "diagram_clipped",
  "diagram_too_large",
  "diagram_too_small",
  "diagram_missing",
  "numbering",
  "raw_markup",
  "answer_space_short",
  "answer_space_excess",
  "answer_space_wrong_kind",
]);

const VISUAL_CHECK_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["faults"],
  properties: {
    faults: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["page", "kind", "question", "excerpt", "description"],
        properties: {
          page: { type: "integer" },
          kind: { type: "string", enum: [...FAULT_KINDS] },
          question: { type: "string" },
          excerpt: { type: "string" },
          description: { type: "string" },
        },
      },
    },
  },
});

function visualCheckSystemPrompt() {
  return `You check the layout of a printed tutoring resource (a worksheet, booklet or exam paper for Australian school students). You are shown the whole document as it will print. Report only faults a tutor would have to fix by hand before handing it to a student. Do not judge the content, difficulty or correctness of questions and answers.

Report a fault only when you can see it:
- blank_page: a page that is empty or almost empty (less than about a fifth used) where the content could have continued. Never report the cover or title page, a contents page, or a page left short at the natural end of a section (before Answers, a stimulus booklet or a new section heading). For this fault, "question" is the first question on the NEXT page.

Ignore an empty Contents list or box: Word fills it in when the file is opened, so it is not a fault.
- content_cut_off: text or a table running off the page edge or overlapping other content.
- diagram_clipped: part of a diagram cut off, or a diagram overlapping text.
- diagram_too_large: a diagram so large it pushes its question onto the next page or leaves most of a page empty around it.
- diagram_too_small: a diagram whose labels, numbers or markings are too small to read when printed.
- diagram_missing: a question that refers to a diagram, graph or figure that is not shown.
- numbering: questions or parts numbered out of order, repeated or skipped.
- raw_markup: maths or formatting printed as code, such as \\frac{1}{2}, x^2, x_1, \\sqrt, \\times, $...$ or **bold** markers, instead of formatted maths or text. Answer and marking pages count too.
The three answer_space faults are about the space a student writes or draws in under a question. Answer, solution and marking pages are for the tutor: never report answer space there.
- answer_space_short: clearly too little space or too few lines for what the question asks (for example a 4-mark worked problem with two lines).
- answer_space_excess: far more space than the question needs (for example a one-word answer with a dozen lines).
- answer_space_wrong_kind: lines where the student must draw (a graph, sketch, construction or table to complete), or blank space where they must write working.

For each fault give: page (the printed page number, counting the cover as page 1), kind, question (the question it belongs to exactly as printed, such as "7" or "7(b)"; "" when it belongs to no question), excerpt (for raw_markup, the exact characters printed, copied character for character; otherwise ""), and description (one short sentence a tutor can act on).

Return {"faults": []} when the layout is fine. Do not report the same fault twice.`;
}

// The vision call goes to an Anthropic model (it reads the PDF directly): the
// live source planner when it is one, else the chat model.
function visualCheckModel() {
  for (const model of [sourcePlannerModel(), chatModel()]) {
    if (providerForModel(model) === "anthropic") return model;
  }
  return null;
}

function cleanFault(raw) {
  if (!raw || typeof raw !== "object" || !FAULT_KINDS.includes(raw.kind)) return null;
  const page = Number(raw.page);
  return {
    page: Number.isInteger(page) && page > 0 ? page : null,
    kind: raw.kind,
    question: String(raw.question || "").trim().slice(0, 40),
    excerpt: String(raw.excerpt || "").slice(0, 200),
    description: String(raw.description || "").trim().slice(0, 300),
  };
}

/**
 * Ask Claude for the layout faults in a built resource. Returns the cleaned
 * fault list. Throws when no model is available or the call fails; the
 * caller delivers without the check.
 */
async function findLayoutFaults({ pdfBuffer, job, callAi, signal, model = visualCheckModel() }) {
  if (!model) throw Object.assign(new Error("No Anthropic model available for the visual check"), { code: "VISUAL_CHECK_UNAVAILABLE" });
  if (typeof callAi !== "function") throw new TypeError("findLayoutFaults requires callAi");
  if (!Buffer.isBuffer(pdfBuffer) || !pdfBuffer.length) throw new TypeError("findLayoutFaults requires a PDF");
  const result = await callAi({
    model,
    maxTokens: VISUAL_CHECK_MAX_TOKENS,
    effort: "low",
    mathBearing: false,
    systemPrompt: visualCheckSystemPrompt(),
    messages: [{
      role: "user",
      content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBuffer.toString("base64") } },
        { type: "text", text: `Resource: ${job?.resourceType || "resource"}, ${job?.subject || ""}, Year ${job?.year || "unspecified"}.\n\nCheck every page and list the layout faults.` },
      ],
    }],
    responseSchema: VISUAL_CHECK_SCHEMA,
    signal,
    stageId: VISUAL_CHECK_STAGE_ID,
    stageLabel: "Checking the printed layout",
    progressPhase: "finish",
    bestEffort: true,
  });
  const faults = Array.isArray(result?.parsed?.faults) ? result.parsed.faults : [];
  const seen = new Set();
  return faults.map(cleanFault).filter((fault) => {
    if (!fault) return false;
    // Answer space belongs to a question; without one it is a mark scheme or
    // a misreading, and a warning would give the tutor nothing to act on.
    if (fault.kind.startsWith("answer_space") && !fault.question) return false;
    const key = `${fault.page}|${fault.kind}|${fault.question}|${fault.excerpt}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, MAX_FAULTS);
}

// "7", "Q7", "Question 7", "7(b)", "7 b", "7.b" → { number: 7, part: "b" }.
function parseQuestionRef(ref) {
  const match = /(\d+)\s*[.(\s]?\s*\(?\s*([a-z]{1,4})?\s*\)?/i.exec(String(ref || "").replace(/^\s*(?:question|q)\s*/i, ""));
  if (!match) return null;
  return { number: Number(match[1]), part: match[2] ? match[2].toLowerCase() : null };
}

const partKey = (label) => String(label || "").toLowerCase().replace(/[^a-z0-9]/g, "");

function isQuestionNode(node) {
  return Number.isFinite(node?.number) &&
    (typeof node.stem === "string" || typeof node.question === "string" || typeof node.text === "string" || Array.isArray(node.parts));
}

function questionNodes(resource) {
  const found = [];
  const walk = (node) => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== "object") return;
    if (isQuestionNode(node)) found.push(node);
    for (const [key, value] of Object.entries(node)) {
      // Answers and marking rows name questions too, but never hold one.
      if (key === "answers" || key === "diagram") continue;
      walk(value);
    }
  };
  walk(resource);
  return found;
}

/**
 * The question (and part) a fault names, or null when it names none or more
 * than one question has that number (a booklet's sub-topics restart their
 * numbering), so a fix is never applied to the wrong question.
 */
function resolveQuestion(resource, ref) {
  const parsed = parseQuestionRef(ref);
  if (!parsed) return null;
  const matches = questionNodes(resource).filter((node) => node.number === parsed.number);
  if (matches.length !== 1) return null;
  const question = matches[0];
  const part = parsed.part && Array.isArray(question.parts)
    ? question.parts.find((p) => partKey(p?.label) === parsed.part) || null
    : null;
  if (parsed.part && !part) return { question, part: null, partMissing: true };
  return { question, part };
}

// The diagram a fault is about: the part's own, else its question's.
function diagramOwner(target) {
  if (target.part?.diagram && typeof target.part.diagram === "object") return target.part;
  if (target.question?.diagram && typeof target.question.diagram === "object") return target.question;
  return null;
}

function setPrintSize(target, size) {
  const owner = target && diagramOwner(target);
  if (!owner) return false;
  const current = owner.diagram.printSize;
  // One step each way per resource: a second request means the first didn't help.
  if (current === size || (current && current !== size)) return false;
  owner.diagram.printSize = size;
  return true;
}

function currentLines(item, responseLineCount) {
  return Number.isInteger(item?.answerLines) ? item.answerLines : responseLineCount(item);
}

function scaleAnswerLines(target, direction, responseLineCount) {
  const item = target?.part || target?.question;
  if (!item || item.answerLinesAdjusted) return false;
  const before = currentLines(item, responseLineCount);
  if (direction === "more") {
    const next = Math.min(MAX_ANSWER_LINES, Math.max(before + 2, Math.ceil(before * 1.5)));
    if (next <= before) return false;
    item.answerLines = next;
  } else {
    const next = Math.max(MIN_ANSWER_LINES, Math.floor(before * 0.5));
    if (next >= before) return false;
    item.answerLines = next;
  }
  item.answerLinesAdjusted = true;
  return true;
}

function toggleAnswerSpace(target, subject) {
  if (String(subject || "").toLowerCase() !== "maths") return false;
  const item = target?.part || target?.question;
  if (!item || item.answerSpaceAdjusted) return false;
  const current = item.answerSpace || (target.part ? target.question?.answerSpace : null) || "lines";
  item.answerSpace = current === "blank" ? "lines" : "blank";
  item.answerSpaceAdjusted = true;
  return true;
}

/**
 * Apply the faults that have a fix to `resource` (mutated in place). Returns
 * { applied, unresolved, mathIssues }: mathIssues are raw-notation faults for
 * the caller's maths repair, whose result decides whether they are fixed.
 *
 * `responseLineCount` is the builder's line rule, so "more lines" starts from
 * what actually printed.
 */
function planLayoutFixes({ resource, faults, subject, responseLineCount }) {
  const applied = [];
  const unresolved = [];
  const mathIssues = [];
  const maths = String(subject || "").toLowerCase() === "maths";
  for (const fault of faults) {
    const target = fault.question ? resolveQuestion(resource, fault.question) : null;
    let fixed = false;
    switch (fault.kind) {
      case "diagram_clipped":
      case "diagram_too_large":
      case "content_cut_off":
        fixed = Boolean(target && !target.partMissing && setPrintSize(target, "smaller"));
        break;
      case "blank_page":
        // The next question's block didn't fit what was left of the page; a
        // smaller diagram lets it start there.
        fixed = Boolean(target && !target.partMissing && setPrintSize(target, "smaller"));
        break;
      case "diagram_too_small":
        fixed = Boolean(target && !target.partMissing && setPrintSize(target, "larger"));
        break;
      case "answer_space_short":
        fixed = Boolean(target && !target.partMissing && scaleAnswerLines(target, "more", responseLineCount));
        break;
      case "answer_space_excess":
        fixed = Boolean(target && !target.partMissing && scaleAnswerLines(target, "fewer", responseLineCount));
        break;
      case "answer_space_wrong_kind":
        fixed = Boolean(target && !target.partMissing && toggleAnswerSpace(target, subject));
        break;
      case "raw_markup":
        if (maths && fault.excerpt.trim()) {
          mathIssues.push({ source: fault.excerpt.trim(), location: fault.question ? `Q${fault.question}` : `page ${fault.page}`, fault });
          continue;
        }
        break;
      default:
        break;
    }
    (fixed ? applied : unresolved).push(fault);
  }
  return { applied, unresolved, mathIssues };
}

function where(fault) {
  const page = fault.page ? `Page ${fault.page}` : "The document";
  return fault.question ? `${page}, Question ${fault.question}` : page;
}

const ADVICE = {
  blank_page: "has a mostly blank page. Remove the gap before printing.",
  content_cut_off: "has content running off the page. Fix the layout before printing.",
  diagram_clipped: "has a diagram that is cut off. Resize it before printing.",
  diagram_too_large: "has a diagram that is too large for the page. Resize it before printing.",
  diagram_too_small: "has a diagram that may be too small to read. Enlarge it before printing.",
  diagram_missing: "refers to a diagram that isn't shown. Add it or reword the question before printing.",
  numbering: "has numbering out of order. Check the question numbers before printing.",
  raw_markup: "shows maths as raw code. Retype it before printing.",
  answer_space_short: "may not leave enough room to answer. Add space before printing.",
  answer_space_excess: "leaves much more room than the answer needs.",
  answer_space_wrong_kind: "has the wrong kind of answer space (lines where students draw, or blank space where they write).",
};

/** Plain-language tutor warnings for the faults left unfixed (RES-106 style). */
function layoutWarnings(faults) {
  return faults.map((fault) => {
    const detail = fault.kind === "raw_markup" && fault.excerpt ? ` (“${fault.excerpt.trim()}”)` : "";
    return {
      code: "VISUAL_LAYOUT_FAULT",
      message: `${where(fault)} ${ADVICE[fault.kind] || "has a layout problem. Check it before printing."}${detail}`,
      page: fault.page,
      kind: fault.kind,
      ...(fault.question ? { question: fault.question } : {}),
    };
  });
}

module.exports = {
  FAULT_KINDS,
  VISUAL_CHECK_SCHEMA,
  VISUAL_CHECK_STAGE_ID,
  findLayoutFaults,
  layoutWarnings,
  parseQuestionRef,
  planLayoutFixes,
  resolveQuestion,
  visualCheckModel,
  visualCheckSystemPrompt,
};
