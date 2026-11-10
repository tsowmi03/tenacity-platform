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
        required: ["index", "outcome", "questionStem", "text"],
        properties: {
          index: { type: "integer" },
          outcome: { type: "string", enum: ["fine", "reworded", "needs_diagram"] },
          questionStem: str,
          text: str,
        },
      },
    },
  },
};

const SYSTEM_PROMPT = `Each item below is an exam question, or one part of a question, that was written expecting a diagram. The diagram could not be made, so it will print without one. Decide what each needs.
- "fine": it reads correctly and can be answered as printed. A student being asked to draw or sketch something themselves is fine. Leave questionStem and text empty.
- "reworded": it refers to a diagram that won't be there, but its words already give everything needed to answer it. Return questionStem and text with only that reference changed, so the question stands alone. Keep every number, name, unit, LaTeX expression and instruction, and the same answer. Leave a field empty if it needs no change.
- "needs_diagram": it can't be answered without the picture. Leave questionStem and text empty.
Return one entry per item, using its index.`;

const FIELD = (node) => (typeof node?.stem === "string" ? "stem" : "instruction");
const NUMBER = /\d+(?:\.\d+)?/g;

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

// A rewording may only remove the reference. Losing a number could change the
// answer, and a leftover mention leaves the problem in place.
function safeRewording(before, after) {
  const text = String(after || "").trim();
  if (!text || /\bdiagram\b/i.test(text)) return false;
  const kept = text.match(NUMBER) || [];
  return (String(before || "").match(NUMBER) || []).every((n) => kept.includes(n));
}

function applyRewording(entry, item) {
  const changes = [];
  if (item.questionStem && entry.question !== entry.owner) changes.push([entry.question, item.questionStem]);
  if (item.text) changes.push([entry.owner, item.text]);
  if (!changes.length || !changes.every(([node, after]) => safeRewording(node[FIELD(node)], after))) return false;
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
  const entries = omissions.filter((omission) => omission.owner)
    .map((omission) => ({ ...omission, question: questionOf(parsed, omission.owner) }));
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
      userMessage: entries.map((entry, i) => JSON.stringify({
        index: i + 1,
        questionStem: entry.question === entry.owner ? "" : entry.question[FIELD(entry.question)],
        text: entry.owner[FIELD(entry.owner)],
      })).join("\n"),
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
      result.notes.push({ label: entry.label, note: "Left out. The question works without it." });
    } else if (item?.outcome === "reworded" && applyRewording(entry, item)) {
      result.notes.push({ label: entry.label, note: "Left out. The question was reworded so it doesn't need one." });
    } else {
      result.warnings.push(tutorWarning(entry));
    }
  });
  return result;
}

module.exports = { settleOmittedDiagrams, safeRewording };
