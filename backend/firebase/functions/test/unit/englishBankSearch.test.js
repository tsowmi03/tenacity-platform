"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { embeddingText, matchesFilters, searchStimuli, usableForYear } = require("../../src/englishBank/search");
const { planEmbeddings } = require("../../scripts/englishBankEmbed");

function stimulus(extra = {}) {
  return {
    id: "s1", status: "live", type: "speech", medium: "written", title: "We Shall Fight", author: "A. Speaker",
    text: "We will not stand by while the planet warms.", wordCount: 320, themes: ["climate change", "responsibility"],
    techniqueIds: ["rhetorical_question", "inclusive_language"], years: [12], ...extra,
  };
}

// A fake Firestore holding stimuli (returned nearest-first, in order), questions and guides.
function fakeDb({ stimuli = [], questions = [], guides = [] } = {}) {
  const calls = { where: [], findNearest: [] };
  const docOf = (record) => ({ id: record.id, data: () => ({ ...record }) });
  const db = {
    calls,
    collection(name) {
      const filters = [];
      const query = {
        where(field, op, value) { filters.push([field, op, value]); calls.where.push([name, field, op, value]); return query; },
        findNearest(options) { calls.findNearest.push(options); return query; },
        select() { return query; },
        limit() { return query; },
        async get() {
          let records = { englishStimuli: stimuli, englishQuestions: questions, englishGuides: guides }[name] || [];
          for (const [field, op, value] of filters) {
            if (op === "==") records = records.filter((r) => r[field] === value);
            if (op === "array-contains") records = records.filter((r) => (r[field] || []).includes(value));
            if (op === "in") records = records.filter((r) => value.includes(r[field]));
          }
          return { docs: records.map(docOf) };
        },
      };
      return query;
    },
  };
  return db;
}

const embed = async (texts) => texts.map(() => [0.1, 0.2]);

describe("English bank search: year rule", () => {
  it("lets Years 7-12 use any stimulus", () => {
    for (const year of [7, 9, 12]) {
      assert.equal(usableForYear(stimulus({ years: [12] }), year), true);
      assert.equal(usableForYear(stimulus({ years: [5] }), year), true);
    }
  });

  it("lets Years 5-6 use stimuli up to Year 10, and untagged ones, but not Year 11-12 only", () => {
    assert.equal(usableForYear(stimulus({ years: [10] }), 5), true);
    assert.equal(usableForYear(stimulus({ years: [7, 8, 9, 10] }), 6), true);
    assert.equal(usableForYear(stimulus({ years: [10, 11] }), 6), true);
    assert.equal(usableForYear(stimulus({ years: [] }), 5), true);
    assert.equal(usableForYear(stimulus({ years: undefined }), 5), true);
    assert.equal(usableForYear(stimulus({ years: [12] }), 5), false);
    assert.equal(usableForYear(stimulus({ years: [11, 12] }), 6), false);
  });

  it("applies no year rule when no student year is given", () => {
    assert.equal(usableForYear(stimulus({ years: [12] }), undefined), true);
  });
});

describe("English bank search: filters", () => {
  it("passes only live stimuli", () => {
    assert.equal(matchesFilters(stimulus()), true);
    assert.equal(matchesFilters(stimulus({ status: "hidden" })), false);
  });

  it("filters by medium, type, technique and theme", () => {
    const s = stimulus();
    assert.equal(matchesFilters(s, { medium: "visual" }), false);
    assert.equal(matchesFilters(s, { type: ["speech", "nonfiction"] }), true);
    assert.equal(matchesFilters(s, { type: "poem" }), false);
    assert.equal(matchesFilters(s, { techniques: ["imagery", "inclusive_language"] }), true);
    assert.equal(matchesFilters(s, { techniques: ["imagery"] }), false);
    assert.equal(matchesFilters(s, { themes: ["Climate"] }), true);
    assert.equal(matchesFilters(s, { themes: ["belonging"] }), false);
  });

  it("filters written stimuli by length, but never a visual", () => {
    assert.equal(matchesFilters(stimulus({ wordCount: 320 }), { minWords: 200, maxWords: 400 }), true);
    assert.equal(matchesFilters(stimulus({ wordCount: 900 }), { maxWords: 400 }), false);
    assert.equal(matchesFilters(stimulus({ wordCount: 90 }), { minWords: 200 }), false);
    assert.equal(matchesFilters(stimulus({ medium: "visual", type: "photograph", wordCount: 0 }), { minWords: 200 }), true);
  });

  it("drops excluded IDs and applies the year rule", () => {
    assert.equal(matchesFilters(stimulus(), { excludeIds: ["s1"] }), false);
    assert.equal(matchesFilters(stimulus({ years: [12] }), { studentYear: 5 }), false);
    assert.equal(matchesFilters(stimulus({ years: [12] }), { studentYear: 8 }), true);
  });
});

describe("English bank search: searchStimuli", () => {
  it("returns the nearest stimuli that pass the filters, without the embedding", async () => {
    const db = fakeDb({ stimuli: [
      stimulus({ id: "a", years: [12], embedding: [1, 2] }),
      stimulus({ id: "b", years: [6] }),
      stimulus({ id: "c", years: [9], status: "hidden" }),
      stimulus({ id: "d", years: [] }),
    ] });
    const results = await searchStimuli({ db, embed, brief: "persuasive speech on climate", filters: { studentYear: 5 }, limit: 5 });
    assert.deepEqual(results.map((r) => r.id), ["b", "d"]);
    assert.equal("embedding" in results[0], false);
    assert.equal(db.calls.findNearest[0].vectorField, "embedding");
  });

  it("pre-filters on medium in Firestore and asks for more candidates for Years 5-6", async () => {
    const db = fakeDb({ stimuli: [stimulus({ id: "v", medium: "visual", type: "photograph" })] });
    await searchStimuli({ db, embed, brief: "photo", filters: { medium: "visual" }, limit: 4 });
    assert.ok(db.calls.where.some(([, field, , value]) => field === "medium" && value === "visual"));
    const wide = db.calls.findNearest[0].limit;
    await searchStimuli({ db, embed, brief: "photo", filters: { medium: "visual", studentYear: 5 }, limit: 4 });
    assert.ok(db.calls.findNearest[1].limit > wide);
  });

  it("attaches each stimulus's live questions and their guide entries", async () => {
    const db = fakeDb({
      stimuli: [stimulus({ id: "s1" })],
      questions: [
        { id: "q1", status: "live", stimulusIds: ["s1"], label: "Question 1", text: "Explain the speaker's tone.", marks: 3 },
        { id: "q2", status: "hidden", stimulusIds: ["s1"], label: "Question 2", text: "Hidden" },
        { id: "q3", status: "live", stimulusIds: ["other"], label: "Question 3", text: "Not this one" },
      ],
      guides: [{ id: "g1", status: "live", questionId: "q1", criteria: "Identifies an urgent tone", sampleAnswer: null }],
    });
    const [result] = await searchStimuli({ db, embed, brief: "speech", withLinks: true });
    assert.deepEqual(result.questions.map((q) => q.id), ["q1"]);
    assert.deepEqual(result.questions[0].guide, [{ id: "g1", criteria: "Identifies an urgent tone", sampleAnswer: null }]);
  });
});

describe("English bank embeddings", () => {
  it("embeds what the stimulus is, its themes and techniques, and how it opens", () => {
    const text = embeddingText(stimulus({ text: "x".repeat(4000) }));
    assert.match(text, /^speech \/ We Shall Fight \/ A\. Speaker/);
    assert.match(text, /Themes: climate change, responsibility/);
    assert.match(text, /Techniques: rhetorical_question, inclusive_language/);
    assert.ok(text.length < 1700);
    assert.match(embeddingText(stimulus({ medium: "visual", text: null, visualDescription: "A flooded street" })), /A flooded street/);
  });

  it("embeds a live stimulus only when its text changed", () => {
    const fresh = stimulus({ id: "new" });
    const [planned] = planEmbeddings([fresh]);
    assert.equal(planned.id, "new");
    assert.deepEqual(planEmbeddings([{ ...fresh, embeddingHash: planned.hash }]), []);
    assert.deepEqual(planEmbeddings([stimulus({ status: "hidden" })]), []);
  });
});
