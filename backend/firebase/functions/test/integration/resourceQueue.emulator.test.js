"use strict";

const { describe, it, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");

const {
  claimNextPendingJobForTutor,
  finalizeResourceJobAttempt,
  recoverStuckResourceJobsImpl,
} = require("../../src/resources");
const { createDurableCaller } = require("../../src/resources/durableStages");
const { getAdmin, clearCollection } = require("../helpers/emulator");

const clock = () => new Date("2026-06-11T00:00:00.000Z");

describe("resource queue concurrency (firestore emulator)", () => {
  let db;

  before(() => {
    ({ db } = getAdmin());
  });

  beforeEach(async () => {
    await clearCollection(db, "resourceJobs");
  });

  after(async () => {
    await clearCollection(db, "resourceJobs");
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

});
