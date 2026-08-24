"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  cancelResourceJobImpl,
  runQueueForTutor,
  validateCancelResourceJobPayload,
} = require("../../src/resources");

const clock = () => new Date("2026-05-23T00:00:00.000Z");

// Minimal Firestore double supporting collection().doc(), runTransaction(),
// and the per-tutor pending/processing queries runQueueForTutor relies on.
function fakeDb(initialJobs) {
  const jobs = initialJobs.map((job) => ({ ...job }));
  const updates = [];

  function ref(id) {
    return { __type: "ref", id };
  }

  function docsForQuery(query) {
    let result = jobs.filter((job) =>
      query.filters.every((f) => (f.op === "==" ? job[f.field] === f.value : true))
    );
    if (query.sort) {
      result = result.sort((a, b) => (a[query.sort.field] < b[query.sort.field] ? -1 : 1));
    }
    if (query.max) result = result.slice(0, query.max);
    return result.map((job) => ({ id: job.id, ref: ref(job.id), data: () => ({ ...job, jobId: job.id }) }));
  }

  function query(filters = [], sort = null, max = null) {
    return {
      __type: "query",
      filters,
      sort,
      max,
      where(field, op, value) {
        return query([...filters, { field, op, value }], sort, max);
      },
      orderBy(field) {
        return query(filters, { field }, max);
      },
      limit(value) {
        return query(filters, sort, value);
      },
    };
  }

  function applyUpdate(id, patch) {
    updates.push({ id, patch });
    const job = jobs.find((item) => item.id === id);
    if (job) Object.assign(job, patch);
  }

  return {
    jobs,
    updates,
    collection() {
      return {
        where(field, op, value) {
          return query().where(field, op, value);
        },
        doc(id) {
          return ref(id);
        },
      };
    },
    runTransaction(callback) {
      const tx = {
        async get(target) {
          if (target?.__type === "ref") {
            const job = jobs.find((item) => item.id === target.id);
            return { exists: Boolean(job), data: () => ({ ...job, jobId: target.id }) };
          }
          const docs = docsForQuery(target);
          return { empty: docs.length === 0, docs };
        },
        update(target, patch) {
          applyUpdate(target.id, patch);
        },
      };
      return callback(tx);
    },
  };
}

describe("validateCancelResourceJobPayload", () => {
  it("requires a jobId string", () => {
    assert.throws(() => validateCancelResourceJobPayload({}));
    assert.deepEqual(validateCancelResourceJobPayload({ jobId: "job-1" }), { jobId: "job-1" });
  });
});

describe("cancelResourceJobImpl", () => {
  const actor = { uid: "tutor-1", role: "tutor" };

  it("cancels a still-queued (pending) job outright", async () => {
    const db = fakeDb([{ id: "job-1", createdBy: "tutor-1", status: "pending" }]);
    const result = await cancelResourceJobImpl({
      payload: { jobId: "job-1" },
      actor,
      deps: { db, clock },
    });
    assert.deepEqual(result, { jobId: "job-1", status: "cancelled" });
    assert.equal(db.jobs[0].status, "cancelled");
    assert.equal(db.jobs[0].cancelRequested, false);
  });

  it("flags a processing job for cooperative cancellation", async () => {
    const db = fakeDb([{ id: "job-1", createdBy: "tutor-1", status: "processing", attemptId: "a1" }]);
    const result = await cancelResourceJobImpl({
      payload: { jobId: "job-1" },
      actor,
      deps: { db, clock },
    });
    assert.deepEqual(result, { jobId: "job-1", status: "cancelling" });
    assert.equal(db.jobs[0].cancelRequested, true);
    assert.equal(db.jobs[0].status, "processing");
  });

  it("rejects cancelling a finished job", async () => {
    const db = fakeDb([{ id: "job-1", createdBy: "tutor-1", status: "complete" }]);
    await assert.rejects(
      cancelResourceJobImpl({ payload: { jobId: "job-1" }, actor, deps: { db, clock } }),
      /already finished/i
    );
  });

  it("rejects a missing job", async () => {
    const db = fakeDb([]);
    await assert.rejects(
      cancelResourceJobImpl({ payload: { jobId: "nope" }, actor, deps: { db, clock } }),
      /not found/i
    );
  });

  it("forbids cancelling another tutor's job", async () => {
    const db = fakeDb([{ id: "job-1", createdBy: "tutor-2", status: "pending" }]);
    await assert.rejects(
      cancelResourceJobImpl({ payload: { jobId: "job-1" }, actor, deps: { db, clock } }),
      /only stop your own/i
    );
  });

  it("lets an admin cancel another tutor's job", async () => {
    const db = fakeDb([{ id: "job-1", createdBy: "tutor-2", status: "pending" }]);
    const result = await cancelResourceJobImpl({
      payload: { jobId: "job-1" },
      actor: { uid: "admin-1", role: "admin" },
      deps: { db, clock },
    });
    assert.equal(result.status, "cancelled");
  });
});

describe("runQueueForTutor cancellation", () => {
  it("finalizes a job as cancelled when generation aborts", async () => {
    const db = fakeDb([{ id: "job-1", createdBy: "tutor-1", status: "pending", createdAt: 1 }]);
    const outcomes = await runQueueForTutor("tutor-1", {
      db,
      clock,
      enableFailover: false,
      generationPipeline: async () => {
        const err = new Error("Resource generation was cancelled");
        err.cancelled = true;
        throw err;
      },
    });
    assert.deepEqual(outcomes, [{ jobId: "job-1", status: "cancelled" }]);
    assert.equal(db.jobs[0].status, "cancelled");
    assert.equal(db.jobs[0].cancelRequested, false);
  });

  it("treats a watcher-reported cancel as cancelled even for a generic error", async () => {
    const db = fakeDb([{ id: "job-1", createdBy: "tutor-1", status: "pending", createdAt: 1 }]);
    const outcomes = await runQueueForTutor("tutor-1", {
      db,
      clock,
      startCancelWatcher: () => ({
        signal: { aborted: true },
        isCancelled: () => true,
        stop() {},
      }),
      generationPipeline: async () => {
        throw new Error("aborted mid-stream");
      },
    });
    assert.deepEqual(outcomes, [{ jobId: "job-1", status: "cancelled" }]);
    assert.equal(db.jobs[0].status, "cancelled");
  });

  it("stores a friendly message and technical detail on failure", async () => {
    const db = fakeDb([{ id: "job-1", createdBy: "tutor-1", status: "pending", createdAt: 1 }]);
    const outcomes = await runQueueForTutor("tutor-1", {
      db,
      clock,
      enableFailover: false,
      generationPipeline: async () => {
        const err = new Error("AI response was truncated at the 24000 token output limit.");
        err.stopReason = "max_tokens";
        throw err;
      },
    });
    assert.equal(outcomes[0].status, "failed");
    assert.match(db.jobs[0].error, /too large|cut off/i);
    assert.match(db.jobs[0].errorDetail, /truncated/i);
  });
});
