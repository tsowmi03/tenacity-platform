"use strict";

const { describe, it, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");

const {
  claimNextPendingJobForTutor,
  finalizeResourceJobAttempt,
  processResourceJobImpl,
  processResourceFallbackImpl,
  recoverStuckResourceJobsImpl,
} = require("../../src/resources");
const { createProviderBudget } = require("../../src/resources/providerBudget");
const { createDurableCaller } = require("../../src/resources/durableStages");
const { getAdmin, clearCollection } = require("../helpers/emulator");

const clock = () => new Date("2026-06-11T00:00:00.000Z");
const providerLimits = {
  anthropic: { maxConcurrent: 4, maxStartsPerMinute: 12 },
  openai: { maxConcurrent: 2, maxStartsPerMinute: 4 },
};

describe("resource queue concurrency (firestore emulator)", () => {
  let db;

  before(() => {
    ({ db } = getAdmin());
  });

  beforeEach(async () => {
    await clearCollection(db, "resourceJobs");
    await clearCollection(db, "resourceProviderBudgets");
    await db.doc("config/resourceQueue").delete();
  });

  after(async () => {
    await clearCollection(db, "resourceJobs");
    await clearCollection(db, "resourceProviderBudgets");
    await db.doc("config/resourceQueue").delete();
  });

  it("allows only one simultaneous claim for a tutor", async () => {
    await Promise.all([
      db.collection("resourceJobs").doc("job-1").set({
        createdBy: "tutor-1",
        status: "pending",
        createdAt: new Date("2026-06-11T00:00:00.000Z"),
        attemptCount: 0,
      }),
      db.collection("resourceJobs").doc("job-2").set({
        createdBy: "tutor-1",
        status: "pending",
        createdAt: new Date("2026-06-11T00:00:01.000Z"),
        attemptCount: 0,
      }),
    ]);

    const claims = await Promise.all([
      claimNextPendingJobForTutor({
        db,
        createdBy: "tutor-1",
        clock,
        attemptIdFactory: () => "attempt-a",
      }),
      claimNextPendingJobForTutor({
        db,
        createdBy: "tutor-1",
        clock,
        attemptIdFactory: () => "attempt-b",
      }),
    ]);

    const successfulClaims = claims.filter(Boolean);
    assert.equal(successfulClaims.length, 1);
    assert.equal(successfulClaims[0].jobId, "job-1");

    const processing = await db
      .collection("resourceJobs")
      .where("createdBy", "==", "tutor-1")
      .where("status", "==", "processing")
      .get();
    assert.equal(processing.size, 1);
  });

  it("admits two distinct turns for a pilot tutor and drains safely when the flag is removed", async () => {
    const jobs = db.collection("resourceJobs");
    await db.doc("config/resourceQueue").set({ twoTurnTutorUids: ["pilot"], providerLimits });
    await Promise.all(["a", "b", "c", "d"].map((id) => jobs.doc(id).set({
      createdBy: id === "d" ? "other" : "pilot", status: "pending", createdAt: clock(),
    })));
    const claim = (createdBy = "pilot") => claimNextPendingJobForTutor({ db, createdBy, clock });
    const first = await claim();
    assert.equal(first.extraTurn, false);
    assert.ok((await jobs.doc("b").get()).data().queueWakeId);
    const concurrent = await Promise.all([claim(), claim(), claim("other")]);
    assert.deepEqual(concurrent.filter((job) => job?.createdBy === "pilot").map((job) => job.jobId), ["b"]);
    const second = concurrent.find((job) => job?.jobId === "b");
    assert.equal(second.extraTurn, true);
    assert.equal(concurrent.find((job) => job?.jobId === "d").extraTurn, false);

    await db.doc("config/resourceQueue").update({ twoTurnTutorUids: [] });
    await finalizeResourceJobAttempt({ db, clock, jobId: first.jobId, attemptId: first.attemptId, patch: { status: "complete" } });
    assert.equal(await claim(), null);
    await finalizeResourceJobAttempt({ db, clock, jobId: second.jobId, attemptId: second.attemptId, patch: { status: "complete" } });
    assert.equal((await claim()).jobId, "c");
  });

  it("skips a deferred or fallback job while filling both pilot turns in queue order", async () => {
    const jobs = db.collection("resourceJobs");
    await db.doc("config/resourceQueue").set({ twoTurnTutorUids: ["pilot"], providerLimits });
    const write = (id, status, fields = {}) => jobs.doc(id).set({
      createdBy: "pilot", status, createdAt: clock(), ...fields,
    });
    await Promise.all([
      write("deferred", "pending", { queueNotBefore: new Date(clock().getTime() + 30_000) }),
      write("fallback", "fallback_pending"),
      write("continuation", "pending", { queueTurnAt: new Date(clock().getTime() + 500), stageContinuation: true }),
      write("fresh", "pending"),
    ]);
    const claim = () => claimNextPendingJobForTutor({ db, createdBy: "pilot", clock });
    assert.equal((await claim()).jobId, "fresh");
    assert.equal((await claim()).jobId, "continuation");
    assert.equal(await claim(), null);
  });

  it("resumes a capacity-deferred job through the normal update handler without spending a content retry", async () => {
    const start = clock().getTime();
    let time = start;
    await db.doc("config/resourceQueue").set({ twoTurnTutorUids: ["pilot"], providerLimits });
    const ref = db.doc("resourceJobs/deferred");
    const pending = { createdBy: "pilot", status: "pending", createdAt: clock(), generationVersion: 1 };
    await ref.set(pending);
    const deps = {
      db,
      clock: () => new Date(time),
      durableStages: true,
      resourceLogSink: () => {},
      startCancelWatcher: () => ({ isCancelled: () => false, stop() {} }),
      generationPipeline: async () => {
        if (time < start + 2_000) throw Object.assign(new Error("waiting"), {
          code: "RESOURCE_STAGE_YIELD", resourceControl: true, queueNotBeforeMs: start + 2_000,
        });
        return { outputPath: "generated.docx" };
      },
    };
    const event = { data: { data: () => pending } };
    await processResourceJobImpl({ event, deps });
    const deferred = (await ref.get()).data();
    assert.equal(deferred.status, "pending");
    assert.equal(deferred.queueNotBefore.toMillis(), start + 2_000);
    assert.equal(deferred.stageRecoveryCount, undefined);
    assert.deepEqual(await processResourceJobImpl({ event, deps }), []);
    time += 2_000;
    await recoverStuckResourceJobsImpl({ deps });
    const woken = (await ref.get()).data();
    await processResourceFallbackImpl({ event: { data: { before: { data: () => deferred }, after: { data: () => woken } } }, deps });
    const ready = (await ref.get()).data();
    assert.equal(ready.status, "complete");
    assert.equal(ready.attemptCount, 1);
    assert.equal(ready.queueElapsedMs, 2_000);
    assert.equal(ready.outputPath, "generated.docx");
  });

  it("shares provider permits across workers and keeps capacity for another tutor's first turn", async () => {
    let now = clock().getTime();
    const budget = (extraTurn) => createProviderBudget({
      db, job: { jobId: "test", resourceLogSink: () => {} }, limits: providerLimits, extraTurn, clock: () => now,
    });
    const extra = await budget(true).acquire("openai");
    await assert.rejects(budget(true).acquire("openai"), { code: "RESOURCE_STAGE_YIELD" });
    const first = await budget(false).acquire("openai");
    await assert.rejects(budget(false).acquire("openai"), { code: "RESOURCE_STAGE_YIELD" });

    await extra({ status: 429, headers: { "retry-after": "7" } });
    await first();
    await assert.rejects(budget(false).acquire("openai"), { queueNotBeforeMs: now + 7_000 });
    now += 7_000;
    await (await budget(true).acquire("openai"))();
    await assert.rejects(budget(true).acquire("openai"), { code: "RESOURCE_STAGE_YIELD" });
    await (await budget(false).acquire("openai"))();
    await assert.rejects(budget(false).acquire("openai"), { code: "RESOURCE_STAGE_YIELD" });
    now += 60_000;
    await (await budget(false).acquire("openai"))();
  });

  it("rejects finalisation after another attempt has taken the lease", async () => {
    const ref = db.collection("resourceJobs").doc("job-1");
    await ref.set({
      createdBy: "tutor-1",
      status: "processing",
      attemptId: "attempt-new",
    });

    const finalized = await finalizeResourceJobAttempt({
      db,
      jobId: "job-1",
      attemptId: "attempt-old",
      patch: { status: "complete" },
    });

    assert.equal(finalized, false);
    const job = (await ref.get()).data();
    assert.equal(job.status, "processing");
    assert.equal(job.attemptId, "attempt-new");
  });
  it("overlapping recovery schedules preserve a live lease and recover an abandoned stage only once", async () => {
    const jobs = db.collection("resourceJobs");
    await jobs.doc("live").set({ createdBy: "tutor-1", status: "processing", attemptId: "live",
      startedAt: new Date("2026-06-10T23:40:00Z"), leaseExpiresAt: new Date("2026-06-11T00:05:00Z") });
    await jobs.doc("abandoned").set({ createdBy: "tutor-2", status: "processing", attemptId: "dead",
      startedAt: new Date("2026-06-10T23:40:00Z"), leaseExpiresAt: new Date("2026-06-10T23:50:00Z") });
    const deps = { db, clock, runQueueForTutor: () => { throw new Error("Scheduler must not generate"); } };
    await Promise.all([recoverStuckResourceJobsImpl({ deps }), recoverStuckResourceJobsImpl({ deps })]);
    const live = (await jobs.doc("live").get()).data();
    const recovered = (await jobs.doc("abandoned").get()).data();
    assert.equal(live.attemptId, "live");
    assert.equal(live.status, "processing");
    assert.equal(recovered.recoveryCount, 1);
    assert.equal(recovered.status, "pending");
  });

  it("persists planned-stage recovery transactionally and rejects superseded recovery", async () => {
    const ref = db.collection("resourceJobs").doc("planned");
    const base = { jobId: "planned", generationVersion: 1, status: "processing", attemptId: "old" };
    await ref.set(base);
    const saved = [];
    const storage = { bucket: () => ({ file: () => ({ download: async () => { throw Object.assign(new Error("missing"), { code: 404 }); }, save: async (data) => saved.push(data) }) }) };
    const events = [];
    const make = (job, callAi) => createDurableCaller({ job: { ...job, ref, resourceLogSink: (_m, data) => events.push(data) }, db, storage, callAi, timeoutMs: 10 });
    const req = { model: "gpt-test", userMessage: "batch", stageId: "questions.1", splitAllowed: true };
    await assert.rejects(make(base, () => new Promise(() => {}))(req), { code: "RESOURCE_STAGE_YIELD" });
    const recovered = (await ref.get()).data();
    assert.equal(recovered.stageRecoveryCount, 1);
    assert.ok(Object.values(recovered.stageRecovery)[0].split);
    await assert.rejects(make(recovered, () => { throw new Error("must not call"); })(req), { code: "RESOURCE_STAGE_SPLIT" });

    let started;
    const ready = new Promise((resolve) => { started = resolve; });
    let fail;
    const waiting = make(base, () => { started(); return new Promise((_resolve, reject) => { fail = reject; }); })({ ...req, userMessage: "next stage" });
    await ready;
    await ref.update({ attemptId: "new" });
    fail(Object.assign(new Error("provider failure"), { modelFailure: true }));
    await assert.rejects(waiting, { code: "RESOURCE_SUPERSEDED" });
    assert.equal((await ref.get()).data().stageRecoveryCount, 1);
    assert.equal(saved.length, 0);
    assert.equal(events.filter((e) => e.event === "recovery.decided").length, 1);
  });

  it("persists optional-review failures once and fences a superseded reviewer", async () => {
    const ref = db.collection("resourceJobs").doc("optional-review");
    const base = { jobId: "optional-review", generationVersion: 1, status: "processing", attemptId: "owned" };
    await ref.set(base);
    const storage = { bucket: () => ({ file: () => ({ download: async () => { throw Object.assign(new Error("missing"), { code: 404 }); }, save: async () => {} }) }) };
    const make = (job, callAi) => createDurableCaller({ job: { ...job, ref, resourceLogSink: () => {} }, db, storage, callAi });
    const request = { model: "gpt-test", stageId: "content.review", optionalReview: true, userMessage: "synthetic" };
    let calls = 0;
    await assert.rejects(make(base, async () => { calls++; throw Object.assign(new Error("provider unavailable"), { modelFailure: true }); })(request), { code: "RESOURCE_REVIEW_UNAVAILABLE" });
    const current = (await ref.get()).data();
    await assert.rejects(make(current, async () => { calls++; return { parsed: {} }; })(request), { code: "RESOURCE_REVIEW_UNAVAILABLE" });
    assert.equal(calls, 1);
    assert.equal(current.providerCallCount, 1);
    assert.equal(Object.keys(current.optionalReviewFailures).length, 1);

    let begin;
    let fail;
    const ready = new Promise((resolve) => { begin = resolve; });
    const pending = make(current, () => { begin(); return new Promise((_resolve, reject) => { fail = reject; }); })({ ...request, stageId: "answers.review", userMessage: "another check" });
    await ready;
    await ref.update({ attemptId: "new" });
    fail(Object.assign(new Error("provider unavailable"), { modelFailure: true }));
    await assert.rejects(pending, { code: "RESOURCE_SUPERSEDED" });
    assert.equal(Object.keys((await ref.get()).data().optionalReviewFailures).length, 1);
  });

});
