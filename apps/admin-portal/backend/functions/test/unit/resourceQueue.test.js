"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  claimNextPendingJobForTutor,
  outputPathForJob,
  processResourceJobImpl,
  recoverStuckResourceJobsImpl,
  retryResourceJobImpl,
  runGenerationPipeline,
  runQueueForTutor,
  validateRetryResourceJobPayload,
} = require("../../src/resources");
const { fromDate } = require("../../src/shared/timestamps");

const clock = () => new Date("2026-05-23T00:00:00.000Z");

function fakeRef(id, jobs, updates) {
  return {
    id,
    async get() {
      const job = jobs.find((item) => item.id === id);
      return {
        exists: Boolean(job),
        data: () => ({ ...job, jobId: id }),
      };
    },
    async update(patch) {
      updates.push({ id, patch });
      const job = jobs.find((item) => item.id === id);
      if (job) Object.assign(job, patch);
    },
  };
}

function fakeQueueDb(initialJobs) {
  const jobs = initialJobs.map((job) => ({ ...job }));
  const updates = [];

  function comparable(value) {
    if (typeof value?.toMillis === "function") return value.toMillis();
    if (value instanceof Date) return value.getTime();
    return value;
  }

  function docsForQuery(query) {
    let result = jobs.filter((job) =>
      query.filters.every((filter) => {
        if (filter.op === "==") return job[filter.field] === filter.value;
        if (filter.op === "<") return comparable(job[filter.field]) < comparable(filter.value);
        throw new Error(`Unsupported fake op: ${filter.op}`);
      })
    );
    if (query.sort) {
      result = result.sort((a, b) => {
        const aValue = a[query.sort.field];
        const bValue = b[query.sort.field];
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      });
    }
    if (query.max) result = result.slice(0, query.max);
    return result.map((job) => ({
      id: job.id,
      ref: fakeRef(job.id, jobs, updates),
      data: () => ({ ...job, jobId: job.id }),
    }));
  }

  function fakeQuery(collection, filters = [], sort = null, max = null) {
    return {
      __type: "query",
      collection,
      filters,
      sort,
      max,
      where(field, op, value) {
        return fakeQuery(collection, [...filters, { field, op, value }], sort, max);
      },
      orderBy(field, direction) {
        return fakeQuery(collection, filters, { field, direction }, max);
      },
      limit(limitValue) {
        return fakeQuery(collection, filters, sort, limitValue);
      },
      async get() {
        const docs = docsForQuery(this);
        return { empty: docs.length === 0, docs };
      },
    };
  }

  return {
    jobs,
    updates,
    collection(name) {
      return {
        where(field, op, value) {
          return fakeQuery(name).where(field, op, value);
        },
        doc(id) {
          return fakeRef(id, jobs, updates);
        },
      };
    },
    runTransaction(callback) {
      const tx = {
        async get(target) {
          const docs = docsForQuery(target);
          return { empty: docs.length === 0, docs };
        },
        update(ref, patch) {
          updates.push({ id: ref.id, patch });
          const job = jobs.find((item) => item.id === ref.id);
          if (job) Object.assign(job, patch);
        },
      };
      return callback(tx);
    },
  };
}

function fakeStorage(downloads = {}) {
  const saved = [];
  return {
    saved,
    bucket() {
      return {
        file(path) {
          return {
            async download() {
              return [downloads[path] || Buffer.from("")];
            },
            async save(buffer, options) {
              saved.push({ path, buffer, options });
            },
          };
        },
      };
    },
  };
}

const worksheetJson = {
  title: "Linear Equations Worksheet",
  subject: "maths",
  year: 8,
  topic: "Solving linear equations",
  totalMarks: 2,
  questions: [
    {
      number: 1,
      stem: "Solve 2x + 3 = 11.",
      marks: 2,
      workingLines: 2,
      parts: null,
    },
  ],
  answers: [{ questionNumber: 1, partLabel: null, answer: "x = 4" }],
};

describe("resource queue claiming", () => {
  it("does not claim a pending job while the tutor already has a processing job", async () => {
    const db = fakeQueueDb([
      { id: "processing-1", createdBy: "tutor-1", status: "processing" },
      { id: "pending-1", createdBy: "tutor-1", status: "pending", createdAt: 1 },
    ]);

    const claimed = await claimNextPendingJobForTutor({
      db,
      createdBy: "tutor-1",
      clock,
    });

    assert.equal(claimed, null);
    assert.equal(db.updates.length, 0);
  });

  it("claims the oldest pending job for the tutor", async () => {
    const db = fakeQueueDb([
      { id: "newer", createdBy: "tutor-1", status: "pending", createdAt: 2 },
      { id: "older", createdBy: "tutor-1", status: "pending", createdAt: 1 },
      { id: "other", createdBy: "tutor-2", status: "pending", createdAt: 0 },
    ]);

    const claimed = await claimNextPendingJobForTutor({
      db,
      createdBy: "tutor-1",
      clock,
    });

    assert.equal(claimed.jobId, "older");
    assert.equal(db.jobs.find((job) => job.id === "older").status, "processing");
    assert.equal(db.updates[0].patch.error, null);
    assert.equal(db.updates[0].patch.startedAt.toDate().toISOString(), "2026-05-23T00:00:00.000Z");
  });
});

describe("resource generation pipeline", () => {
  it("builds and uploads a worksheet DOCX from AI JSON", async () => {
    const storage = fakeStorage({
      "resources/uploads/tutor-1/reference.txt": Buffer.from("Reference topic: equations"),
    });
    const aiCalls = [];

    const result = await runGenerationPipeline(
      {
        jobId: "job-1",
        createdBy: "tutor-1",
        studentName: "Mei Tanaka",
        subject: "maths",
        year: 8,
        resourceType: "worksheet",
        model: "claude-3-5-haiku-20241022",
        customPrompt: "Make it short.",
        uploadedFilePath: "resources/uploads/tutor-1/reference.txt",
        uploadedFileName: "reference.txt",
      },
      {
        storage,
        anthropicApiKey: "test-key",
        clock,
        callAi: async (payload) => {
          aiCalls.push(payload);
          return { parsed: worksheetJson, raw: JSON.stringify(worksheetJson) };
        },
      }
    );

    assert.equal(aiCalls.length, 1);
    assert.equal(aiCalls[0].model, "claude-sonnet-4-20250514");
    assert.match(aiCalls[0].systemPrompt, /worksheet/);
    assert.match(aiCalls[0].userMessage, /Reference topic: equations/);
    assert.equal(
      result.outputFileName,
      "Worksheet - Mei Tanaka - Year 8 Maths - Linear Equations Worksheet - 2026-05-23.docx"
    );
    assert.equal(result.outputPath, outputPathForJob("job-1", result.outputFileName));
    assert.equal(storage.saved[0].path, result.outputPath);
    assert.equal(storage.saved[0].buffer.subarray(0, 2).toString("utf8"), "PK");
    assert.equal(
      storage.saved[0].options.metadata.contentType,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
  });

  it("preserves raw AI JSON when DOCX building fails", async () => {
    const raw = JSON.stringify(worksheetJson);
    await assert.rejects(
      () =>
        runGenerationPipeline(
          {
            jobId: "job-1",
            createdBy: "tutor-1",
            studentName: "Mei Tanaka",
            subject: "maths",
            year: 8,
            resourceType: "worksheet",
            model: "claude-sonnet-4-20250514",
            customPrompt: "",
            uploadedFilePath: null,
            uploadedFileName: null,
          },
          {
            storage: fakeStorage(),
            anthropicApiKey: "test-key",
            clock,
            callAi: async () => ({ parsed: worksheetJson, raw }),
            buildDocx: async () => {
              throw new Error("DOCX build failed");
            },
          }
        ),
      (err) => err.rawAiText === raw && /DOCX build failed/.test(err.message)
    );
  });
});

describe("resource queue runner", () => {
  it("processes pending jobs sequentially for a tutor", async () => {
    const db = fakeQueueDb([
      { id: "job-1", createdBy: "tutor-1", status: "pending", createdAt: 1 },
      { id: "job-2", createdBy: "tutor-1", status: "pending", createdAt: 2 },
    ]);
    const processed = [];

    const outcomes = await runQueueForTutor("tutor-1", {
      db,
      clock,
      generationPipeline: async (job) => {
        processed.push(job.jobId);
        return {
          outputPath: `resources/output/${job.jobId}/out.docx`,
          outputFileName: "out.docx",
          generatedJson: "{}",
        };
      },
    });

    assert.deepEqual(processed, ["job-1", "job-2"]);
    assert.deepEqual(
      outcomes.map((outcome) => outcome.status),
      ["complete", "complete"]
    );
    assert.deepEqual(
      db.jobs.map((job) => job.status),
      ["complete", "complete"]
    );
  });

  it("marks failed jobs and keeps processing the tutor queue", async () => {
    const db = fakeQueueDb([
      { id: "job-1", createdBy: "tutor-1", status: "pending", createdAt: 1 },
      { id: "job-2", createdBy: "tutor-1", status: "pending", createdAt: 2 },
    ]);

    const outcomes = await runQueueForTutor("tutor-1", {
      db,
      clock,
      generationPipeline: async (job) => {
        if (job.jobId === "job-1") {
          const err = new Error("AI response was not valid JSON");
          err.rawAiText = "not json";
          throw err;
        }
        return {
          outputPath: "resources/output/job-2/out.docx",
          outputFileName: "out.docx",
          generatedJson: "{}",
        };
      },
    });

    assert.deepEqual(
      outcomes.map((outcome) => outcome.status),
      ["failed", "complete"]
    );
    assert.equal(db.jobs[0].status, "failed");
    assert.equal(db.jobs[0].generatedJson, "not json");
    assert.equal(db.jobs[1].status, "complete");
  });
});

describe("processResourceJobImpl", () => {
  it("runs the tutor queue only for pending created jobs", async () => {
    const called = [];
    const pendingResult = await processResourceJobImpl({
      event: { data: { data: () => ({ status: "pending", createdBy: "tutor-1" }) } },
      deps: {
        runQueueForTutor: async (createdBy) => {
          called.push(createdBy);
          return [{ jobId: "job-1", status: "complete" }];
        },
      },
    });
    const completeResult = await processResourceJobImpl({
      event: { data: { data: () => ({ status: "complete", createdBy: "tutor-1" }) } },
      deps: {
        runQueueForTutor: async () => {
          throw new Error("Should not run");
        },
      },
    });

    assert.deepEqual(called, ["tutor-1"]);
    assert.deepEqual(pendingResult, [{ jobId: "job-1", status: "complete" }]);
    assert.equal(completeResult, null);
  });
});

describe("retryResourceJobImpl", () => {
  it("validates retry payloads", () => {
    assert.deepEqual(validateRetryResourceJobPayload({ jobId: "job-1" }), {
      jobId: "job-1",
    });
    assert.throws(() => validateRetryResourceJobPayload({}), /jobId/);
  });

  it("resets failed jobs and starts the tutor queue", async () => {
    const db = fakeQueueDb([
      {
        id: "job-1",
        createdBy: "tutor-1",
        status: "failed",
        error: "Bad JSON",
        startedAt: fromDate(new Date("2026-05-23T00:00:00.000Z")),
        completedAt: fromDate(new Date("2026-05-23T00:01:00.000Z")),
      },
    ]);
    const queued = [];

    const result = await retryResourceJobImpl({
      payload: { jobId: "job-1" },
      actor: { uid: "tutor-1", role: "tutor" },
      deps: {
        db,
        clock,
        runQueueForTutor: async (createdBy) => {
          queued.push(createdBy);
          return [{ jobId: "job-1", status: "complete" }];
        },
      },
    });

    assert.equal(db.jobs[0].status, "pending");
    assert.equal(db.jobs[0].error, null);
    assert.equal(db.jobs[0].startedAt, null);
    assert.equal(db.jobs[0].completedAt, null);
    assert.deepEqual(queued, ["tutor-1"]);
    assert.deepEqual(result.outcomes, [{ jobId: "job-1", status: "complete" }]);
  });

  it("rejects retries by another tutor", async () => {
    const db = fakeQueueDb([
      { id: "job-1", createdBy: "tutor-1", status: "failed" },
    ]);

    await assert.rejects(
      () =>
        retryResourceJobImpl({
          payload: { jobId: "job-1" },
          actor: { uid: "tutor-2", role: "tutor" },
          deps: { db, clock },
        }),
      (err) => err.code === "permission-denied"
    );
  });
});

describe("recoverStuckResourceJobsImpl", () => {
  it("resets old processing jobs and kicks each affected tutor queue", async () => {
    const db = fakeQueueDb([
      {
        id: "stuck-1",
        createdBy: "tutor-1",
        status: "processing",
        startedAt: fromDate(new Date("2026-05-23T00:00:00.000Z")),
      },
      {
        id: "fresh-1",
        createdBy: "tutor-2",
        status: "processing",
        startedAt: fromDate(new Date("2026-05-23T00:07:00.000Z")),
      },
      {
        id: "pending-1",
        createdBy: "tutor-3",
        status: "pending",
        startedAt: null,
      },
    ]);
    const queued = [];

    const result = await recoverStuckResourceJobsImpl({
      deps: {
        db,
        clock: () => new Date("2026-05-23T00:09:00.000Z"),
        runQueueForTutor: async (createdBy) => {
          queued.push(createdBy);
          return [];
        },
      },
    });

    assert.deepEqual(result, {
      recoveredJobIds: ["stuck-1"],
      tutorsQueued: ["tutor-1"],
    });
    assert.equal(db.jobs[0].status, "pending");
    assert.equal(db.jobs[0].startedAt, null);
    assert.equal(db.jobs[0].error, "Job recovered after timeout");
    assert.equal(db.jobs[1].status, "processing");
    assert.deepEqual(queued, ["tutor-1"]);
  });
});
