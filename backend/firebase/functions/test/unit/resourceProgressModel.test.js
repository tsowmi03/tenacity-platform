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
  // Each report lands just as a batch is counted (no time-based partial batch).
  const onPace = estimateProgress({ ...base, activeMs: 67_500, wallMs: 67_500, countChangedAtMs: 67_500 });
  assert.ok(Math.abs(onPace.fraction - 0.45) < 0.01);
  const slow = estimateProgress({ ...base, activeMs: 135_000, wallMs: 135_000, countChangedAtMs: 135_000 });
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
  // The plan's coverage review runs inside writing, before diagrams.
  assert.equal(phaseForStage({ stageId: "content.review.v1", stageLabel: "Checking topic coverage" }), "write");
  assert.equal(phaseForStage({ stageId: "answers.verify" }), "check");
});

it("counts questions in every resource shape, not their parts", () => {
  const { countResourceQuestions } = require("../../src/resources/progressModel");
  const q = (n) => Array.from({ length: n }, () => ({ stem: "s", parts: [{ label: "a" }, { label: "b" }] }));
  assert.equal(countResourceQuestions({ questions: q(12) }), 12);
  assert.equal(countResourceQuestions({ sections: [{ questions: q(5) }, { questions: q(7) }] }), 12);
  assert.equal(countResourceQuestions({ subTopics: [{ practiceQuestions: q(4) }, { practiceQuestions: q(3) }], endQuiz: { sections: [{ questions: q(6) }] } }), 13);
  assert.equal(countResourceQuestions({ blocks: [{ type: "questionSet", questions: q(2) }, { type: "text" }] }), 2);
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

// RES-84
const booklet = { resourceType: "topic-booklet", subject: "maths", answerMode: "worked" };

it("never writes a lower bar than the run's last report", () => {
  const out = estimateProgress({ job, tracker: { phase: "write", questionCount: 20, questionsDone: 1 }, activeMs: 30_000, phaseStarts: { write: 20_000 }, previous: { fraction: 0.6, remainingMs: 100_000, elapsedMs: 5000 } });
  assert.equal(out.fraction, 0.6);
});

it("keeps moving through an overrunning step instead of freezing short of its end", () => {
  // Diagrams on a booklet: no question count, so time moves the bar.
  const at = (activeMs) => estimateProgress({ job: booklet, tracker: { phase: "diagrams" }, activeMs, phaseStarts: { diagrams: 0 }, requestedQuestions: 20 }).fraction;
  const expected = 500_000 * 0.15; // default fit for 20 questions × the default diagram share
  const [once, twice, thrice] = [1, 2, 3].map((n) => at(expected * n));
  assert.ok(once < twice && twice < thrice, `${once} ${twice} ${thrice}`);
  // Never reaches the next step's start (plan 8% + write 55% + diagrams 15%).
  assert.ok(at(expected * 50) < 0.78);
});

it("counts waiting as part of the ETA once the run has some work behind it", () => {
  const base = { job, tracker: { phase: "write", questionCount: 20, questionsDone: 10 }, phaseStarts: { write: 0 }, requestedQuestions: 20 };
  const working = estimateProgress({ ...base, activeMs: 240_000, wallMs: 240_000 });
  // The tutor's other resource took every second turn: twice the real time.
  const sharing = estimateProgress({ ...base, activeMs: 240_000, wallMs: 480_000 });
  assert.ok(Math.abs(sharing.remainingMs / working.remainingMs - 2) < 0.01, `${sharing.remainingMs} vs ${working.remainingMs}`);
  // A long wait in the first seconds of work is mostly discounted, and capped.
  const early = estimateProgress({ ...base, activeMs: 12_000, wallMs: 330_000 });
  const earlyNoWait = estimateProgress({ ...base, activeMs: 12_000, wallMs: 12_000 });
  assert.ok(early.remainingMs <= earlyNoWait.remainingMs * 4.01);
});

it("blends a report with the last one so one stage cannot swing the ETA", () => {
  const base = { job, tracker: { phase: "write", questionCount: 20, questionsDone: 10 }, phaseStarts: { write: 0 }, activeMs: 100_000, wallMs: 100_000 };
  const fresh = estimateProgress(base).remainingMs;
  const soon = estimateProgress({ ...base, previous: { fraction: 0.3, remainingMs: fresh * 2, elapsedMs: 1000 } }).remainingMs;
  // One second later, good news: half way from the counted-down last ETA.
  const before = fresh * 2 - 1000;
  assert.ok(Math.abs(soon - (before + 0.5 * (fresh - before))) < 2, `${soon}`);
  // A rise is eased in: a fifth of the way.
  const up = estimateProgress({ ...base, previous: { fraction: 0.3, remainingMs: fresh / 2, elapsedMs: 1000 } }).remainingMs;
  const upBefore = fresh / 2 - 1000;
  assert.ok(Math.abs(up - (upBefore + 0.2 * (fresh - upBefore))) < 2, `${up}`);
  // Minutes later the new estimate wins.
  const later = estimateProgress({ ...base, previous: { fraction: 0.3, remainingMs: fresh * 2, elapsedMs: 300_000 } }).remainingMs;
  assert.ok(Math.abs(later - fresh) / fresh < 0.01, `${later} vs ${fresh}`);
});

it("keeps the bar from dropping across worker hand-offs, and restarts it on a manual Retry", async () => {
  let t = 2_000_000;
  const current = { status: "processing", attemptId: "a", runId: "run-1", startedAt: new Date(t), ...job };
  const db = { runTransaction: async (fn) => fn({ get: async () => ({ exists: true, data: () => current }), update: (_r, patch) => Object.assign(current, patch) }) };
  const storage = { bucket: () => ({ file: () => ({
    download: async () => { throw Object.assign(new Error("missing"), { code: 404 }); },
    save: async () => {},
  }) }) };
  const caller = () => {
    const runJob = { jobId: "j", attemptId: "a", ref: {}, customPrompt: "20 questions", ...job, timingStats: {} };
    return createDurableCaller({ job: runJob, db, storage, clock: () => new Date(t), callAi: async () => { t += 1000; return { parsed: {} }; } });
  };
  current.progress = { runId: "run-1", fraction: 0.7, remainingMs: 60_000, updatedAt: new Date(t - 1000), phaseStarts: { plan: 0 }, firstStartedAtMs: t - 100_000 };
  // A fresh invocation replays from the start: its tracker is back at planning.
  await caller()({ stageId: "plan.v2", stageLabel: "Planning", userMessage: "p" });
  assert.equal(current.progress.fraction, 0.7);
  assert.equal(current.progress.runId, "run-1");
  // Manual Retry: new run, progress kept on the job but not carried over.
  current.runId = "run-2";
  current.activeElapsedMs = 0;
  current.startedAt = new Date(t);
  const retriedAt = t;
  await caller()({ stageId: "plan.v2", stageLabel: "Planning again", userMessage: "p2" });
  assert.ok(current.progress.fraction < 0.1, `${current.progress.fraction}`);
  assert.equal(current.progress.runId, "run-2");
  assert.equal(current.progress.firstStartedAtMs, retriedAt);
});

it("moves through the diagram step by diagram questions settled, and replays to the same figure", () => {
  const at = (diagramsDone) => estimateProgress({ job: booklet, tracker: { phase: "diagrams", diagramCount: 12, diagramsDone }, activeMs: 400_000, phaseStarts: { diagrams: 390_000 }, requestedQuestions: 20 });
  assert.ok(at(3).fraction < at(6).fraction && at(6).fraction < at(12).fraction);
  assert.equal(at(6).diagramsDone, 6);
  const runJob = { progressTracker: { phase: "diagrams" } };
  noteProgress(runJob, { diagramCount: 12, diagramsDone: 2 });
  noteProgress(runJob, { diagramsDone: 7 });
  noteProgress(runJob, { diagramsDone: 7 });
  assert.deepEqual([runJob.progressTracker.diagramCount, runJob.progressTracker.diagramsDone], [12, 7]);
});

it("moves the bar within a batch, toward the next count, without reaching it", () => {
  const base = { job, tracker: { phase: "write", questionCount: 20, questionsDone: 10 }, phaseStarts: { write: 0 }, requestedQuestions: 20 };
  const counted = estimateProgress({ ...base, activeMs: 100_000, countChangedAtMs: 100_000 }).fraction;
  const midBatch = estimateProgress({ ...base, activeMs: 150_000, countChangedAtMs: 100_000 }).fraction;
  const long = estimateProgress({ ...base, activeMs: 2_000_000, countChangedAtMs: 100_000 }).fraction;
  const nextCount = estimateProgress({ ...base, tracker: { ...base.tracker, questionsDone: 20 }, activeMs: 2_000_000, countChangedAtMs: 2_000_000 }).fraction;
  assert.ok(counted < midBatch && midBatch < long && long <= nextCount, `${counted} ${midBatch} ${long} ${nextCount}`);
});

it("gives English no diagram step in the bar or the ETA", () => {
  const stats = { all: history([1, 2, 3].map(() => ({ questions: 10, activeMs: 300_000, phaseMs: { plan: 10, write: 70, diagrams: 20, check: 0, finish: 0 } }))) };
  const english = { resourceType: "practice-paper", subject: "english", answerMode: "worked" };
  const done = estimateProgress({ job: english, statsByKey: stats, tracker: { phase: "write", questionCount: 8, questionsDone: 8 }, activeMs: 280_000, countChangedAtMs: 280_000, phaseStarts: { plan: 0, write: 30_000 } });
  // Writing done and nothing but writing after planning: almost no time left.
  assert.ok(done.remainingMs < 15_000, `${done.remainingMs}`);
  const maths = estimateProgress({ job: { ...english, subject: "maths" }, statsByKey: stats, tracker: { phase: "write", questionCount: 8, questionsDone: 8 }, activeMs: 280_000, countChangedAtMs: 280_000, phaseStarts: { plan: 0, write: 30_000 } });
  assert.ok(maths.remainingMs > done.remainingMs * 3);
});

it("counts unnamed work before the first step as planning", async () => {
  let t = 3_000_000;
  const current = { status: "processing", attemptId: "a", runId: "r", startedAt: new Date(t), ...job, subject: "english" };
  const db = { runTransaction: async (fn) => fn({ get: async () => ({ exists: true, data: () => current }), update: (_r, patch) => Object.assign(current, patch) }) };
  const saved = new Map();
  const storage = { bucket: () => ({ file: (path) => ({
    download: async () => { if (!saved.has(path)) throw Object.assign(new Error("missing"), { code: 404 }); return [Buffer.from(saved.get(path))]; },
    save: async (data) => saved.set(path, data),
  }) }) };
  // One fresh call per worker invocation: the second replays the first.
  const invocation = () => createDurableCaller({ job: { jobId: "j", attemptId: "a", ref: {}, customPrompt: "paper", ...job, subject: "english", timingStats: {} },
    db, storage, clock: () => new Date(t), callAi: async () => { t += 120_000; return { parsed: {} }; } });
  await invocation()({ userMessage: "s1" });
  const second = invocation();
  await second({ userMessage: "s1" });
  await second({ userMessage: "s2" });
  assert.equal(current.progress.phase, "plan");
  assert.equal(current.progress.phaseStarts.plan, 0);
  assert.ok(current.progress.fraction > 0, `${current.progress.fraction}`);
});
