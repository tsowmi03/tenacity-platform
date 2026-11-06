"use strict";

// RES-63. The book's own answers for bank questions.
//
// Books address their answers in one of two ways:
//   - by exercise: a textbook's answer section lists "1E  5 a 12 cm  b 7 cm";
//   - by printed page: Mathletics solutions and exam revision teacher editions
//     list "Page 168  1 a 2.4".
// A bank question records its source, PDF page and printed label, so linking
// needs, for each PDF page, its printed page number and the exercise in force.
// Both come from the page's text layer, with no model call. The answers
// themselves are read from page images by Haiku, because answer pages are
// two-column layouts of fractions and sketches that a text layer scrambles.

const { buildAnthropicSystemParam, assertCompleteResponse, assertNotRefused, normaliseAnthropicUsage, parseAiJsonResponse, responseText } = require("../resources/apiClient");

const ANSWER_MODEL = "claude-haiku-5-5";
const ANSWER_EFFORT = "low";
const ANSWER_MAX_TOKENS = 32000; // dense two-column answer pages run past 16K
const ANSWERS_COLLECTION = "questionBankAnswers";

const ROMAN = "(?:viii|vii|iii|vi|iv|ix|ii|i|v|x)";

// --- labels -----------------------------------------------------------------

/**
 * A printed label as the extraction recorded it, split into what an answer key
 * is addressed by. "Exercise 7A Q2b" -> { exercise: "7A", number: 2, part: "b" };
 * "Question 12(e)(i)" -> { number: 12, part: "e.i" }; "Q4a" -> { number: 4, part: "a" }.
 * Worked examples and unnumbered labels return a null number.
 */
function parseLabel(label) {
  const text = String(label || "").trim();
  const exerciseMatch = /\b(?:exercise|ex\.?)\s*([0-9]+[A-Z]?(?:\.[0-9]+)?)\b/i.exec(text) || /^([0-9]+[A-Z])\b/.exec(text);
  const exercise = exerciseMatch ? exerciseMatch[1].toUpperCase() : null;
  if (/\bexample\b/i.test(text)) return { exercise, number: null, part: "" };
  const tail = new RegExp(`(?:\\bQ(?:uestion)?\\s*)?(\\d+)\\s*(?:\\(?([a-z])\\)?)?\\s*(?:\\(?(${ROMAN})\\)?)?\\s*$`, "i").exec(text);
  if (!tail) return { exercise, number: null, part: "" };
  // A section prefix that is not an exercise ("Pre-test", "Let's start: ...",
  // "Chapter review") repeats in every chapter, so it cannot address an answer.
  const prefix = text.slice(0, tail.index).replace(exerciseMatch ? exerciseMatch[0] : "", "").replace(/[\s:.,–-]+/g, "");
  if (/[a-z]/i.test(prefix)) return { exercise, number: null, part: "" };
  const parts = [tail[2], tail[3]].filter(Boolean).map((p) => p.toLowerCase());
  return { exercise, number: Number(tail[1]), part: parts.join(".") };
}

/**
 * A paper's question label. A question number is unique within a paper, so a
 * prefix ("Section B", "2004 Year 9 Yearly") never stops it linking; a lettered
 * section is kept, because some papers restart their numbering in each one.
 * "Section B Q2" -> { section: "B", number: 2, part: "" }.
 */
function parsePaperLabel(label) {
  const text = String(label || "").trim();
  const section = paperSection(/\bsection\s+([A-Z])\b/i.exec(text)?.[1]);
  const tail = new RegExp(`(?:\\bQ(?:uestion)?\\s*)(\\d+)\\s*(?:\\(?([a-z])\\)?)?\\s*(?:\\(?(${ROMAN})\\)?)?\\s*$`, "i").exec(text)
    || new RegExp(`^(\\d+)\\s*(?:\\(?([a-z])\\)?)?\\s*(?:\\(?(${ROMAN})\\)?)?\\s*$`, "i").exec(text);
  if (!tail || /\bexample\b/i.test(text)) return { section, number: null, part: "" };
  return { section, number: Number(tail[1]), part: [tail[2], tail[3]].filter(Boolean).map((p) => p.toLowerCase()).join(".") };
}

// Only a lettered section (A-F) restarts numbering; NESA's Section I/II does not.
function paperSection(value) {
  const letter = /^(?:section\s*)?([A-F])$/i.exec(String(value || "").trim())?.[1];
  return letter ? letter.toUpperCase() : null;
}

function normalisePart(part) {
  return String(part || "").toLowerCase().replace(/[()\s]/g, "").replace(/^([a-z])(?=[ivx]+$)/, "$1.").replace(/[^a-z.]/g, "");
}

// --- page index ---------------------------------------------------------------

const EXERCISE_HEADING = /\bExercise\s+([0-9]+[A-Z]?(?:\.[0-9]+)?)\b/g;

/**
 * For every PDF page: its printed page number (when the book prints one), the
 * exercise headings on it, and whether it is an answer page. `texts[i]` is the
 * text layer of PDF page i + 1 (empty when the page has none).
 *
 * The printed number is the offset from the PDF page that most pages agree on,
 * judged from the numbers printed at the top and bottom of each page, so a
 * stray number in a question cannot move it.
 */
// Copyright and licence lines a publisher prints on every page. They carry an
// ISBN and a year, and push the printed page number away from the page's ends.
const BOILERPLATE = /ISBN|©|Photocopying|University Press|All rights reserved/i;

/**
 * A line that is only an answers heading: "Answers", "Answers 7A ➜ 7E",
 * "799 Answers 799 Answers", "Chapter 1 answers". Not "Answer the question
 * in a sentence", which is a worked example's step.
 */
function isAnswersHeading(line) {
  const words = String(line || "").replace(/\b\d+[A-Z]?\b|➜|→|[–—:-]/g, " ").toLowerCase().split(/\s+/).filter(Boolean);
  return words.some((w) => w === "answers" || w === "answer") && words.length <= 4 && words.every((w) => ["answers", "answer", "chapter", "to", "and", "exercise", "exercises"].includes(w));
}

function contentLines(text) {
  return String(text || "").split("\n").map((l) => l.trim()).filter((l) => l && !BOILERPLATE.test(l));
}

function buildPageIndex(texts) {
  const votes = new Map();
  texts.forEach((text, i) => {
    const page = i + 1;
    const lines = contentLines(text);
    const ends = [...lines.slice(0, 3), ...lines.slice(-3)].join(" ");
    for (const token of new Set(ends.match(/\b\d{1,4}\b/g) || [])) {
      const n = Number(token);
      if (n >= 1 && n <= page + 50) votes.set(page - n, (votes.get(page - n) || 0) + 1);
    }
  });
  const [offset, support] = [...votes.entries()].sort((a, b) => b[1] - a[1])[0] || [null, 0];
  const trusted = offset !== null && support >= Math.max(3, texts.length * 0.3);

  const pages = texts.map((text, i) => {
    const t = String(text || "");
    const head = t.slice(0, 220);
    return {
      page: i + 1,
      printedPage: trusted && i + 1 - offset >= 1 ? i + 1 - offset : null,
      headings: [...new Set([...t.matchAll(EXERCISE_HEADING)].map((m) => m[1].toUpperCase()))],
      answerPage: /\b(answers?|solutions?)\b/i.test(head) && !/\bexercise\s+\d/i.test(head),
    };
  });
  // A textbook's answers are one section at the back: only its first page is
  // headed "Answers", and it runs to the index, glossary or end of the book.
  const headed = (i, test) => contentLines(texts[i]).slice(0, 4).some(test);
  const start = texts.findIndex((_, i) => i >= texts.length * 0.5 && headed(i, isAnswersHeading));
  if (start >= 0) {
    let end = texts.length;
    for (let i = start + 1; i < texts.length; i++) if (headed(i, (l) => /^(index|glossary)\b/i.test(l.replace(/^\d+\s+/, "")))) { end = i; break; }
    pages.forEach((p, i) => { p.answerPage = i >= start && i < end; });
  } else {
    // No back section: a run of pages each headed "Answers" (a lone one in the
    // middle of a book is a worked answer box, not a key).
    pages.forEach((p, i) => {
      if (!p.answerPage) return;
      const near = pages.slice(Math.max(0, i - 2), i + 3).filter((q) => q.answerPage).length;
      if (near < 2) p.answerPage = false;
    });
  }
  return { offset: trusted ? offset : null, pages };
}

/**
 * The exercise each bank question on a page belongs to. A page that opens a
 * new exercise can still finish the previous one, so the questions are read
 * in printed order and the new exercise starts where the numbering resets.
 * A label that names its own exercise wins.
 */
function assignExercises(questions, index) {
  const byPage = new Map();
  for (const q of questions) byPage.set(q.pageNumber, [...(byPage.get(q.pageNumber) || []), q]);
  const out = new Map();
  let current = null;
  let lastNumber = 0;
  for (const p of index.pages) {
    const onPage = (byPage.get(p.page) || []).map((q) => ({ q, parsed: parseLabel(q.label) }))
      .sort((a, b) => (a.q.box?.y0 ?? 0) - (b.q.box?.y0 ?? 0) || (a.q.box?.x0 ?? 0) - (b.q.box?.x0 ?? 0));
    const fresh = p.headings.filter((h) => h !== current);
    let next = fresh.length ? fresh[fresh.length - 1] : null;
    let switched = !next;
    for (const { q, parsed } of onPage) {
      if (parsed.exercise) { current = parsed.exercise; lastNumber = parsed.number || 0; out.set(q.id, current); switched = true; next = null; continue; }
      if (!switched && next && parsed.number && (parsed.number < lastNumber || current === null || lastNumber === 0 || parsed.number === 1)) {
        current = next; switched = true; next = null; lastNumber = 0;
      } else if (parsed.number === 1 && lastNumber >= 2) {
        // Numbering restarts with no new exercise heading: an investigation,
        // review or task, not the exercise before it.
        current = null; lastNumber = 0;
      }
      if (parsed.number) lastNumber = Math.max(lastNumber, parsed.number);
      out.set(q.id, current);
    }
    if (!switched && next) { current = next; lastNumber = 0; }
  }
  return keepExercisesInOrder(questions, out);
}

/** Sort key for an exercise code: 7A -> [7, 1], 1.05 -> [1, 5], 3 -> [3, 0]. */
function exerciseOrder(code) {
  const m = /^(\d+)([A-Z])?(?:\.(\d+))?$/.exec(code || "");
  if (!m) return null;
  return [Number(m[1]), m[2] ? m[2].charCodeAt(0) - 64 : m[3] ? Number(m[3]) : 0];
}

/**
 * Exercises run in book order, so a question whose exercise is out of order
 * with the rest is a chapter review or revision question that names the
 * exercise it revises; its number is the review's, not the exercise's. Keeps
 * the longest in-order run of exercises (weighted by questions) and clears the
 * exercise of every other question.
 */
function keepExercisesInOrder(questions, exercises) {
  const groups = [];
  const sorted = questions.filter((q) => exerciseOrder(exercises.get(q.id)))
    .sort((a, b) => a.pageNumber - b.pageNumber || (a.box?.y0 ?? 0) - (b.box?.y0 ?? 0));
  for (const q of sorted) {
    const code = exercises.get(q.id);
    const last = groups[groups.length - 1];
    if (last && last.code === code) last.ids.push(q.id);
    else groups.push({ code, order: exerciseOrder(code), ids: [q.id] });
  }
  const before = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]);
  const best = groups.map((g) => g.ids.length);
  const prev = groups.map(() => -1);
  for (let i = 0; i < groups.length; i++) {
    for (let j = 0; j < i; j++) {
      if (before(groups[j].order, groups[i].order) && best[j] + groups[i].ids.length > best[i]) { best[i] = best[j] + groups[i].ids.length; prev[i] = j; }
    }
  }
  const kept = new Set();
  for (let i = best.indexOf(Math.max(0, ...best)); i >= 0 && groups.length; i = prev[i]) for (const id of groups[i].ids) kept.add(id);
  const out = new Map(exercises);
  for (const g of groups) for (const id of g.ids) if (!kept.has(id)) out.set(id, null);
  return out;
}

/**
 * An answer key read page by page carries the last exercise over a page
 * break. Where the numbering restarts to 1 under the same exercise, the key
 * has moved on to an unheaded section (review, investigation), so those
 * entries lose the stale exercise until a new one is named.
 */
function dropStaleExercises(entries) {
  let label = null;
  let stale = false;
  let last = 0;
  return entries.map((e) => {
    if (e.exercise !== label) { label = e.exercise; stale = false; last = 0; }
    if (Number.isInteger(e.question)) {
      if (e.question === 1 && last >= 2) stale = true;
      last = Math.max(last, e.question);
    }
    return stale && e.exercise ? { ...e, exercise: null } : e;
  });
}

// --- answer extraction ---------------------------------------------------------

const ANSWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["entries"],
  properties: {
    entries: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["exercise", "page", "question", "part", "answer"],
        properties: {
          exercise: { type: ["string", "null"] },
          page: { type: ["integer", "null"] },
          question: { type: "integer" },
          part: { type: "string" },
          answer: { type: "string" },
        },
      },
    },
  },
};

const ANSWER_SYSTEM = "You transcribe answer keys from NSW school maths textbooks and workbooks so each answer can be matched to its question. You return exact transcriptions.";

function answerPrompt({ previous, paper = false }) {
  if (paper) {
    return `This is a page from a school maths exam paper. It may hold the paper's solutions or marking guidelines, or it may be a question page.

If it holds solutions or answers, list every question's final answer on it, in order. For each:
- exercise: the section letter ("A", "B") only when the paper restarts its question numbers in each lettered section, otherwise null.
- page: null.
- question: the question number.
- part: the part as printed, letters then numerals separated by a dot ("a", "b.ii"), or "" for a question with no parts.
- answer: the final answer only (not the working or marking criteria), with maths in LaTeX between $...$. For multiple choice give the letter and, if shown, the option ("B"). If the answer is only a drawn graph or diagram, write "[diagram]".

Answers continue from the previous page: ${previous?.question ? `the last answer there was question ${previous.question}${previous.exercise ? ` in section ${previous.exercise}` : ""}` : "this is the first solutions page"}.

If the page holds only questions for students to answer (not answers), return an empty list.`;
  }
  return `This is a page of answers or worked solutions to questions printed elsewhere in the book.

List every answer on the page, in reading order (down the first column, then the next). For each:
- exercise: the exercise or section code the answer is listed under, as printed (for example "1E" or "7A"), or null if the book lists answers by page instead.
- page: the printed page number of the questions it answers when the book lists answers by page ("Page 168"), otherwise null.
- question: the question number.
- part: the part as printed, letters then numerals separated by a dot ("a", "b.ii"), or "" for a question with no parts.
- answer: the final answer exactly as printed, with maths in LaTeX between $...$. For worked solutions give only the final answer. If the answer is only a drawn graph or diagram, write "[diagram]".

Answers continue from the previous page: ${previous?.exercise ? `the last exercise there was "${previous.exercise}"` : previous?.page ? `the last page referenced there was ${previous.page}` : "this is the first answer page"}. Answers at the top of this page with no heading belong to that.

Leave out headings, copyright lines and anything that is not an answer. Return an empty list for a page with no answers.`;
}

function buildAnswerParams({ image, previous, paper = false, model = ANSWER_MODEL }) {
  return {
    model,
    max_tokens: ANSWER_MAX_TOKENS,
    system: buildAnthropicSystemParam({ systemPrompt: ANSWER_SYSTEM }),
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image.toString("base64") } },
      { type: "text", text: answerPrompt({ previous, paper }) },
    ] }],
    thinking: { type: "adaptive" },
    output_config: { effort: ANSWER_EFFORT, format: { type: "json_schema", schema: ANSWER_SCHEMA } },
  };
}

function readAnswerMessage(message) {
  const usage = normaliseAnthropicUsage(message.usage);
  assertNotRefused(message);
  const raw = responseText(message);
  assertCompleteResponse(message, raw, ANSWER_MAX_TOKENS);
  return { entries: parseAiJsonResponse(raw, { mathBearing: true })?.entries || [], usage };
}

// --- scanned books -------------------------------------------------------------
//
// A scanned book has no text layer to find its answer section by, so its pages
// are classified from their images, walking back from the end of the book.

const PAGE_KIND_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kind"],
  properties: { kind: { type: "string", enum: ["answers", "questions", "other"] } },
};

function buildPageKindParams({ image, model = ANSWER_MODEL }) {
  return {
    model,
    max_tokens: 1000,
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image.toString("base64") } },
      { type: "text", text: "Is this page from a maths book a page of answers to exercises (\"answers\"), a page of questions, exercises or teaching (\"questions\"), or something else such as an index, glossary or blank page (\"other\")?" },
    ] }],
    output_config: { effort: "low", format: { type: "json_schema", schema: PAGE_KIND_SCHEMA } },
  };
}

/**
 * Walks back from the last page, asking `kindOf(page)` for each, and returns
 * the answer section: the run of answer pages nearest the back, ending once
 * `stopAfter` question pages in a row follow it. Gives up with none after
 * `searchLimit` pages without an answer page.
 */
async function findAnswerSectionByImage({ pageCount, kindOf, stopAfter = 4, searchLimit = 20 }) {
  const answers = [];
  let questionsRun = 0;
  for (let page = pageCount; page >= 1; page--) {
    const kind = await kindOf(page);
    if (kind === "answers") { answers.push(page); questionsRun = 0; continue; }
    if (kind === "questions") questionsRun += 1;
    if (answers.length && questionsRun >= stopAfter) break;
    if (!answers.length && pageCount - page + 1 >= searchLimit) break;
  }
  return answers.reverse();
}

// --- teacher editions that mirror the student book ------------------------------
//
// Some teacher editions (Mathletics Series A-F) are the student book with the
// answers written in on the same page, so there is no key to address: each
// teacher page is matched to its student page by text, and the answers are
// read straight off it for the questions the bank holds on that page.

function pageFingerprint(text) {
  return new Set(contentLines(text).join(" ").toLowerCase().match(/[a-z]{3,}/g) || []);
}

function overlap(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared += 1;
  return shared / Math.min(a.size, b.size);
}

/**
 * Student PDF page -> teacher PDF page, for pages whose words match closely.
 * Searches near the same position first, since editions add a few pages.
 */
function matchMirrorPages(studentTexts, teacherTexts, { threshold = 0.85 } = {}) {
  const teacher = teacherTexts.map(pageFingerprint);
  const out = new Map();
  studentTexts.forEach((text, i) => {
    const words = pageFingerprint(text);
    if (words.size < 8) return;
    let best = null;
    for (let j = 0; j < teacher.length; j++) {
      const score = overlap(words, teacher[j]) - Math.abs(i - j) * 1e-4;
      if (!best || score > best.score) best = { page: j + 1, score };
    }
    if (best && best.score >= threshold) out.set(i + 1, best.page);
  });
  return out;
}

const MIRROR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answers"],
  properties: {
    answers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "answer"],
        properties: { label: { type: "string" }, answer: { type: "string" } },
      },
    },
  },
};

function mirrorPrompt(questions) {
  const list = questions.map((q) => `- ${q.label}: ${String(q.text || q.stem || "").slice(0, 160)}`).join("\n");
  return `This is a page from a teacher's edition of a maths workbook: the student page with the answers written in (usually in italics or a second colour, on the answer lines or in the boxes).

For each of these questions on the page, give the answer written in for it:
${list}

Use the label exactly as given. Give the final answer exactly as written, with maths in LaTeX between $...$. If the answer is only a drawing, write "[diagram]". If no answer is written in for a question, leave it out.`;
}

function buildMirrorParams({ image, questions, model = ANSWER_MODEL }) {
  return {
    model,
    max_tokens: ANSWER_MAX_TOKENS,
    system: buildAnthropicSystemParam({ systemPrompt: ANSWER_SYSTEM }),
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image.toString("base64") } },
      { type: "text", text: mirrorPrompt(questions) },
    ] }],
    thinking: { type: "adaptive" },
    output_config: { effort: ANSWER_EFFORT, format: { type: "json_schema", schema: MIRROR_SCHEMA } },
  };
}

function readMirrorMessage(message) {
  const usage = normaliseAnthropicUsage(message.usage);
  assertNotRefused(message);
  const raw = responseText(message);
  assertCompleteResponse(message, raw, ANSWER_MAX_TOKENS);
  return { answers: parseAiJsonResponse(raw, { mathBearing: true })?.answers || [], usage };
}

/** Links a mirror page's answers to its questions by label; a repeated label links nothing. */
function linkMirrorAnswers(questions, answers) {
  const byLabel = new Map();
  for (const q of questions) byLabel.set(q.label, byLabel.has(q.label) ? null : q);
  const links = [];
  for (const a of answers) {
    const q = byLabel.get(a.label);
    if (!q || !a.answer || a.answer === "[diagram]") continue;
    links.push({ questionId: q.id, answer: a.answer, via: "mirror", key: `mirror:${q.pageNumber}|${a.label}` });
  }
  return links;
}

// --- linking -------------------------------------------------------------------

function exerciseKey(exercise, number, part) {
  // Only an exercise code ("1B", "7.3") is unique in a book; a section name is not.
  const code = String(exercise || "").trim().toUpperCase();
  return /^\d+[A-Z]?(?:\.\d+)?$/.test(code) ? `ex:${code}|${number}|${normalisePart(part)}` : null;
}

function pageKey(page, number, part) {
  return Number.isInteger(page) ? `pg:${page}|${number}|${normalisePart(part)}` : null;
}

function paperKey(section, number, part) {
  return `paper:${section || ""}|${number}|${normalisePart(part)}`;
}

// A heading that opens a paper's solutions. "Question One (20 marks) Answers
// Marks" is the answer column on a question page, so a line naming marks is not one.
const SOLUTIONS_HEADING = /\b(marking\s+(guidelines?|scheme|criteria)|sample\s+(solutions?|answers?)|worked\s+solutions?|suggested\s+solutions?|solutions?|answers?)\b/i;

function isSolutionsHeading(line) {
  return line.length <= 90 && SOLUTIONS_HEADING.test(line) && !/\bmarks?\b/i.test(line.replace(/marking/gi, ""));
}

const isTextless = (text) => contentLines(text).join("").length < 40;

/**
 * Where a past paper keeps its solutions, in the order they are tried:
 *   - "pages": typed pages from a solutions heading in the paper's back 70%;
 *   - "pages": the scanned pages after its last bank question (a typed paper
 *     with handwritten solutions scanned on, or a wholly scanned paper);
 *   - "mirror": a second copy of the paper with the answers written in, as a
 *     map from question page to its copy;
 *   - "none".
 */
function paperSolutionPages(texts, questionPages) {
  const pages = texts.map((_, i) => i + 1);
  const start = texts.findIndex((t, i) => i >= texts.length * 0.3 && contentLines(t).slice(0, 5).some(isSolutionsHeading));
  if (start >= 0) return { mode: "pages", pages: pages.filter((p) => p > start) };
  // The last typed question page: scanned solution pages restate the
  // questions, and the bank may hold copies extracted from them.
  const typed = questionPages.filter((p) => !isTextless(texts[p - 1]));
  const last = Math.max(0, ...(typed.length ? typed : questionPages));
  const tail = pages.filter((p) => p > last && isTextless(texts[p - 1]));
  if (tail.length >= 2) return { mode: "pages", pages: tail };
  const half = Math.ceil(texts.length / 2);
  const mirror = matchMirrorPages(texts.slice(0, half), texts.slice(half), { threshold: 0.8 });
  const mirrored = questionPages.filter((p) => mirror.has(p));
  if (mirrored.length && mirrored.length >= new Set(questionPages).size * 0.5) {
    return { mode: "mirror", mirror: new Map([...mirror].map(([p, q]) => [p, q + half])) };
  }
  return { mode: "none", pages: [] };
}

/**
 * The lettered section each page of a paper is in. A page that opens a new
 * section near its top is in it; one that opens it lower down keeps the
 * previous section for its questions (the label usually says, when it matters).
 */
function paperPageSections(texts) {
  const out = new Map();
  let current = null;
  texts.forEach((t, i) => {
    const lines = contentLines(t);
    const top = lines.slice(0, 4).map((l) => /^section\s+([A-F])\b/i.exec(l)?.[1]).find(Boolean);
    if (top) current = top.toUpperCase();
    out.set(i + 1, current);
    const lower = lines.slice(4).map((l) => /^section\s+([A-F])\b/i.exec(l)?.[1]).filter(Boolean).pop();
    if (lower) current = lower.toUpperCase();
  });
  return out;
}

/**
 * Links a paper's solutions to its questions by section, number and part.
 * Every answer is also filed without its section, so a paper whose lettered
 * sections continue the numbering still links; where sections restart it,
 * the unsectioned key is ambiguous and drops out.
 */
function linkPaperAnswers({ questions, entries, pageSections = new Map() }) {
  const byKey = new Map();
  const conflicted = new Set();
  for (const e of entries) {
    if (!Number.isInteger(e.question) || !e.answer || e.answer === "[diagram]") continue;
    const section = paperSection(e.exercise);
    for (const key of new Set([paperKey(section, e.question, e.part), paperKey(null, e.question, e.part)])) {
      if (byKey.has(key) && byKey.get(key).answer !== e.answer) conflicted.add(key);
      byKey.set(key, e);
    }
  }
  const links = [];
  let numbered = 0;
  for (const q of questions) {
    const parsed = parsePaperLabel(q.label);
    if (!parsed.number) continue;
    numbered += 1;
    const section = parsed.section || pageSections.get(q.pageNumber) || null;
    // The unsectioned key only stands in for an answer from the same section
    // (or one that names none), never another section's question 1.
    const fits = (e) => !section || !paperSection(e.exercise) || paperSection(e.exercise) === section;
    const key = [paperKey(section, parsed.number, parsed.part), paperKey(null, parsed.number, parsed.part)].find((k) => byKey.has(k) && !conflicted.has(k) && fits(byKey.get(k)));
    if (key) links.push({ questionId: q.id, answer: byKey.get(key).answer, via: "paper", key });
  }
  return { links, numbered, entryCount: entries.length, conflicted: conflicted.size };
}

/**
 * Matches a book's answer entries to its bank questions. Returns one link per
 * matched question and the counts for the match-rate report. An answer that
 * is only a drawn diagram is never linked, and neither is a key two entries
 * share with different answers (an ambiguous key is worse than none).
 */
function linkAnswers({ questions, index, entries }) {
  const byKey = new Map();
  const conflicted = new Set();
  for (const e of dropStaleExercises(entries)) {
    if (!Number.isInteger(e.question) || !e.answer || e.answer === "[diagram]") continue;
    for (const key of [exerciseKey(e.exercise, e.question, e.part), pageKey(e.page, e.question, e.part)].filter(Boolean)) {
      if (byKey.has(key) && byKey.get(key).answer !== e.answer) conflicted.add(key);
      byKey.set(key, e);
    }
  }
  const exercises = assignExercises(questions, index);
  const printed = new Map(index.pages.map((p) => [p.page, p.printedPage]));
  const links = [];
  let numbered = 0;
  for (const q of questions) {
    const { number, part } = parseLabel(q.label);
    if (!number) continue;
    numbered += 1;
    const keys = [exerciseKey(exercises.get(q.id), number, part), pageKey(printed.get(q.pageNumber), number, part)].filter(Boolean);
    const key = keys.find((k) => byKey.has(k) && !conflicted.has(k));
    if (key) links.push({ questionId: q.id, answer: byKey.get(key).answer, via: key.slice(0, 2) === "ex" ? "exercise" : "page", key });
  }
  return { links, numbered, entryCount: entries.length, conflicted: conflicted.size };
}

// --- comparing answers -----------------------------------------------------------

const UNIT = /(cm|mm|km|m|kg|g|l|ml|kl|s|min|h|°|\^\\circ|\\circ|degrees?)(\^?2|\^?3|²|³)?$/;

/**
 * An answer that is a single value: a number or a fraction, optionally after
 * "x =", with an optional unit. Returns { value, places } (places null for an
 * exact fraction), or null for anything with more structure (roots, powers,
 * inequalities, coordinates, words).
 */
function scalarOf(text) {
  let t = String(t0(text));
  t = t.replace(/^[a-z]\s*=\s*/i, "").replace(UNIT, "").replace(/(\d),(\d{3})/g, "$1$2");
  let m = /^(-?)\\[dt]?frac\{(\d+)\}\{(\d+)\}$/.exec(t) || /^(-?)(\d+)\/(\d+)$/.exec(t);
  if (m) return Number(m[3]) ? { value: (m[1] ? -1 : 1) * Number(m[2]) / Number(m[3]), places: null } : null;
  m = /^(-?\d+)\\[dt]?frac\{(\d+)\}\{(\d+)\}$/.exec(t); // mixed number 18\frac{6}{7}
  if (m && Number(m[3])) return { value: Math.sign(Number(m[1]) || 1) * (Math.abs(Number(m[1])) + Number(m[2]) / Number(m[3])), places: null };
  m = /^-?\d+(?:\.(\d+))?$/.exec(t);
  return m ? { value: Number(t), places: (m[1] || "").length } : null;
}

// Strips only what never changes meaning: $ delimiters, spacing and \left/\right.
function t0(text) {
  return String(text || "").toLowerCase().replace(/\$/g, "").replace(/\\left|\\right|\\[,;! ]|\s+/g, "").replace(/\\text\{([^}]*)\}/g, "$1").replace(/\\mathrm\{([^}]*)\}/g, "$1");
}

/**
 * Whether two answers say the same thing, decided without a model only when
 * it is safe: the same text once delimiters and spacing are ignored, or two
 * single values equal within the rounding a decimal answer shows (an exact
 * fraction allows none). Returns true, false, or null when it cannot tell
 * (anything with more structure), in which case the caller asks a model.
 */
function sameAnswer(a, b) {
  const pa = t0(a).replace(UNIT, ""); const pb = t0(b).replace(UNIT, "");
  if (pa && pa === pb) return true;
  const sa = scalarOf(a); const sb = scalarOf(b);
  if (!sa || !sb) return null;
  const shown = [sa.places, sb.places].filter((p) => p !== null);
  // Two exact fractions must be equal; otherwise allow the coarser decimal's rounding.
  const tolerance = shown.length ? 0.5 * 10 ** -Math.min(...shown) + 1e-9 : 1e-9;
  return Math.abs(sa.value - sb.value) <= tolerance;
}

module.exports = {
  ANSWERS_COLLECTION,
  ANSWER_MAX_TOKENS,
  ANSWER_MODEL,
  ANSWER_SCHEMA,
  answerPrompt,
  assignExercises,
  dropStaleExercises,
  keepExercisesInOrder,
  MIRROR_SCHEMA,
  buildAnswerParams,
  buildMirrorParams,
  buildPageIndex,
  linkAnswers,
  linkMirrorAnswers,
  linkPaperAnswers,
  matchMirrorPages,
  buildPageKindParams,
  findAnswerSectionByImage,
  isAnswersHeading,
  paperPageSections,
  paperSolutionPages,
  parsePaperLabel,
  readMirrorMessage,
  normalisePart,
  parseLabel,
  readAnswerMessage,
  sameAnswer,
};
