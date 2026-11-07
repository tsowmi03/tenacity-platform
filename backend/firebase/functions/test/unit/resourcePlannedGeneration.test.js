"use strict";
const { it } = require("node:test");
const assert = require("node:assert/strict");
const { createDurableCaller, requestedQuestionCount } = require("../../src/resources/durableStages");
const { clarificationMessage, generatePlannedResource, perTopicCount, plannedTimeAllowed, validatePlan, validateQuestions, validateAnswers, reconcilePlanTopics, unmatchedEvidenceTopics, evidenceWarnings } = require("../../src/resources/plannedGeneration");
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
    questions: Array.from({ length: count }, (_, i) => ({ number: i + 1, topic: i < count / 2 ? "Algebra" : "Geometry", section: i < count / 2 ? "A" : "B", difficulty: "increasing", marks: 2, sourceIds: [], estimatedMinutes: 6 })) };
}
function fakeProvider(savedPlan, calls) {
  return async (req) => {
    calls.push(req);
    if (req.systemPrompt.startsWith("Plan an educational")) return { parsed: savedPlan, provider: "openai" };
    if (req.systemPrompt.startsWith("Independently audit")) {
      const parsed = JSON.parse(req.userMessage.split("GENERATED RESOURCE TO CHECK: ")[1]);
      const questions = parsed.topics ? parsed.sections.flatMap((section) => section.questions) : parsed.questions;
      return { parsed: { scopePass: true, difficultyPass: true, issues: [], questions: questions.map((q) => ({ number: q.number, coveredSourceIds: [], estimatedMinutes: 6 })) } };
    }
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
  assert.doesNotThrow(() => validatePlan({ parsed: plan() }, {}, "textbook title only"));
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
  assert.equal(calls.length, 8, "one plan, three content batches, three solution batches and independent review");
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
  assert.equal(calls.length, 4);
  assert.ok(h.values.has(result.outputPath));
  const skipped = h.events.filter((e) => e.event === "stage.skipped").map((e) => e.stageId);
  for (const stage of ["sourcing.passage", "sourcing.stimulus", "diagrams.fill", "diagrams.validate_repair", "answers.verify", "math.repair"]) assert.ok(skipped.includes(stage), `explicit skip for ${stage}`);
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

it("passes safe validation feedback to the next attempt without losing its checkpoint identity", async () => {
  const h = harness();
  const request = { model: "gpt-test", stageId: "plan.v2", userMessage: "original scope", validateStageResult: (result) => {
    if (!result.parsed.valid) throw Object.assign(new Error("private generated text"), { code: "RESOURCE_PLAN_INVALID", reason: "incomplete_source_coverage", resourceControl: true });
  } };
  await assert.rejects(h.caller(async () => ({ parsed: { valid: false } }))(request), { code: "RESOURCE_STAGE_YIELD" });
  const result = await h.caller(async (req) => {
    assert.match(req.userMessage, /incomplete_source_coverage/);
    assert.match(req.userMessage, /original scope/);
    return { parsed: { valid: true } };
  })(request);
  assert.equal(result.parsed.valid, true);
  await h.caller(() => { throw new Error("must reuse the corrected checkpoint"); })(request);
  assert.equal(h.values.size, 1);
  assert.ok(!JSON.stringify(h.events).includes("private generated text"));
});

it("retains a labelled downloadable draft after a review failure across worker continuations", async () => {
  const { runGenerationPipeline } = require("../../src/resources");
  const mammoth = require("mammoth");
  const h = harness({ resourceType: "worksheet", subject: "maths", year: "10", answerMode: "worked", createdBy: "tutor", customPrompt: prompt });
  const calls = [];
  const provider = fakeProvider(plan(), calls);
  let reviews = 0;
  let result;
  for (let turn = 0; turn < 30; turn++) {
    try {
      result = await runGenerationPipeline(h.job(), { db: h.db, storage: h.storage,
        callAi: h.caller(async (req) => {
          if (req.systemPrompt.startsWith("Independently audit")) { reviews++; throw Object.assign(new Error("private provider failure"), { modelFailure: true }); }
          if (req.systemPrompt.startsWith("You are a senior mathematics")) return { parsed: { corrections: [] } };
          return provider(req);
        }) });
      break;
    } catch (err) { assert.equal(err.code, "RESOURCE_STAGE_YIELD", err.stack); }
  }
  assert.ok(result?.outputPath);
  assert.equal(result.reviewStatus, "draft");
  assert.equal(reviews, 1, "failed optional review is not repeated on every continuation");
  assert.ok(result.warnings.some((w) => w.code === "RESOURCE_REVIEW_UNAVAILABLE"));
  const text = await mammoth.extractRawText({ buffer: Buffer.from(h.values.get(result.outputPath)) });
  assert.match(text.value, /DRAFT - tutor review required/);
  assert.match(text.value, /Unique problem 14/);
});

it("returns a real DOCX with review notes for content concerns instead of throwing away the paper", async () => {
  const { runGenerationPipeline } = require("../../src/resources");
  const mammoth = require("mammoth");
  const h = harness({ resourceType: "practice-paper", subject: "maths", year: "10", answerMode: "none", createdBy: "tutor", customPrompt: "90-minute paper. Algebra; Geometry." });
  const calls = [];
  const provider = fakeProvider(plan(), calls);
  let result;
  for (let turn = 0; turn < 20; turn++) {
    try {
      result = await runGenerationPipeline(h.job(), { db: h.db, storage: h.storage, callAi: h.caller(async (req) => {
        const response = await provider(req);
        if (req.systemPrompt.startsWith("Independently audit")) { response.parsed.scopePass = false; response.parsed.questions.forEach((q) => { q.estimatedMinutes = 8; }); }
        return response;
      }) });
      break;
    } catch (err) { assert.equal(err.code, "RESOURCE_STAGE_YIELD", err.stack); }
  }
  assert.ok(result?.outputPath);
  assert.equal(result.reviewStatus, "warnings");
  assert.ok(result.warnings.some((w) => w.code === "RESOURCE_TIMING_WARNING"));
  const text = await mammoth.extractRawText({ buffer: Buffer.from(h.values.get(result.outputPath)) });
  assert.match(text.value, /Tutor review recommended/);
  assert.match(text.value, /Estimated answering time is 112 minutes/);
});

// RES-70. "Short answer questions in response to a poem" names no sitting time.
// The planner left timeAllowed empty, the plan was rejected with a catch-all
// reason, and all three attempts failed the same way.
it("accepts a practice paper plan with no sitting time and derives one", () => {
  const paper = { resourceType: "practice-paper", customPrompt: "Short answer questions on a poem" };
  const untimed = { ...plan(5), timeAllowed: "" };
  assert.doesNotThrow(() => validatePlan({ parsed: untimed }, paper, "Algebra Geometry"));
  assert.equal(plannedTimeAllowed(untimed), "30 minutes");
  assert.equal(plannedTimeAllowed({ ...untimed, timeAllowed: "45 minutes" }), "45 minutes");
  const noEstimates = { ...untimed, questions: untimed.questions.map((q) => ({ ...q, estimatedMinutes: 0 })) };
  assert.throws(() => validatePlan({ parsed: noEstimates }, paper, "Algebra Geometry"), { reason: "time_allowed_missing" });
});

it("names the plan check that failed, so the retry knows what to correct", () => {
  const job = { resourceType: "worksheet", customPrompt: "" };
  const reasonFor = (parsed) => { try { validatePlan({ parsed }, job, "Algebra Geometry"); } catch (err) { return err.reason; } return null; };
  const base = plan(4);
  assert.equal(reasonFor({ ...base, questions: base.questions.map((q, i) => ({ ...q, number: i + 2 })) }), "questions_not_numbered_1_to_n");
  assert.equal(reasonFor({ ...base, questions: base.questions.map((q) => ({ ...q, topic: "Trigonometry" })) }), null);
  assert.equal(reasonFor({ ...base, topics: [...base.topics, { name: "Algebra", evidence: "Algebra" }] }), "topic_names_duplicated");
  assert.equal(reasonFor({ ...base, questions: base.questions.map((q) => ({ ...q, marks: 40 })) }), "question_marks_outside_1_to_30");
  assert.equal(reasonFor({ ...base, questions: base.questions.map((q, i) => ({ ...q, section: i % 2 ? "A" : "B" })) }), "section_questions_not_consecutive");
  assert.equal(reasonFor({ ...base, questions: [] }), "plan_questions_empty");
});

it("tells the tutor what to add when a plan never validates (RES-70)", async () => {
  const h = harness();
  const provider = async () => ({ parsed: { title: "Paper", clarification: "", timeAllowed: "", topics: [], questions: [] } });
  const request = { model: "gpt-test", stageId: "plan.v2", userMessage: "poem questions",
    validateStageResult: (result) => validatePlan(result, { resourceType: "practice-paper", customPrompt: "poem questions" }, "poem questions") };
  let last;
  for (let i = 0; i < 3; i++) last = await h.caller(provider, { fallbackModel: "claude-test" })(request).catch((err) => err);
  assert.equal(last.code, "RESOURCE_RECOVERY_EXHAUSTED");
  assert.match(last.message, /Add the topics, number of questions/);
  assert.equal(last.reason, "plan_topics_empty");
});

// Joshua's Year 10 paper (Nov 2026) failed three plans in a row: the quotes were
// real lines of the school's notification, retyped with plain apostrophes.
it("matches topic evidence across curly quotes and dashes, and only warns when it cannot", () => {
  const notification = "MA5-TRG-P-01 \u2013 applies Pythagoras\u2019 theorem and trigonometry to solve 3-dimensional\nproblems";
  const quoted = { ...plan(4), topics: [{ name: "Trigonometry", evidence: "MA5-TRG-P-01 - applies Pythagoras' theorem and trigonometry to solve 3-dimensional problems" }, { name: "Networks", evidence: "Chapter 12 - Geometry and networks" }] };
  assert.deepEqual(unmatchedEvidenceTopics(quoted, notification), ["Networks"]);
  const [warning, ...rest] = evidenceWarnings(quoted, notification);
  assert.equal(rest.length, 0);
  assert.equal(warning.code, "RESOURCE_PLAN_EVIDENCE_WARNING");
  assert.match(warning.message, /Topic "Networks" couldn't be matched/);
  assert.deepEqual(evidenceWarnings({ ...quoted, topics: [quoted.topics[0]] }, notification), []);
});

it("reassigns a question labelled with an unlisted topic instead of failing the plan", () => {
  const base = { ...plan(4), topics: [{ name: "Chapter 8 - Further trigonometry", evidence: "x" }, { name: "Chapter 11 - Probability", evidence: "x" }] };
  const labels = ["chapter 8 \u2013 further trigonometry", "Probability", "Trigonometry: bearings", "Linear programming"];
  const { plan: fixed, reassigned, added } = reconcilePlanTopics({ ...base, questions: base.questions.map((q, i) => ({ ...q, topic: labels[i] })) });
  assert.deepEqual(fixed.questions.map((q) => q.topic), ["Chapter 8 - Further trigonometry", "Chapter 11 - Probability", "Chapter 8 - Further trigonometry", "Linear programming"]);
  assert.equal(reassigned.length, 3);
  assert.deepEqual(added, ["Linear programming"]);
  assert.deepEqual(fixed.topics.at(-1), { name: "Linear programming", evidence: "" });
  assert.deepEqual(unmatchedEvidenceTopics(fixed, "x"), ["Linear programming"]);
});

it("reassigns to the most specific overlapping topic", () => {
  const base = { ...plan(3), topics: [{ name: "Linear equations", evidence: "x" }, { name: "Non-linear equations", evidence: "x" }] };
  const labels = ["Non-linear equations and graphs", "Linear equations with fractions", "equations"];
  const { plan: fixed } = reconcilePlanTopics({ ...base, questions: base.questions.map((q, i) => ({ ...q, topic: labels[i] })) });
  assert.deepEqual(fixed.questions.map((q) => q.topic), ["Non-linear equations", "Linear equations", "Linear equations"]);
});

it("delivers a paper whose topic quotes cannot be matched, with a review warning", async () => {
  const h = harness({ resourceType: "practice-paper", year: "10", subject: "maths", answerMode: "worked", customPrompt: "Write a paper for a 90-minute sitting." });
  const unquoted = { ...plan(4), topics: [{ name: "Algebra", evidence: "Algebra chapter" }, { name: "Geometry", evidence: "Geometry" }] };
  let result;
  for (let i = 0; i < 30 && !result; i++) {
    h.current.invocationId = String(i);
    const callAi = h.caller(fakeProvider(unquoted, []));
    result = await generatePlannedResource({ job: h.job(), request: { model: "gpt-test", userMessage: "Write a paper for a 90-minute sitting. Algebra; Geometry.", systemPrompt: "" }, callAi })
      .catch((err) => { if (err.code === "RESOURCE_STAGE_YIELD") return null; throw err; });
  }
  assert.ok(result, "the paper was delivered");
  assert.deepEqual(result.warnings.filter((w) => w.code === "RESOURCE_PLAN_EVIDENCE_WARNING").map((w) => w.message), ['Topic "Algebra" couldn\'t be matched to the request or uploaded files. Check it is in scope.']);
});

it("prints one clean heading per section when the plan describes each question (RES-90)", async () => {
  const { sectionTitle } = require("../../src/resources/plannedGeneration");
  assert.equal(sectionTitle("A, Three multiple-choice parts, labelled (a), (c)"), "Section A");
  assert.equal(sectionTitle("A, Short answer questions on Text 2"), "Section A");
  assert.equal(sectionTitle("Section B: Writing"), "Section B: Writing");
  assert.equal(sectionTitle("Reading"), "Reading");

  const h = harness({ resourceType: "practice-paper", year: "8", subject: "maths", answerMode: "worked", customPrompt: "Write a paper for a 90-minute sitting." });
  const described = { ...plan(4) };
  described.questions = described.questions.map((q, i) => ({ ...q, section: ["A, Three multiple-choice parts, labelled (a), (c)", "A, Short answer questions", "B, Extended response", "B, Extended response, 10 marks"][i] }));
  let result;
  for (let i = 0; i < 30 && !result; i++) {
    h.current.invocationId = String(i);
    const callAi = h.caller(fakeProvider(described, []));
    result = await generatePlannedResource({ job: h.job(), request: { model: "gpt-test", userMessage: "Write a paper for a 90-minute sitting. Algebra; Geometry.", systemPrompt: "" }, callAi })
      .catch((err) => { if (err.code === "RESOURCE_STAGE_YIELD") return null; throw err; });
  }
  assert.ok(result, "the paper was delivered");
  assert.deepEqual(result.parsed.sections.map((s) => [s.title, s.questions.map((q) => q.number)]), [["Section A", [1, 2]], ["Section B", [3, 4]]]);
});

it("shows every answer batch and later question batch the paper's full stimulus (RES-91)", async () => {
  const h = harness({ resourceType: "practice-paper", year: "8", subject: "english", answerMode: "worked", customPrompt: "Write a Year 8 English paper for a 60-minute sitting." });
  const englishPlan = { ...plan(12), topics: [{ name: "Reading", evidence: "English" }, { name: "Writing", evidence: "English" }] };
  englishPlan.questions = englishPlan.questions.map((q) => ({ ...q, topic: q.number <= 6 ? "Reading" : "Writing", section: q.number <= 6 ? "Section A: Reading" : "Section B: Writing" }));
  const stimulus = [
    { title: "The Adventures of Tom Sawyer", author: "Mark Twain", source: "Project Gutenberg", body: "Tom appeared on the sidewalk with a bucket of whitewash." },
    { title: "Before the red light", author: null, source: null, body: "Leon kept going after the mistake, and Asha slid the page back to him." },
    { title: "Exam rooms", author: null, source: null, body: "Students in the quiet room are supervised for the whole trial." },
  ];
  const solutionMessages = [];
  const questionMessages = [];
  let blindAnswerSent = false;
  const provider = async (req) => {
    if (req.systemPrompt.startsWith("Plan an educational")) return { parsed: englishPlan, provider: "openai" };
    if (req.systemPrompt.startsWith("Independently audit")) {
      const parsed = JSON.parse(req.userMessage.split("GENERATED RESOURCE TO CHECK: ")[1]);
      return { parsed: { scopePass: true, difficultyPass: true, issues: [], questions: parsed.sections.flatMap((s) => s.questions).map((q) => ({ number: q.number, coveredSourceIds: [], estimatedMinutes: 4 })) } };
    }
    const specs = req.userMessage.match(/SAVED PLAN .*?: (\[.*\])\nGenerate/);
    if (specs) {
      questionMessages.push(req.userMessage);
      const questions = JSON.parse(specs[1]).map((q) => ({ number: q.number, marks: q.marks, stem: `Explain how Text ${(q.number % 3) + 1} shows character, question ${q.number}`, type: "short-answer", options: null, parts: null }));
      const first = !req.userMessage.includes("FINAL STIMULUS");
      return { parsed: { title: "Practice", subject: "english", year: 8, totalMarks: 2 * questions.length, timeAllowed: "60 minutes", stimulus: first ? stimulus : null, sections: [{ title: "batch", questions }], markingGuide: [] }, provider: "openai" };
    }
    solutionMessages.push(req.userMessage);
    const questions = req.userMessage.split("\n").map((line) => { try { return JSON.parse(line); } catch { return null; } })
      .find((rows) => Array.isArray(rows) && rows[0]?.stem);
    const blind = !blindAnswerSent && questions.some((q) => q.number === 3);
    if (blind) blindAnswerSent = true;
    return { parsed: { markingGuide: questions.map((q) => ({ questionNumber: q.number, partLabel: null, criteria: "Explains with evidence", marks: q.marks,
      response: blind && q.number === 3 ? "Cannot determine from the supplied material: Text 2 is missing." : "Leon keeps going after his mistake (Text 2)." })) }, provider: "openai" };
  };
  let result;
  for (let i = 0; i < 40 && !result; i++) {
    h.current.invocationId = String(i);
    result = await generatePlannedResource({ job: h.job(), hasStimulus: true, request: { model: "gpt-test", userMessage: "Write a Year 8 English paper for a 60-minute sitting.\n\nText 1:\nTom Sawyer", systemPrompt: "" }, callAi: h.caller(provider) })
      .catch((err) => { if (err.code === "RESOURCE_STAGE_YIELD") return null; throw err; });
  }
  assert.ok(result, "the paper was delivered");
  assert.ok(solutionMessages.length >= 3);
  for (const message of solutionMessages) {
    assert.match(message, /FINAL STIMULUS/);
    assert.match(message, /Leon kept going/);
    assert.match(message, /quiet room/);
  }
  const later = questionMessages.filter((m) => !/"number":1,/.test(m.match(/SAVED PLAN .*?: (\[.*\])/)[1]));
  assert.ok(later.length >= 2);
  for (const message of later) assert.match(message, /FINAL STIMULUS[\s\S]*Set "stimulus" to null/);
  assert.ok(solutionMessages.some((m) => /answer_claims_text_missing: Q3/.test(m)), "the retry told the model what was wrong");
  assert.deepEqual(result.parsed.stimulus.map((s) => s.title), stimulus.map((s) => s.title));
  assert.equal(result.parsed.markingGuide.length, 12);
  assert.ok(result.parsed.markingGuide.every((row) => !/missing/i.test(row.response)));
});

it("accepts answers about details a text leaves unstated (RES-91)", () => {
  const { answerClaimsMissingContext } = require("../../src/resources/plannedGeneration");
  assert.equal(answerClaimsMissingContext({ response: "Cannot determine from the supplied material: Text 2 is missing." }), true);
  assert.equal(answerClaimsMissingContext({ response: "Text 3 is not provided." }), true);
  assert.equal(answerClaimsMissingContext({ response: "The narrator's exact age cannot be determined from the provided text." }), false);
  assert.equal(answerClaimsMissingContext({ response: "Leon's surname is not provided in the material, so accept any reasonable inference." }), false);
  assert.equal(answerClaimsMissingContext({ response: "Image 1 is missing a caption, which creates mystery." }), false);
});
it("shows the planner's clarification reason to the tutor", () => {
  const reason = "The prompt describes an English paper, but the subject is set to Maths. Change the subject to English";
  assert.throws(() => validatePlan({ parsed: { ...plan(), clarification: reason } }, {}, ""),
    { code: "RESOURCE_SCOPE_CLARIFICATION", message: `${reason}. Update the request, then submit again.` });
  assert.equal(clarificationMessage("  unclear\n "), "Clarify the requested topics or attach the relevant contents pages, then submit again.");
  assert.match(clarificationMessage("x".repeat(500)), /^x{300}… Update the request/);
});

it("passes the selected subject to the planner and asks it to flag mismatches", async () => {
  let seen;
  const callAi = async (req) => { seen = req; return { parsed: { title: "", timeAllowed: "", clarification: "Subject mismatch: the prompt is for English but Maths is selected.", topics: [], questions: [] } }; };
  await assert.rejects(generatePlannedResource({ job: { jobId: "j", subject: "maths", year: 9, resourceType: "practice-paper", customPrompt: "English paper" }, request: { userMessage: "English paper" }, callAi }),
    { code: "RESOURCE_SCOPE_CLARIFICATION", message: /Maths is selected\. Update the request/ });
  assert.match(seen.userMessage, /SELECTED SETTINGS: subject maths, Year 9, practice-paper/);
  assert.match(seen.systemPrompt, /different subject than the selected subject/);
});

// RES-96. The Year 7 paper of 7 Nov 2026: Q6 sat in a later batch than the
// text it used, and Q10's image was only a caption to the answer stage, so
// both model answers said the material "has not been supplied".
it("gives a later batch's answers the stimulus and the image description, and retries a question-range lead-in (RES-96)", async () => {
  const h = harness({ resourceType: "practice-paper", year: "7", subject: "english", answerMode: "worked", customPrompt: "Year 7 paper, 60 minutes, prose extract, speech and an image." });
  const englishPlan = { ...plan(10), topics: [{ name: "Reading", evidence: "English" }, { name: "Writing", evidence: "English" }] };
  englishPlan.questions = englishPlan.questions.map((q) => ({ ...q, topic: q.number <= 9 ? "Reading" : "Writing", section: q.number <= 6 ? "Section A: Reading" : q.number <= 9 ? "Section B: Persuasion" : "Section C: Writing", focus: `focus ${q.number}` }));
  const stimulus = [
    { title: "The bridge", author: null, source: null, body: "Amira stopped beside the spare chair while Toby tested the cardboard bridge." },
    { title: "A quiet room", author: null, source: null, body: "Our school should trial a supervised quiet room at lunchtime." },
  ];
  const solutionMessages = [];
  const questionMessages = [];
  let rangedSent = false;
  const provider = async (req) => {
    if (req.systemPrompt.startsWith("Plan an educational")) return { parsed: englishPlan, provider: "openai" };
    if (req.systemPrompt.startsWith("Independently audit")) {
      const parsed = JSON.parse(req.userMessage.split("GENERATED RESOURCE TO CHECK: ")[1]);
      return { parsed: { scopePass: true, difficultyPass: true, issues: [], questions: parsed.sections.flatMap((s) => s.questions).map((q) => ({ number: q.number, coveredSourceIds: [], estimatedMinutes: 5 })) } };
    }
    const specs = req.userMessage.match(/SAVED PLAN .*?: (\[.*\])\nGenerate/);
    if (specs) {
      questionMessages.push(req.userMessage);
      const ranged = !rangedSent && /"number":1,/.test(specs[1]);
      if (ranged) rangedSent = true;
      const questions = JSON.parse(specs[1]).map((q) => ({ number: q.number, marks: q.marks, type: "short-answer", options: null, parts: null,
        stem: ranged && q.number === 1 ? "Read Text 1 and answer Questions 1 to 5. What is Toby testing?" : q.number === 10 ? "Write a persuasive piece about the issue Image 1 raises." : `In Text ${q.number <= 6 ? 1 : 2}, explain point ${q.number}.` }));
      const first = !req.userMessage.includes("FINAL STIMULUS — the stimulus booklet");
      return { parsed: { title: "Practice", subject: "english", year: 7, totalMarks: 2 * questions.length, timeAllowed: "60 minutes", stimulus: first ? stimulus : null, sections: [{ title: "batch", questions }], markingGuide: [] }, provider: "openai" };
    }
    solutionMessages.push(req.userMessage);
    const questions = req.userMessage.split("\n").map((line) => { try { return JSON.parse(line); } catch { return null; } })
      .find((rows) => Array.isArray(rows) && rows[0]?.stem);
    return { parsed: { markingGuide: questions.map((q) => ({ questionNumber: q.number, partLabel: null, criteria: "1 mark: a relevant technique", marks: q.marks,
      response: req.userMessage.includes("A 1942 poster urging people to save water") ? "The poster's water-saving appeal supports a thesis about conservation." : "Image 1 has not been supplied." })) }, provider: "openai" };
  };
  let result;
  for (let i = 0; i < 40 && !result; i++) {
    h.current.invocationId = String(i);
    result = await generatePlannedResource({ job: h.job(), hasStimulus: true,
      stimulusImages: [{ purpose: "creative-prompt", task: "Write from it.", title: "Save water poster", description: "A 1942 poster urging people to save water" }],
      request: { model: "gpt-test", userMessage: "Write a Year 7 English paper.", systemPrompt: "" }, callAi: h.caller(provider) })
      .catch((err) => { if (err.code === "RESOURCE_STAGE_YIELD") return null; throw err; });
  }
  assert.ok(result, "the paper was delivered");
  assert.ok(questionMessages.some((m) => /question_range_lead_in: Q1/.test(m)), "the range lead-in was sent back with its reason");
  const stems = result.parsed.sections.flatMap((s) => s.questions).map((q) => q.stem);
  assert.ok(stems.every((stem) => !/Questions \d+ to \d+/.test(stem)));
  // Every answer batch, including the one for Q6-Q10, saw both texts and the image.
  assert.ok(solutionMessages.length >= 2);
  for (const message of solutionMessages) {
    assert.match(message, /Amira stopped beside the spare chair/);
    assert.match(message, /supervised quiet room/);
    assert.match(message, /A 1942 poster urging people to save water/);
  }
  assert.ok(result.parsed.markingGuide.every((row) => !/not been supplied/.test(row.response)));
  assert.deepEqual(result.parsed.stimulus.map((s) => s.title), ["The bridge", "A quiet room"]);
  // Later batches are told not to repeat earlier questions' evidence.
  assert.ok(questionMessages.some((m) => /Do not repeat their wording, their skill or the evidence/.test(m)));
});

it("catches the RES-96 wordings of a missing text and still passes answers about unstated details", () => {
  const { answerClaimsMissingContext } = require("../../src/resources/plannedGeneration");
  const claims = (response) => answerClaimsMissingContext({ response });
  assert.equal(claims("The prose extract about Amira and Toby has not been supplied. An accurate model answer cannot be written without it."), true);
  assert.equal(claims("Image 1 has not been supplied. A stimulus-based TETAL model plan cannot be completed."), true);
  assert.equal(claims("The speech was not provided."), true);
  assert.equal(claims("The source of the conflict is not given in the passage."), false);
  assert.equal(claims("The speech is not provided with statistics, so it relies on emotion."), false);
  assert.equal(claims("The text is not given a title, so the reader infers it."), false);
});

it("asks the planner for a distinct focus per question (RES-96)", async () => {
  const { PLAN_SCHEMA } = require("../../src/resources/plannedGeneration");
  assert.ok(PLAN_SCHEMA.properties.questions.items.required.includes("focus"));
  let seen;
  const callAi = async (req) => { seen = req; return { parsed: { title: "", timeAllowed: "", clarification: "Unclear request, name the topics.", topics: [], questions: [] } }; };
  await assert.rejects(generatePlannedResource({ job: { jobId: "j", subject: "english", year: 7, resourceType: "practice-paper", customPrompt: "paper" }, request: { userMessage: "paper" }, callAi }));
  assert.match(seen.systemPrompt, /No two questions may share a focus/);
});

// RES-96 / RES-100 / RES-98 / RES-88 end to end through the real pipeline: no
// planned text could be verified, so the generator writes the texts itself.
// They go in the stimulus booklet (not a question stem), print as "Tenacity
// Original" whatever author the model typed, coaching is cut from the
// questions, and a text no question uses is dropped.
it("writes unverifiable texts into the booklet as Tenacity Originals and tidies the paper (RES-96/98/100/88)", async () => {
  const { runGenerationPipeline } = require("../../src/resources");
  const mammoth = require("mammoth");
  const h = harness({ resourceType: "practice-paper", subject: "english", year: 7, answerMode: "worked", createdBy: "tutor", customPrompt: "Year 7 practice paper, 60 minutes, on one unseen prose extract." });
  const englishPlan = { ...plan(4), timeAllowed: "60 minutes", topics: [{ name: "Reading", evidence: "unseen prose extract" }, { name: "Inference", evidence: "unseen prose extract" }] };
  englishPlan.questions = englishPlan.questions.map((q) => ({ ...q, topic: q.number <= 2 ? "Reading" : "Inference", section: "Section A: Reading", focus: `focus ${q.number}`, estimatedMinutes: 12 }));
  const systemPrompts = [];
  const provider = async (req) => {
    if (req.systemPrompt.startsWith("Plan an educational")) return { parsed: englishPlan, provider: "openai" };
    if (req.systemPrompt.startsWith("Independently audit")) {
      const parsed = JSON.parse(req.userMessage.split("GENERATED RESOURCE TO CHECK: ")[1]);
      return { parsed: { scopePass: true, difficultyPass: true, issues: [], questions: parsed.sections.flatMap((s) => s.questions).map((q) => ({ number: q.number, coveredSourceIds: [], estimatedMinutes: 12 })) } };
    }
    const specs = req.userMessage.match(/SAVED PLAN .*?: (\[.*\])\nGenerate/);
    if (specs) {
      systemPrompts.push(req.systemPrompt);
      const questions = JSON.parse(specs[1]).map((q) => ({ number: q.number, marks: q.marks, type: "short-answer", options: null, parts: null, diagram: null, diagramRequired: false,
        stem: `How does Text 1 show Amira's feelings in moment ${q.number}? Begin with a thesis that answers the question. Support it with one ETA: Evidence, Technique, Analysis.` }));
      return { parsed: { title: "Year 7 English", subject: "english", year: 7, topics: ["Reading"], focus: null, totalMarks: 8, timeAllowed: "60 minutes",
        stimulus: [
          { label: "Text 1", textType: "prose", title: "The bridge", author: "Robert Frost", source: "Collected Poems", body: "Amira stopped beside the spare chair.\n\nToby lowered a coin onto the cardboard bridge." },
          { label: "Text 2", textType: "prose", title: "Unused notes", author: null, source: null, body: "Nothing asks about this text." },
        ],
        sections: [{ title: "Section A: Reading", questions }], markingGuide: [] }, provider: "openai" };
    }
    const questions = req.userMessage.split("\n").map((line) => { try { return JSON.parse(line); } catch { return null; } })
      .find((rows) => Array.isArray(rows) && rows[0]?.stem);
    return { parsed: { markingGuide: questions.map((q) => ({ questionNumber: q.number, partLabel: null, suggestedResponse: "Amira hesitates; the image of the spare chair shows she feels like an outsider.", markingCriteria: ["1 mark: a thesis", "1 mark: an ETA"], marks: q.marks })) }, provider: "openai" };
  };
  const selection = { title: "A Missing Story", author: "Nobody", type: "short-story" };
  let result;
  for (let i = 0; i < 40 && !result; i++) {
    h.current.invocationId = String(i);
    try {
      result = await runGenerationPipeline(h.job(), { db: h.db, storage: h.storage, callAi: h.caller(provider), enablePdTextSourcing: true,
        anthropicApiKey: "test", openaiApiKey: "test",
        planStimulus: async () => ({ needed: true, texts: [selection], visuals: [], planner: null }),
        sourceText: async () => ({ ok: false, selection }),
        selectAlternative: async () => ({ ...selection, title: "Another Missing Story" }) });
    } catch (err) { assert.equal(err.code, "RESOURCE_STAGE_YIELD", err.stack); }
  }
  assert.ok(result?.outputPath, "the paper was saved");
  assert.ok(systemPrompts.length && systemPrompts.every((p) => p.includes('"stimulus": null | [')), "the generator was offered the stimulus booklet");
  const saved = JSON.parse(result.generatedJson);
  assert.equal(saved.stimulus.length, 1, "the unused text was removed");
  assert.equal(saved.stimulus[0].title, "The bridge");
  assert.equal(saved.stimulus[0].author, null, "a model-typed author is not kept");
  assert.equal(saved.stimulus[0].source, null);
  for (const q of saved.sections.flatMap((s) => s.questions)) {
    assert.match(q.stem, /^How does Text 1 show Amira's feelings in moment \d\?$/);
  }
  assert.ok(saved.markingGuide.every((row) => /thesis|ETA/.test(row.markingCriteria.join(" "))), "structure stays in the marking criteria");
  const text = (await mammoth.extractRawText({ buffer: h.values.get(result.outputPath) })).value;
  assert.match(text, /Text 1: The bridge/);
  assert.match(text, /Tenacity Original/);
  assert.doesNotMatch(text, /Robert Frost|Unused notes/);
  assert.ok(result.warnings.some((w) => /labelled Tenacity Original/.test(w.message)));
});

// RES-96, found in the 8 Nov live replay: the first batch wrote only the text
// its own questions used, so the speech Q6-Q8 analysed was never written.
it("writes the booklet for the whole paper and lets a later batch add a text it needs (RES-96)", async () => {
  const h = harness({ resourceType: "practice-paper", year: "8", subject: "english", answerMode: "worked", customPrompt: "Year 8 paper, prose extract then a speech." });
  const englishPlan = { ...plan(8), topics: [{ name: "Reading", evidence: "English" }, { name: "Persuasion", evidence: "English" }] };
  englishPlan.questions = englishPlan.questions.map((q) => ({ ...q, topic: q.number <= 5 ? "Reading" : "Persuasion", section: q.number <= 5 ? "Section A: Reading" : "Section B: Persuasion", focus: q.number <= 5 ? `extract detail ${q.number}` : `speech technique ${q.number}` }));
  const questionMessages = [];
  const solutionMessages = [];
  let danglingSent = false;
  const provider = async (req) => {
    if (req.systemPrompt.startsWith("Plan an educational")) return { parsed: englishPlan, provider: "openai" };
    if (req.systemPrompt.startsWith("Independently audit")) {
      const parsed = JSON.parse(req.userMessage.split("GENERATED RESOURCE TO CHECK: ")[1]);
      return { parsed: { scopePass: true, difficultyPass: true, issues: [], questions: parsed.sections.flatMap((s) => s.questions).map((q) => ({ number: q.number, coveredSourceIds: [], estimatedMinutes: 6 })) } };
    }
    const specs = req.userMessage.match(/SAVED PLAN .*?: (\[.*\])\nGenerate/);
    if (specs) {
      questionMessages.push(req.userMessage);
      const rows = JSON.parse(specs[1]);
      const later = rows[0].number > 1;
      const questions = rows.map((q) => ({ number: q.number, marks: q.marks, type: "short-answer", options: null, parts: null,
        stem: q.number <= 5 ? `In Text 1, explain detail ${q.number}.` : `In Text 2, explain technique ${q.number}.` }));
      // The first answer for the later batch names Text 2 without writing it;
      // the retry adds it.
      let stimulus = null;
      if (!later) stimulus = [{ title: "The fence", author: null, source: null, body: "Tom surveyed the fence." }];
      else if (danglingSent) stimulus = [{ title: "A quiet room", author: null, source: null, body: "Fellow students, we need a quiet room." }];
      else danglingSent = true;
      return { parsed: { title: "Practice", subject: "english", year: 8, totalMarks: 16, timeAllowed: "60 minutes", stimulus, sections: [{ title: "batch", questions }], markingGuide: [] }, provider: "openai" };
    }
    solutionMessages.push(req.userMessage);
    const questions = req.userMessage.split("\n").map((line) => { try { return JSON.parse(line); } catch { return null; } })
      .find((rows) => Array.isArray(rows) && rows[0]?.stem);
    return { parsed: { markingGuide: questions.map((q) => ({ questionNumber: q.number, partLabel: null, criteria: "1 mark: a technique", marks: q.marks, response: "An answer from the text." })) }, provider: "openai" };
  };
  let result;
  for (let i = 0; i < 40 && !result; i++) {
    h.current.invocationId = String(i);
    result = await generatePlannedResource({ job: h.job(), hasStimulus: true, request: { model: "gpt-test", userMessage: "Write a Year 8 English paper.", systemPrompt: "" }, callAi: h.caller(provider) })
      .catch((err) => { if (err.code === "RESOURCE_STAGE_YIELD") return null; throw err; });
  }
  assert.ok(result, "the paper was delivered");
  assert.match(questionMessages[0], /WHOLE PAPER \(for the stimulus booklet only\)[\s\S]*speech technique 6/);
  assert.ok(questionMessages.some((m) => /question_text_missing: Q6/.test(m)), "the dangling Text 2 was sent back with its reason");
  assert.deepEqual(result.parsed.stimulus.map((s) => s.title), ["The fence", "A quiet room"]);
  const later = solutionMessages.filter((m) => /explain technique/.test(m));
  assert.ok(later.length && later.every((m) => /we need a quiet room/.test(m)), "answers for the speech questions saw the speech");
});

it("rejects an answer that says the text is needed instead of answering (RES-96)", () => {
  const { answerClaimsMissingContext } = require("../../src/resources/plannedGeneration");
  assert.equal(answerClaimsMissingContext({ response: "The speech's exact opening is needed to identify the addressee and explain the effect accurately." }), true);
  assert.equal(answerClaimsMissingContext({ response: "Evidence from the text is needed to support the inference." }), false);
  assert.equal(answerClaimsMissingContext({ response: "Close reading of the poem is needed for full marks." }), false);
});
