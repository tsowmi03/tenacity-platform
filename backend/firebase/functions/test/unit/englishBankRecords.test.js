"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { ALL_TECHNIQUES, QUESTION_TYPES, SKILLS, STIMULUS_TYPE_IDS, isTechniqueFor, mediumOf } = require("../../src/englishBank/taxonomy");
const { PAGE_SCHEMA } = require("../../src/englishBank/schema");
const { cropPath, labelKey, questionId, toGuideDocs, toPaperDocs, wordCount } = require("../../src/englishBank/records");

const source = { id: "drive1", path: "English/Past Papers/Year 12/HSC Papers/Advanced/English Advanced HSC exam 2023 - Paper 1.pdf", version: "md5:2026" };
const box = (y0, y1) => ({ x0: 50, y0, x1: 950, y1 });

function piece(extra = {}) {
  return {
    label: "Text 1", type: "poem", title: "Drought", author: "A. Poet", publication: null,
    continuesPrevious: false, continuesNext: false, text: "The paddock is a furnace\nand the dam a cracked plate",
    visualDescription: null, box: box(100, 600), techniques: [], themes: ["Hardship"], yearLevel: "Year 12", difficulty: "medium",
    ...extra,
  };
}
function page(pageNumber, result) {
  return { pageNumber, width: 1000, height: 1400, result: { pageKind: "mixed", stimuli: [], questions: [], guideEntries: [], ...result } };
}
function question(extra = {}) {
  return { label: "Question 1", stimulusLabels: ["Text 1"], text: "How does the poet convey hardship?", marks: 4, questionType: "short_answer", skill: "explain_technique_effect", techniques: ["metaphor"], difficulty: "medium", ...extra };
}

describe("English bank taxonomy and schema", () => {
  it("keeps written and visual techniques to their own medium", () => {
    assert.equal(mediumOf("poem"), "written");
    assert.equal(mediumOf("poster"), "visual");
    assert.equal(isTechniqueFor("poem", "metaphor"), true);
    assert.equal(isTechniqueFor("poem", "salience"), false);
    assert.equal(isTechniqueFor("poster", "salience"), true);
    assert.equal(isTechniqueFor("poster", "symbolism"), true);
    assert.equal(isTechniqueFor("nope", "metaphor"), false);
  });

  it("builds the page schema from the taxonomy, every list with an other", () => {
    const stimulus = PAGE_SCHEMA.properties.stimuli.items;
    assert.deepEqual(stimulus.properties.type.enum, STIMULUS_TYPE_IDS);
    assert.deepEqual(stimulus.properties.techniques.items.properties.technique.enum, ALL_TECHNIQUES);
    assert.deepEqual(PAGE_SCHEMA.properties.questions.items.properties.questionType.enum, QUESTION_TYPES);
    assert.deepEqual(PAGE_SCHEMA.properties.questions.items.properties.skill.enum, SKILLS);
    for (const list of [ALL_TECHNIQUES, QUESTION_TYPES, SKILLS]) assert.ok(list.includes("other"));
    assert.ok(STIMULUS_TYPE_IDS.includes("other_written") && STIMULUS_TYPE_IDS.includes("other_visual"));
  });

  it("requires every property and allows no extras, as strict structured output needs", () => {
    const check = (schema, path) => {
      if (schema.anyOf) return schema.anyOf.forEach((option, i) => check(option, `${path}|${i}`));
      if (schema.type === "object") {
        assert.equal(schema.additionalProperties, false, path);
        assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort(), path);
        for (const [key, child] of Object.entries(schema.properties)) check(child, `${path}.${key}`);
      }
      if (schema.items) check(schema.items, `${path}[]`);
    };
    check(PAGE_SCHEMA, "page");
  });
});

describe("English bank records", () => {
  it("keys labels the same however they are printed", () => {
    assert.equal(labelKey("Question 3 (b)"), "3b");
    assert.equal(labelKey("Q3b"), "3b");
    assert.equal(questionId("drive1", "Question 3 (b)"), "drive1_q3b");
    assert.equal(wordCount(" one  two\nthree "), 3);
    assert.match(cropPath("drive1_s1", "md5:2026", 2), /^englishBank\/stimuli\/drive1_s1_[0-9a-f]{8}_page2\.png$/);
  });

  it("joins a passage that runs across pages into one verbatim stimulus", () => {
    const { stimuli } = toPaperDocs({
      source,
      pages: [
        page(3, { stimuli: [piece({ continuesNext: true, text: "First half of the story." })] }),
        page(2, { pageKind: "instructions" }),
        page(4, { stimuli: [piece({ continuesPrevious: true, title: null, text: "Second half." })] }),
      ],
    });
    assert.equal(stimuli.length, 1);
    assert.equal(stimuli[0].id, "drive1_s1");
    assert.equal(stimuli[0].data.text, "First half of the story.\nSecond half.");
    assert.deepEqual(stimuli[0].data.pages, [3, 4]);
    assert.equal(stimuli[0].data.pageCrops.length, 2);
    assert.equal(stimuli[0].data.title, "Drought");
    assert.equal(stimuli[0].data.wordCount, 7);
    assert.deepEqual(stimuli[0].data.years, [12]);
  });

  it("keeps separate stimuli apart, even on one page", () => {
    const { stimuli } = toPaperDocs({ source, pages: [page(1, { stimuli: [piece(), piece({ label: "Text 2", type: "poster", text: null, visualDescription: "A child in a dry field" })] })] });
    assert.deepEqual(stimuli.map((doc) => [doc.data.label, doc.data.medium, doc.data.text === null]), [["Text 1", "written", false], ["Text 2", "visual", true]]);
  });

  it("drops techniques whose quote isn't in the passage, or that don't fit the medium", () => {
    const { stimuli, droppedTechniques } = toPaperDocs({
      source,
      pages: [page(1, {
        stimuli: [piece({
          techniques: [
            { technique: "metaphor", evidence: "“The paddock is a furnace”", box: null },
            { technique: "simile", evidence: "like a burning oven", box: null },
            { technique: "salience", evidence: "the dam", box: null },
            { technique: "imagery", evidence: "the dam a cracked   plate.", box: null },
          ],
        })],
      })],
    });
    assert.deepEqual(stimuli[0].data.techniqueIds, ["metaphor", "imagery"]);
    assert.equal(stimuli[0].data.techniques[0].evidence, "“The paddock is a furnace”");
    assert.equal(droppedTechniques, 2);
  });

  it("keeps a visual technique with its region of the image", () => {
    const { stimuli } = toPaperDocs({
      source,
      pages: [page(1, { stimuli: [piece({ type: "poster", text: null, techniques: [{ technique: "salience", evidence: "the red sun", box: box(120, 300) }] })] })],
    });
    assert.deepEqual(stimuli[0].data.techniques, [{ technique: "salience", evidence: "the red sun", pageNumber: 1, box: box(120, 300) }]);
  });

  it("leaves out an image a published paper withheld for copyright", () => {
    const { stimuli, withheldVisuals } = toPaperDocs({
      source,
      pages: [page(12, { stimuli: [
        piece({ label: "Item 2", type: "other_visual", text: null, visualDescription: "Blank area with only the heading 'Item 2'; no visible image is shown on this page." }),
        piece({ label: "Item 4", type: "photograph", text: null, visualDescription: "Large empty bordered box under the heading 'Item 4'. No image or text is displayed." }),
        piece({ label: "Item 5", type: "poster", text: null, visualDescription: "A poster of a lighthouse at dusk with the words KEEP WATCH." }),
        piece({ label: "Item 6", type: "cartoon", text: "Caption: not shown here", visualDescription: "Blank box" }),
      ] })],
    });
    assert.equal(withheldVisuals, 2);
    assert.deepEqual(stimuli.map((doc) => doc.data.label), ["Item 5", "Item 6"]);
  });

  it("links questions to the stimuli they name, or the one on their page", () => {
    const { questions } = toPaperDocs({
      source,
      pages: [
        page(1, { stimuli: [piece(), piece({ label: "Text 2", type: "speech", text: "Friends, we must act." })] }),
        page(2, { questions: [question(), question({ label: "Question 2", stimulusLabels: ["Text 1", "Text 2"], skill: "compare_texts" })] }),
        page(3, { stimuli: [piece({ label: null, type: "nonfiction", text: "An article." })], questions: [question({ label: "Question 3", stimulusLabels: [], marks: null })] }),
      ],
    });
    assert.deepEqual(questions.map((doc) => [doc.id, doc.data.stimulusIds]), [
      ["drive1_q1", ["drive1_s1"]],
      ["drive1_q2", ["drive1_s1", "drive1_s2"]],
      ["drive1_q3", ["drive1_s3"]],
    ]);
    assert.equal(questions[2].data.marks, null);
  });

  it("keeps each exercise's Question 1 and Text 1 apart in a comprehension book", () => {
    const { stimuli, questions } = toPaperDocs({
      source,
      pages: [
        page(1, { stimuli: [piece({ text: "First exercise passage." })], questions: [question({ text: "Exercise 1, Q1" })] }),
        page(2, { questions: [question({ text: "Exercise 1, Q1 again, continued" })] }),
        page(5, { stimuli: [piece({ type: "prose_fiction", text: "Second exercise passage." })], questions: [question({ text: "Exercise 2, Q1" })] }),
        page(6, { questions: [question({ label: "Question 2", text: "Exercise 2, Q2" })] }),
      ],
    });
    assert.deepEqual(stimuli.map((doc) => doc.id), ["drive1_s1", "drive1_s2"]);
    assert.deepEqual(questions.map((doc) => [doc.id, doc.data.text, doc.data.stimulusIds]), [
      ["drive1_q1", "Exercise 1, Q1", ["drive1_s1"]],
      ["drive1_s2_q1", "Exercise 2, Q1", ["drive1_s2"]],
      ["drive1_q2", "Exercise 2, Q2", ["drive1_s2"]],
    ]);
  });

  it("points guide entries at the paper's questions and joins continued ones", () => {
    const guide = { id: "drive9", path: "English/Past Papers/x/English Advanced HSC marking guidelines 2023 - Paper 1.pdf", version: "v" };
    const docs = toGuideDocs({
      source: guide,
      paperSourceId: "drive1",
      pages: [
        page(2, { guideEntries: [{ questionLabel: "Question 1", marks: 4, criteria: "Explains how hardship is conveyed", sampleAnswer: null }] }),
        page(3, { guideEntries: [{ questionLabel: "Q1", marks: null, criteria: "Uses textual evidence", sampleAnswer: "The metaphor..." }, { questionLabel: "Question 2", marks: 5, criteria: "Compares", sampleAnswer: null }] }),
      ],
    });
    assert.deepEqual(docs.map((doc) => [doc.id, doc.data.questionId]), [["drive9_g1", "drive1_q1"], ["drive9_g2", "drive1_q2"]]);
    assert.equal(docs[0].data.criteria, "Explains how hardship is conveyed\nUses textual evidence");
    assert.equal(docs[0].data.sampleAnswer, "The metaphor...");
    assert.deepEqual(docs[0].data.pages, [2, 3]);
    assert.equal(toGuideDocs({ source: guide, paperSourceId: null, pages: [page(1, { guideEntries: [{ questionLabel: "1", marks: 2, criteria: "x", sampleAnswer: null }] })] })[0].data.questionId, null);
  });
});
