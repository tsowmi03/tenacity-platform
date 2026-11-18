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

// Codex review on #372: the check must run on the real build path, not only in
// isolation. This builds a real DOCX and reads its text back.
describe("pipeline notes on the build path (RES-114)", () => {
  const mammoth = require("mammoth");
  const { buildDocxWithDiagramReliability } = require("../../src/resources");
  const { buildResourceDocx } = require("../../src/resources/builder");

  it("keeps notes out of the built document and the saved resource", async () => {
    const parsed = {
      title: "Pythagoras",
      subject: "maths",
      year: 8,
      topic: "Pythagoras",
      totalMarks: 2,
      questions: [{ number: 1, stem: "Find the hypotenuse of a right-angled triangle with legs 6 cm and 8 cm.", marks: 2, workingLines: 2, parts: null }],
      answers: [{ questionNumber: 1, answer: "10 cm", workingOut: "Not confirmed: two independent solves disagreed with the book's answer, which is shown. Check before use.\nAdd the squares of the two legs, then take the square root." }],
    };
    const built = await buildDocxWithDiagramReliability({
      resourceType: "worksheet",
      parsed,
      options: { studentName: "Test Student", subject: "maths", year: 8, answerMode: "worked" },
      buildDocx: buildResourceDocx,
    });
    const { value: text } = await mammoth.extractRawText({ buffer: built.buffer });
    assert.doesNotMatch(text, /Not confirmed|Check before use|independent solves/);
    assert.match(text, /Add the squares of the two legs, then take the square root\./);
    assert.doesNotMatch(JSON.stringify(built.resource), /Not confirmed/);
    assert.match(parsed.answers[0].workingOut, /^Not confirmed/, "the caller's copy isn't changed");
  });

  it("tells the generator not to write such notes", () => {
    const { AUTHORSHIP_RULES } = require("../../src/resources/humanStyle");
    assert.match(AUTHORSHIP_RULES, /Never put notes about how the resource was made/);
  });
});
