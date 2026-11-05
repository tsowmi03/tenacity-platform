"use strict";
const { it } = require("node:test");
const assert = require("node:assert/strict");
const { estimateProgress, addSample, fitFromStats, phaseForStage, phaseDurations, kindKey, noteProgress } = require("../../src/resources/progressModel");
const { createDurableCaller } = require("../../src/resources/durableStages");

const job = { resourceType: "worksheet", subject: "maths", answerMode: "worked" };
function history(samples) {
  return samples.reduce((stats, s) => addSample(stats, s), null);
}

it("fits time = a + b × questions from history", () => {
  const stats = history([10, 20, 40].map((q) => ({ questions: q, activeMs: (30 + 6 * q) * 1000 })));
  const fit = fitFromStats(stats);
  assert.ok(Math.abs(fit.a - 30) < 1e-6 && Math.abs(fit.b - 6) < 1e-6);
});

it("predicts a fresh run from history before any stage has run", () => {
  const stats = history([10, 20, 40].map((q) => ({ questions: q, activeMs: (30 + 6 * q) * 1000 })));
  const out = estimateProgress({ job, statsByKey: { [kindKey(job)]: stats }, tracker: { phase: "plan" }, activeMs: 0, requestedQuestions: 20 });
  assert.equal(out.expectedTotalMs, 150_000);
  assert.equal(out.fraction, 0);
  assert.equal(out.remainingMs, 150_000);
  assert.ok(out.lowMs < out.remainingMs && out.highMs > out.remainingMs);
});

it("counts written questions toward the bar and stretches the ETA for a slow run", () => {
  const stats = history([10, 20, 40].map((q) => ({ questions: q, activeMs: (30 + 6 * q) * 1000, phaseMs: { plan: 10, write: 70, diagrams: 0, check: 10, finish: 10 } })));
  const base = { job, statsByKey: { [kindKey(job)]: stats }, tracker: { phase: "write", questionCount: 20, questionsDone: 10 }, phaseStarts: { plan: 0, write: 15_000 } };
  const onPace = estimateProgress({ ...base, activeMs: 67_500, wallMs: 67_500 });
  assert.ok(Math.abs(onPace.fraction - 0.45) < 0.01);
  const slow = estimateProgress({ ...base, activeMs: 135_000, wallMs: 135_000 });
  assert.equal(slow.fraction, onPace.fraction);
  assert.ok(slow.remainingMs > onPace.remainingMs * 1.8, `${slow.remainingMs} vs ${onPace.remainingMs}`);
});

it("never moves the bar backwards within a step and stops short of 100%", () => {
  const out = estimateProgress({ job, tracker: { phase: "finish" }, activeMs: 10_000_000, phaseStarts: { finish: 0 } });
  assert.ok(out.fraction <= 0.99);
});

it("narrows the range as history agrees with predictions", () => {
  let stats = null;
  for (let i = 0; i < 6; i += 1) stats = addSample(stats, { questions: 20, activeMs: 150_000, predictedMs: 150_000 });
  const out = estimateProgress({ job, statsByKey: { all: stats }, tracker: { phase: "plan" }, requestedQuestions: 20 });
  assert.equal(out.lowMs, out.highMs);
});

it("names the step each stage belongs to", () => {
  assert.equal(phaseForStage({ stageId: "plan.v2" }), "plan");
  assert.equal(phaseForStage({ stageId: "solutions.3.a" }), "write");
  assert.equal(phaseForStage({ stageLabel: "Writing questions 1–15 of 40" }), "write");
  assert.equal(phaseForStage({ stageLabel: "Checking 12 answers" }), "check");
  assert.equal(phaseForStage({ progressPhase: "diagrams", stageLabel: "Checking" }), "diagrams");
  assert.equal(phaseForStage({}), null);
});

it("splits a run's time across the steps it went through", () => {
  assert.deepEqual(phaseDurations({ plan: 0, write: 10, check: 70 }, 100), { plan: 10, write: 60, diagrams: 0, check: 30, finish: 0 });
});

it("writes the step, bar and ETA with each stage and keeps step start times", async () => {
  let t = 1_000_000;
  const current = { status: "processing", attemptId: "a", startedAt: new Date(t), ...job };
  const db = { runTransaction: async (fn) => fn({ get: async () => ({ exists: true, data: () => current }), update: (_r, patch) => Object.assign(current, patch) }) };
  const saved = new Map();
  const storage = { bucket: () => ({ file: (path) => ({
    download: async () => { if (!saved.has(path)) throw Object.assign(new Error("missing"), { code: 404 }); return [Buffer.from(saved.get(path))]; },
    save: async (data) => saved.set(path, data),
  }) }) };
  const invocation = () => {
    const runJob = { jobId: "j", attemptId: "a", ref: {}, customPrompt: "20 questions", ...job, timingStats: {} };
    return { runJob, call: createDurableCaller({ job: runJob, db, storage, clock: () => new Date(t), callAi: async () => { t += 5000; return { parsed: {} }; } }) };
  };
  const plan = { stageId: "plan.v2", stageLabel: "Planning", userMessage: "p" };
  const first = invocation();
  await first.call(plan);
  assert.equal(current.progress.phase, "plan");
  assert.equal(current.progress.phaseStarts.plan, 0);
  // The next invocation replays the saved plan, then writes.
  const { runJob, call } = invocation();
  await call(plan);
  noteProgress(runJob, { questionCount: 20 });
  await call({ stageId: "questions.1", stageLabel: "Writing questions 1–10 of 20", userMessage: "q" });
  assert.equal(current.progress.phase, "write");
  assert.equal(current.progress.questionCount, 20);
  assert.equal(current.progress.phaseStarts.plan, 0, "earlier step starts survive");
  assert.equal(current.progress.phaseStarts.write, 5000);
  assert.ok(current.progress.remainingMs > 0 && current.progress.fraction > 0);
  await runJob.progressTracker.markPhase("finish", "Building the PDF");
  assert.equal(current.progress.phase, "finish");
  assert.equal(current.progress.message, "Building the PDF");
});

it("seeds history from logged runs, skipping revisions and nested diagram stages", () => {
  const { buildStats } = require("../../scripts/backfillResourceTiming");
  const hash = "a".repeat(64);
  const { stats, skipped } = buildStats({
    completed: [{ jobId: "j1", runId: "r1", activeElapsedMs: 200_000 }, { jobId: "j2", runId: "r2", activeElapsedMs: 90_000 }],
    plans: [{ jobId: "j1", questionCount: 20 }],
    stages: [
      { runId: "r1", stageId: "plan.v2", durationMs: 10_000 },
      { runId: "r1", stageId: "questions.1", durationMs: 100_000 },
      { runId: "r1", stageId: "diagrams.fill", durationMs: 50_000 },
      { runId: "r1", stageId: hash, durationMs: 40_000 },
      { runId: "r1", stageId: "document.build", durationMs: 40_000 },
    ],
    jobs: new Map([["j1", job], ["j2", { ...job, revisionInstruction: "harder" }]]),
  });
  assert.equal(stats.all.n, 1);
  assert.equal(stats[kindKey(job)].sq, 20);
  assert.equal(stats.all.shares.diagrams, 0.25);
  assert.deepEqual(skipped, { revision: 1 });
});
