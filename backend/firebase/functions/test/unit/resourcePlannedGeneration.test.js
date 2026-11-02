"use strict";
const { it } = require("node:test");
const assert = require("node:assert/strict");
const { createDurableCaller, requestedQuestionCount } = require("../../src/resources/durableStages");
const { generatePlannedResource, perTopicCount, validatePlan, validateQuestions, validateAnswers } = require("../../src/resources/plannedGeneration");
const { resourceEvent, resourceStage } = require("../../src/resources/resourceLog");

function harness(extra = {}) {
  const values = new Map();
  const events = [];
  const current = { jobId: "job", runId: "run", status: "processing", attemptId: "a", invocationId: "i", generationVersion: 1, ...extra };
  const job = () => ({ ...current, ref: {}, resourceLogSink: (_m, data) => events.push(data) });
  const db = { collection: () => ({ doc: () => ({}) }), runTransaction: async (fn) => fn({ get: async () => ({ exists: true, data: () => current }), update: (_ref, patch) => Object.assign(current, patch) }) };
  const storage = { bucket: () => ({ file: (key) => ({ download: async () => {
    if (!values.has(key)) throw Object.assign(new Error("missing"), { code: 404 });
    return [Buffer.from(values.get(key))];
  }, save: async (data) => values.set(key, data) }) }) };
  return { current, values, events, job, db, storage,
    caller(callAi, options = {}) { return createDurableCaller({ job: job(), db, storage, callAi, ...options }); } };
}
const prompt = "Exclude all of chapter 2 and everything after 10H. Create a worksheet of 7 word problems per topic of varying difficulties for the remaining topics. Supplied contents: Algebra; Geometry.";
function plan(count = 14) {
  return { title: "Practice", clarification: "", timeAllowed: "90 minutes",
    topics: [{ name: "Algebra", evidence: "Algebra" }, { name: "Geometry", evidence: "Geometry" }],
    questions: Array.from({ length: count }, (_, i) => ({ number: i + 1, topic: i < count / 2 ? "Algebra" : "Geometry", section: i < count / 2 ? "A" : "B", difficulty: "increasing", marks: 2 })) };
}
function fakeProvider(savedPlan, calls) {
  return async (req) => {
    calls.push(req);
    if (req.systemPrompt.startsWith("Plan an educational")) return { parsed: savedPlan, provider: "openai" };
    const specs = req.userMessage.match(/SAVED PLAN .*?: (\[.*\])\nGenerate/);
    if (specs) {
      const questions = JSON.parse(specs[1]).map((q) => ({ number: q.number, marks: q.marks, stem: `Unique problem ${q.number}`, type: "short-answer", diagram: null, diagramType: "none", diagramRequired: false, parts: null }));
      return { parsed: { title: "Practice", subject: "maths", year: 10, topic: "Algebra", totalMarks: 2 * questions.length, timeAllowed: "90 minutes", questions, sections: [{ title: "batch", questions }], answers: [] }, provider: "openai" };
    }
    const questions = JSON.parse(req.userMessage.split("\n").at(-1));
    return { parsed: { answers: questions.map((q) => ({ questionNumber: q.number, partLabel: null, answer: "2", workingOut: "1 + 1 = 2", marks: q.marks })) }, provider: "openai" };
  };
}

it("resolves per-topic quantities without treating them as a total", () => {
  assert.equal(requestedQuestionCount(prompt), null);
  assert.equal(perTopicCount(prompt), 7);
  assert.equal(requestedQuestionCount("20 quadratic questions"), 20);
  assert.throws(() => validatePlan({ parsed: plan(7) }, { customPrompt: prompt }, prompt), { code: "RESOURCE_PLAN_INVALID" });
  assert.throws(() => validatePlan({ parsed: { ...plan(), clarification: "Need contents" } }, {}, ""), { code: "RESOURCE_SCOPE_CLARIFICATION" });
  assert.throws(() => validatePlan({ parsed: plan() }, {}, "textbook title only"), { code: "RESOURCE_PLAN_INVALID" });
});

for (const type of ["worksheet", "practice-paper"]) it(`plans and resumes a ${type} without repeating completed calls`, async () => {
  const h = harness({ resourceType: type, year: "10", subject: "maths", answerMode: "worked", customPrompt: type === "worksheet" ? prompt : "Write a paper for a 90-minute sitting. Algebra; Geometry." });
  const calls = [];
  let result;
  for (let i = 0; i < 30; i++) {
    h.current.invocationId = String(i);
    try {
      result = await generatePlannedResource({ job: h.job(), callAi: h.caller(fakeProvider(plan(), calls)), request: {
        model: "gpt-test", systemPrompt: "normal", maxTokens: 96000, userMessage: prompt,
      } });
      break;
    } catch (err) { assert.equal(err.code, "RESOURCE_STAGE_YIELD", err.stack); }
  }
  assert.ok(result);
  const { buildResourceDocx } = require("../../src/resources/builder");
  const buffer = await buildResourceDocx(type, result.parsed, { subject: "maths", year: "10", answerMode: "worked" });
  assert.equal(buffer.subarray(0, 2).toString(), "PK", "assembled resource builds a DOCX");
  assert.equal(calls.length, 7, "one plan, three content batches, three solution batches");
  assert.equal(result.parsed.totalMarks, 28);
  assert.equal(result.parsed.answers.length, 14);
  if (type === "practice-paper") {
    assert.equal(result.parsed.timeAllowed, "90 minutes");
    assert.deepEqual(result.parsed.sections.map((s) => s.questions.length), [7, 7]);
  }
  assert.ok(h.events.some((e) => e.event === "checkpoint.reused"));
  assert.equal(h.events.filter((e) => e.event === "provider.started").length, calls.length);
});

it("persists a timed-out batch split, preventing another oversized call on replay", async () => {
  const h = harness();
  const request = { model: "gpt-test", stageId: "questions.1", splitAllowed: true, userMessage: "large" };
  await assert.rejects(h.caller(() => new Promise(() => {}), { timeoutMs: 5 })(request), { code: "RESOURCE_STAGE_YIELD" });
  let calls = 0;
  await assert.rejects(h.caller(async () => { calls++; })(request), { code: "RESOURCE_STAGE_SPLIT" });
  assert.equal(calls, 0);
  assert.equal(h.current.stageRecoveryCount, 1);
});

it("bounds retries and uses the backup only for the failed stage", async () => {
  const h = harness();
  const models = [];
  const provider = async (req) => { models.push(req.model); throw Object.assign(new Error("private provider text"), { modelFailure: true }); };
  const request = { model: "gpt-test", stageId: "single", userMessage: "private prompt" };
  for (let i = 0; i < 3; i++) await assert.rejects(h.caller(provider, { fallbackModel: "claude-test" })(request), { code: i === 2 ? "RESOURCE_RECOVERY_EXHAUSTED" : "RESOURCE_STAGE_YIELD" });
  assert.deepEqual(models, ["gpt-test", "gpt-test", "claude-test"]);
  await assert.rejects(h.caller(provider, { fallbackModel: "claude-test" })(request), { code: "RESOURCE_RECOVERY_EXHAUSTED" });
  assert.equal(models.length, 3);
  assert.ok(!JSON.stringify(h.events).includes("private"));
});

it("keeps a planned checkpoint across a provider change and does not cache invalid output", async () => {
  const h = harness();
  const req = { model: "gpt-test", stageId: "q1", userMessage: "one" };
  await h.caller(async () => ({ parsed: { ok: true } }))(req);
  const replay = await h.caller(() => { throw new Error("should not call"); })({ ...req, model: "claude-test" });
  assert.equal(replay.parsed.ok, true);
  await assert.rejects(h.caller(async () => ({ parsed: {} }))({ ...req, stageId: "q2", validateStageResult: () => { throw Object.assign(new Error("invalid"), { code: "RESOURCE_BATCH_INVALID", resourceControl: true }); } }), { code: "RESOURCE_STAGE_YIELD" });
  assert.equal(h.values.size, 1);
});

it("logs correlated stage failures with redaction even when callers handle the exception", async () => {
  const h = harness();
  await assert.rejects(resourceStage(h.job(), "build", async () => {
    resourceEvent(h.job(), "provider.completed", { responseId: "provider-1", inputTokens: 12, customPrompt: "private" });
    throw Object.assign(new Error("private content"), { code: "BUILD_FAILED" });
  }));
  const [start, provider, failure] = h.events;
  assert.equal(failure.event, "stage.failed");
  assert.equal(start.stageExecutionId, failure.stageExecutionId);
  assert.equal(provider.jobId, "job");
  assert.equal(provider.inputTokens, 12);
  assert.equal(failure.errorCode, "BUILD_FAILED");
  assert.ok(!JSON.stringify(h.events).includes("private"));
});

it("routes versioned jobs through the real generation pipeline and saves the assembled document", async () => {
  const { runGenerationPipeline } = require("../../src/resources");
  const h = harness({ resourceType: "worksheet", subject: "maths", year: "10", answerMode: "none", createdBy: "tutor", customPrompt: prompt });
  const calls = [];
  let result;
  for (let i = 0; i < 10; i++) {
    try {
      result = await runGenerationPipeline(h.job(), { db: h.db, storage: h.storage,
        callAi: h.caller(fakeProvider(plan(), calls)), enablePdTextSourcing: false });
      break;
    } catch (err) { assert.equal(err.code, "RESOURCE_STAGE_YIELD", err.stack); }
  }
  assert.ok(result?.outputPath);
  assert.equal(JSON.parse(result.generatedJson).questions.length, 14);
  assert.equal(calls.length, 3);
  assert.ok(h.values.has(result.outputPath));
});

it("rejects incorrect solution links, duplicated questions and oversized resolved plans", () => {
  assert.throws(() => validateAnswers({ parsed: { answers: [{ questionNumber: 2 }] } }, [{ number: 1 }], "answers"), { code: "RESOURCE_BATCH_INVALID" });
  assert.throws(() => validateAnswers({ parsed: { answers: {} } }, [{ number: 1 }], "answers"), { code: "RESOURCE_BATCH_INVALID" });
  assert.throws(() => validateQuestions({ parsed: { questions: [{ number: 1, marks: 2, stem: "Repeated" }] } }, [{ number: 1, marks: 2 }], "worksheet", ["Repeated"]), { code: "RESOURCE_BATCH_INVALID" });
  assert.throws(() => validatePlan({ parsed: plan(202) }, {}, prompt), { code: "RESOURCE_SIZE_LIMIT" });
});

it("honours the persisted job-wide recovery ceiling before another provider call", async () => {
  const h = harness({ stageRecoveryCount: 13 });
  let called = false;
  await assert.rejects(h.caller(async () => { called = true; })({ model: "gpt-test", userMessage: "new" }), { code: "RESOURCE_RECOVERY_EXHAUSTED" });
  assert.equal(called, false);
});
