"use strict";

// RES-59. The same question printed in several books or editions is kept once.
// Pure, so the rules are unit tested; scripts/questionBankDedupe.js does the I/O.
//
// Two questions from different files are the same when they have the same
// diagram type, skill and kind, exactly the same numbers, and nearly the same
// words. The numbers rule matters most: "find x when the sides are 6 and 8"
// and "... 5 and 12" are different questions however alike the wording is.
// A part printed as only its letter and a diagram has no wording of its own,
// so its figure descriptions stand in for it.

const MIN_WORD_OVERLAP = 0.8;
const MIN_FIGURE_OVERLAP = 0.4;

function contentOf(question) {
  const own = [question.stem, question.text].filter(Boolean).join(" ");
  const figures = (question.figures || []).map((figure) => figure.description).filter(Boolean).join(" ");
  return { own, all: `${own} ${figures}` };
}

function stripLatex(text) {
  return String(text || "")
    .replace(/\\(frac|dfrac|sqrt|times|div|cdot|left|right|circ|degree|text|mathrm|angle|triangle|pi|theta|alpha|beta)\b/g, " ")
    .replace(/[\\{}$^_]/g, " ");
}

function numbersOf(text) {
  return (stripLatex(text).match(/\d+(?:\.\d+)?/g) || []).map(Number).sort((a, b) => a - b);
}

function wordsOf(text) {
  return new Set((stripLatex(text).toLowerCase().match(/[a-z]{3,}/g) || []));
}

function overlap(a, b) {
  if (!a.size && !b.size) return 1;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / (a.size + b.size - shared);
}

function partLabel(label) {
  // "Exercise 7A Q2b" and "Set 7A Q2b" are the same part; the heading wording varies by edition.
  const match = /q\s*([0-9]+\s*[a-z]?(?:\s*\(?[ivx]+\)?)?|[a-z])\s*$/i.exec(String(label || "").trim());
  return match ? match[1].replace(/\W/g, "").toLowerCase() : String(label || "").trim().toLowerCase();
}

/** What two copies of one question have in common; null when a question is too bare to match safely. */
function signatureOf(question) {
  const { own, all } = contentOf(question);
  const text = own.trim() ? own : all;
  const numbers = numbersOf(all);
  const words = wordsOf(text);
  if (words.size < 4 && !numbers.length) return null;
  // Parts that share an instruction and differ only by their diagram ("Cross
  // out the incorrect nets", then a different solid each time) can only be
  // told apart by their printed label, so it must match as well.
  const ownText = String(question.text || "");
  const distinct = wordsOf(ownText).size >= 4 || numbersOf(ownText).length > 0;
  const figures = wordsOf((question.figures || []).map((figure) => figure.description).join(" "));
  return { key: [question.diagramType, question.skill, question.kind, numbers.join(","), distinct ? "" : partLabel(question.label)].join("|"), words, figures, numbered: numbers.length > 0 };
}

function sameQuestion(a, b) {
  if (a.sourceId === b.sourceId || a.signature.key !== b.signature.key) return false;
  if (overlap(a.signature.words, b.signature.words) < MIN_WORD_OVERLAP) return false;
  // Without numbers, the same wording can sit beside a different diagram ("what
  // is the letter opposite Y?" under another net), so the diagrams' own
  // descriptions must broadly agree too.
  return a.signature.numbered || overlap(a.signature.figures, b.signature.figures) >= MIN_FIGURE_OVERLAP;
}

/** The newest copy first: the latest year in its file path, then the file's Drive modified time. */
function newerFirst(a, b) {
  const year = (question) => Math.max(0, ...((question.sourcePath || "").match(/\b(?:19|20)\d\d\b/g) || []).map(Number));
  return (
    year(b) - year(a) ||
    String(b.sourceModifiedTime || "").localeCompare(String(a.sourceModifiedTime || "")) ||
    a.id.localeCompare(b.id)
  );
}

function sourceEntry(question) {
  return { questionId: question.id, sourceId: question.sourceId, sourcePath: question.sourcePath, pageNumber: question.pageNumber, label: question.label || null };
}

/**
 * Groups of copies, each with the copy to keep. A copy an admin has hidden is
 * always the one kept, so hiding it hides every copy.
 */
function findDuplicateGroups(questions) {
  const blocks = new Map();
  for (const question of questions) {
    const signature = signatureOf(question);
    if (!signature) continue;
    const entry = { ...question, signature };
    if (!blocks.has(signature.key)) blocks.set(signature.key, []);
    blocks.get(signature.key).push(entry);
  }

  // Each copy joins the newest group whose kept question it matches and that
  // has nothing from its own file yet, so parts of one file never merge.
  const groups = [];
  for (const block of blocks.values()) {
    if (block.length < 2) continue;
    const formed = [];
    for (const question of [...block].sort(newerFirst)) {
      const group = formed.find((members) => !members.some((member) => member.sourceId === question.sourceId) && sameQuestion(members[0], question));
      if (group) group.push(question);
      else formed.push([question]);
    }
    for (const group of formed) {
      if (group.length < 2) continue;
      const keep = group.find((question) => question.status === "hidden") || group[0];
      groups.push({ keep, copies: group.filter((question) => question !== keep) });
    }
  }
  return groups;
}

/**
 * The writes that bring the bank in line with the groups: each copy points at
 * the kept question, and the kept question lists every source. A copy that is
 * no longer in a group goes live again. Only changed fields are written.
 */
function planDuplicateWrites(questions, groups) {
  const writes = new Map();
  const set = (question, fields) => {
    const changed = {};
    for (const [field, value] of Object.entries(fields)) {
      if (JSON.stringify(question[field] ?? null) !== JSON.stringify(value)) changed[field] = value;
    }
    if (Object.keys(changed).length) writes.set(question.id, { ...(writes.get(question.id) || {}), ...changed });
  };

  const grouped = new Set();
  for (const { keep, copies } of groups) {
    const all = [keep, ...copies];
    all.forEach((question) => grouped.add(question.id));
    set(keep, {
      status: keep.status === "hidden" ? "hidden" : "live",
      duplicateOf: null,
      sources: [...all].sort(newerFirst).map(sourceEntry),
    });
    for (const copy of copies) set(copy, { status: "duplicate", duplicateOf: keep.id, sources: null });
  }
  for (const question of questions) {
    if (grouped.has(question.id)) continue;
    if (question.status === "duplicate") set(question, { status: "live", duplicateOf: null });
    if (question.sources) set(question, { sources: null });
  }
  return [...writes].map(([id, data]) => ({ id, data }));
}

module.exports = { MIN_WORD_OVERLAP, findDuplicateGroups, newerFirst, numbersOf, partLabel, planDuplicateWrites, signatureOf, wordsOf };
