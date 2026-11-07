"use strict";

// Production job HdbMuhmzBzaPcygOZYRO (Year 7 English practice paper) failed
// after every question was written: Question 1 was typed multiple-choice with
// one placeholder option ("Answer each of parts (a) to (d) by choosing one
// option."), while parts (a)–(d) each had four real options.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { buildResourceDocx } = require("../../src/resources/builder");
const { buildDocxWithDiagramReliability } = require("../../src/resources");
const { normaliseQuestionShape } = require("../../src/resources/builder/questionShape");

const part = (label) => ({
  label, stem: `Part ${label}?`, type: "multiple-choice",
  options: ["One", "Two", "Three", "Four"], marks: 1, diagram: null, diagramRequired: false,
});

function groupedQuestion(options) {
  return {
    number: 1, stem: "Read the extract and answer the parts.", type: "multiple-choice",
    options, marks: 4, diagram: null, diagramRequired: false,
    parts: ["a", "b", "c", "d"].map(part),
  };
}

function paper(question) {
  return {
    title: "Year 7 English Practice Paper", subject: "English", year: 7,
    topics: ["Reading"], focus: "Reading", totalMarks: 4, timeAllowed: "60 minutes",
    sections: [{ title: "Section A", questions: [question] }],
  };
}

describe("grouped question placeholder options", () => {
  it("drops a one-item parent option list when the parts carry the choices", () => {
    const resource = paper(groupedQuestion(["Answer each of parts (a) to (d) by choosing one option."]));
    assert.equal(normaliseQuestionShape(resource).placeholderOptions, 1);
    const q = resource.sections[0].questions[0];
    assert.equal(q.options, null);
    assert.equal(q.type, "short-answer");
    assert.deepEqual(q.parts.map((p) => p.options.length), [4, 4, 4, 4]);
  });

  it("leaves real parent options and lone one-option questions alone", () => {
    const real = paper(groupedQuestion(["A", "B"]));
    const lone = { questions: [{ number: 1, stem: "Q", type: "multiple-choice", options: ["Only"], marks: 1 }] };
    assert.equal(normaliseQuestionShape(real).placeholderOptions, 0);
    assert.equal(normaliseQuestionShape(lone).placeholderOptions, 0);
    assert.deepEqual(real.sections[0].questions[0].options, ["A", "B"]);
    assert.deepEqual(lone.questions[0].options, ["Only"]);
  });

  it("clears diagramRequired on English questions only", () => {
    const writing = () => ({ number: 2, stem: "Study Image 1 and write a speech.", type: "short-answer",
      options: null, marks: 20, diagram: null, diagramRequired: true, parts: null });
    const english = paper(writing());
    const maths = { ...paper(writing()), subject: "Maths" };
    assert.equal(normaliseQuestionShape(english).englishDiagramFlags, 1);
    assert.equal(english.sections[0].questions[0].diagramRequired, false);
    assert.equal(normaliseQuestionShape(maths).englishDiagramFlags, 0);
    assert.equal(maths.sections[0].questions[0].diagramRequired, true);
  });

  it("builds the failed paper and stores the cleaned JSON", async () => {
    const parsed = paper(groupedQuestion(["Answer each of parts (a) to (d) by choosing one option."]));
    await assert.rejects(buildResourceDocx("practice-paper", parsed, { answerMode: "none" }), /at least 2 items/);
    const built = await buildDocxWithDiagramReliability({
      resourceType: "practice-paper", parsed, options: { answerMode: "none" }, buildDocx: buildResourceDocx,
    });
    assert.ok(built.buffer.length > 0);
    assert.equal(built.resource.sections[0].questions[0].options, null);
    assert.equal(parsed.sections[0].questions[0].options.length, 1, "input is not mutated");
  });
});
