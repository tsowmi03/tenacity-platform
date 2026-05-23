"use strict";

const MODEL_MAP = {
  "practice-paper": "claude-sonnet-4-20250514",
  "topic-booklet": "claude-sonnet-4-20250514",
  "study-guide": "claude-sonnet-4-20250514",
  "annotation-task": "claude-sonnet-4-20250514",
  "essay-scaffold": "claude-sonnet-4-20250514",
  custom: "claude-sonnet-4-20250514",
  worksheet: "claude-sonnet-4-20250514",
  "diagnostic-test": "claude-sonnet-4-20250514",
  "mixed-review": "claude-sonnet-4-20250514",
};

const RESOURCE_TYPES = Object.freeze(Object.keys(MODEL_MAP));
const ENGLISH_ONLY_RESOURCE_TYPES = new Set([
  "annotation-task",
  "essay-scaffold",
]);

module.exports = {
  ENGLISH_ONLY_RESOURCE_TYPES,
  MODEL_MAP,
  RESOURCE_TYPES,
};
