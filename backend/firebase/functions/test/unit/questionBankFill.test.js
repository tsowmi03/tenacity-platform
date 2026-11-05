"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { applyQuestionBank, bankSlots, difficultyAt, pickSlots, questionBankModeFor } = require("../../src/resources/questionBankFill");
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
      diagram: { type: "right-triangle", sides: [3, 4] },
      diagramRequired: true,
      parts: null,
    })),
    answers: Array.from({ length: count }, (_, i) => ({ questionNumber: i + 1, partLabel: null, answer: "5 cm", workingOut: "$c^2 = 3^2 + 4^2$" })),
  };
}

function bankQuestion(id) {
  return { id, status: "live", sourcePath: "Maths/Year 9/Book.pdf", pageNumber: 4, label: "Q1a", stem: "Find x.", text: "", description: "Find the hypotenuse", figures: [{ storagePath: `questionBank/diagrams/${id}_1.png` }] };
}

describe("question bank fill: choosing slots", () => {
  it("only offers numbered diagram questions without parts whose answer row is unambiguous", () => {
    const parsed = worksheet(4);
    parsed.questions[1].parts = [{ label: "a", stem: "x" }];
    parsed.questions[2].type = "multiple-choice";
    parsed.answers.push({ questionNumber: 4, partLabel: "b", answer: "?" });
    assert.deepEqual(bankSlots(parsed).map((slot) => slot.owner.number), [1]);
  });

  it("skips resources whose answers restart numbering by section", () => {
    const parsed = worksheet(2);
    parsed.answers = { subTopicAnswers: parsed.answers };
    assert.deepEqual(bankSlots(parsed), []);
  });

  it("takes about a third for some, all for mostly, none otherwise", () => {
    const slots = Array.from({ length: 9 }, (_, i) => ({ id: i }));
    assert.equal(pickSlots(slots, "some").length, 3);
    assert.deepEqual(pickSlots(slots, "some").map((s) => s.id), [1, 4, 7], "spread through the resource");
    assert.equal(pickSlots(slots, "mostly").length, 8, "capped");
    assert.deepEqual(pickSlots(slots, "none"), []);
    assert.equal(pickSlots([{ id: 0 }], "some").length, 1);
  });

  it("asks for harder questions later in the resource", () => {
    assert.deepEqual([0, 3, 6].map((i) => difficultyAt(i, 9)), ["easy", "medium", "hard"]);
    assert.equal(difficultyAt(0, 2), null);
  });

  it("is off for English and for jobs without the setting", () => {
    assert.equal(questionBankModeFor({ subject: "english", questionBank: "mostly" }), "none");
    assert.equal(questionBankModeFor({ subject: "maths" }), "none");
    assert.equal(questionBankModeFor({ subject: "maths", questionBank: "some" }), "some");
  });
});

describe("question bank fill: swapping questions", () => {
  function setup({ choose, check }) {
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
    const bucket = { file: () => ({ download: async () => [png()] }) };
    const calls = [];
    const callAi = async (request) => {
      calls.push(request);
      const isCheck = request.responseSchema.required.includes("agrees");
      return { parsed: isCheck ? check(request) : choose(request) };
    };
    return { db, bucket, callAi, calls };
  }

  it("puts the chosen original diagram and checked answer in place", async () => {
    const parsed = worksheet(3);
    const { db, bucket, callAi, calls } = setup({
      choose: () => ({ choice: 2, reason: "fits", stem: "Find the length of the hypotenuse.", answer: "13 cm", workingOut: "$c^2 = 5^2 + 12^2$\\n$c = 13$" }),
      check: () => ({ answer: "13 cm", agrees: true, note: "" }),
    });
    const result = await applyQuestionBank({ job: { jobId: "j", subject: "maths", year: 9, questionBank: "some" }, parsed, db, bucket, callAi, embed: async (texts) => texts.map(() => [1]), logger: {} });
    assert.equal(result.used.length, 1);
    const question = parsed.questions[1];
    assert.equal(question.stem, "Find the length of the hypotenuse.");
    assert.equal(question.diagram.type, "source-image");
    assert.equal(question.diagram.width, 300);
    assert.match(question.diagram.questionBankId, /_2$/);
    assert.equal(parsed.answers[1].answer, "13 cm");
    assert.equal(parsed.answers[1].workingOut, "$c^2 = 5^2 + 12^2$\n$c = 13$");
    assert.equal(calls[0].userMessage.filter((block) => block.type === "image").length, 3, "the model sees every candidate");
    assert.equal(calls[1].userMessage.filter((block) => block.type === "image").length, 1, "the check sees only the chosen diagram");
  });

  it("keeps the generated question when no candidate suits or the check disagrees", async () => {
    for (const { choose, check, reason } of [
      { choose: () => ({ choice: 0, reason: "none fit", stem: "", answer: "", workingOut: "" }), check: () => assert.fail("no check"), reason: "none_suitable" },
      { choose: () => ({ choice: 1, reason: "", stem: "Find x.", answer: "12", workingOut: "" }), check: () => ({ answer: "13", agrees: false, note: "x is 13" }), reason: "check_disagreed" },
    ]) {
      const parsed = worksheet(3);
      const before = JSON.stringify(parsed);
      const result = await applyQuestionBank({ job: { subject: "maths", year: 9, questionBank: "some" }, parsed, ...setup({ choose, check }), embed: async (t) => t.map(() => [1]), logger: {} });
      assert.equal(JSON.stringify(parsed), before);
      assert.equal(result.skipped[0].reason, reason);
    }
  });

  it("gives up on slots still running when its time is spent", async () => {
    const parsed = worksheet(3);
    const env = setup({ choose: () => new Promise(() => {}), check: () => ({}) });
    const result = await applyQuestionBank({ job: { subject: "maths", year: 9, questionBank: "some" }, parsed, ...env, embed: async (t) => t.map(() => [1]), budgetMs: 20, logger: {} });
    assert.equal(result.used.length, 0);
    assert.equal(result.skipped[0].reason, "out_of_time");
  });

  it("does nothing when the setting is none", async () => {
    const result = await applyQuestionBank({ job: { subject: "maths", year: 9, questionBank: "none" }, parsed: worksheet(3), db: {}, bucket: {}, callAi: () => assert.fail() });
    assert.deepEqual(result.used, []);
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
    const result = await applyQuestionBank({ job: { subject: "maths", year: 9, questionBank: "some" }, parsed, db, bucket: {}, callAi: async () => ({}), embed: async (t) => t.map(() => [1]), logger: {} });
    const hasUndefined = (value) => value === undefined || (value && typeof value === "object" && Object.values(value).some(hasUndefined));
    assert.ok(result.skipped.length);
    assert.equal(hasUndefined(result), false);
  });

  it("omits the detail of a slot that timed out", async () => {
    const parsed = worksheet(3);
    const db = { collection: () => { const q = { where: () => q, findNearest: () => ({ get: async () => ({ docs: [{ id: "a", data: () => ({ ...bankQuestion("a"), years: [9] }) }] }) }) }; return q; } };
    const result = await applyQuestionBank({ job: { subject: "maths", year: 9, questionBank: "some" }, parsed, db, bucket: { file: () => ({ download: () => new Promise(() => {}) }) }, callAi: async () => ({}), embed: async (t) => t.map(() => [1]), budgetMs: 10, logger: {} });
    assert.deepEqual(result.skipped, [{ questionNumber: 2, reason: "out_of_time" }]);
  });
});

describe("question bank fill: time limits", () => {
  it("bounds a search that never returns by the step's budget", async () => {
    const parsed = worksheet(3);
    const db = { collection: () => { const q = { where: () => q, findNearest: () => ({ get: () => new Promise(() => {}) }) }; return q; } };
    const started = Date.now();
    const result = await applyQuestionBank({ job: { subject: "maths", year: 9, questionBank: "mostly" }, parsed, db, bucket: {}, callAi: async () => ({}), embed: async (t) => t.map(() => [1]), budgetMs: 50, logger: {} });
    assert.ok(Date.now() - started < 1000, "returns within the budget");
    assert.equal(result.used.length, 0);
    assert.ok(result.skipped.every((s) => /timed out|out_of_time/.test(s.reason)));
    assert.equal(JSON.stringify(parsed), JSON.stringify(worksheet(3)), "every generated question stays");
  });
});
