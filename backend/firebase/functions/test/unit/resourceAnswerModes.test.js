"use strict";

// RES-36: each answer mode must produce exactly what its portal label promises.
//   English — "Marking guide" (answers): criteria only, no response at all.
//             "Model answers" (worked): the answer itself, not directions.
//   Maths   — "Answers only" (answers): final answer, no working.
//             "Answers with working out" (worked): every step, explained.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { buildSystemPrompt } = require("../../src/resources/promptBuilder");
const { paragraphTexts, zipEntries } = require("../../src/resources/builder/docxText");

// The document's visible text, paragraph by paragraph.
function documentText(buffer) {
  const xml = zipEntries(buffer).find((entry) => entry.name === "word/document.xml").read();
  return paragraphTexts(xml).join("\n");
}

const ENGLISH_GUIDE_TYPES = [
  "practice-paper",
  "worksheet",
  "diagnostic-test",
  "mixed-review",
  "annotation-task",
  "custom",
];

function prompt(resourceType, subject, answerMode, extra = {}) {
  return buildSystemPrompt(resourceType, { year: 9, subject, answerMode, ...extra });
}

describe("English Marking guide mode", () => {
  it("never asks for a suggested response", () => {
    for (const resourceType of ENGLISH_GUIDE_TYPES) {
      const text = prompt(resourceType, "english", "answers");
      assert.doesNotMatch(text, /"suggestedResponse"/, `${resourceType} asks for a response`);
      assert.match(text, /"markingCriteria"/, `${resourceType} lost its criteria`);
    }
    for (const section of ["all", "assessment"]) {
      const text = prompt("topic-booklet", "english", "answers", { section });
      assert.doesNotMatch(text, /"suggestedResponse"/, `topic-booklet ${section} asks for a response`);
    }
  });

  it("tells the model the guide is criteria only", () => {
    const text = prompt("worksheet", "english", "answers");
    assert.match(text, /marking criteria for each question and nothing else/);
    assert.doesNotMatch(text, /brief summary/);
  });
});

describe("English Model answers mode", () => {
  it("asks for the answer itself, scaled to marks, with dot points above 6 marks", () => {
    for (const resourceType of ENGLISH_GUIDE_TYPES) {
      const text = prompt(resourceType, "english", "worked");
      assert.match(text, /"suggestedResponse": string/, `${resourceType} lost its response`);
      assert.match(text, /MODEL ANSWER RULES/, `${resourceType} lacks the model answer rules`);
    }
    const text = prompt("topic-booklet", "english", "worked", { section: "assessment" });
    assert.match(text, /"suggestedResponse": string/);
    assert.match(text, /never a description of an answer/);
    assert.match(text, /6 marks or fewer: write the complete answer in full prose/);
    assert.match(text, /more than 6 marks \(extended responses\): do NOT write full prose/);
    assert.match(text, /beginning "- "/);
    assert.match(text, /Match length to the marks/);
    assert.match(text, /No filler/);
  });
});

describe("describesInsteadOfAnswers", () => {
  const { describesInsteadOfAnswers } = require("../../src/resources/builder/validation");

  // Taken from a real Year 9 booklet's marking guide (RES-36).
  const directions = [
    "The response should identify unfair treatment and analyse how two quotations use persuasive voice.",
    "Evidence and techniques should show how one poem idealises droving while the other exposes its hardship.",
    "A direct judgement about poetry's value in communicating cultural experiences.",
    "An introduction with a clear contention, accurate identification of the poem and author.",
    "A structured paragraph showing how sound, imagery or emotive language represents hardship.",
    "A direct comparative judgement that poetry can challenge Australian identity.",
    "An introduction identifying both poems and authors, then outlining the contrast.",
    "A coherent paragraph arguing that collective voice, obligation and symbols of protest connect.",
    "Students should explain the effect of the metaphor.",
    "- The answer should name two techniques.",
  ];
  const answers = [
    "A cultural voice expresses the experiences, beliefs or values of a person or community.",
    "The end-rhyme pattern is ABAAB.",
    "The strongest analysis explains that the inclusive pronoun \"we\" joins speaker and audience.",
    "The speaker of \"The City Bushman\" questions the romantic view presented in \"Clancy of the Overflow\".",
    "Poetry is valuable because it lets marginalised voices answer the myths that once spoke for them.",
    "- Thesis: Lawson's collective voice turns private hardship into a public call for fairness.\n- Argument 1: \"we must fly a rebel flag\" — modal verb, obligation.",
    "A thesis statement is not enough on its own; Lawson's poem should be read as protest.",
  ];

  it("flags responses that describe an answer", () => {
    for (const text of directions) assert.ok(describesInsteadOfAnswers(text), text);
  });

  it("passes responses that are the answer", () => {
    for (const text of answers) assert.ok(!describesInsteadOfAnswers(text), text);
  });
});

describe("Model answers validation", () => {
  const { buildResourceDocx } = require("../../src/resources/builder");

  const worksheet = (suggestedResponse) => ({
    title: "Persuasive Language",
    subject: "english",
    year: 8,
    topic: "Persuasive language",
    totalMarks: 2,
    questions: [{ number: 1, stem: "Identify one persuasive technique.", type: "short-answer", marks: 2, parts: null }],
    markingGuide: [{ questionNumber: 1, suggestedResponse, markingCriteria: ["Names a technique.", "Explains its effect."] }],
  });

  it("rejects a response written as directions, so the repair pass rewrites it", async () => {
    await assert.rejects(
      buildResourceDocx("worksheet", worksheet("The response should name a technique and explain it."), {
        subject: "english",
        answerMode: "worked",
      }),
      /describes what an answer should contain/
    );
  });

  it("accepts the answer itself", async () => {
    await assert.doesNotReject(
      buildResourceDocx("worksheet", worksheet("The rhetorical question invites the reader to agree that change is overdue."), {
        subject: "english",
        answerMode: "worked",
      })
    );
  });
});

describe("Maths Answers only mode", () => {
  const { buildResponseSchema } = require("../../src/resources/responseSchema");
  const { buildResourceDocx } = require("../../src/resources/builder");

  const MATHS_TYPES = ["practice-paper", "worksheet", "diagnostic-test", "mixed-review", "topic-booklet"];

  it("asks for the final answer only, with no working or explanation", () => {
    for (const resourceType of MATHS_TYPES) {
      const text = prompt(resourceType, "maths", "answers");
      assert.match(text, /ONLY the final answer/, resourceType);
      assert.match(text, /Never include working steps, derivations, or explanations/, resourceType);
      assert.match(text, /Set "workingOut" to null/, resourceType);
      assert.doesNotMatch(text, /WORKING OUT RULES/, resourceType);
    }
  });

  it("pins workingOut to null in the schema", () => {
    const schema = buildResponseSchema("worksheet", { subject: "maths", answerMode: "answers" });
    assert.deepEqual(schema.properties.answers.items.properties.workingOut, { type: "null" });
  });

  it("never prints working, even when a row carries some", async () => {
    const worksheet = {
      title: "Linear Equations",
      subject: "maths",
      year: 8,
      topic: "Linear equations",
      totalMarks: 2,
      questions: [{ number: 1, stem: "Solve 2x + 3 = 11.", type: "calculation", marks: 2, parts: null }],
      answers: [{ questionNumber: 1, partLabel: null, answer: "x = 4", workingOut: "Subtract three from both sides" }],
    };
    for (const answerMode of ["answers", "worked"]) {
      const text = documentText(await buildResourceDocx("worksheet", worksheet, { answerMode }));
      assert.match(text, /Answers/);
      if (answerMode === "answers") assert.doesNotMatch(text, /Subtract three/);
      else assert.match(text, /Subtract three/);
    }
  });
});

describe("Maths Answers with working out mode", () => {
  it("asks for every step and an explanation of leaps and quick answers", () => {
    for (const resourceType of ["practice-paper", "worksheet", "diagnostic-test", "mixed-review", "topic-booklet"]) {
      const text = prompt(resourceType, "maths", "worked");
      assert.match(text, /Show every step/, resourceType);
      assert.match(text, /logical leap/, resourceType);
      assert.match(text, /little or no working, give one sentence saying why/, resourceType);
    }
  });

  it("prints each step of the working on its own line", async () => {
    const { buildResourceDocx } = require("../../src/resources/builder");
    const worksheet = {
      title: "Linear Equations",
      subject: "maths",
      year: 8,
      topic: "Linear equations",
      totalMarks: 2,
      questions: [{ number: 1, stem: "Solve the equation.", type: "calculation", marks: 2, parts: null }],
      answers: [{
        questionNumber: 1,
        partLabel: null,
        answer: "four",
        workingOut: "Subtract three from both sides\nDivide both sides by two",
      }],
    };
    for (const resourceType of ["worksheet", "mixed-review"]) {
      const resource = resourceType === "worksheet"
        ? worksheet
        : { ...worksheet, topics: ["Linear equations"], sections: [{ topic: "Linear equations", questions: worksheet.questions }] };
      const paragraphs = documentText(await buildResourceDocx(resourceType, resource, { answerMode: "worked" })).split("\n");
      for (const line of ["Working:", "Subtract three from both sides", "Divide both sides by two"]) {
        assert.ok(paragraphs.includes(line), `${resourceType}: "${line}" is not its own paragraph`);
      }
    }
  });

  it("rejects an answer without working", async () => {
    const { buildResourceDocx } = require("../../src/resources/builder");
    const worksheet = {
      title: "Linear Equations",
      subject: "maths",
      year: 8,
      topic: "Linear equations",
      totalMarks: 2,
      questions: [{ number: 1, stem: "Solve 2x + 3 = 11.", type: "calculation", marks: 2, parts: null }],
      answers: [{ questionNumber: 1, partLabel: null, answer: "x = 4", workingOut: null }],
    };
    await assert.rejects(buildResourceDocx("worksheet", worksheet, { answerMode: "worked" }), /workingOut/);
  });
});
