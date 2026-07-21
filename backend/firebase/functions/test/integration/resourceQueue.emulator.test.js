"use strict";

const { describe, it, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");

const {
  claimNextPendingJobForTutor,
  finalizeResourceJobAttempt,
} = require("../../src/resources");
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
});
