"use strict";

// RES-97: candidate stimulus images are shown to a vision model before one is
// printed.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { bestVerdict, judgeStimulusImages, judgeSystemPrompt } = require("../../src/resources/imageJudge");
const { maybeSourceStimulusSet } = require("../../src/resources/index");

describe("judgeStimulusImages", () => {
  it("sends every candidate as an image with the year, purpose and task, and reads the verdicts back in order", async () => {
    let request;
    const callAi = async (req) => {
      request = req;
      return { parsed: { candidates: [
        { index: 2, suitable: true, fit: 4, reason: "Clear.", title: "Storm at sea", description: "A ship in a storm." },
        { index: 1, suitable: false, fit: 1, reason: "Arabic text.", title: "", description: "" },
      ] } };
    };
    const verdicts = await judgeStimulusImages({
      images: [{ buffer: Buffer.from("a") }, { buffer: Buffer.from("b") }],
      year: 7, purpose: "creative-prompt", task: "Write a story.",
      anthropicApiKey: "key", callAi, model: "claude-test",
      preview: async (buffer) => Buffer.concat([Buffer.from("jpeg:"), buffer]),
    });
    const content = request.messages[0].content;
    const images = content.filter((block) => block.type === "image");
    assert.equal(images.length, 2);
    assert.equal(images[0].source.media_type, "image/jpeg");
    assert.equal(Buffer.from(images[1].source.data, "base64").toString(), "jpeg:b");
    assert.match(content.at(-1).text, /Year level: 7/);
    assert.match(content.at(-1).text, /writing prompt/);
    assert.match(content.at(-1).text, /Task: Write a story\./);
    assert.equal(request.model, "claude-test");
    assert.equal(request.thinkingDisabled, true);
    assert.ok(request.responseSchema);
    assert.deepEqual(verdicts.map((v) => [v.index, v.suitable]), [[1, false], [2, true]]);
    assert.equal(bestVerdict(verdicts).title, "Storm at sea");
  });

  it("tells the judge what makes an image unsuitable", () => {
    const prompt = judgeSystemPrompt();
    for (const phrase of [/multi-panel/, /both sides of a document/, /map, chart/, /in English and large enough to read/, /year level/]) {
      assert.match(prompt, phrase);
    }
  });

  it("refuses to run without an Anthropic key, so the caller falls back", async () => {
    await assert.rejects(judgeStimulusImages({ images: [], anthropicApiKey: "", callAi: async () => ({}), model: "claude-test" }), { code: "IMAGE_JUDGE_UNAVAILABLE" });
  });

  it("prefers the best fit, then the better-ranked candidate", () => {
    assert.equal(bestVerdict([{ index: 1, suitable: true, fit: 4 }, { index: 2, suitable: true, fit: 5 }]).index, 2);
    assert.equal(bestVerdict([{ index: 1, suitable: true, fit: 4 }, { index: 2, suitable: true, fit: 4 }]).index, 1);
    assert.equal(bestVerdict([{ index: 1, suitable: false, fit: 5 }]), null);
  });
});

describe("visual sourcing hands the judge the job's year", () => {
  it("binds the year, keys and caller for each planned visual", async () => {
    let judged;
    const result = await maybeSourceStimulusSet({
      job: { jobId: "j", year: 9, subject: "english", resourceType: "worksheet", createdBy: "u" },
      anthropicApiKey: "key",
      callAi: async () => ({}),
      planStimulus: async () => ({ needed: true, texts: [], visuals: [{ searchTerms: "poster", purpose: "visual-literacy", task: "Analyse it." }] }),
      sourceText: async () => ({ ok: false }),
      judgeImages: async (args) => { judged = args; return [{ index: 1, suitable: true, fit: 5, reason: "", title: "A poster", description: "" }]; },
      sourceVisual: async ({ selection, judge }) => {
        const verdicts = await judge({ images: [{ buffer: Buffer.from("x") }], purpose: selection.purpose, task: selection.task });
        return { ok: true, selection, image: { buffer: Buffer.from("x"), type: "png" }, title: verdicts[0].title, cluster: "poster" };
      },
    });
    assert.equal(result.visuals.length, 1);
    assert.equal(judged.year, 9);
    assert.equal(judged.anthropicApiKey, "key");
    assert.equal(judged.purpose, "visual-literacy");
    assert.equal(typeof judged.callAi, "function");
  });
});
