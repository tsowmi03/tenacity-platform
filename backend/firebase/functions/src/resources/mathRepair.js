"use strict";

// Maths the renderer can't typeset used to ship as plain text with a warning
// (RES-19). A resource is now held back until it renders cleanly: after a
// build that reports fallbacks, only the fields holding the broken notation
// go back to the model for a notation-only rewrite, and the document is
// rebuilt from the same content. If that doesn't clear them, the job fails
// with the expressions named instead of becoming Ready (RES-45).

const { cleanText } = require("./builder/shared");
const { arrayOf, int, obj, str } = require("./responseSchema");
const { controlError } = require("./durableStages");
const { mathFallbackWarning } = require("./mathNotation");

const MATH_REPAIR_ROUNDS = 2;
const MAX_REPAIR_FIELDS = 20;
const MATH_REPAIR_MAX_TOKENS = 16000;
const MATH_REPAIR_EFFORT = "low";

// Keys whose strings are never rendered as maths, so never repair targets.
const SKIPPED_KEYS = new Set(["diagram", "subject", "resourceType", "year", "type"]);

function comparable(value) {
  return cleanText(value).replace(/\s+/g, " ").trim();
}

// Every rendered string leaf, with a setter that writes a fix back in place.
function stringFields(root) {
  const out = [];
  const walk = (value, path) => {
    if (Array.isArray(value)) {
      value.forEach((child, index) => {
        if (typeof child === "string") out.push({ path: [...path, index], text: child, set: (next) => { value[index] = next; } });
        else walk(child, [...path, index]);
      });
    } else if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        if (SKIPPED_KEYS.has(key)) continue;
        if (typeof child === "string") out.push({ path: [...path, key], text: child, set: (next) => { value[key] = next; } });
        else walk(child, [...path, key]);
      }
    }
  };
  walk(root, []);
  return out;
}

/**
 * The fields holding each reported expression. An issue's source is the
 * span or token the renderer failed on, after the builder's own cleaning, so
 * fields are compared in that cleaned form.
 */
function affectedFields(resource, issues) {
  const fields = stringFields(resource).map((field) => ({ ...field, clean: comparable(field.text) }));
  const affected = new Map();
  for (const issue of issues) {
    const source = comparable(issue.source);
    if (!source) continue;
    for (const field of fields) {
      if (!field.clean.includes(source)) continue;
      const key = field.path.join(".");
      if (!affected.has(key)) affected.set(key, { ...field, issues: [] });
      affected.get(key).issues.push(issue);
    }
  }
  return [...affected.values()].slice(0, MAX_REPAIR_FIELDS);
}

const SYSTEM_PROMPT = `You fix maths notation in a teaching resource. A document renderer could not typeset some expressions.

Supported notation: a LaTeX subset — ^ and _ with braces for anything longer than one character (x^{12}, a_{n+1}), \\frac{a}{b}, \\sqrt{x}, \\sqrt[3]{x}, |x| for absolute value, \\begin{cases}...\\end{cases}, \\begin{pmatrix}...\\end{pmatrix}, Greek letters and common symbols (\\times, \\div, \\leq, \\pi, \\theta).

For each numbered text, return it rewritten so every expression uses only that notation, with balanced braces and every ^ or _ attached to a base and an argument. Keep the mathematical meaning exactly. Keep every word, number and answer that is not part of the broken notation exactly as written. Do not solve, reword or add anything.

Return only JSON: { "fixes": [{ "index": number, "text": string }] }. No markdown fences.`;

function buildRepairSchema() {
  return obj({ fixes: arrayOf(obj({ index: int, text: str })) });
}

function proseWords(value) {
  return String(value).replace(/\\[A-Za-z]+/g, " ").match(/[A-Za-z]{3,}/g) || [];
}

// A notation fix keeps the length roughly and the words entirely; a rewrite
// that drops either is no longer the same text.
function plausibleRewrite(before, after) {
  if (typeof after !== "string" || !after.trim()) return false;
  if (after.length > before.length * 1.6 + 20 || after.length < before.length * 0.6) return false;
  const kept = new Set(proseWords(after));
  const words = proseWords(before);
  return words.filter((word) => kept.has(word)).length >= words.length * 0.8;
}

/**
 * One bounded repair round. Mutates `resource` and returns how many fields
 * changed. `attempt` is part of the prompt so a tutor's Retry asks afresh
 * while saved stages (RES-44) still replay the rest of the job unchanged.
 */
async function repairMathFallbacks({ resource, issues, callAi, model, round, attempt, signal }) {
  const fields = affectedFields(resource, issues);
  if (!fields.length) return 0;
  const listed = fields.map((field, index) => {
    const failing = [...new Set(field.issues.map((issue) => issue.source))].join(" | ");
    const where = field.issues.find((issue) => issue.location)?.location;
    return `${index + 1}.${where ? ` (${where})` : ""} could not typeset: ${failing}\n${JSON.stringify(field.text)}`;
  }).join("\n\n");
  const { parsed } = await callAi({
    model,
    maxTokens: MATH_REPAIR_MAX_TOKENS,
    effort: MATH_REPAIR_EFFORT,
    systemPrompt: SYSTEM_PROMPT,
    userMessage: `Repair round ${round}, attempt ${attempt}.\n\n${listed}`,
    signal,
    responseSchema: buildRepairSchema(),
    stageLabel: `Fixing maths formatting in ${fields.length} ${fields.length === 1 ? "place" : "places"}`,
  });
  let changed = 0;
  for (const fix of Array.isArray(parsed?.fixes) ? parsed.fixes : []) {
    const field = fields[Number(fix?.index) - 1];
    if (!field || fix.text === field.text || !plausibleRewrite(field.text, fix.text)) continue;
    field.set(fix.text);
    changed += 1;
  }
  return changed;
}

function unresolvedMathError(issues) {
  const { items } = mathFallbackWarning(issues);
  const listed = items.slice(0, 5)
    .map((item) => (item.location ? `${item.location} "${item.source}"` : `"${item.source}"`))
    .join(", ");
  const more = issues.length > 5 ? ` and ${issues.length - 5} more` : "";
  const err = controlError(
    "RESOURCE_MATH_UNRESOLVED",
    `Some maths couldn't be formatted, so the document was held back: ${listed}${more}. ` +
      "Press Retry to try the repair again, or reword those questions in your prompt."
  );
  err.mathIssues = items;
  return err;
}

module.exports = {
  MATH_REPAIR_ROUNDS,
  affectedFields,
  repairMathFallbacks,
  unresolvedMathError,
};
