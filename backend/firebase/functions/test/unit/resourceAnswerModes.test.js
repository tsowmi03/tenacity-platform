"use strict";

// RES-36: each answer mode must produce exactly what its portal label promises.
//   English — "Marking guide" (answers): criteria only, no response at all.
//             "Model answers" (worked): the answer itself, not directions.
//   Maths   — "Answers only" (answers): final answer, no working.
//             "Answers with working out" (worked): every step, explained.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { buildSystemPrompt } = require("../../src/resources/promptBuilder");

const ENGLISH_GUIDE_TYPES = [
  "practice-paper",
  "worksheet",
  "diagnostic-test",
  "mixed-review",
  "annotation-task",
  "custom",
];

function prompt(resourceType, subject, answerMode, extra = {}) {
  return buildSystemPrompt(resourceType, { year: 9, subject, answerMode, ...extra });
}

describe("English Marking guide mode", () => {
  it("never asks for a suggested response", () => {
    for (const resourceType of ENGLISH_GUIDE_TYPES) {
      const text = prompt(resourceType, "english", "answers");
      assert.doesNotMatch(text, /"suggestedResponse"/, `${resourceType} asks for a response`);
      assert.match(text, /"markingCriteria"/, `${resourceType} lost its criteria`);
    }
    for (const section of ["all", "assessment"]) {
      const text = prompt("topic-booklet", "english", "answers", { section });
      assert.doesNotMatch(text, /"suggestedResponse"/, `topic-booklet ${section} asks for a response`);
    }
  });

  it("tells the model the guide is criteria only", () => {
    const text = prompt("worksheet", "english", "answers");
    assert.match(text, /marking criteria for each question and nothing else/);
    assert.doesNotMatch(text, /brief summary/);
  });
});
