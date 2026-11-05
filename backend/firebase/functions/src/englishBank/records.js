"use strict";

const crypto = require("node:crypto");

// RES-64. Turns the page results for one English source (schema.js) into
// stimulus, question and marking-guide records. Pure, so the rules are unit
// tested; extraction (RES-66) does the I/O.
//
// Stimuli are stored verbatim so the generator never retypes a passage: a
// passage split across pages is joined back together, and a technique whose
// quoted evidence isn't in the passage is dropped rather than kept as a
// made-up quote.

const { clampBox } = require("../questionBank/pages");
const { yearsOf } = require("../questionBank/search");
const { isTechniqueFor, mediumOf } = require("./taxonomy");

const STIMULI_COLLECTION = "englishStimuli";
const QUESTIONS_COLLECTION = "englishQuestions";
const GUIDES_COLLECTION = "englishGuides";

// "Question 3 (b)" and "Q3b" both become "3b".
function labelKey(label) {
  return String(label || "")
    .toLowerCase()
    .replace(/\b(question|text|source|part)\b\.?/g, "")
    .replace(/\bq\.?(?=\s*\d)/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function questionId(sourceId, label) {
  return `${sourceId}_q${labelKey(label) || "x"}`;
}

function stimulusId(sourceId, index) {
  return `${sourceId}_s${index + 1}`;
}

// A crop's path names the file version it was cut from, as in the maths bank,
// so re-extracting a changed file never overwrites crops already in use.
function cropPath(id, version, pageNumber, kind = "page") {
  const tag = version ? `_${crypto.createHash("sha256").update(String(version)).digest("hex").slice(0, 8)}` : "";
  return `englishBank/stimuli/${id}${tag}_${kind}${pageNumber}.png`;
}

function normaliseWhitespace(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function wordCount(text) {
  const words = normaliseWhitespace(text);
  return words ? words.split(" ").length : 0;
}

// Quoted evidence must appear in the passage, ignoring spacing, case and
// curly quotes.
function quoteKey(text) {
  return normaliseWhitespace(text).toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/^["']+|["'.,;:!?]+$/g, "");
}

// A published paper often prints a blank box where an image was withheld for
// copyright. The model may still describe it ("Empty bordered box under the
// heading Item 4"); such a visual has nothing to reuse and is left out.
const WITHHELD_VISUAL = /\b(no (visible )?(image|picture|photograph)|(image|picture|photograph|stimulus)( itself)?( content)? (is |was )?not (shown|displayed|included|reproduced)|(removed|withheld) for copyright|blank (area|box|space|frame)|empty (bordered )?(box|frame|area))\b/i;

function isWithheldVisual(group) {
  const first = group.pieces[0].piece;
  if (mediumOf(first.type) !== "visual") return false;
  if (group.pieces.some(({ piece }) => piece.text && piece.text.trim())) return false;
  return group.pieces.every(({ piece }) => piece.visualDescription && WITHHELD_VISUAL.test(piece.visualDescription));
}

function joinPieces(pieces) {
  return pieces.filter((piece) => piece && piece.trim()).map((piece) => piece.trim()).join("\n");
}

/**
 * Groups the stimuli returned page by page into whole stimuli. A piece marked
 * continuesPrevious joins the open stimulus with the same label (or the last
 * one left open by continuesNext); anything else starts a new stimulus.
 */
function groupStimuli(pages) {
  const groups = [];
  for (const page of pages) {
    for (const piece of page.result?.stimuli || []) {
      const open = [...groups].reverse().find((group) => group.open && (!piece.label || !group.label || labelKey(group.label) === labelKey(piece.label)));
      const target = piece.continuesPrevious && open ? open : null;
      if (target) {
        target.pieces.push({ page, piece });
        target.open = piece.continuesNext;
      } else {
        groups.push({ label: piece.label, pieces: [{ page, piece }], open: piece.continuesNext });
      }
    }
  }
  return groups;
}

function stimulusDoc({ source, group, index, runId, model }) {
  const first = group.pieces[0].piece;
  const id = stimulusId(source.id, index);
  const type = first.type;
  const text = mediumOf(type) === "visual" && !group.pieces.some(({ piece }) => piece.text) ? null : joinPieces(group.pieces.map(({ piece }) => piece.text));
  const textKey = quoteKey(text);
  const pageCrops = group.pieces.map(({ page, piece }) => ({
    pageNumber: page.pageNumber,
    box: clampBox(piece.box, page.width, page.height),
    pageSize: { width: page.width, height: page.height },
    storagePath: cropPath(id, source.version, page.pageNumber),
  })).filter((crop) => crop.box);

  let droppedTechniques = 0;
  const techniques = [];
  for (const { page, piece } of group.pieces) {
    for (const entry of piece.techniques || []) {
      const fits = isTechniqueFor(type, entry.technique);
      const quoted = mediumOf(type) === "visual" || (textKey && quoteKey(entry.evidence) && textKey.includes(quoteKey(entry.evidence)));
      if (!fits || !quoted || !normaliseWhitespace(entry.evidence)) {
        droppedTechniques++;
        continue;
      }
      const region = entry.box ? clampBox(entry.box, page.width, page.height) : null;
      techniques.push({ technique: entry.technique, evidence: normaliseWhitespace(entry.evidence), pageNumber: page.pageNumber, box: region });
    }
  }

  const themes = [...new Set(group.pieces.flatMap(({ piece }) => piece.themes || []).map((theme) => normaliseWhitespace(theme).toLowerCase()).filter(Boolean))];
  const yearLevel = group.pieces.map(({ piece }) => piece.yearLevel).find(Boolean) || null;
  return {
    id,
    droppedTechniques,
    data: {
      status: "live",
      sourceId: source.id,
      sourcePath: source.path,
      sourceVersion: source.version,
      label: group.label || null,
      type,
      medium: mediumOf(type),
      title: first.title || null,
      author: first.author || null,
      publication: first.publication || null,
      text,
      wordCount: wordCount(text),
      visualDescription: group.pieces.map(({ piece }) => piece.visualDescription).find(Boolean) || null,
      pages: group.pieces.map(({ page }) => page.pageNumber),
      pageCrops,
      techniques,
      techniqueIds: [...new Set(techniques.map((entry) => entry.technique))],
      themes,
      yearLevel,
      years: yearsOf(yearLevel, source.path),
      difficulty: first.difficulty || null,
      runId,
      model,
    },
  };
}

// The stimulus a label means from a given page. Comprehension books reuse
// "Text 1" in every exercise, so it is the one on that page if there is one,
// else the nearest one before it, else the first.
function stimulusByLabel(label, page, stimuli) {
  const matches = stimuli.filter((doc) => doc.data.label && labelKey(doc.data.label) === labelKey(label));
  return (
    matches.find((doc) => doc.data.pages.includes(page.pageNumber)) ||
    matches.filter((doc) => Math.min(...doc.data.pages) <= page.pageNumber).pop() ||
    matches[0] ||
    null
  );
}

// A question that names no stimulus is about the one on its page, when there
// is exactly one, or else the last stimulus before it.
// A label that resolves to a withheld visual stays unresolved: the question
// is kept but linked to nothing rather than to a passage it isn't about.
function stimuliForQuestion(question, page, stimuli, stimulusPages, withheld = []) {
  const byLabel = question.stimulusLabels.map((label) => stimulusByLabel(label, page, [...stimuli, ...withheld])).filter(Boolean);
  if (byLabel.length) return [...new Set(byLabel.filter((doc) => !doc.withheld).map((doc) => doc.id))];
  const onPage = stimuli.filter((doc) => doc.data.pages.includes(page.pageNumber));
  if (onPage.length === 1) return [onPage[0].id];
  const before = stimulusPages.filter((entry) => entry.firstPage <= page.pageNumber).pop();
  return before ? [before.id] : [];
}

/**
 * The records for one paper (or comprehension book, or image): its stimuli
 * and its questions, linked by ID.
 *
 * @param {{source: {id, path, version}, pages: Array<{pageNumber, width, height, result}>, runId?: string, model?: string}} input
 */
function toPaperDocs({ source, pages, runId = null, model = null }) {
  const ordered = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const groups = groupStimuli(ordered);
  const kept = groups.filter((group) => !isWithheldVisual(group));
  const built = kept.map((group, index) => stimulusDoc({ source, group, index, runId, model }));
  const stimuli = built.map(({ id, data }) => ({ id, data }));
  const withheld = groups
    .filter((group) => group.label && isWithheldVisual(group))
    .map((group) => ({ id: null, withheld: true, data: { label: group.label, pages: group.pieces.map(({ page }) => page.pageNumber) } }));
  const stimulusPages = stimuli.map((doc) => ({ id: doc.id, firstPage: Math.min(...doc.data.pages) }));

  // A paper's questions are keyed by label alone, so its guide can find them.
  // A comprehension book restarts at Question 1 for each exercise: a label
  // seen before for a different stimulus is a new question, keyed by its
  // stimulus too. The same label for the same stimulus is a repeat (a
  // question continued over a page) and is skipped.
  const questions = new Map();
  for (const page of ordered) {
    for (const question of page.result?.questions || []) {
      const stimulusIds = stimuliForQuestion(question, page, stimuli, stimulusPages, withheld);
      const plainId = questionId(source.id, question.label);
      const earlier = questions.get(plainId);
      let id = plainId;
      if (earlier) {
        if (earlier.data.stimulusIds.join() === stimulusIds.join()) continue;
        id = questionId(`${stimulusIds[0] || `${source.id}_p${page.pageNumber}`}`, question.label);
        if (questions.has(id)) continue;
      }
      questions.set(id, {
        id,
        data: {
          status: "live",
          sourceId: source.id,
          sourcePath: source.path,
          sourceVersion: source.version,
          pageNumber: page.pageNumber,
          label: question.label,
          stimulusIds,
          text: question.text,
          marks: Number.isInteger(question.marks) ? question.marks : null,
          questionType: question.questionType,
          skill: question.skill,
          techniques: [...new Set(question.techniques || [])],
          difficulty: question.difficulty || null,
          runId,
          model,
        },
      });
    }
  }
  return {
    stimuli,
    questions: [...questions.values()],
    droppedTechniques: built.reduce((sum, doc) => sum + doc.droppedTechniques, 0),
    withheldVisuals: groups.length - kept.length,
  };
}

/**
 * Marking-guide records for a guide file paired with a paper (englishBankSources
 * pairedWith). Each entry points at the paper's question with the same label,
 * by the same deterministic ID the paper's records use; entries for several
 * pages of the same question are joined.
 */
function toGuideDocs({ source, paperSourceId, pages, runId = null, model = null }) {
  const entries = new Map();
  for (const page of [...pages].sort((a, b) => a.pageNumber - b.pageNumber)) {
    for (const entry of page.result?.guideEntries || []) {
      const questionKey = questionId(paperSourceId || source.id, entry.questionLabel);
      const current = entries.get(questionKey);
      if (current) {
        current.data.criteria = joinPieces([current.data.criteria, entry.criteria]) || null;
        current.data.sampleAnswer = joinPieces([current.data.sampleAnswer, entry.sampleAnswer]) || null;
        current.data.pages.push(page.pageNumber);
        continue;
      }
      entries.set(questionKey, {
        id: `${source.id}_g${labelKey(entry.questionLabel) || "x"}`,
        data: {
          status: "live",
          sourceId: source.id,
          sourcePath: source.path,
          sourceVersion: source.version,
          paperSourceId: paperSourceId || null,
          questionId: paperSourceId ? questionKey : null,
          questionLabel: entry.questionLabel,
          marks: Number.isInteger(entry.marks) ? entry.marks : null,
          criteria: entry.criteria || null,
          sampleAnswer: entry.sampleAnswer || null,
          pages: [page.pageNumber],
          runId,
          model,
        },
      });
    }
  }
  return [...entries.values()];
}

module.exports = {
  GUIDES_COLLECTION,
  QUESTIONS_COLLECTION,
  STIMULI_COLLECTION,
  WITHHELD_VISUAL,
  cropPath,
  groupStimuli,
  labelKey,
  questionId,
  quoteKey,
  toGuideDocs,
  toPaperDocs,
  wordCount,
};
