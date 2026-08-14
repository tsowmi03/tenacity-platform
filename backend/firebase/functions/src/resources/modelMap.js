"use strict";

// Claude model used to generate each resource type. Opus 5 across the board:
// these resources are long, structured JSON documents carrying LaTeX and
// worked mathematical solutions, which is exactly where the Opus tier pulls
// ahead — fewer invalid-JSON responses to repair and fewer arithmetic slips in
// mark schemes. Per-type entries are kept (rather than a single constant) so a
// future change can move one resource type without touching the others.
//
// The RESOURCE_LLM_MODEL env var overrides every entry here at runtime; see
// configuredModelForResourceType() in index.js.
const RESOURCE_MODEL = "claude-opus-5";

const MODEL_MAP = {
  "practice-paper": RESOURCE_MODEL,
  "topic-booklet": RESOURCE_MODEL,
  "study-guide": RESOURCE_MODEL,
  "annotation-task": RESOURCE_MODEL,
  "essay-scaffold": RESOURCE_MODEL,
  custom: RESOURCE_MODEL,
  worksheet: RESOURCE_MODEL,
  "diagnostic-test": RESOURCE_MODEL,
  "mixed-review": RESOURCE_MODEL,
};

const RESOURCE_TYPES = Object.freeze(Object.keys(MODEL_MAP));
const ENGLISH_ONLY_RESOURCE_TYPES = new Set([
  "annotation-task",
  "essay-scaffold",
]);

module.exports = {
  ENGLISH_ONLY_RESOURCE_TYPES,
  MODEL_MAP,
  RESOURCE_MODEL,
  RESOURCE_TYPES,
};
