"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  AUTHORSHIP_RULES,
  DEFAULT_RESOURCE_AUTHOR,
  HUMAN_WRITING_RULES,
  deAiPunctuation,
} = require("../../src/resources/humanStyle");
const { cleanText } = require("../../src/resources/builder/shared");

describe("deAiPunctuation", () => {
  it("replaces a spaced em-dash with a comma", () => {
    assert.equal(
      deAiPunctuation("There is one rule — no em-dashes"),
      "There is one rule, no em-dashes"
    );
  });

  it("removes em-dashes with no surrounding spaces", () => {
    assert.equal(deAiPunctuation("focus—namely effort"), "focus, namely effort");
    assert.doesNotMatch(deAiPunctuation("focus—namely effort"), /—/);
  });

  it("keeps numeric ranges readable by using a hyphen", () => {
    assert.equal(deAiPunctuation("read 5–10"), "read 5-10");
    assert.equal(deAiPunctuation("the years 1914—1918"), "the years 1914-1918");
  });

  it("converts curly quotes and apostrophes to straight ones", () => {
    assert.equal(deAiPunctuation("“hello” ‘world’"), '"hello" \'world\'');
    assert.equal(deAiPunctuation("it’s fine"), "it's fine");
  });

  it("converts the ellipsis character to three full stops", () => {
    assert.equal(deAiPunctuation("wait…"), "wait...");
  });

  it("leaves ordinary hyphenated words and straight quotes untouched", () => {
    assert.equal(deAiPunctuation('a "well-structured" answer'), 'a "well-structured" answer');
    assert.equal(deAiPunctuation("cause/effect"), "cause/effect");
  });

  it("handles non-string input safely", () => {
    assert.equal(deAiPunctuation(null), "");
    assert.equal(deAiPunctuation(undefined), "");
    assert.equal(deAiPunctuation(42), "42");
  });
});

describe("cleanText backstop", () => {
  it("strips em-dashes from rendered text", () => {
    const out = cleanText("Macbeth — a study of ambition");
    assert.doesNotMatch(out, /—/);
    assert.equal(out, "Macbeth, a study of ambition");
  });

  it("normalises curly quotes produced by the model", () => {
    assert.equal(cleanText("“To be”"), '"To be"');
  });
});

describe("writing-rule constants", () => {
  it("forbids em-dashes and en-dashes explicitly", () => {
    assert.match(HUMAN_WRITING_RULES, /em-dash/i);
    assert.match(HUMAN_WRITING_RULES, /NEVER use em-dashes/);
  });

  it("lists representative banned vocabulary and constructions", () => {
    for (const word of ["delve", "tapestry", "testament", "showcase"]) {
      assert.match(HUMAN_WRITING_RULES, new RegExp(`\\b${word}\\b`));
    }
    assert.match(HUMAN_WRITING_RULES, /not only X but also Y/);
    assert.match(HUMAN_WRITING_RULES, /straight quotation marks/i);
  });

  it("defaults generated authorship to Tenacity Resources", () => {
    assert.equal(DEFAULT_RESOURCE_AUTHOR, "Tenacity Resources");
    assert.match(AUTHORSHIP_RULES, /Tenacity Resources/);
    assert.match(AUTHORSHIP_RULES, /public domain/i);
    assert.match(AUTHORSHIP_RULES, /Shakespeare/);
    assert.match(AUTHORSHIP_RULES, /Never fabricate/i);
  });
});
