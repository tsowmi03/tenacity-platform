"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { applyQuestionBank, bankSlots, difficultyAt, questionBankModeFor } = require("../../src/resources/questionBankFill");
const { cloneWithSourceImages, loadSourceImages, pngSize, withoutSourceImageBytes } = require("../../src/resources/sourceImages");

// A 3x2 PNG header is all pngSize reads.
function png(width = 300, height = 200) {
  const buffer = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

// As generation leaves it: each question names the diagram it needs, and
// none has been drawn yet (RES-71 runs the bank before drawing).
function worksheet(count = 6) {
  return {
    title: "Pythagoras",
    topic: "Pythagoras' theorem",
    questions: Array.from({ length: count }, (_, i) => ({
      number: i + 1,
      stem: `Find the hypotenuse of triangle ${i + 1}.`,
      type: "short-answer",
      options: null,
      marks: 2,
      diagram: null,
      diagramType: "right-triangle",
      diagramRequired: true,
      parts: null,
    })),
    answers: Array.from({ length: count }, (_, i) => ({ questionNumber: i + 1, partLabel: null, answer: "5 cm", workingOut: "$c^2 = 3^2 + 4^2$" })),
  };
}

function bankQuestion(id) {
  return { id, status: "live", sourcePath: "Maths/Year 9/Book.pdf", pageNumber: 4, label: "Q1a", stem: "Find x.", text: "", description: "Find the hypotenuse", figures: [{ storagePath: `questionBank/diagrams/${id}_1.png` }] };
}

// Storage: diagram crops download as PNGs; anything the step saves (its
// search record) can be read back by a later run.
function memoryBucket({ hangDownloads = false } = {}) {
  const saved = new Map();
  return {
    saved,
    file: (path) => ({
      download: async () => {
        if (saved.has(path)) return [Buffer.from(saved.get(path))];
        if (path.startsWith("resources/checkpoints/")) throw Object.assign(new Error("missing"), { code: 404 });
        return hangDownloads ? new Promise(() => {}) : [png()];
      },
      save: async (data) => { saved.set(path, data); },
    }),
  };
}

function setup({ choose, check, bucket = memoryBucket() }) {
  const searches = [];
  const db = {
    collection: () => {
      const query = {
        where: () => query,
        findNearest: () => ({ get: async () => ({ docs: [1, 2, 3].map((n) => {
          const q = bankQuestion(`q${searches.length}_${n}`);
          return { id: q.id, data: () => ({ ...q, years: [9], distance: 0.3 }) };
        }) }) }),
      };
      searches.push(1);
      return query;
    },
  };
  const calls = [];
  const callAi = async (request) => {
    calls.push(request);
    const isCheck = request.responseSchema.required.includes("agrees");
    return { parsed: isCheck ? check(request) : choose(request) };
  };
  return { db, bucket, callAi, calls, searches };
}

const embed = async (texts) => texts.map(() => [1]);
const job = { jobId: "j", subject: "maths", year: 9 };
const fits = () => ({ choice: 2, reason: "fits", stem: "Find the length of the hypotenuse.", options: [], answer: "13 cm", workingOut: "$c^2 = 5^2 + 12^2$\\n$c = 13$" });
const agrees = () => ({ answer: "13 cm", agrees: true, note: "" });

describe("question bank fill: choosing slots", () => {
  it("offers every question or part that asks for a diagram, including multiple choice", () => {
    const parsed = worksheet(4);
    parsed.questions[1].parts = [{ label: "a", stem: "Find x.", marks: 1 }, { label: "b", stem: "Find y.", marks: 1 }];
    parsed.answers.splice(1, 1, { questionNumber: 2, partLabel: "a", answer: "1" }, { questionNumber: 2, partLabel: "b", answer: "2" });
    parsed.questions[2].type = "multiple-choice";
    parsed.questions[3].diagramType = "none";
    parsed.questions[3].parts = [{ label: "a", stem: "Find the area.", marks: 2, diagramType: "rectangle" }];
    parsed.answers[parsed.answers.length - 1].partLabel = "a";
    const { slots, ineligible } = bankSlots(parsed);
    assert.deepEqual(slots.map((s) => [s.number, s.kind, s.partLabel || null]), [[1, "question", null], [2, "whole", null], [3, "question", null], [4, "part", "a"]]);
    assert.equal(slots[1].answerRows.length, 2, "a question whose parts share its diagram takes all their answer rows");
    assert.deepEqual(ineligible, []);
  });

  it("covers topic booklets, matching answers by sub-topic and quiz section", () => {
    const question = (n) => ({ number: n, stem: `Q${n}`, type: "short-answer", options: null, marks: 2, diagram: null, diagramType: "cylinder", parts: null });
    const parsed = {
      topic: "Volume",
      subTopics: [{ title: "Prisms", practiceQuestions: [question(1)] }, { title: "Cylinders", practiceQuestions: [question(1)] }],
      endQuiz: { sections: [{ title: "Quiz", questions: [question(1)] }] },
      answers: {
        subTopicAnswers: [{ subTopicTitle: "Prisms", questionNumber: 1, partLabel: null, answer: "a" }, { subTopicTitle: "Cylinders", questionNumber: 1, partLabel: null, answer: "b" }],
        endQuizAnswers: [{ section: "Quiz", questionNumber: 1, partLabel: null, answer: "c" }],
      },
    };
    const { slots, ineligible } = bankSlots(parsed);
    assert.deepEqual(slots.map((s) => [s.group.value, s.answerRows[0].answer]), [["Prisms", "a"], ["Cylinders", "b"], ["Quiz", "c"]]);
    assert.deepEqual(ineligible, []);
  });

  it("keeps a sub-topic and a quiz section apart when they share a title", () => {
    const question = (n) => ({ number: n, stem: `Q${n}`, type: "short-answer", options: null, marks: 2, diagram: null, diagramType: "right-triangle", parts: null });
    const parsed = {
      subTopics: [{ title: "Finding the hypotenuse", practiceQuestions: [question(1)] }],
      endQuiz: { sections: [{ title: "Finding the hypotenuse", questions: [question(1)] }] },
      answers: {
        subTopicAnswers: [{ subTopicTitle: "Finding the hypotenuse", questionNumber: 1, partLabel: null, answer: "a" }],
        endQuizAnswers: [{ section: "Finding the hypotenuse", questionNumber: 1, partLabel: null, answer: "b" }],
      },
    };
    const { slots, ineligible } = bankSlots(parsed);
    assert.deepEqual(slots.map((s) => s.answerRows[0].answer), ["a", "b"]);
    assert.deepEqual(ineligible, []);
  });

  it("names the questions it cannot swap safely, and leaves bank diagrams alone", () => {
    const parsed = worksheet(3);
    parsed.answers.push({ questionNumber: 1, partLabel: null, answer: "again" });
    parsed.questions[2].diagram = { type: "source-image", storagePath: "a.png" };
    delete parsed.questions[2].diagramType;
    const { slots, ineligible } = bankSlots(parsed);
    assert.deepEqual(slots.map((s) => s.number), [2]);
    assert.deepEqual(ineligible, [{ questionNumber: 1, reason: "answer_row_unclear" }]);
  });

  it("asks for harder questions later in the resource", () => {
    assert.deepEqual([0, 3, 6].map((i) => difficultyAt(i, 9)), ["easy", "medium", "hard"]);
    assert.equal(difficultyAt(0, 2), null);
  });

  it("is always on for maths, whatever an older portal sent, and off for English", () => {
    assert.equal(questionBankModeFor({ subject: "maths" }), "first");
    assert.equal(questionBankModeFor({ subject: "maths", questionBank: "none" }), "first");
    assert.equal(questionBankModeFor({ subject: "english", questionBank: "mostly" }), "none");
  });
});

describe("question bank fill: swapping questions", () => {
  it("tries every diagram question and puts the textbook diagram and checked answer in place", async () => {
    const parsed = worksheet(10);
    const env = setup({ choose: fits, check: agrees });
    const result = await applyQuestionBank({ job, parsed, ...env, embed, logger: {} });
    assert.equal(result.slots, 10, "no cap");
    assert.equal(result.used.length, 10);
    const question = parsed.questions[1];
    assert.equal(question.stem, "Find the length of the hypotenuse.");
    assert.equal(question.diagram.type, "source-image");
    assert.equal(question.diagram.width, 300);
    assert.equal("diagramType" in question, false, "nothing is drawn for it");
    assert.match(question.diagram.questionBankId, /_2$/);
    assert.equal(parsed.answers[1].answer, "13 cm");
    assert.equal(parsed.answers[1].workingOut, "$c^2 = 5^2 + 12^2$\n$c = 13$");
    assert.equal(result.answerRows.length, 10);
    assert.equal(env.calls[0].userMessage.filter((block) => block.type === "image").length, 3, "the model sees every candidate");
    assert.ok(env.calls.every((call) => call.bestEffort && call.concurrent), "bank calls are best effort and may run side by side");
  });

  it("replaces a question whose parts share its diagram with one question and one answer", async () => {
    const parsed = worksheet(1);
    parsed.questions[0].marks = 3;
    parsed.questions[0].parts = [{ label: "a", stem: "Find x.", marks: 1 }, { label: "b", stem: "Find y.", marks: 2 }];
    parsed.answers = [{ questionNumber: 1, partLabel: "a", answer: "1", workingOut: "w", marks: 1 }, { questionNumber: 1, partLabel: "b", answer: "2", workingOut: "w", marks: 2 }];
    await applyQuestionBank({ job, parsed, ...setup({ choose: fits, check: agrees }), embed, logger: {} });
    assert.equal(parsed.questions[0].parts, null);
    assert.equal(parsed.questions[0].marks, 3);
    assert.deepEqual(parsed.answers.map((row) => [row.questionNumber, row.partLabel, row.answer, row.marks]), [[1, null, "13 cm", 3]], "the one answer carries the question's total marks");
  });

  it("gives a multiple-choice question textbook options", async () => {
    const parsed = worksheet(1);
    parsed.questions[0].type = "multiple-choice";
    parsed.questions[0].options = ["1", "2", "3", "4"];
    const choose = () => ({ ...fits(), options: ["12 cm", "13 cm", "14 cm", "17 cm"] });
    const env = setup({ choose, check: agrees });
    await applyQuestionBank({ job, parsed, ...env, embed, logger: {} });
    assert.deepEqual(parsed.questions[0].options, ["12 cm", "13 cm", "14 cm", "17 cm"]);
    assert.match(env.calls[0].userMessage.at(-1).text, /four options/);
    assert.match(env.calls[1].userMessage.at(-1).text, /Options: 12 cm \| 13 cm/);
  });

  it("keeps the generated question to be drawn when no candidate suits or the check disagrees", async () => {
    for (const { choose, check, reason } of [
      { choose: () => ({ choice: 0, reason: "none fit", stem: "", options: [], answer: "", workingOut: "" }), check: () => assert.fail("no check"), reason: "none_suitable" },
      { choose: () => ({ choice: 1, reason: "", stem: "Find x.", options: [], answer: "12", workingOut: "" }), check: () => ({ answer: "13", agrees: false, note: "x is 13" }), reason: "check_disagreed" },
    ]) {
      const parsed = worksheet(3);
      const before = JSON.stringify(parsed);
      const result = await applyQuestionBank({ job, parsed, ...setup({ choose, check }), embed, logger: {} });
      assert.equal(JSON.stringify(parsed), before);
      assert.equal(result.skipped[0].reason, reason);
      assert.equal(result.skipped[0].questionNumber, 1);
    }
  });

  it("solves a third time when the two solves disagree, and uses that answer only if a fresh check agrees", async () => {
    const parsed = worksheet(1);
    const checks = [];
    const env = setup({
      choose: (request) => (request.responseSchema.required.includes("choice") ? fits() : { answer: "13.0 cm", workingOut: "careful working" }),
      check: (request) => { checks.push(request); return checks.length === 1 ? { answer: "13.0 cm", agrees: false, note: "arithmetic slip" } : agrees(); },
    });
    const result = await applyQuestionBank({ job, parsed, ...env, embed, logger: {} });
    assert.equal(result.used.length, 1);
    assert.equal(parsed.answers[0].answer, "13.0 cm");
    assert.equal(parsed.answers[0].workingOut, "careful working");
    const resolve = env.calls.find((c) => c.responseSchema.required.join() === "answer,workingOut");
    assert.match(resolve.userMessage.at(-1).text, /^Solve this question from its diagram/);
    assert.doesNotMatch(resolve.userMessage.at(-1).text, /arithmetic slip|13 cm/, "the third solve never sees the earlier answers, which the model refused");
    assert.equal(resolve.effort, "medium", "high effort was refused by the model");
    assert.equal(checks.length, 2);
  });

  it("searches on the question and its diagram before the resource's topic", async () => {
    const briefs = [];
    const env = setup({ choose: fits, check: agrees });
    await applyQuestionBank({ job, parsed: worksheet(1), ...env, embed: async (texts) => { briefs.push(...texts); return texts.map(() => [1]); }, logger: {} });
    assert.match(briefs[0], /^Find the hypotenuse of triangle 1\.\nDiagram: right-triangle\nTopic: Pythagoras/);
  });

  it("searches separately for a sub-topic and a quiz question that share a title and number", async () => {
    const question = () => ({ number: 1, stem: "Find the hypotenuse.", type: "short-answer", options: null, marks: 2, diagram: null, diagramType: "right-triangle", parts: null });
    const parsed = {
      topic: "Pythagoras",
      subTopics: [{ title: "Hypotenuse", practiceQuestions: [question()] }],
      endQuiz: { sections: [{ title: "Hypotenuse", questions: [question()] }] },
      answers: {
        subTopicAnswers: [{ subTopicTitle: "Hypotenuse", questionNumber: 1, partLabel: null, answer: "a" }],
        endQuizAnswers: [{ section: "Hypotenuse", questionNumber: 1, partLabel: null, answer: "b" }],
      },
    };
    const env = setup({ choose: fits, check: agrees });
    const result = await applyQuestionBank({ job, parsed, ...env, embed, logger: {} });
    assert.equal(env.searches.length, 4, "each slot runs its own search and fallback; neither reuses the other's");
    const ids = result.used.map((u) => u.questionId);
    assert.equal(new Set(ids).size, 2, "never the same textbook question twice");
  });

  it("saves its searches, so a later worker does not search again", async () => {
    const bucket = memoryBucket();
    const first = setup({ choose: fits, check: agrees, bucket });
    await applyQuestionBank({ job, parsed: worksheet(4), ...first, embed, logger: {} });
    const searchesFirst = first.searches.length;
    assert.ok(searchesFirst >= 4);
    const second = setup({ choose: fits, check: agrees, bucket });
    const result = await applyQuestionBank({ job, parsed: worksheet(4), ...second, embed, logger: {} });
    assert.equal(second.searches.length, 0);
    assert.equal(result.used.length, 4);
  });

  it("leaves slots still running when its time is spent to be drawn", async () => {
    const parsed = worksheet(3);
    const env = setup({ choose: () => new Promise(() => {}), check: () => ({}) });
    const result = await applyQuestionBank({ job, parsed, ...env, embed, budgetMs: 20, logger: {} });
    assert.equal(result.used.length, 0);
    assert.ok(result.skipped.every((s) => s.reason === "out_of_time"));
  });

  it("does nothing for English", async () => {
    const result = await applyQuestionBank({ job: { subject: "english", year: 9 }, parsed: worksheet(3), db: {}, bucket: {}, callAi: () => assert.fail() });
    assert.deepEqual(result.used, []);
    assert.equal(result.mode, "none");
  });
});

describe("source images", () => {
  it("keep their bytes through a clone but never in stored JSON", () => {
    const image = png(10, 20);
    const resource = { questions: [{ diagram: { type: "source-image", image, width: 10, height: 20, storagePath: "a.png" } }] };
    const copy = cloneWithSourceImages(resource);
    assert.ok(Buffer.isBuffer(copy.questions[0].diagram.image));
    assert.notEqual(copy.questions[0].diagram, resource.questions[0].diagram);
    const stored = JSON.parse(JSON.stringify(resource, withoutSourceImageBytes));
    assert.equal(stored.questions[0].diagram.image, undefined);
    assert.equal(stored.questions[0].diagram.storagePath, "a.png");
    assert.deepEqual(pngSize(image), { width: 10, height: 20 });
  });

  it("are fetched from Storage when a stored resource is rebuilt", async () => {
    const resource = { questions: [{ diagram: { type: "source-image", width: 1, height: 1, storagePath: "a.png" } }, { diagram: { type: "source-image", width: 1, height: 1, storagePath: "a.png" } }] };
    const downloads = [];
    const fetched = await loadSourceImages(resource, { file: (path) => ({ download: async () => { downloads.push(path); return [png()]; } }) });
    assert.equal(fetched, 1);
    assert.deepEqual(downloads, ["a.png"]);
    assert.ok(Buffer.isBuffer(resource.questions[1].diagram.image));
  });
});

describe("question bank fill: stored records", () => {
  it("never records an undefined field, which Firestore rejects", async () => {
    const parsed = worksheet(3);
    const db = { collection: () => { throw new Error("search down"); } };
    const result = await applyQuestionBank({ job, parsed, db, bucket: memoryBucket(), callAi: async () => ({}), embed, logger: {} });
    const hasUndefined = (value) => value === undefined || (value && typeof value === "object" && !Buffer.isBuffer(value) && Object.values(value).some(hasUndefined));
    assert.ok(result.skipped.length);
    assert.equal(hasUndefined({ used: result.used, skipped: result.skipped }), false);
  });

  it("omits the detail of a slot that timed out", async () => {
    const parsed = worksheet(3);
    const db = { collection: () => { const q = { where: () => q, findNearest: () => ({ get: async () => ({ docs: [{ id: "a", data: () => ({ ...bankQuestion("a"), years: [9] }) }] }) }) }; return q; } };
    const result = await applyQuestionBank({ job, parsed, db, bucket: memoryBucket({ hangDownloads: true }), callAi: async () => ({}), embed, budgetMs: 30, logger: {} });
    assert.ok(result.skipped.some((s) => s.reason === "out_of_time" && !("detail" in s)));
  });
});

describe("question bank fill: time limits", () => {
  it("bounds a search that never returns by the step's budget", async () => {
    const parsed = worksheet(3);
    const db = { collection: () => { const q = { where: () => q, findNearest: () => ({ get: () => new Promise(() => {}) }) }; return q; } };
    const started = Date.now();
    const result = await applyQuestionBank({ job, parsed, db, bucket: memoryBucket(), callAi: async () => ({}), embed, budgetMs: 50, logger: {} });
    assert.ok(Date.now() - started < 1000, "returns within the budget");
    assert.equal(result.used.length, 0);
    assert.ok(result.skipped.every((s) => /timed out|out_of_time/.test(s.reason)));
    assert.equal(JSON.stringify(parsed), JSON.stringify(worksheet(3)), "every generated question stays");
  });
});
