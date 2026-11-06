"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { applyQuestionBank, bankSlots, difficultyAt, levelGap, questionBankModeFor, rankByLevel, slotDifficulty } = require("../../src/resources/questionBankFill");
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

// Each bank question is its own printed question (its own source file), so
// none is a sibling part of another unless a test says so.
function bankQuestion(id) {
  return { id, status: "live", sourcePath: `Maths/Year 9/${id}.pdf`, pageNumber: 4, label: "Q1a", stem: "Find x.", text: "", description: "Find the hypotenuse", figures: [{ storagePath: `questionBank/diagrams/${id}_1.png` }] };
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

  // RES-82. In 19 of 20 rejected questions reviewed, the check was right and
  // the writer wrong; a fresh third solve repeated the writer's slips.
  it("offers a disagreeing check's own answer to a second check, and uses it only if that agrees", async () => {
    const parsed = worksheet(1);
    const checks = [];
    const solution = "$c^2 = 5^2 + 12^2 - 25$... so the side is 12 cm";
    const env = setup({
      choose: (request) => (request.responseSchema.required.join() === "answered,answer" ? { answered: true, answer: "12 cm" } : fits()),
      check: (request) => { checks.push(request); return checks.length === 1 ? { answer: solution, agrees: false, note: "arithmetic slip" } : { answer: "12 cm", agrees: true, note: "" }; },
    });
    const result = await applyQuestionBank({ job, parsed, ...env, embed, logger: {} });
    assert.equal(result.used.length, 1);
    assert.equal(parsed.answers[0].answer, "12 cm");
    assert.equal(parsed.answers[0].workingOut, solution, "the check's solution is the working");
    assert.equal(checks.length, 2, "no third solve");
    const final = env.calls.find((c) => c.responseSchema.required.join() === "answered,answer");
    assert.equal(final.userMessage.some((b) => b.type === "image"), false, "the final answer is read from the solution, text only");
    assert.match(final.userMessage.at(-1).text, /Do not change it/);
    const recheck = checks[1].userMessage.at(-1).text;
    assert.match(recheck, /Proposed answer: 12 cm$/);
    assert.doesNotMatch(recheck, /arithmetic slip|13 cm/, "the second check never sees the earlier answer or note, which the model refused");
    assert.equal(checks[1].effort, "medium", "high effort was refused by the model");
    assert.deepEqual(checks[0].responseSchema.required, ["answer", "agrees", "note"], "the check is not asked to set out its working, which the model refused");
  });

  it("draws the diagram when the check finds the question itself broken", async () => {
    const env = setup({
      choose: (request) => (request.responseSchema.required.join() === "answered,answer" ? { answered: false, answer: "No valid value exists: the conditions are inconsistent" } : fits()),
      check: () => ({ answer: "The totals come to 46, never 40, so no value works.", agrees: false, note: "inconsistent" }),
    });
    const result = await applyQuestionBank({ job, parsed: worksheet(1), ...env, embed, logger: {} });
    assert.equal(result.used.length, 0);
    assert.equal(result.skipped[0].reason, "check_disagreed");
    assert.equal(env.calls.filter((c) => c.responseSchema.required.includes("agrees")).length, 1, "a broken question never reaches a second check");
  });

  it("draws the diagram when the second check disagrees too", async () => {
    let n = 0;
    const env = setup({ choose: (request) => (request.responseSchema.required.join() === "answered,answer" ? { answered: true, answer: "12 cm" } : fits()), check: () => ({ answer: n++ === 0 ? "12 cm" : "11 cm", agrees: false, note: "no" }) });
    const result = await applyQuestionBank({ job, parsed: worksheet(1), ...env, embed, logger: {} });
    assert.equal(result.used.length, 0);
    assert.equal(result.skipped[0].reason, "check_disagreed");
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
    assert.equal(env.searches.length, 2, "each slot runs its own search; neither reuses the other's");
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

// RES-76.
describe("question bank fill: year and difficulty", () => {
  it("takes the generator's difficulty, then the parent's, and position only as a fallback", () => {
    assert.equal(slotDifficulty({ owner: { difficulty: "hard" } }, 0, 9), "hard");
    assert.equal(slotDifficulty({ owner: {}, parent: { difficulty: "easy" } }, 8, 9), "easy");
    assert.equal(slotDifficulty({ owner: { difficulty: "brutal" } }, 8, 9), "hard", "an unknown label falls back to position");
  });

  it("puts year and difficulty on one scale, the student's year either side", () => {
    assert.equal(levelGap({ years: [9], difficulty: "easy" }, 8, "hard"), 0, "Year 9 easy sits level with Year 8 hard");
    assert.equal(levelGap({ years: [8], difficulty: "hard" }, 8, "hard"), 0);
    assert.equal(levelGap({ years: [7], difficulty: "medium" }, 8, "hard"), 1.5);
    assert.equal(levelGap({ years: [10], difficulty: "easy" }, 8, "easy"), Infinity, "two years out is never offered");
    assert.equal(levelGap({ years: [9, 10] }, 9, "medium"), 0, "a multi-year question counts at the student's year, untagged as medium");
  });

  it("ranks by level in half-step bands, by wording within a band, and drops anything a step away", () => {
    const ranked = rankByLevel([
      { id: "near-wording-wrong-level", years: [8], difficulty: "easy" },
      { id: "level", years: [9], difficulty: "easy" },
      { id: "half-step", years: [8], difficulty: "medium" },
      { id: "too-far", years: [7], difficulty: "easy" },
      { id: "level-later", years: [8], difficulty: "hard" },
    ], 8, "hard");
    assert.deepEqual(ranked.map((q) => q.id), ["level", "level-later", "half-step", "near-wording-wrong-level"]);
  });

  it("searches the years either side and tells the model the brief, the difficulty and each candidate's year", async () => {
    const env = setup({ choose: fits, check: agrees });
    const parsed = worksheet(1);
    parsed.questions[0].difficulty = "hard";
    await applyQuestionBank({ job: { ...job, customPrompt: "A tough revision paper for a selective school test" }, parsed, ...env, embed, logger: {} });
    const prompt = env.calls[0].userMessage.at(-1).text;
    assert.match(prompt, /The tutor asked for: "A tough revision paper/);
    assert.match(prompt, /hard for a Year 9 student/);
    assert.match(prompt, /Printed for: Year 9/);
    assert.match(prompt, /taught by Year 9/);
    assert.match(prompt, /approach to "original"/);
  });

  it("records the model's choice of restating or adapting, not a fixed schedule (RES-76)", async () => {
    const env = setup({ choose: () => ({ ...fits(), approach: "adapted" }), check: agrees });
    const result = await applyQuestionBank({ job, parsed: worksheet(3), ...env, embed, logger: {} });
    assert.ok(result.used.length > 0);
    assert.ok(result.used.every((u) => u.kind === "new"));
    assert.ok(result.used.every((u) => u.questionYear === 9 && typeof u.difficulty === "string"));
  });
});

// RES-80. The generated question only sets the slot's skill, difficulty and
// marks; the textbook diagram decides the question.
describe("question bank fill: diagram first", () => {
  // Every search returns the same crops, best first, as a real bank does for
  // several questions on one skill.
  function sharedBank({ choose, check = agrees, crops = 6, refuse = 0 }) {
    const searches = [];
    const db = {
      collection: () => {
        const query = {
          where: (...args) => { searches.at(-1).where.push(args); return query; },
          findNearest: () => ({ get: async () => ({ docs: Array.from({ length: crops }, (_, i) => {
            const q = bankQuestion(`crop${i + 1}`);
            return { id: q.id, data: () => ({ ...q, years: [9], distance: 0.1 + i / 100 }) };
          }) }) }),
        };
        searches.push({ where: [] });
        return query;
      },
    };
    const calls = [];
    let refusals = refuse;
    const callAi = async (request) => {
      calls.push(request);
      if (request.responseSchema.required.includes("choice") && refusals > 0) {
        refusals -= 1;
        throw Object.assign(new Error("AI declined to generate this resource (reasoning_extraction)."), { refusal: true });
      }
      return { parsed: request.responseSchema.required.includes("agrees") ? check(request) : choose(request) };
    };
    return { db, bucket: memoryBucket(), callAi, calls, searches };
  }
  const shownIds = (request) => [...request.userMessage.at(-1).text.matchAll(/^Candidate \d+ \(image \d+\): .*$/gm)].length;
  const pickFirst = () => ({ ...fits(), choice: 1 });

  it("searches on the skill and diagram type, and writes the question from the diagram, not the generated one", async () => {
    const parsed = worksheet(1);
    parsed.questions[0].skill = "lengths in right-angled triangles";
    const briefs = [];
    const env = sharedBank({ choose: pickFirst });
    await applyQuestionBank({ job, parsed, ...env, embed: async (texts) => { briefs.push(...texts); return texts.map(() => [1]); }, logger: {} });
    assert.match(briefs[0], /^lengths in right-angled triangles\nDiagram: right-triangle\nTopic: Pythagoras/);
    const prompt = env.calls[0].userMessage.at(-1).text;
    assert.match(prompt, /needs a question testing lengths in right-angled triangles/);
    assert.doesNotMatch(prompt, /Find the hypotenuse of triangle 1/, "the generated question is not a target to match");
    assert.doesNotMatch(prompt, /near miss is worse/, "a crop no longer has to test the generated question's exact skill");
    assert.match(prompt, /never to a table, row or other question/);
  });

  it("takes a part's skill from its question when the part has none", async () => {
    const parsed = worksheet(1);
    parsed.questions[0].diagramType = "none";
    parsed.questions[0].skill = "area of composite shapes";
    parsed.questions[0].parts = [{ label: "a", stem: "Find the area.", marks: 2, diagramType: "L-shape" }];
    parsed.answers[0].partLabel = "a";
    const env = sharedBank({ choose: pickFirst });
    await applyQuestionBank({ job, parsed, ...env, embed, logger: {} });
    assert.match(env.calls[0].userMessage.at(-1).text, /testing area of composite shapes/);
  });

  it("falls back to the generated question for a question written without a skill", async () => {
    const env = sharedBank({ choose: pickFirst });
    await applyQuestionBank({ job, parsed: worksheet(1), ...env, embed, logger: {} });
    assert.match(env.calls[0].userMessage.at(-1).text, /The question it replaces:\nFind the hypotenuse of triangle 1\./);
  });

  it("holds nothing back in the search, so the last slots are not left with the weakest crops", async () => {
    const env = sharedBank({ choose: pickFirst });
    await applyQuestionBank({ job, parsed: worksheet(3), ...env, embed, logger: {} });
    assert.equal(env.searches.length, 3);
    assert.ok(env.searches.every((s) => !s.where.some(([field]) => field === "__name__")), "no search excludes another slot's crops");
  });

  it("fills the hardest slots first and never uses a crop twice", async () => {
    const parsed = worksheet(3);
    parsed.questions[0].difficulty = "easy";
    parsed.questions[1].difficulty = "medium";
    parsed.questions[2].difficulty = "hard";
    const env = sharedBank({ choose: pickFirst });
    const result = await applyQuestionBank({ job, parsed, ...env, embed, logger: {} });
    const byNumber = Object.fromEntries(result.used.map((u) => [u.questionNumber, u.questionId]));
    assert.equal(byNumber[3], "crop1", "the hard slot gets the best crop");
    assert.equal(new Set(Object.values(byNumber)).size, 3);
    assert.equal(result.used.length, 3, "a slot that lost its crop to a harder one tries again with the rest");
  });

  it("frees a crop a slot looked at but did not keep", async () => {
    const parsed = worksheet(5);
    // The hardest slot looks at crops 1-4 first and keeps none; the others
    // can still use all of them.
    let first = true;
    const env = sharedBank({ choose: () => {
      if (first) { first = false; return { choice: 0, reason: "none fit", stem: "", options: [], answer: "", workingOut: "" }; }
      return pickFirst();
    }, crops: 5 });
    const result = await applyQuestionBank({ job, parsed, ...env, embed, logger: {} });
    assert.equal(result.used.length, 4, "one slot found none suitable; the four others filled");
    assert.ok(result.used.some((u) => u.questionId === "crop1"), "a crop the first slot passed over was used");
    assert.ok(env.calls.filter((c) => c.responseSchema.required.includes("choice")).every((c) => shownIds(c) >= 1));
  });

  it("never uses two parts of one textbook question", async () => {
    const env = sharedBank({ choose: pickFirst, crops: 4 });
    // crop1 and crop2 are parts a and b of one printed question; crop3 and crop4 are others.
    const db = env.db;
    env.db = { collection: () => {
      const query = db.collection();
      const nearest = query.findNearest;
      query.findNearest = (...args) => ({ get: async () => {
        const snap = await nearest(...args).get();
        return { docs: snap.docs.map((doc, i) => ({ id: doc.id, data: () => ({ ...doc.data(), sourcePath: "Maths/Year 9/Book.pdf", label: ["Exercise 8G Q4a", "Exercise 8G Q4d", "Q5", "Q6"][i] }) })) };
      } });
      return query;
    } };
    const result = await applyQuestionBank({ job, parsed: worksheet(2), ...env, embed, logger: {} });
    assert.deepEqual(result.used.map((u) => u.questionId).sort(), ["crop1", "crop3"]);
  });

  it("retries a refused call once, then leaves the slot to be drawn", async () => {
    const once = sharedBank({ choose: pickFirst, refuse: 1 });
    const filled = await applyQuestionBank({ job, parsed: worksheet(1), ...once, embed, logger: {} });
    assert.equal(filled.used.length, 1, "the second attempt goes through");
    const twice = sharedBank({ choose: pickFirst, refuse: 2 });
    const drawn = await applyQuestionBank({ job, parsed: worksheet(1), ...twice, embed, logger: {} });
    assert.equal(drawn.used.length, 0);
    assert.match(drawn.skipped[0].reason, /^failed: AI declined/);
  });

  it("asks the generator for a broad skill on every maths question", () => {
    const { buildResponseSchema } = require("../../src/resources/responseSchema");
    const { buildSystemPrompt } = require("../../src/resources/promptBuilder");
    const schema = buildResponseSchema("worksheet", { subject: "maths", answerMode: "answers" });
    assert.equal(schema.properties.questions.items.properties.skill.type, "string");
    assert.ok(schema.properties.questions.items.required.includes("skill"));
    const english = buildResponseSchema("worksheet", { subject: "english", answerMode: "answers" });
    assert.equal(english.properties.questions.items.properties.skill, undefined);
    assert.match(buildSystemPrompt("worksheet", { year: 9, subject: "maths", answerMode: "answers" }), /set "skill" on the same question or part to the broad skill/);
  });
});
