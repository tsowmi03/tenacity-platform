"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  AUTHORSHIP_RULES,
  HUMAN_WRITING_RULES,
  UNATTRIBUTED_PASSAGE_CAPTION,
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

  it("leaves generated writing unattributed and never names the business", () => {
    assert.equal(UNATTRIBUTED_PASSAGE_CAPTION, "Original passage");
    assert.doesNotMatch(AUTHORSHIP_RULES, /Tenacity/i);
    assert.match(AUTHORSHIP_RULES, /author field null for your own writing/);
    assert.match(AUTHORSHIP_RULES, /public domain/i);
    assert.match(AUTHORSHIP_RULES, /Shakespeare/);
    assert.match(AUTHORSHIP_RULES, /Never fabricate/i);
  });

  // RES-28: the rule used to name an author for the model's own writing, and
  // maths has no author field to put one in, so scenarios arrived tagged with
  // it in the stem. The ban has to name the places a maths resource could put
  // a credit, not just the English "author" field.
  it("bans a credit line inside the text itself, scenarios included", () => {
    assert.match(AUTHORSHIP_RULES, /Never write a credit, byline, attribution or source line into the text itself/);
    assert.match(AUTHORSHIP_RULES, /scenario/);
    assert.match(AUTHORSHIP_RULES, /question stem/);
  });
});
