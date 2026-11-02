"use strict";
const { it } = require("node:test");
const assert = require("node:assert/strict");
const { sourceScope, requestedMinutes, validatePlannedCoverage, verifyPlannedContent } = require("../../src/resources/contentVerification");
const prompt = "Write a paper for a 90-minute sitting. Cover all topics except Chapter 2; exclude everything after section 10H.";
const contents = "1A Algebra 4\n1B Lines 10\n2A Geometry 20\n10A Functions 30\n10H Polynomials 40\n10I Circles 50\n11A Networks 60";
const job = { jobId: "test", resourceType: "practice-paper", customPrompt: prompt, resourceLogSink: () => {} };
const scope = sourceScope(job, contents);
const questions = [
  { number: 1, sourceIds: ["1A", "1B"], marks: 4, estimatedMinutes: 40 },
  { number: 2, sourceIds: ["10A", "10H"], marks: 4, estimatedMinutes: 40 },
];
const plan = { timeAllowed: "90 minutes", questions };
const review = { scopePass: true, difficultyPass: true, issues: [], questions: [
  { number: 1, coveredSourceIds: ["1A", "1B"], estimatedMinutes: 40 },
  { number: 2, coveredSourceIds: ["10A", "10H"], estimatedMinutes: 40 },
] };

it("resolves chapter exclusions and an inclusive section boundary from source contents", () => {
  assert.deepEqual(scope.eligible.map((t) => t.id), ["1A", "1B", "10A", "10H"]);
  assert.deepEqual(scope.excluded.map((t) => t.id), ["2A", "10I", "11A"]);
  assert.equal(scope.minutes, 90);
  assert.equal(requestedMinutes("a 1.5-hour sitting"), 90);
  assert.throws(() => sourceScope({ customPrompt: "All topics after section 20Z are excluded" }, contents), { code: "RESOURCE_SCOPE_CLARIFICATION" });
});

it("rejects missing coverage, excluded topics, dominant chapters and incorrect sitting times", () => {
  validatePlannedCoverage(plan, scope);
  for (const changed of [
    { ...plan, questions: [questions[0]] },
    { ...plan, questions: [...questions, { ...questions[0], sourceIds: ["2A"] }] },
    { ...plan, timeAllowed: "60 minutes" },
    { ...plan, questions: questions.map((q) => ({ ...q, estimatedMinutes: 60 })) },
  ]) assert.throws(() => validatePlannedCoverage(changed, scope), { code: "RESOURCE_PLAN_INVALID" });
  const many = { eligible: [1, 3, 4].map((c) => ({ id: `${c}A` })) };
  assert.throws(() => validatePlannedCoverage({ questions: [1, 3, 4].map((c) => ({ marks: c === 1 ? 20 : 1, sourceIds: [`${c}A`] })) }, many), { code: "RESOURCE_PLAN_INVALID" });
});

it("requires an independent content review of actual questions rather than planner labels", async () => {
  const events = [];
  const reviewedJob = { ...job, resourceLogSink: (_m, event) => events.push(event) };
  const run = (verdict) => verifyPlannedContent({ job: reviewedJob, request: { userMessage: prompt }, plan,
    parsed: { sections: [{ questions: [{ number: 1 }, { number: 2 }] }] }, scope,
    callAi: async (request) => {
      assert.equal(request.stageId, "content.review.v1");
      assert.match(request.userMessage, /GENERATED RESOURCE TO CHECK/);
      return { parsed: verdict };
    } });
  await run(review);
  assert.equal(events.filter((e) => e.event === "content.verified").at(-1).outcome, "passed");
  for (const changed of [
    { ...review, scopePass: false },
    { ...review, difficultyPass: false },
    { ...review, issues: ["Scope not met"] },
    { ...review, questions: review.questions.map((q) => ({ ...q, estimatedMinutes: 60 })) },
    { ...review, questions: [{ ...review.questions[0], coveredSourceIds: ["1A"] }, review.questions[1]] },
    { ...review, questions: [{ ...review.questions[0], coveredSourceIds: ["2A", "1A", "1B"] }, review.questions[1]] },
  ]) await assert.rejects(run(changed), { code: "RESOURCE_CONTENT_INVALID" });
  await assert.rejects(run({ ...review, questions: [] }), { code: "RESOURCE_BATCH_INVALID" });
  assert.equal(events.filter((e) => e.event === "content.verified").at(-1).outcome, "rejected");
});

it("allows multipart questions to cover several reference topics without inventing extra whole questions", () => {
  const { validatePlan } = require("../../src/resources/plannedGeneration");
  const planned = { ...plan, title: "Paper", clarification: "", topics: scope.eligible.map((t) => ({ name: t.title, evidence: t.title })),
    questions: questions.map((q, index) => ({ ...q, topic: index === 0 ? "Algebra" : "Functions", section: "Paper", difficulty: "standard" })) };
  validatePlan({ parsed: planned }, job, contents, scope);
});
