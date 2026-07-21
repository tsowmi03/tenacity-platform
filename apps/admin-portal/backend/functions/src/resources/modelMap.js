"use strict";

const MODEL_MAP = {
  "practice-paper": "claude-sonnet-4-6",
  "topic-booklet": "claude-sonnet-4-6",
  "study-guide": "claude-sonnet-4-6",
  "annotation-task": "claude-sonnet-4-6",
  "essay-scaffold": "claude-sonnet-4-6",
  custom: "claude-sonnet-4-6",
  worksheet: "claude-sonnet-4-6",
  "diagnostic-test": "claude-sonnet-4-6",
  "mixed-review": "claude-sonnet-4-6",
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
