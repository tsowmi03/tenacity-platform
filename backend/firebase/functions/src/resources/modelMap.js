"use strict";

// Model CHOICE used to generate each resource type when a job names no
// choice: the Anthropic choice (see modelRegistry.js) across the board.
// These resources are long, structured JSON documents carrying LaTeX and
// worked mathematical solutions, which is exactly where the Opus tier pulls
// ahead — fewer invalid-JSON responses to repair and fewer arithmetic slips in
// mark schemes. Per-type entries are kept (rather than a single constant) so a
// future change can move one resource type without touching the others.
//
// The RESOURCE_LLM_MODEL env var overrides every entry here; see
// configuredModelForResourceType() in index.js.
const { LEGACY_CHOICE } = require("./modelRegistry");

const RESOURCE_CHOICE = LEGACY_CHOICE;

const MODEL_MAP = {
  "practice-paper": RESOURCE_CHOICE,
  "topic-booklet": RESOURCE_CHOICE,
  "study-guide": RESOURCE_CHOICE,
  "annotation-task": RESOURCE_CHOICE,
  "essay-scaffold": RESOURCE_CHOICE,
  custom: RESOURCE_CHOICE,
  worksheet: RESOURCE_CHOICE,
  "diagnostic-test": RESOURCE_CHOICE,
  "mixed-review": RESOURCE_CHOICE,
};

const RESOURCE_TYPES = Object.freeze(Object.keys(MODEL_MAP));
const ENGLISH_ONLY_RESOURCE_TYPES = new Set([
  "annotation-task",
  "essay-scaffold",
]);

module.exports = {
  ENGLISH_ONLY_RESOURCE_TYPES,
  MODEL_MAP,
  RESOURCE_CHOICE,
  RESOURCE_TYPES,
};
