"use strict";

const crypto = require("node:crypto");

// RES-57. Turns one page's extraction result into question bank records. Pure,
// so the rules are unit tested; the CLI does the I/O.

const { clampBox } = require("./pages");
const { splitSkillId } = require("./taxonomy");
const { yearsOf } = require("./search");

const QUESTIONS_COLLECTION = "questionBank";

// Batch custom IDs allow only letters, digits, "_" and "-", up to 64
// characters. Drive file IDs fit that alphabet.
function requestId(stage, sourceId, pageNumber) {
  return `${stage}_${sourceId}_p${pageNumber}`;
}

function parseRequestId(id) {
  const match = /^(sort|extract)_(.+)_p(\d+)$/.exec(id);
  if (!match) throw new Error(`Unrecognised request id: ${id}`);
  return { stage: match[1], sourceId: match[2], pageNumber: Number(match[3]) };
}

// A crop's path names the file version it was cut from, so re-extracting a
// changed file writes new crops instead of overwriting the ones resources
// already built from it still point at.
function cropPath(id, version, index) {
  const tag = version ? `_${crypto.createHash("sha256").update(String(version)).digest("hex").slice(0, 8)}` : "";
  return `questionBank/diagrams/${id}${tag}_${index + 1}.png`;
}

function questionId(sourceId, pageNumber, index) {
  return `${sourceId}_p${pageNumber}_${index + 1}`;
}

// The number a printed label ends in: "Exercise 7A Q2b" and "Q2a(ii)" are both 2.
function questionNumberOf(label) {
  const match = /(\d+)\s*\(?[a-z]?\)?\s*(?:\(?[ivx]+\)?)?\s*$/i.exec(String(label || "").trim());
  return match ? match[1] : null;
}

/**
 * The prompt gives a diagram shared by several parts to the first of them, so
 * 2b and 2c come back with no figure of their own. Each such part takes the
 * figures of the nearest earlier part with the same instruction or the same
 * question number. A part with neither has no printed diagram at all (a
 * "sketch this line" or a word problem) and stays out of the bank.
 *
 * In the November 2026 backfill this was 43% of the parts returned; about half
 * of them had a parent (RES-58).
 */
function sharedFigureParents(units) {
  return units.map((unit, index) => {
    if (unit.figures?.length) return null;
    const number = questionNumberOf(unit.label);
    for (let earlier = index - 1; earlier >= 0; earlier -= 1) {
      const candidate = units[earlier];
      if (!candidate.figures?.length) continue;
      if (unit.stem && candidate.stem && unit.stem === candidate.stem) return earlier;
      if (number && number === questionNumberOf(candidate.label)) return earlier;
    }
    return null;
  });
}

/**
 * The question records for one page. Units without a usable diagram of their
 * own or a parent's are dropped; a skill that names a type none of the unit's
 * diagrams has falls back to that diagram type's "other". A unit that shares
 * its parent's diagram points at the parent's crop (sharedFrom) instead of
 * having its own cut.
 */
function toQuestionDocs({ source, pageNumber, width, height, units, runId, model }) {
  const docs = [];
  const parents = sharedFigureParents(units);
  const docByUnit = new Map();
  for (const [unitIndex, unit] of units.entries()) {
    let figures = (unit.figures || [])
      .map((figure) => ({ type: figure.type, description: figure.description, box: clampBox(figure.box, width, height) }))
      .filter((figure) => figure.box);
    let sharedFrom = null;
    if (!figures.length && parents[unitIndex] !== null && docByUnit.has(parents[unitIndex])) {
      sharedFrom = docByUnit.get(parents[unitIndex]);
      figures = sharedFrom.data.figures.map((figure) => ({ ...figure, sharedFrom: sharedFrom.id }));
    }
    if (!figures.length) continue;
    const types = [...new Set(figures.map((figure) => figure.type))];
    const named = splitSkillId(unit.skill);
    const diagramType = types.includes(named.type) ? named.type : types[0];
    const skill = named.type === diagramType ? named.skill : "other";
    const id = questionId(source.id, pageNumber, docs.length);
    docs.push({
      id,
      data: {
        status: "live",
        sourceId: source.id,
        sourcePath: source.path,
        sourceVersion: source.version,
        pageNumber,
        kind: unit.kind,
        label: unit.label,
        diagramType,
        diagramTypes: types,
        skill,
        description: unit.description,
        context: unit.context,
        steps: unit.steps,
        difficulty: unit.difficulty || null,
        topic: unit.topic,
        yearLevel: unit.yearLevel || null,
        years: yearsOf(unit.yearLevel, source.path),
        stem: unit.stem || null,
        text: unit.text,
        box: clampBox(unit.box, width, height),
        pageSize: { width, height },
        figures: sharedFrom ? figures : figures.map((figure, index) => ({ ...figure, storagePath: cropPath(id, source.version, index) })),
        runId,
        model,
      },
    });
    docByUnit.set(unitIndex, docs[docs.length - 1]);
  }
  return docs;
}

// A page without a year heading comes back with no year level while its
// neighbours have one; the file's most common level fills the gap.
function majorityYearLevel(yearLevels) {
  const counts = new Map();
  for (const level of yearLevels) if (level) counts.set(level, (counts.get(level) || 0) + 1);
  let best = null;
  for (const [level, count] of counts) if (!best || count > counts.get(best)) best = level;
  return best;
}

module.exports = { QUESTIONS_COLLECTION, majorityYearLevel, parseRequestId, questionId, questionNumberOf, requestId, sharedFigureParents, toQuestionDocs };
