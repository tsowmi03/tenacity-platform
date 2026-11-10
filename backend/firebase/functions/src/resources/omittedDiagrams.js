"use strict";

const { optionalDiagramOmittedWarning } = require("./builder/diagrams");
const { isCancellationError } = require("./cancellation");
const { resourceEvent } = require("./resourceLog");

const str = { type: "string" };
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "outcome", "stem", "parts"],
        properties: {
          index: { type: "integer" },
          outcome: { type: "string", enum: ["fine", "reworded", "needs_diagram"] },
          stem: str,
          parts: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "stem"],
              properties: { label: str, stem: str },
            },
          },
        },
      },
    },
  },
};

const SYSTEM_PROMPT = `Each item below is a whole exam question, with any parts and options. The diagrams listed in missingDiagrams could not be made, so they will print without them. Diagrams marked hasDiagram are still there. Judge every part, not just the first line.
- "fine": every part reads correctly and can be answered as printed. A student being asked to draw or sketch something themselves is fine. Leave stem empty and parts empty.
- "reworded": something refers to a missing diagram, but the words already give everything needed to answer every part. Return the new stem, and an entry in parts for each part you change, with only that reference changed so the question stands alone. Keep every number, name, unit, LaTeX expression and instruction, and the same answers. Leave stem empty if it needs no change, and leave out parts that need no change.
- "needs_diagram": any part can't be answered without a missing diagram. Leave stem empty and parts empty.
Return one entry per item, using its index.`;

const FIELD = (node) => (typeof node?.stem === "string" ? "stem" : "instruction");
const NUMBER = /\d+(?:\.\d+)?/g;
const MENTIONS_DIAGRAM = /\bdiagram\b/i;
const partKey = (label) => String(label ?? "").replace(/[()\s]/g, "").toLowerCase();

// The question holding `owner`: itself, or the question whose parts include it.
function questionOf(root, owner) {
  let found = null;
  const walk = (node) => {
    if (found || !node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (Array.isArray(node.parts) && node.parts.includes(owner)) { found = node; return; }
    Object.values(node).forEach(walk);
  };
  walk(root);
  return found || owner;
}

// One entry per question, so every part is judged together.
function groupByQuestion(parsed, omissions) {
  const groups = new Map();
  for (const omission of omissions) {
    const question = questionOf(parsed, omission.owner);
    if (!groups.has(question)) groups.set(question, []);
    groups.get(question).push(omission);
  }
  return [...groups].map(([question, members]) => ({ question, members }));
}

function describeQuestion({ question, members }, index) {
  const parts = Array.isArray(question.parts) ? question.parts : [];
  return JSON.stringify({
    index,
    missingDiagrams: members.map(({ owner }) => (owner === question ? "the question" : `part ${owner.label}`)),
    stem: question[FIELD(question)],
    hasDiagram: Boolean(question.diagram),
    options: question.options || undefined,
    parts: parts.map((part) => ({ label: part.label, stem: part[FIELD(part)], options: part.options || undefined, hasDiagram: Boolean(part.diagram) })),
  });
}

// A rewording may only remove the reference. Losing a number could change the
// answer, and a leftover mention leaves the problem in place.
function safeRewording(before, after) {
  const text = String(after || "").trim();
  if (!text || MENTIONS_DIAGRAM.test(text)) return false;
  const kept = text.match(NUMBER) || [];
  return (String(before || "").match(NUMBER) || []).every((n) => kept.includes(n));
}

function applyRewording({ question }, item) {
  const parts = Array.isArray(question.parts) ? question.parts : [];
  const changes = new Map();
  if (item.stem) changes.set(question, item.stem);
  for (const row of Array.isArray(item.parts) ? item.parts : []) {
    if (!row?.stem) continue;
    const part = parts.find((candidate) => partKey(candidate.label) === partKey(row.label));
    if (!part) return false;
    changes.set(part, row.stem);
  }
  if (!changes.size) return false;
  for (const [node, after] of changes) {
    if (node.diagram || !safeRewording(node[FIELD(node)], after)) return false;
  }
  // Nothing left may point at a picture that isn't printed. A part can still
  // refer to a diagram the question itself keeps.
  const stranded = [question, ...parts].some((node) => !node.diagram && !question.diagram &&
    MENTIONS_DIAGRAM.test(changes.get(node) ?? node[FIELD(node)] ?? ""));
  if (stranded) return false;
  for (const [node, after] of changes) node[FIELD(node)] = after.trim();
  return true;
}

function tutorWarning({ label, diagramType, detail }) {
  return optionalDiagramOmittedWarning({ label, diagramType, detail });
}

/**
 * Decide what each diagram that couldn't be made means for the finished
 * resource. A question that works without it, or can be reworded to, is not the
 * tutor's problem; only one that can't work without the picture is a warning.
 */
async function settleOmittedDiagrams({ job, parsed, omissions, callAi, model, effort, signal }) {
  const result = { warnings: [], notes: [] };
  const entries = groupByQuestion(parsed, omissions.filter((omission) => omission.owner));
  result.warnings.push(...omissions.filter((omission) => !omission.owner).map(tutorWarning));
  if (!entries.length) return result;

  let items = [];
  try {
    const { parsed: answer } = await callAi({
      progressPhase: "diagrams",
      apiKey: null,
      model,
      maxTokens: 8000,
      effort,
      systemPrompt: SYSTEM_PROMPT,
      userMessage: entries.map((entry, i) => describeQuestion(entry, i + 1)).join("\n"),
      signal,
      responseSchema: SCHEMA,
      mathBearing: true,
      bestEffort: true,
    });
    items = Array.isArray(answer?.items) ? answer.items : [];
  } catch (err) {
    if (isCancellationError(err) || (err?.resourceControl && err.code !== "RESOURCE_STAGE_TIMEOUT")) throw err;
    resourceEvent(job, "diagrams.omissions_unchecked", { errorCode: err?.code || "PROVIDER_FAILURE" }, "warn");
  }

  entries.forEach((entry, i) => {
    const item = items.find((row) => Number(row?.index) === i + 1);
    if (item?.outcome === "fine") {
      result.notes.push(...entry.members.map(({ label }) => ({ label, note: "Left out. The question works without it." })));
    } else if (item?.outcome === "reworded" && applyRewording(entry, item)) {
      result.notes.push(...entry.members.map(({ label }) => ({ label, note: "Left out. The question was reworded so it doesn't need one." })));
    } else {
      result.warnings.push(...entry.members.map(tutorWarning));
    }
  });
  return result;
}

module.exports = { settleOmittedDiagrams, safeRewording };
