"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createEmbedder, embeddingText, matchesFilters, searchQuestions, yearsOf } = require("../../src/questionBank/search");
const { findDuplicateGroups, numbersOf, planDuplicateWrites } = require("../../src/questionBank/dedupe");
const { planEmbeddings } = require("../../scripts/questionBankEmbed");

function question(overrides = {}) {
  return {
    id: "a_p1_1",
    status: "live",
    sourceId: "a",
    sourcePath: "Maths/Year 9/Book A.pdf",
    pageNumber: 1,
    kind: "question",
    label: "Q1a",
    diagramType: "right_triangle",
    skill: "find_hypotenuse",
    description: "Find the hypotenuse given the two shorter sides",
    context: "abstract",
    steps: "single",
    difficulty: "easy",
    topic: "Pythagoras' theorem",
    yearLevel: "Year 9",
    years: [9],
    stem: "Find the value of the pronumeral in each triangle.",
    text: "A right-angled triangle has shorter sides $6$ cm and $8$ cm. Find $x$.",
    figures: [{ type: "right_triangle", description: "Right triangle with legs 6 cm and 8 cm, hypotenuse x" }],
    ...overrides,
  };
}

describe("question bank years", () => {
  it("reads years, ranges and stages", () => {
    assert.deepEqual(yearsOf("Year 9"), [9]);
    assert.deepEqual(yearsOf("Years 9-10"), [9, 10]);
    assert.deepEqual(yearsOf("Year 9/10"), [9, 10]);
    assert.deepEqual(yearsOf("Stage 5.2"), [9, 10]);
    assert.deepEqual(yearsOf("Stage 4"), [7, 8]);
  });

  it("falls back to the file path, Mathletics folders and HSC courses", () => {
    assert.deepEqual(yearsOf(null, "Maths/Past Papers/Year 10/Yearly Papers/X 2019 - Year 10 Yearly.pdf"), [10]);
    assert.deepEqual(yearsOf(null, "Maths/Mathletics/09/Algebra.pdf"), [9]);
    assert.deepEqual(yearsOf(null, "Maths/HSC/Ext 2/Textbook.pdf"), [11, 12]);
    assert.deepEqual(yearsOf(null, "Maths/Misc/worksheet.pdf"), []);
    assert.deepEqual(yearsOf("Year 11", "Maths/Year 9/x.pdf"), [11], "the model's year level wins");
  });
});

describe("question bank search", () => {
  it("embeds what the question asks, including its figures", () => {
    const text = embeddingText(question());
    assert.match(text, /Pythagoras/);
    assert.match(text, /right_triangle \/ find_hypotenuse/);
    assert.match(text, /legs 6 cm and 8 cm/);
  });

  it("filters on every field, and never returns hidden or merged questions", () => {
    assert.equal(matchesFilters(question(), {}), true);
    assert.equal(matchesFilters(question({ status: "hidden" }), {}), false);
    assert.equal(matchesFilters(question({ status: "duplicate" }), {}), false);
    assert.equal(matchesFilters(question(), { skill: "find_shorter_side" }), false);
    assert.equal(matchesFilters(question(), { skill: ["find_shorter_side", "find_hypotenuse"] }), true);
    assert.equal(matchesFilters(question(), { difficulty: "hard" }), false);
    assert.equal(matchesFilters(question(), { context: "abstract", steps: "single", kind: "question" }), true);
    assert.equal(matchesFilters(question(), { years: [10] }), false);
    assert.equal(matchesFilters(question({ years: [9, 10] }), { years: [10] }), true);
    assert.equal(matchesFilters(question(), { excludeIds: ["a_p1_1"] }), false);
  });

  it("embeds in order, in batches", async () => {
    const calls = [];
    const client = {
      embeddings: {
        create: async ({ input, dimensions }) => {
          calls.push(input.length);
          assert.equal(dimensions, 512);
          return { data: input.map((text, index) => ({ index, embedding: [text.length] })).reverse(), usage: { total_tokens: input.length } };
        },
      },
    };
    const embed = createEmbedder({ client, batchSize: 2 });
    assert.deepEqual(await embed(["a", "bb", "ccc"]), [[1], [2], [3]]);
    assert.deepEqual(calls, [2, 1]);
    assert.equal(embed.tokens, 3);
  });

  it("asks Firestore for the nearest live questions of a type, then applies the other filters", async () => {
    const seen = {};
    const docs = [
      question({ id: "q1", difficulty: "easy", embedding: [0.1] }),
      question({ id: "q2", difficulty: "hard" }),
      question({ id: "q3", difficulty: "hard" }),
    ].map(({ id, ...data }, index) => ({ id, data: () => ({ ...data, distance: index / 10 }) }));
    const query = {
      where(field, op, value) {
        seen[field] = value;
        return query;
      },
      findNearest(options) {
        seen.nearest = options;
        return { get: async () => ({ docs }) };
      },
    };
    const db = { collection: (name) => (assert.equal(name, "questionBank"), query) };
    const results = await searchQuestions({
      db,
      embed: async (texts) => texts.map(() => [1, 0]),
      brief: " a hard Pythagoras question ",
      filters: { diagramType: "right_triangle", difficulty: "hard" },
      limit: 1,
    });
    assert.equal(seen.status, "live");
    assert.equal(seen.diagramType, "right_triangle");
    assert.equal(seen.nearest.vectorField, "embedding");
    assert.equal(seen.nearest.distanceMeasure, "COSINE");
    assert.equal(seen.nearest.limit, 20, "one narrowing filter doubles the candidates");
    assert.deepEqual(results.map((result) => [result.id, result.distance]), [["q2", 0.1]]);
    assert.equal(results[0].embedding, undefined);
  });
});

describe("question bank embedding plan", () => {
  it("embeds new or changed questions and fills in missing years", () => {
    const [first] = planEmbeddings([question({ years: undefined })]);
    assert.equal(first.needsEmbedding, true);
    assert.deepEqual(first.years, [9]);
    const done = question({ embeddingHash: first.hash });
    assert.deepEqual(planEmbeddings([done]), []);
    assert.equal(planEmbeddings([{ ...done, text: "Different wording" }])[0].needsEmbedding, true);
  });
});

describe("question bank duplicates", () => {
  const older = question({ id: "old_p4_1", sourceId: "old", sourcePath: "Maths/Year 9/Book 2014.pdf", pageNumber: 4 });
  const newer = question({ id: "new_p7_2", sourceId: "new", sourcePath: "Maths/Year 9/Book 2019.pdf", pageNumber: 7, label: "Exercise 3B Q1a" });

  it("ignores LaTeX when reading numbers", () => {
    assert.deepEqual(numbersOf("$\\frac{3}{4}$ of 12.5 and $x^2$"), [2, 3, 4, 12.5]);
  });

  it("merges copies from different files into the newest", () => {
    const groups = findDuplicateGroups([older, newer]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].keep.id, "new_p7_2");
    const writes = Object.fromEntries(planDuplicateWrites([older, newer], groups).map(({ id, data }) => [id, data]));
    assert.deepEqual(writes.old_p4_1, { status: "duplicate", duplicateOf: "new_p7_2" });
    assert.deepEqual(writes.new_p7_2.sources.map((source) => source.questionId), ["new_p7_2", "old_p4_1"]);
  });

  it("keeps questions with different numbers, from the same file, or of another skill apart", () => {
    const otherNumbers = { ...newer, text: "A right-angled triangle has shorter sides $5$ cm and $12$ cm. Find $x$.", figures: [] };
    const sameFile = { ...newer, sourceId: "old" };
    const otherSkill = { ...newer, skill: "test_right_angled" };
    for (const other of [otherNumbers, sameFile, otherSkill]) assert.deepEqual(findDuplicateGroups([older, other]), []);
  });

  it("uses Drive's modified time when the paths give no year", () => {
    const a = { ...older, sourcePath: "Maths/Book A.pdf", sourceModifiedTime: "2024-01-01T00:00:00Z" };
    const b = { ...newer, sourcePath: "Maths/Book B.pdf", sourceModifiedTime: "2021-01-01T00:00:00Z" };
    assert.equal(findDuplicateGroups([a, b])[0].keep.id, a.id);
  });

  it("keeps a hidden copy as the one kept, so every copy stays hidden", () => {
    const hidden = { ...older, status: "hidden" };
    const [group] = findDuplicateGroups([hidden, newer]);
    assert.equal(group.keep.id, hidden.id);
    const writes = Object.fromEntries(planDuplicateWrites([hidden, newer], [group]).map(({ id, data }) => [id, data]));
    assert.equal(writes[newer.id].status, "duplicate");
    assert.equal(writes[hidden.id].status, undefined, "status stays hidden");
  });

  it("puts a copy back live when it no longer matches, and writes nothing when already in line", () => {
    const stale = { ...older, status: "duplicate", duplicateOf: "gone" };
    assert.deepEqual(planDuplicateWrites([stale], []), [{ id: stale.id, data: { status: "live", duplicateOf: null } }]);
    const groups = findDuplicateGroups([older, newer]);
    const merged = planDuplicateWrites([older, newer], groups);
    const applied = [older, newer].map((q) => ({ ...q, ...(merged.find((w) => w.id === q.id)?.data || {}) }));
    assert.deepEqual(planDuplicateWrites(applied, findDuplicateGroups(applied)), []);
  });

  it("tells parts that share an instruction apart by their label, and never merges parts of one file", () => {
    const part = (id, sourceId, label) =>
      question({ id, sourceId, label, stem: "Cross out (X) the incorrect nets for the solid shown.", text: "", figures: [{ type: "solid_3d", description: "A solid and four nets" }] });
    const groups = findDuplicateGroups([
      part("a10", "a", "Set 10A Q10"),
      part("a11", "a", "Set 10A Q11"),
      part("b10", "b", "Exercise 10A Q10"),
      part("b11", "b", "Set 10A Q11"),
    ]);
    assert.deepEqual(groups.map((group) => [group.keep.id, ...group.copies.map((copy) => copy.id)].sort()), [["a10", "b10"], ["a11", "b11"]]);
  });

  it("keeps the same numberless wording apart when the diagrams differ", () => {
    const cube = (id, sourceId, description) =>
      question({ id, sourceId, stem: null, text: "If the figure below is folded into a cube, what is the letter opposite the marked face?", figures: [{ type: "solid_3d", description }] });
    assert.deepEqual(
      findDuplicateGroups([
        cube("p", "a", "Net of a cube made of labelled squares: U above V, V beside W, W above X"),
        cube("q", "b", "Six squares labelled P, O, R, S, K and M in a staggered pattern"),
      ]),
      []
    );
    assert.equal(
      findDuplicateGroups([
        cube("p", "a", "Net of a cube made of labelled squares: U above V, V beside W, W above X"),
        cube("q", "b", "Net of a cube of labelled squares: U above V, V beside W and W above X"),
      ]).length,
      1
    );
  });

  it("does not match a bare diagram-only part on nothing", () => {
    const bare = (id, sourceId) => question({ id, sourceId, stem: null, text: "", figures: [{ type: "right_triangle", description: "" }] });
    assert.deepEqual(findDuplicateGroups([bare("x", "s1"), bare("y", "s2")]), []);
  });
});
