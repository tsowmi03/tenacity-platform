"use strict";
const { it, describe } = require("node:test");
const assert = require("node:assert/strict");
const { stripPipelineNotes, stripNoteSentences, hasNote } = require("../../src/resources/pipelineNotes");

describe("pipeline notes (RES-114)", () => {
  it("removes the notes seen in the RES-113 baseline and keeps the rest of the text", () => {
    const resource = {
      generalGuidance: [
        "The supplied poem, 'The Tyger (2nd draft)', is by William Blake and is a different text. This scaffold follows the requested essay on Shelley's 'Ozymandias'. Use your class copy of 'Ozymandias' to select quotations.",
        "The suggested word counts are for the finished essay.",
      ],
      answers: [{ questionNumber: 6, answer: "6 cm", workingOut: "Not confirmed: two independent solves disagreed with the book's answer, which is shown. Check before use.\nThe two shorter sides are 8 cm and y." }],
    };
    const removed = stripPipelineNotes(resource);
    assert.deepEqual(resource.generalGuidance, [
      "Use your class copy of 'Ozymandias' to select quotations.",
      "The suggested word counts are for the finished essay.",
    ]);
    assert.doesNotMatch(JSON.stringify(resource), /Not confirmed|Check before use|supplied poem|requested essay/);
    assert.match(resource.answers[0].workingOut, /The two shorter sides are 8 cm and y\./);
    assert.ok(removed.length >= 3);
    assert.equal(removed[0].path.startsWith("answers[0].workingOut") || removed.some((r) => r.path === "generalGuidance[0]"), true);
  });

  it("drops an array item that was only a note", () => {
    const resource = { tips: ["This paper follows the request from your tutor.", "Read each question twice."] };
    stripPipelineNotes(resource);
    assert.deepEqual(resource.tips, ["Read each question twice."]);
  });

  it("leaves ordinary teaching text and decimals alone", () => {
    const text = "A ladder 4.5 m long leans against a wall. Find the height, correct to 1 d.p. Check your answer makes sense.";
    assert.equal(hasNote(text), false);
    assert.deepEqual(stripNoteSentences(text), { text, removed: [] });
    for (const ok of ["Compare the two poems.", "Use the formula sheet.", "Explain how the poet presents power.", "Choose a different word for 'big'."]) {
      assert.equal(hasNote(ok), false, ok);
    }
  });

  it("never touches verified source texts or diagram specs", () => {
    const resource = {
      stimulus: [{ title: "A real text", sourceUrl: "https://example.org", passage: "The question bank of the river was not confirmed: so the story goes." }],
      questions: [{ stem: "Find x.", diagram: { labels: { a: "the generator" } } }],
    };
    const before = JSON.stringify(resource);
    assert.deepEqual(stripPipelineNotes(resource), []);
    assert.equal(JSON.stringify(resource), before);
  });
});
