"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  canonicalTopicList,
  isCanonicalTopic,
  normaliseTopic,
  normaliseTopics,
} = require("../../src/resources/topicTaxonomy");
const { extractJobTopics } = require("../../src/resources");
const { buildSystemPrompt } = require("../../src/resources/promptBuilder");

describe("topicTaxonomy.normaliseTopic", () => {
  it("lowercases and trims", () => {
    assert.equal(normaliseTopic("  Trigonometry "), "trigonometry");
  });

  it("collapses internal whitespace", () => {
    assert.equal(normaliseTopic("quadratic   equations"), "quadratic equations");
  });

  it("resolves abbreviations through the alias map", () => {
    assert.equal(normaliseTopic("trig"), "trigonometry");
    assert.equal(normaliseTopic("logs"), "logarithms");
    assert.equal(normaliseTopic("quads"), "quadratic equations");
  });

  it("collapses variant spellings to one canonical string", () => {
    const variants = ["quadratics", "quadratic", "parabolas", "QUADRATIC EQUATIONS"];
    const normalised = new Set(variants.map(normaliseTopic));
    assert.equal(normalised.size, 1);
    assert.ok(normalised.has("quadratic equations"));
  });

  it("passes through free-text titles lowercased (not in vocabulary)", () => {
    assert.equal(normaliseTopic("Macbeth"), "macbeth");
    assert.equal(normaliseTopic("The Great Gatsby"), "the great gatsby");
  });

  it("returns empty string for non-strings and blanks", () => {
    assert.equal(normaliseTopic(null), "");
    assert.equal(normaliseTopic(42), "");
    assert.equal(normaliseTopic("   "), "");
  });
});

describe("topicTaxonomy.normaliseTopics", () => {
  it("dedupes after alias resolution", () => {
    assert.deepEqual(
      normaliseTopics(["Quadratics", "quads", "quadratic equations"]),
      ["quadratic equations"]
    );
  });

  it("drops empty and non-string entries, preserves order", () => {
    assert.deepEqual(
      normaliseTopics(["Indices", "", null, 7, "Trig"]),
      ["indices", "trigonometry"]
    );
  });

  it("returns [] for non-array input", () => {
    assert.deepEqual(normaliseTopics(undefined), []);
    assert.deepEqual(normaliseTopics("indices"), []);
  });

  it("caps the number of stored topics", () => {
    const many = Array.from({ length: 40 }, (_, i) => `topic ${i}`);
    assert.equal(normaliseTopics(many, { limit: 25 }).length, 25);
  });
});

describe("topicTaxonomy.canonicalTopicList", () => {
  it("returns maths topics for maths", () => {
    const list = canonicalTopicList("maths");
    assert.ok(list.includes("trigonometry"));
    assert.ok(list.includes("quadratic equations"));
  });

  it("returns english skills for english", () => {
    const list = canonicalTopicList("english");
    assert.ok(list.includes("close reading"));
    assert.ok(!list.includes("trigonometry"));
  });

  it("flags canonical vs free-text topics", () => {
    assert.equal(isCanonicalTopic("trig"), true);
    assert.equal(isCanonicalTopic("macbeth"), false);
  });
});

describe("extractJobTopics", () => {
  it("reads a topics[] array (practice-paper, study-guide, etc.)", () => {
    assert.deepEqual(
      extractJobTopics({ topics: ["Quadratics", "Indices"] }),
      ["quadratic equations", "indices"]
    );
  });

  it("reads a single topic string (worksheet, topic-booklet, custom)", () => {
    assert.deepEqual(extractJobTopics({ topic: "Trigonometry" }), ["trigonometry"]);
  });

  it("prefers topics[] when both are present and non-empty", () => {
    assert.deepEqual(
      extractJobTopics({ topics: ["Surds"], topic: "Indices" }),
      ["surds"]
    );
  });

  it("falls back to topic string when topics[] is empty", () => {
    assert.deepEqual(
      extractJobTopics({ topics: [], topic: "Indices" }),
      ["indices"]
    );
  });

  it("returns [] when no topic data is present", () => {
    assert.deepEqual(extractJobTopics({ title: "Year 10 Maths" }), []);
    assert.deepEqual(extractJobTopics(null), []);
  });

  it("never throws on malformed topic data", () => {
    assert.deepEqual(extractJobTopics({ topics: "not-an-array" }), []);
    assert.deepEqual(extractJobTopics({ topics: [1, 2, {}] }), []);
  });

  it("keeps free-text English text titles", () => {
    assert.deepEqual(
      extractJobTopics({ topics: ["Macbeth", "close reading"] }),
      ["macbeth", "close reading"]
    );
  });
});

describe("prompt schemas include topics", () => {
  const cases = [
    ["practice-paper", "maths"],
    ["practice-paper", "english"],
    ["annotation-task", "english"],
    ["essay-scaffold", "english"],
  ];

  for (const [resourceType, subject] of cases) {
    it(`${resourceType} (${subject}) asks for a topics array and canonical vocabulary`, () => {
      const prompt = buildSystemPrompt(resourceType, { year: 10, subject });
      assert.ok(prompt.includes('"topics": string[]'), "schema has topics field");
      assert.ok(/canonical names/i.test(prompt), "prompt mentions canonical vocabulary");
    });
  }

  it("maths practice paper lists maths topics, english lists english skills", () => {
    const maths = buildSystemPrompt("practice-paper", { year: 10, subject: "maths" });
    const english = buildSystemPrompt("annotation-task", { year: 10, subject: "english" });
    assert.ok(maths.includes("trigonometry"));
    assert.ok(english.includes("close reading"));
  });
});
