"use strict";

// RES-57. Turns one page's extraction result into question bank records. Pure,
// so the rules are unit tested; the CLI does the I/O.

const { clampBox } = require("./pages");
const { splitSkillId } = require("./taxonomy");

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

function questionId(sourceId, pageNumber, index) {
  return `${sourceId}_p${pageNumber}_${index + 1}`;
}

/**
 * The question records for one page. Units without a usable diagram are
 * dropped; a skill that names a type none of the unit's diagrams has falls
 * back to that diagram type's "other".
 */
function toQuestionDocs({ source, pageNumber, width, height, units, runId, model }) {
  const docs = [];
  for (const unit of units) {
    const figures = unit.figures
      .map((figure) => ({ type: figure.type, description: figure.description, box: clampBox(figure.box, width, height) }))
      .filter((figure) => figure.box);
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
        topic: unit.topic,
        yearLevel: unit.yearLevel || null,
        stem: unit.stem || null,
        text: unit.text,
        box: clampBox(unit.box, width, height),
        pageSize: { width, height },
        figures: figures.map((figure, index) => ({ ...figure, storagePath: `questionBank/diagrams/${id}_${index + 1}.png` })),
        runId,
        model,
      },
    });
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

module.exports = { QUESTIONS_COLLECTION, majorityYearLevel, parseRequestId, questionId, requestId, toQuestionDocs };
