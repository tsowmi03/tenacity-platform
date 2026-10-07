"use strict";

// RES-37: every English prompt carries Tenacity's English guidance, and the
// marking rules are written from it, so marks, criteria and model answers share
// one standard.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { buildSystemPrompt } = require("../../src/resources/promptBuilder");
const {
  ENGLISH_CRITERIA_RULE,
  ENGLISH_GUIDANCE,
} = require("../../src/resources/englishGuidance");
const { HUMAN_WRITING_RULES } = require("../../src/resources/humanStyle");

const SUBJECT_TYPES = [
  "practice-paper",
  "topic-booklet",
  "study-guide",
  "worksheet",
  "diagnostic-test",
  "mixed-review",
  "custom",
];
const ENGLISH_ONLY_TYPES = ["annotation-task", "essay-scaffold"];

function prompt(resourceType, subject, extra = {}) {
  return buildSystemPrompt(resourceType, { year: 9, subject, ...extra });
}

function occurrences(text, fragment) {
  return text.split(fragment).length - 1;
}

describe("English guidance in system prompts", () => {
  it("appears exactly once in every English prompt", () => {
    for (const resourceType of [...SUBJECT_TYPES, ...ENGLISH_ONLY_TYPES]) {
      const text = prompt(resourceType, "english");
      assert.equal(occurrences(text, ENGLISH_GUIDANCE), 1, resourceType);
    }
    for (const section of ["content", "assessment"]) {
      const text = prompt("topic-booklet", "english", { section });
      assert.equal(occurrences(text, ENGLISH_GUIDANCE), 1, `topic-booklet ${section}`);
    }
  });

  it("is left out of maths prompts", () => {
    for (const resourceType of SUBJECT_TYPES) {
      assert.doesNotMatch(prompt(resourceType, "maths"), /HOW TENACITY TEACHES ENGLISH/, resourceType);
    }
  });

  it("is carried by the English-only types whatever the subject field says", () => {
    for (const resourceType of ENGLISH_ONLY_TYPES) {
      assert.match(prompt(resourceType, "maths"), /HOW TENACITY TEACHES ENGLISH/, resourceType);
    }
  });

  it("follows the house writing rules it asks the model to follow", () => {
    assert.doesNotMatch(ENGLISH_GUIDANCE, /[—–]/);
    const banned = /Banned vocabulary[^:]*: ([^\n]+)/.exec(HUMAN_WRITING_RULES)[1]
      .replace(/\.$/, "")
      .split(", ")
      .filter((word) => !word.includes("("));
    for (const word of banned) {
      assert.doesNotMatch(ENGLISH_GUIDANCE, new RegExp(`\\b${word}\\b`, "i"), word);
    }
  });
});

describe("English marking follows the guidance", () => {
  it("writes criteria from the guidance in both tutor-copy modes", () => {
    for (const answerMode of ["answers", "worked"]) {
      assert.match(prompt("worksheet", "english", { answerMode }), new RegExp(escape(ENGLISH_CRITERIA_RULE)));
    }
    assert.doesNotMatch(prompt("worksheet", "english", { answerMode: "none" }), /Write each question's marking criteria/);
  });

  it("builds model answers from the short-answer table and plans essays in TETAL", () => {
    const text = prompt("practice-paper", "english", { answerMode: "worked" });
    assert.match(text, /SHORT-ANSWER QUESTIONS table/);
    assert.match(text, /Give a TETAL plan as dot points/);
    assert.match(text, /"- Paragraph 1 thesis: …"/);
    assert.match(text, /"- ETA: "quotation" · technique · analysis"/);
  });

  it("teaches booklet analysis and essay scaffolds in the house structure", () => {
    assert.match(prompt("topic-booklet", "english"), /model analysis written as ETAs/);
    assert.match(prompt("topic-booklet", "english"), /exemplar paragraph written in TETAL/);
    assert.match(prompt("essay-scaffold", "english"), /For an analytical essay, follow TETAL/);
  });
});

function escape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
