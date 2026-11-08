"use strict";

// RES-95 and RES-89: a paper that fits passes silently, one that doesn't is
// repaired and re-checked, and only what is still wrong reaches the tutor.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { generatePlannedResource, unmatchedEvidenceTopics, validateRepair, validateQuestions } = require("../../src/resources/plannedGeneration");
const { requestedMinutes, separateReadingMinutes, timingFits, verifyPlannedContent } = require("../../src/resources/contentVerification");
const { readingBudget, textWordLimit } = require("../../src/resources/readingLoad");
const { excerptOpening } = require("../../src/resources/publicDomainText");

function setup({ reviews, repairs = [], customPrompt = "Year 8 paper, 60 minutes." }) {
  const plan = { title: "Paper", clarification: "", timeAllowed: "60 minutes", topics: [{ name: "Reading", evidence: "Year 8 paper" }],
    questions: [1, 2, 3].map((number) => ({ number, topic: "Reading", section: "Section A: Reading", difficulty: "standard", marks: number === 3 ? 20 : 4, focus: `f${number}`, sourceIds: [], estimatedMinutes: 20 })) };
  const seen = { reviews: [], repairs: [], events: [] };
  const callAi = async (req) => {
    if (req.systemPrompt.startsWith("Plan an educational")) return { parsed: plan };
    if (req.systemPrompt.startsWith("Independently audit")) {
      seen.reviews.push(req);
      const verdict = reviews[Math.min(seen.reviews.length - 1, reviews.length - 1)];
      return { parsed: { scopePass: true, difficultyPass: true, issues: [], ...verdict } };
    }
    if (req.userMessage.includes("A review of the finished resource")) {
      seen.repairs.push(req);
      const repair = repairs[seen.repairs.length - 1];
      if (repair instanceof Error) throw repair;
      req.validateStageResult?.(repair);
      return repair;
    }
    const specs = req.userMessage.match(/SAVED PLAN .*?: (\[.*\])\nGenerate/);
    if (specs) {
      const questions = JSON.parse(specs[1]).map((q) => ({ number: q.number, marks: q.marks, stem: `In Text 1, explain point ${q.number}.`, type: "short-answer", options: null, parts: null }));
      return { parsed: { title: "Paper", subject: "english", year: 8, totalMarks: 28, timeAllowed: "60 minutes", stimulus: [{ title: "The bridge", author: null, source: null, body: "Toby tested the bridge." }], sections: [{ title: "batch", questions }], markingGuide: [] } };
    }
    const questions = req.userMessage.split("\n").map((line) => { try { return JSON.parse(line); } catch { return null; } }).find((rows) => Array.isArray(rows) && rows[0]?.stem);
    return { parsed: { markingGuide: questions.map((q) => ({ questionNumber: q.number, partLabel: null, suggestedResponse: "Original answer.", markingCriteria: ["1 mark: a point"], marks: q.marks })) } };
  };
  const job = { jobId: "j", subject: "english", year: 8, resourceType: "practice-paper", answerMode: "worked", customPrompt, resourceLogSink: (_m, e) => seen.events.push(e) };
  const run = () => generatePlannedResource({ job, hasStimulus: true, request: { model: "gpt-test", userMessage: "Year 8 paper, 60 minutes.", systemPrompt: "system" }, callAi,
    stimulusImages: [{ purpose: "creative-prompt", task: "Write.", title: "Rally", description: "A crowd with a JOBS sign." }] });
  return { run, seen };
}

const minutes = (a, b, c) => ({ questions: [a, b, c].map((estimatedMinutes, i) => ({ number: i + 1, coveredSourceIds: [], estimatedMinutes })) });
const shorter = { parsed: {
  questions: [{ number: 3, marks: 15, stem: "In Text 1, write a shorter response.", type: "short-answer", options: null, parts: null }],
  markingGuide: [{ questionNumber: 3, partLabel: null, suggestedResponse: "Shorter plan.", markingCriteria: ["15 marks: a response"], marks: 15 }],
} };

describe("timing tolerance (RES-95)", () => {
  it("lets a paper up to 15% over, or down to 75%, pass", () => {
    assert.equal(timingFits(69, 60), true);
    assert.equal(timingFits(45, 60), true);
    assert.equal(timingFits(70, 60), false);
    assert.equal(timingFits(44, 60), false);
    assert.equal(timingFits(500, null), true);
  });

  it("passes a small overrun silently, with no repair", async () => {
    const { run, seen } = setup({ reviews: [minutes(10, 20, 39)] });
    const result = await run();
    assert.equal(result.reviewStatus, "passed");
    assert.deepEqual(result.warnings, []);
    assert.equal(seen.repairs.length, 0);
  });
});

describe("repair before warning (RES-95)", () => {
  it("repairs a large overrun, re-checks it and says nothing to the tutor", async () => {
    const { run, seen } = setup({ reviews: [minutes(15, 25, 45), minutes(15, 25, 22)], repairs: [shorter] });
    const result = await run();
    assert.equal(seen.repairs.length, 1);
    assert.equal(seen.reviews.length, 2);
    assert.match(seen.repairs[0].userMessage, /takes about 85 minutes but the sitting is 60 minutes/);
    assert.equal(result.reviewStatus, "passed");
    assert.deepEqual(result.warnings, []);
    const q3 = result.parsed.sections.flatMap((s) => s.questions).find((q) => q.number === 3);
    assert.equal(q3.stem, "In Text 1, write a shorter response.");
    assert.equal(result.parsed.totalMarks, 23);
    assert.equal(result.parsed.markingGuide.find((r) => r.questionNumber === 3).suggestedResponse, "Shorter plan.");
    assert.deepEqual(result.parsed.markingGuide.map((r) => r.questionNumber), [1, 2, 3]);
    assert.ok(JSON.parse(result.raw).sections.flatMap((s) => s.questions).some((q) => q.marks === 15));
    assert.equal(seen.events.filter((e) => e.event === "content.repaired" && e.outcome === "applied").length, 1);
  });

  it("warns once, with specifics, when repair does not bring it in", async () => {
    const { run, seen } = setup({ reviews: [minutes(15, 25, 45)], repairs: [shorter, shorter] });
    const result = await run();
    assert.equal(seen.repairs.length, 2);
    assert.equal(seen.reviews.length, 3);
    const timing = result.warnings.filter((w) => w.code === "RESOURCE_TIMING_WARNING");
    assert.equal(timing.length, 1);
    assert.match(timing[0].message, /about 85 minutes for the requested 60-minute sitting/);
    assert.match(timing[0].message, /Question 3 \(45 min\), Question 2 \(25 min\), Question 1 \(15 min\)/);
    assert.equal(result.reviewStatus, "warnings");
  });

  it("keeps the paper and warns when the repair itself fails", async () => {
    const failure = Object.assign(new Error("model down"), { modelFailure: true });
    const { run, seen } = setup({ reviews: [minutes(15, 25, 45)], repairs: [failure] });
    const result = await run();
    assert.equal(seen.repairs.length, 1);
    assert.equal(seen.reviews.length, 1);
    assert.ok(result.warnings.some((w) => w.code === "RESOURCE_TIMING_WARNING"));
    assert.equal(seen.events.filter((e) => e.event === "content.repaired" && e.outcome === "failed").length, 1);
  });

  it("repairs an issue naming a question and a fix, and reports one it cannot act on", async () => {
    const issue = { questions: [2], problem: "The answer quotes a line not in Text 1.", fix: "Use a line from Text 1." };
    const vague = { questions: [], problem: "The paper leans heavily on inference.", fix: "" };
    const fixed = { parsed: { questions: [{ number: 2, marks: 4, stem: "In Text 1, explain point two again.", type: "short-answer", options: null, parts: null }], markingGuide: [{ questionNumber: 2, partLabel: null, suggestedResponse: "Fixed.", markingCriteria: ["4 marks: a point"], marks: 4 }] } };
    const { run, seen } = setup({ reviews: [{ ...minutes(20, 20, 20), issues: [issue, vague] }, { ...minutes(20, 20, 20), issues: [vague] }], repairs: [fixed] });
    const result = await run();
    assert.equal(seen.repairs.length, 1);
    assert.match(seen.repairs[0].userMessage, /Question 2: The answer quotes a line not in Text 1\. Fix: Use a line from Text 1\./);
    assert.deepEqual(result.warnings.map((w) => w.message), ["The paper leans heavily on inference."]);
  });

  it("names the questions in a content warning", async () => {
    const issue = { questions: [1, 3], problem: "These overlap.", fix: "" };
    const { run } = setup({ reviews: [{ ...minutes(20, 20, 20), issues: [issue] }] });
    assert.deepEqual((await run()).warnings.map((w) => w.message), ["Questions 1, 3: These overlap."]);
  });

  it("rejects a repair that raises marks, invents a question or leaves an answer out", () => {
    const rows = [{ number: 1, marks: 4, stem: "x" }];
    const job = { answerMode: "worked" };
    const check = (parsed) => () => validateRepair({ parsed }, rows, job, "markingGuide", {});
    assert.throws(check({ questions: [] }), { reason: /repair_changed_nothing/ });
    assert.throws(check({ questions: [{ number: 9, marks: 2, stem: "y" }] }), { reason: /repair_unknown_question/ });
    assert.throws(check({ questions: [{ number: 1, marks: 5, stem: "y" }] }), { reason: /repair_marks/ });
    assert.throws(check({ questions: [{ number: 1, marks: 3, stem: "y" }], markingGuide: [] }), { code: "RESOURCE_BATCH_INVALID" });
  });
});

describe("what the reviewer is told (RES-95)", () => {
  it("knows about images, verified texts and the house marking approach", async () => {
    const { run, seen } = setup({ reviews: [minutes(20, 20, 20)] });
    await run();
    const prompt = seen.reviews[0].systemPrompt;
    assert.match(prompt, /A crowd with a JOBS sign/);
    assert.match(prompt, /Never report one as missing/);
    assert.match(prompt, /may differ in punctuation/);
    assert.match(prompt, /deliberately expects a thesis/);
    assert.match(prompt, /never report it in issues/);
    assert.match(prompt, /Count the first reading of each stimulus text once/);
  });

  it("is told not to count reading time the tutor set aside", async () => {
    const parsed = { sections: [{ questions: [{ number: 1, marks: 2, stem: "x" }] }] };
    let prompt;
    await verifyPlannedContent({ job: { resourceType: "practice-paper", resourceLogSink: () => {} }, request: { userMessage: "u" }, plan: {}, parsed, scope: { eligible: [], excluded: [], minutes: 60, separateReadingMinutes: 10 },
      callAi: async (req) => { prompt = req.systemPrompt; return { parsed: { scopePass: true, difficultyPass: true, issues: [], questions: [{ number: 1, coveredSourceIds: [], estimatedMinutes: 60 }] } }; } });
    assert.match(prompt, /10 minutes of separate reading time/);
  });
});

describe("reading load (RES-89)", () => {
  it("scales with year level and sitting time", () => {
    assert.deepEqual(readingBudget({ year: 8, minutes: 60 }), { wordsPerMinute: 150, perTextWords: 450, totalWords: 1080 });
    assert.equal(readingBudget({ year: 5, minutes: 30 }).perTextWords, 180);
    assert.equal(readingBudget({ year: 12, minutes: 120 }).perTextWords, 1000);
    assert.equal(readingBudget({ year: 8 }).totalWords, null);
  });

  it("shares the total across the texts", () => {
    const budget = readingBudget({ year: 8, minutes: 60 });
    assert.equal(textWordLimit(budget, 2), 450);
    assert.equal(textWordLimit(budget, 3), 360);
    assert.equal(textWordLimit(null, 2), null);
  });

  it("separates reading time from the sitting", () => {
    assert.equal(requestedMinutes("10 minutes reading time plus a 60-minute paper"), 60);
    assert.equal(separateReadingMinutes("10 minutes reading time plus a 60-minute paper"), 10);
    assert.equal(requestedMinutes("Reading time: 5 minutes. Writing 40 minutes."), 40);
    assert.equal(separateReadingMinutes("A 60 minute paper"), null);
    // A reading assessment's own length is the sitting, not reading time.
    for (const prompt of ["Create a 60-minute reading comprehension paper for Year 8", "A 60 minute reading and writing paper", "60 minutes reading comprehension", "Year 8 reading 60 minutes"]) {
      assert.equal(requestedMinutes(prompt), 60, prompt);
      assert.equal(separateReadingMinutes(prompt), null, prompt);
    }
    assert.equal(separateReadingMinutes("10 minutes reading, then 50 minutes writing"), 10);
    assert.equal(requestedMinutes("10 minutes reading, then 50 minutes writing"), 50);
    assert.equal(separateReadingMinutes("5 minutes of reading and 40 minutes writing"), 5);
    assert.equal(separateReadingMinutes("a 10-minute perusal then a 40-minute paper"), 10);
    assert.equal(separateReadingMinutes("Reading time of 10 minutes"), 10);
  });

  it("cuts an extract to the limit", () => {
    const para = (n) => `Paragraph ${n} carries the story forward with a good many ordinary words in it, and it ends properly with a full stop here.`;
    const out = excerptOpening(Array.from({ length: 30 }, (_, i) => para(i + 1)).join("\n\n"), 300, "T", { fromChapterStart: false });
    assert.ok(out.split(/\s+/).length < 340);
  });

  it("sends back a text the generator wrote that is too long, but not a sourced copy", () => {
    const long = Array.from({ length: 600 }, () => "word").join(" ");
    const specs = [{ number: 1, marks: 2 }];
    const parsed = (stimulus) => ({ parsed: { stimulus, sections: [{ questions: [{ number: 1, marks: 2, stem: "In Text 1, why?" }] }] } });
    const rules = { english: true, existingTexts: [], maxTextWords: 400, sourcedCount: 0 };
    assert.throws(() => validateQuestions(parsed([{ title: "Ours", body: long }]), specs, "practice-paper", [], rules), { reason: /stimulus_too_long.*at most 400 words/ });
    assert.doesNotThrow(() => validateQuestions(parsed([{ title: "Sourced", body: long }]), specs, "practice-paper", [], { ...rules, sourcedCount: 1 }));
  });
});

describe("topic evidence (RES-95)", () => {
  it("accepts evidence made of several quotes when one is in the request", () => {
    const plan = { topics: [{ name: "Reading", evidence: '"Section A: reading comprehension." "Title: Extract from a book"' }, { name: "Invented", evidence: '"Nothing like this"' }] };
    assert.deepEqual(unmatchedEvidenceTopics(plan, "Section A: reading comprehension. Section B: writing."), ["Invented"]);
  });
});

describe("the re-check after trimming (RES-95)", () => {
  it("does not let a repair undo a cut made for time", async () => {
    const { run, seen } = setup({ reviews: [minutes(15, 25, 45), minutes(15, 25, 22)], repairs: [shorter] });
    await run();
    assert.doesNotMatch(seen.reviews[0].systemPrompt, /deliberately shortened/);
    assert.match(seen.reviews[1].systemPrompt, /deliberately shortened\. Do not report a task as too short/);
    assert.match(seen.repairs[0].userMessage, /never add to the paper's overall workload \(the sitting is 60 minutes\), and never state a time allowance/);
  });
});

describe("the job's subject (found live, Year 11 Advanced)", () => {
  it("builds an English paper whatever the model called the subject", async () => {
    const { runGenerationPipeline } = require("../../src/resources");
    const values = new Map();
    const storage = { bucket: () => ({ file: (key) => ({ download: async () => { if (!values.has(key)) throw Object.assign(new Error("missing"), { code: 404 }); return [Buffer.from(values.get(key))]; }, save: async (data) => values.set(key, data) }) }) };
    const parsed = { title: "Advanced Paper", subject: "English Advanced", year: 11, topics: ["Reading"], focus: null, totalMarks: 2, timeAllowed: "60 minutes",
      sections: [{ title: "Section A", questions: [{ number: 1, marks: 2, stem: "What is a metaphor?", type: "short-answer", options: null, parts: null, diagram: null, diagramRequired: false }] }],
      markingGuide: [{ questionNumber: 1, partLabel: null, suggestedResponse: "A comparison.", markingCriteria: ["2 marks: a definition"], marks: 2 }] };
    const job = { jobId: "j", attemptId: "a", subject: "english", year: 11, resourceType: "practice-paper", answerMode: "worked", createdBy: "t", customPrompt: "paper", resourceLogSink: () => {} };
    const result = await runGenerationPipeline(job, { storage, enablePdTextSourcing: false, callAi: async () => ({ parsed, raw: JSON.stringify(parsed), provider: "openai" }) });
    assert.ok(result.outputPath);
    assert.equal(JSON.parse(result.generatedJson).subject, "english");
  });
});
