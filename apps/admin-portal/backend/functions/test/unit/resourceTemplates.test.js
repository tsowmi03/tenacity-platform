"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const zlib = require("node:zlib");

const {
  RESOURCE_BUILDERS,
  buildResourceDocx,
} = require("../../src/resources/builder");

function zipEntries(buffer) {
  const eocdSig = 0x06054b50;
  let eocdOffset = -1;
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === eocdSig) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("ZIP end of central directory not found");

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = new Map();
  let cursor = centralDirOffset;

  for (let i = 0; i < entryCount; i += 1) {
    assert.equal(buffer.readUInt32LE(cursor), 0x02014b50);
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer
      .subarray(cursor + 46, cursor + 46 + fileNameLength)
      .toString("utf8");

    entries.set(name, { compressedSize, localHeaderOffset, method, name });
    cursor += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function extractZipEntry(buffer, name) {
  const entries = zipEntries(buffer);
  const entry = entries.get(name);
  if (!entry) throw new Error(`ZIP entry not found: ${name}`);
  const localOffset = entry.localHeaderOffset;
  assert.equal(buffer.readUInt32LE(localOffset), 0x04034b50);
  const fileNameLength = buffer.readUInt16LE(localOffset + 26);
  const extraLength = buffer.readUInt16LE(localOffset + 28);
  const dataOffset = localOffset + 30 + fileNameLength + extraLength;
  const compressed = buffer.subarray(dataOffset, dataOffset + entry.compressedSize);
  if (entry.method === 0) return compressed;
  if (entry.method === 8) return zlib.inflateRawSync(compressed);
  throw new Error(`Unsupported ZIP compression method: ${entry.method}`);
}

function extractXmlText(buffer, name) {
  return extractZipEntry(buffer, name)
    .toString("utf8")
    .replace(/<[^>]+>/g, "");
}

const question = {
  number: 1,
  stem: "Solve x + 4 = 9.",
  marks: 1,
  workingLines: 2,
  parts: null,
};

const samples = {
  "diagnostic-test": {
    title: "Number Diagnostic",
    subject: "maths",
    year: 8,
    topics: ["Linear equations"],
    totalMarks: 1,
    instructions: "Answer all questions.",
    questions: [{ ...question, subTopic: "Linear equations", type: "calculation", options: null }],
    answers: [{ questionNumber: 1, subTopic: "Linear equations", answer: "x = 5", note: "Subtract 4." }],
  },
  "mixed-review": {
    title: "Algebra Mixed Review",
    subject: "maths",
    year: 8,
    topics: ["Equations"],
    totalMarks: 1,
    sections: [{ topic: "Equations", questions: [question] }],
    answers: [{ questionNumber: 1, partLabel: null, answer: "x = 5" }],
  },
  "study-guide": {
    title: "Algebra Study Guide",
    subject: "maths",
    year: 8,
    topics: ["Equations"],
    sections: [
      {
        title: "Solving Equations",
        summary: "Keep equations balanced.",
        keyPoints: ["Do the same operation to both sides."],
        formulas: [{ name: "Balance", formula: "left = right", note: "Maintain equality." }],
        definitions: [{ term: "Equation", definition: "A statement that two expressions are equal." }],
      },
    ],
    quickReference: [{ concept: "Inverse operations", summary: "Undo addition with subtraction." }],
  },
  "annotation-task": {
    title: "Persuasive Language Annotation",
    subject: "english",
    year: 8,
    passageTitle: "The Last Bell",
    passageAuthor: null,
    passageSource: null,
    passageText: "The bell rang across the empty courtyard.",
    contextNote: "Original practice passage.",
    tasks: [{ number: 1, instruction: "Identify one image.", type: "identify", marks: 1, focusQuote: null, responseLines: 2 }],
    markingGuide: [{ taskNumber: 1, suggestedResponse: "The bell image creates closure.", markingCriteria: ["Identifies an image."] }],
  },
  "essay-scaffold": {
    title: "Persuasive Essay Scaffold",
    subject: "english",
    year: 8,
    essayType: "Persuasive essay",
    essayQuestion: "Should homework be limited?",
    targetWordCount: 600,
    sections: [{ name: "Introduction", purpose: "Set up the argument.", suggestedWordCount: 80, prompts: ["What is your contention?"], sentenceStarters: ["This essay argues..."], planningLines: 2 }],
    vocabularyBank: ["therefore", "however"],
    generalGuidance: ["Use clear topic sentences."],
  },
  "practice-paper": {
    title: "Algebra Practice Paper",
    subject: "maths",
    year: 8,
    focus: "Linear equations",
    totalMarks: 1,
    timeAllowed: "20 minutes",
    instructions: ["Answer all questions."],
    sections: [{ title: "Section A", instructions: "Show working.", questions: [question] }],
    answers: [{ questionNumber: 1, partLabel: null, answer: "x = 5", marks: 1 }],
  },
  "topic-booklet": {
    title: "Linear Equations Booklet",
    subject: "maths",
    year: 8,
    topic: "Linear equations",
    learningObjectives: ["Solve one-step equations."],
    nesaOutcomes: null,
    subTopics: [
      {
        title: "One-step equations",
        explanation: "Use inverse operations.",
        definitions: [{ term: "Inverse", definition: "An operation that reverses another." }],
        workedExamples: [{ title: "Example 1", steps: [{ working: "x + 4 = 9", explanation: "Start with the equation." }] }],
        tip: "Keep both sides balanced.",
        commonMistake: "Changing one side only.",
        practiceQuestions: [question],
      },
    ],
    endQuiz: { sections: [{ title: "Quiz", instructions: "Complete independently.", questions: [{ ...question, number: 2 }] }] },
    answers: {
      subTopicAnswers: [
        { subTopicTitle: "One-step equations", questionNumber: 1, partLabel: null, answer: "x = 5" },
      ],
      endQuizAnswers: [
        { section: "Quiz", questionNumber: 2, partLabel: null, answer: "x = 5" },
      ],
    },
  },
  custom: {
    title: "Custom Revision Resource",
    subject: "maths",
    year: 8,
    resourceType: "custom",
    topic: "Equations",
    blocks: [
      { type: "heading", text: "Quick Revision" },
      { type: "paragraph", text: "Balance both sides." },
      { type: "noteBox", title: "Tip", text: "Check your answer by substitution." },
      { type: "table", headers: ["Step", "Action"], rows: [["1", "Subtract 4"]] },
    ],
  },
};

const englishMarkingSamples = {
  "practice-paper": {
    title: "Persuasive Practice Paper",
    subject: "english",
    year: 8,
    focus: "Persuasive language",
    totalMarks: 2,
    timeAllowed: "20 minutes",
    instructions: ["Answer in full sentences."],
    sections: [{ title: "Section A", instructions: "Short responses.", questions: [question] }],
    markingGuide: [{ questionNumber: 1, partLabel: null, suggestedResponse: "Explains the technique.", markingCriteria: ["Names a technique."], marks: 2 }],
  },
  "diagnostic-test": {
    title: "Reading Diagnostic",
    subject: "english",
    year: 8,
    topics: ["Inference"],
    totalMarks: 2,
    instructions: "Answer all questions.",
    questions: [{ ...question, subTopic: "Inference", type: "short-answer", options: null }],
    markingGuide: [{ questionNumber: 1, subTopic: "Inference", suggestedResponse: "Makes a supported inference.", markingCriteria: ["Uses textual evidence."] }],
  },
  "mixed-review": {
    title: "English Mixed Review",
    subject: "english",
    year: 8,
    topics: ["Persuasive language"],
    totalMarks: 2,
    sections: [{ topic: "Persuasive language", questions: [question] }],
    markingGuide: [{ questionNumber: 1, topic: "Persuasive language", suggestedResponse: "Identifies a technique.", markingCriteria: ["Explains audience effect."] }],
  },
  "topic-booklet": {
    title: "Persuasive Techniques Booklet",
    subject: "english",
    year: 8,
    topic: "Persuasive techniques",
    learningObjectives: ["Identify persuasive techniques."],
    subTopics: [
      {
        title: "Rhetorical questions",
        explanation: "Rhetorical questions prompt readers to consider an idea.",
        definitions: [{ term: "Rhetorical question", definition: "A question asked for effect." }],
        workedExamples: [{ title: "Example", steps: [{ working: "Why wait?", annotation: "Challenges the audience to act." }] }],
        tip: "Link each technique to audience effect.",
        commonMistake: "Listing a technique without explaining effect.",
        practiceQuestions: [question],
      },
    ],
    endQuiz: { sections: [{ title: "Quiz", instructions: "Complete independently.", questions: [{ ...question, number: 2 }] }] },
    markingGuide: [
      { section: "Rhetorical questions", questionNumber: 1, suggestedResponse: "Identifies the technique.", markingCriteria: ["Names the technique."] },
      { section: "Quiz", questionNumber: 2, suggestedResponse: "Explains the effect.", markingCriteria: ["Explains audience positioning."] },
    ],
  },
};

const expectedText = {
  "diagnostic-test": /Gap Analysis/,
  "mixed-review": /Equations/,
  "study-guide": /Quick Reference/,
  "annotation-task": /Answer Guide - Tutor Copy/,
  "essay-scaffold": /Vocabulary Bank/,
  "practice-paper": /Mark Scheme/,
  "topic-booklet": /End of Topic Quiz/,
  custom: /Quick Revision/,
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

describe("resource template dispatcher", () => {
  it("registers every exposed backend resource type", () => {
    assert.deepEqual(Object.keys(RESOURCE_BUILDERS).sort(), [
      "annotation-task",
      "custom",
      "diagnostic-test",
      "essay-scaffold",
      "mixed-review",
      "practice-paper",
      "study-guide",
      "topic-booklet",
      "worksheet",
    ]);
  });

  for (const [resourceType, sample] of Object.entries(samples)) {
    it(`builds a branded ${resourceType} DOCX`, async () => {
      const buffer = await buildResourceDocx(resourceType, sample, {
        studentName: "Mei Tanaka",
        subject: sample.subject,
        year: sample.year,
      });

      assert.ok(Buffer.isBuffer(buffer));
      assert.equal(buffer.subarray(0, 2).toString("utf8"), "PK");
      assert.ok(buffer.length > 9000);
      const documentText = extractXmlText(buffer, "word/document.xml");
      assert.match(documentText, expectedText[resourceType]);
      assert.ok(documentText.length > 50);
    });
  }

  for (const [resourceType, sample] of Object.entries(englishMarkingSamples)) {
    it(`builds an English ${resourceType} with a marking guide`, async () => {
      const buffer = await buildResourceDocx(resourceType, sample, {
        studentName: "Mei Tanaka",
        subject: "english",
        year: sample.year,
      });
      const documentText = extractXmlText(buffer, "word/document.xml");

      assert.match(documentText, /Marking Guide/);
      assert.match(documentText, /Suggested Response/);
      assert.match(documentText, /Marking Criteria/);
    });
  }

  it("does not render legacy instruction sections in maths resources", async () => {
    const cases = [
      ["practice-paper", samples["practice-paper"], /Answer all questions|Show working|Instructions/],
      ["diagnostic-test", samples["diagnostic-test"], /Answer all questions/],
      ["topic-booklet", samples["topic-booklet"], /Complete independently/],
    ];

    for (const [resourceType, sample, forbidden] of cases) {
      const buffer = await buildResourceDocx(resourceType, sample, {
        studentName: "Mei Tanaka",
        subject: sample.subject,
        year: sample.year,
      });
      const documentText = extractXmlText(buffer, "word/document.xml");

      assert.doesNotMatch(documentText, forbidden);
    }
  });

  it("rejects disabled shape diagrams before rendering", async () => {
    const sample = clone(samples["diagnostic-test"]);
    sample.questions[0].diagram = {
      type: "right-triangle",
    };

    await assert.rejects(
      () => buildResourceDocx("diagnostic-test", sample),
      /right-triangle is temporarily disabled/
    );
  });

  it("rejects malformed answer JSON before rendering", async () => {
    const sample = clone(samples["diagnostic-test"]);
    delete sample.answers;
    await assert.rejects(
      () => buildResourceDocx("diagnostic-test", sample),
      /Invalid resource JSON: diagnosticTest\.answers must be an array/
    );
  });

  it("rejects malformed sectioned resource JSON before rendering", async () => {
    const sample = clone(samples["practice-paper"]);
    delete sample.sections[0].questions;
    await assert.rejects(
      () => buildResourceDocx("practice-paper", sample),
      /Invalid resource JSON: practicePaper\.sections\[0\]\.questions must be an array/
    );
  });

  it("rejects malformed study guide JSON before rendering", async () => {
    const sample = clone(samples["study-guide"]);
    delete sample.sections[0].keyPoints;
    await assert.rejects(
      () => buildResourceDocx("study-guide", sample),
      /Invalid resource JSON: studyGuide\.sections\[0\]\.keyPoints must be an array/
    );
  });

  it("rejects malformed topic booklet JSON before rendering", async () => {
    const sample = clone(samples["topic-booklet"]);
    delete sample.endQuiz;
    await assert.rejects(
      () => buildResourceDocx("topic-booklet", sample),
      /Invalid resource JSON: topicBooklet\.endQuiz\.sections must contain at least 1 item/
    );
  });

  it("rejects malformed English resource JSON before rendering", async () => {
    const sample = clone(samples["annotation-task"]);
    delete sample.passageText;
    await assert.rejects(
      () => buildResourceDocx("annotation-task", sample),
      /Invalid resource JSON: annotationTask\.passageText must be a string/
    );
  });
});
