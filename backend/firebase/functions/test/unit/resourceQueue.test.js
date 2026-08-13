"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  buildResourceJobDoc,
  buildDocxWithDiagramReliability,
  claimNextPendingJobForTutor,
  deleteResourceJobImpl,
  downloadUploadedContent,
  finalizeResourceJobAttempt,
  maxTokensForResourceJob,
  outputPathForJob,
  processResourceJobImpl,
  recoverStuckResourceJobsImpl,
  retryResourceJobImpl,
  runGenerationPipeline,
  runRepairPipeline,
  runQueueForTutor,
  uploadedFilesForJob,
  validateSubmitResourceJobPayload,
  validateDeleteResourceJobPayload,
  validateRetryResourceJobPayload,
} = require("../../src/resources");
const {
  attachDiagramContext,
} = require("../../src/resources/builder/diagrams");
const { fromDate } = require("../../src/shared/timestamps");

const clock = () => new Date("2026-05-23T00:00:00.000Z");

function fakeRef(id, jobs, updates, deletes = []) {
  return {
    __type: "ref",
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
    async delete() {
      deletes.push({ id });
      const index = jobs.findIndex((item) => item.id === id);
      if (index >= 0) jobs.splice(index, 1);
    },
  };
}

function fakeQueueDb(initialJobs) {
  const jobs = initialJobs.map((job) => ({ ...job }));
  const updates = [];
  const deletes = [];
  const adds = [];

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
      ref: fakeRef(job.id, jobs, updates, deletes),
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
    adds,
    jobs,
    updates,
    deletes,
    collection(name) {
      return {
        async add(data) {
          const id = `${name}-${adds.length + 1}`;
          adds.push({ collection: name, id, data });
          return { id };
        },
        where(field, op, value) {
          return fakeQuery(name).where(field, op, value);
        },
        doc(id) {
          return fakeRef(id, jobs, updates, deletes);
        },
      };
    },
    runTransaction(callback) {
      const tx = {
        async get(target) {
          if (target?.__type === "ref") {
            const job = jobs.find((item) => item.id === target.id);
            return {
              exists: Boolean(job),
              data: () => ({ ...job, jobId: target.id }),
            };
          }
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
  const deleted = [];
  const deletedPrefixes = [];
  return {
    saved,
    deleted,
    deletedPrefixes,
    bucket() {
      return {
        async deleteFiles({ prefix }) {
          deletedPrefixes.push(prefix);
        },
        file(path) {
          return {
            async download() {
              return [downloads[path] || Buffer.from("")];
            },
            async save(buffer, options) {
              saved.push({ path, buffer, options });
            },
            async delete() {
              deleted.push(path);
            },
          };
        },
      };
    },
  };
}

describe("resource marks visibility", () => {
  const basePayload = {
    studentId: "student-1",
    subject: "maths",
    year: 8,
    resourceType: "worksheet",
    answerMode: "none",
    customPrompt: "",
    uploadedFiles: [],
  };

  it("validates explicit choices and applies resource-type defaults", () => {
    assert.equal(
      validateSubmitResourceJobPayload({ ...basePayload, showMarks: true }).showMarks,
      true
    );
    assert.equal(validateSubmitResourceJobPayload(basePayload).showMarks, false);
    assert.equal(
      validateSubmitResourceJobPayload({
        ...basePayload,
        resourceType: "practice-paper",
      }).showMarks,
      true
    );
    assert.throws(
      () => validateSubmitResourceJobPayload({ ...basePayload, showMarks: "yes" }),
      /showMarks must be a boolean/
    );
  });

  it("stores the tutor's choice on the resource job", () => {
    const payload = validateSubmitResourceJobPayload({ ...basePayload, showMarks: true });
    const doc = buildResourceJobDoc({
      jobId: "job-1",
      payload,
      actor: { uid: "tutor-1", email: "tutor@example.com", claims: {} },
      actorUserData: { displayName: "Tutor" },
      studentData: { displayName: "Student" },
      clock,
    });

    assert.equal(doc.showMarks, true);
  });
});

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
      attemptIdFactory: () => "attempt-1",
    });

    assert.equal(claimed.jobId, "older");
    assert.equal(claimed.attemptId, "attempt-1");
    assert.equal(claimed.attemptCount, 1);
    assert.equal(db.jobs.find((job) => job.id === "older").status, "processing");
    assert.equal(db.updates[0].patch.error, null);
    assert.equal(db.updates[0].patch.startedAt.toDate().toISOString(), "2026-05-23T00:00:00.000Z");
    assert.equal(db.updates[0].patch.leaseExpiresAt.toDate().toISOString(), "2026-05-23T00:10:00.000Z");
  });
});

describe("resource attempt fencing", () => {
  it("finalizes only the attempt currently holding the job lease", async () => {
    const db = fakeQueueDb([
      {
        id: "job-1",
        createdBy: "tutor-1",
        status: "processing",
        attemptId: "attempt-current",
      },
    ]);

    const stale = await finalizeResourceJobAttempt({
      db,
      jobId: "job-1",
      attemptId: "attempt-stale",
      patch: { status: "complete" },
    });
    const current = await finalizeResourceJobAttempt({
      db,
      jobId: "job-1",
      attemptId: "attempt-current",
      patch: { status: "complete" },
    });

    assert.equal(stale, false);
    assert.equal(current, true);
    assert.equal(db.jobs[0].status, "complete");
    assert.equal(db.jobs[0].attemptId, null);
    assert.equal(db.jobs[0].lastAttemptId, "attempt-current");
    assert.equal(db.jobs[0].leaseExpiresAt, null);
  });

  it("ignores stale completion and removes its isolated output", async () => {
    const db = fakeQueueDb([
      { id: "job-1", createdBy: "tutor-1", status: "pending", createdAt: 1 },
    ]);
    const storage = fakeStorage();

    const outcomes = await runQueueForTutor("tutor-1", {
      db,
      storage,
      clock,
      attemptIdFactory: () => "attempt-stale",
      generationPipeline: async (job) => {
        db.jobs[0].status = "processing";
        db.jobs[0].attemptId = "attempt-new";
        return {
          outputPath: outputPathForJob(job.jobId, "worksheet.docx", job.attemptId),
          outputFileName: "worksheet.docx",
          generatedJson: "{}",
        };
      },
    });

    assert.deepEqual(outcomes, [{ jobId: "job-1", status: "superseded" }]);
    assert.equal(db.jobs[0].attemptId, "attempt-new");
    assert.deepEqual(storage.deleted, [
      "resources/output/job-1/attempt-stale_worksheet.docx",
    ]);
  });
});

describe("resource generation pipeline", () => {
  it("normalizes legacy and multi-file reference jobs", () => {
    assert.deepEqual(
      uploadedFilesForJob({
        uploadedFilePath: "resources/uploads/tutor-1/legacy.pdf",
        uploadedFileName: "legacy.pdf",
      }),
      [{ path: "resources/uploads/tutor-1/legacy.pdf", name: "legacy.pdf" }]
    );
    assert.deepEqual(
      uploadedFilesForJob({
        uploadedFiles: [
          { path: "resources/uploads/tutor-1/one.pdf", name: "one.pdf" },
          { path: "resources/uploads/tutor-1/two.docx", name: "two.docx" },
        ],
      }),
      [
        { path: "resources/uploads/tutor-1/one.pdf", name: "one.pdf" },
        { path: "resources/uploads/tutor-1/two.docx", name: "two.docx" },
      ]
    );
    assert.deepEqual(
      uploadedFilesForJob({
        uploadedFiles: [{ path: "", name: "" }],
        uploadedFilePath: "resources/uploads/tutor-1/fallback.pdf",
        uploadedFileName: "fallback.pdf",
      }),
      [{ path: "resources/uploads/tutor-1/fallback.pdf", name: "fallback.pdf" }]
    );
  });

  it("downloads and extracts every reference document in order", async () => {
    const storage = fakeStorage({
      "resources/uploads/tutor-1/one.pdf": Buffer.from("first"),
      "resources/uploads/tutor-1/two.docx": Buffer.from("second"),
    });

    const references = await downloadUploadedContent({
      job: {
        uploadedFiles: [
          { path: "resources/uploads/tutor-1/one.pdf", name: "one.pdf" },
          { path: "resources/uploads/tutor-1/two.docx", name: "two.docx" },
        ],
      },
      storage,
      extractText: async (buffer, { fileName }) => `${fileName}:${buffer.toString()}`,
    });

    assert.deepEqual(references, [
      { fileName: "one.pdf", content: "one.pdf:first" },
      { fileName: "two.docx", content: "two.docx:second" },
    ]);
  });

  it("normalizes renderer-specific error codes for diagram recovery", () => {
    const rendererError = Object.assign(new Error("Sharp failed"), {
      code: "SHARP_INPUT_ERROR",
    });
    const wrapped = attachDiagramContext(
      rendererError,
      { type: "rectangle" },
      { label: "Q2", required: false }
    );

    assert.equal(wrapped.code, "DIAGRAM_RENDER_ERROR");
    assert.equal(wrapped.rendererCode, "SHARP_INPUT_ERROR");
    assert.equal(wrapped.diagramLabel, "Q2");
    assert.equal(wrapped.diagramRequired, false);
  });

  it("omits failed optional diagrams and returns structured warnings", async () => {
    const parsed = {
      ...worksheetJson,
      questions: [
        {
          ...worksheetJson.questions[0],
          diagram: { type: "rectangle", dimensions: { width: 8, height: 4 } },
          diagramRequired: false,
        },
      ],
    };
    let buildCount = 0;

    const result = await buildDocxWithDiagramReliability({
      resourceType: "worksheet",
      parsed,
      options: {},
      buildDocx: async (_resourceType, resource) => {
        buildCount += 1;
        if (resource.questions[0].diagram) {
          const err = new Error("Rasterisation failed");
          err.code = "DIAGRAM_RENDER_ERROR";
          err.diagramSpec = resource.questions[0].diagram;
          err.diagramRequired = false;
          err.diagramLabel = "Q1";
          err.diagramType = "rectangle";
          throw err;
        }
        return Buffer.from("docx");
      },
    });

    assert.equal(buildCount, 2);
    assert.equal(result.buffer.toString(), "docx");
    assert.deepEqual(result.warnings, [
      {
        code: "OPTIONAL_DIAGRAM_OMITTED",
        diagramLabel: "Q1",
        diagramType: "rectangle",
        message: "Optional diagram for Q1 was omitted: Rasterisation failed",
      },
    ]);
    assert.equal(parsed.questions[0].diagram.type, "rectangle");
  });

  it("fails required diagrams with an actionable error", async () => {
    await assert.rejects(
      () =>
        buildDocxWithDiagramReliability({
          resourceType: "worksheet",
          parsed: worksheetJson,
          options: {},
          buildDocx: async (_resourceType, resource) => {
            const err = new Error("Label collision");
            err.code = "DIAGRAM_LAYOUT_ERROR";
            err.diagramSpec = resource.questions[0];
            err.diagramRequired = true;
            err.diagramLabel = "Q1";
            err.diagramType = "rectangle";
            throw err;
          },
        }),
      /Required diagram for Q1 could not be rendered: Label collision/
    );
  });

  // Live-generation finding (2026-07-03): a model-emitted diagram with
  // algebraic dimensions ("width": "2(x + 3)") failed build-time schema
  // validation and sank the whole topic booklet. Schema-invalid diagrams now
  // ride the same recovery path as render failures: optional ones are dropped
  // with a warning, required ones fail with diagram repair context. These
  // tests use the real builder end to end.
  it("drops a schema-invalid optional diagram and still builds the document", async () => {
    const parsed = {
      ...worksheetJson,
      questions: [
        {
          ...worksheetJson.questions[0],
          diagram: { type: "rectangle", dimensions: { width: "2(x + 3)", height: 4 } },
          diagramRequired: false,
        },
      ],
    };

    const result = await buildDocxWithDiagramReliability({
      resourceType: "worksheet",
      parsed,
      options: { studentName: "Test Student", subject: "maths", year: 8, answerMode: "none" },
      buildDocx: require("../../src/resources/builder").buildResourceDocx,
    });

    assert.ok(Buffer.isBuffer(result.buffer) && result.buffer.length > 0);
    assert.equal(result.warnings.length, 1);
    assert.equal(result.warnings[0].code, "OPTIONAL_DIAGRAM_OMITTED");
    assert.equal(result.warnings[0].diagramLabel, "Question 1");
    assert.match(result.warnings[0].message, /width must be a finite number/);
    // The caller's parsed JSON is untouched (the omission happens on a clone).
    assert.equal(parsed.questions[0].diagram.type, "rectangle");
  });

  it("fails the job when a schema-invalid diagram is required", async () => {
    const parsed = {
      ...worksheetJson,
      questions: [
        {
          ...worksheetJson.questions[0],
          diagram: { type: "rectangle", dimensions: { width: "2(x + 3)", height: 4 } },
          diagramRequired: true,
        },
      ],
    };

    await assert.rejects(
      () =>
        buildDocxWithDiagramReliability({
          resourceType: "worksheet",
          parsed,
          options: { studentName: "Test Student", subject: "maths", year: 8, answerMode: "none" },
          buildDocx: require("../../src/resources/builder").buildResourceDocx,
        }),
      (err) => {
        assert.match(err.message, /Required diagram for Question 1 could not be rendered/);
        // Tagged as a diagram error so the retry path uses diagram repair,
        // not full schema repair.
        assert.equal(err.code, "DIAGRAM_RENDER_ERROR");
        return true;
      }
    );
  });

  it("keeps plain validation errors (non-diagram) failing the build as schema errors", async () => {
    const parsed = {
      ...worksheetJson,
      questions: [{ ...worksheetJson.questions[0], marks: "two" }],
    };

    await assert.rejects(
      () =>
        buildDocxWithDiagramReliability({
          resourceType: "worksheet",
          parsed,
          options: { studentName: "Test Student", subject: "maths", year: 8, answerMode: "none" },
          buildDocx: require("../../src/resources/builder").buildResourceDocx,
        }),
      (err) => {
        assert.match(err.message, /marks must be a finite number/);
        assert.notEqual(err.code, "DIAGRAM_RENDER_ERROR");
        return true;
      }
    );
  });

  it("builds and uploads a worksheet DOCX from AI JSON", async () => {
    const storage = fakeStorage({
      "resources/uploads/tutor-1/reference.txt": Buffer.from("Reference topic: equations"),
    });
    const aiCalls = [];

    const result = await runGenerationPipeline(
      {
        jobId: "job-1",
        attemptId: "attempt-1",
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
    assert.equal(aiCalls[0].model, "claude-sonnet-4-6");
    assert.equal(aiCalls[0].maxTokens, 24000);
    assert.match(aiCalls[0].systemPrompt, /worksheet/);
    assert.match(aiCalls[0].userMessage, /Reference topic: equations/);
    assert.equal(
      result.outputFileName,
      "Worksheet - Mei Tanaka - Year 8 Maths - Linear Equations Worksheet - 2026-05-23.docx"
    );
    assert.equal(
      result.outputPath,
      outputPathForJob("job-1", result.outputFileName, "attempt-1")
    );
    assert.equal(storage.saved[0].path, result.outputPath);
    assert.equal(storage.saved[0].buffer.subarray(0, 2).toString("utf8"), "PK");
    assert.equal(
      storage.saved[0].options.metadata.contentType,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
  });

  it("builds a question-only worksheet without answer data", async () => {
    const storage = fakeStorage();
    const aiCalls = [];
    const questionOnlyJson = { ...worksheetJson };
    delete questionOnlyJson.answers;

    const result = await runGenerationPipeline(
      {
        jobId: "job-question-only",
        attemptId: "attempt-1",
        createdBy: "tutor-1",
        studentName: "Mei Tanaka",
        subject: "maths",
        year: 8,
        resourceType: "worksheet",
        answerMode: "none",
        model: "claude-sonnet-4-6",
        customPrompt: "",
        uploadedFilePath: null,
        uploadedFileName: null,
      },
      {
        storage,
        anthropicApiKey: "test-key",
        clock,
        callAi: async (payload) => {
          aiCalls.push(payload);
          return {
            parsed: questionOnlyJson,
            raw: JSON.stringify(questionOnlyJson),
          };
        },
      }
    );

    assert.match(aiCalls[0].systemPrompt, /Do not include answers or worked solutions/);
    assert.equal(storage.saved[0].path, result.outputPath);
    assert.equal(storage.saved[0].buffer.subarray(0, 2).toString("utf8"), "PK");
  });

  it("uses a larger output budget when working out is requested", async () => {
    const storage = fakeStorage();
    const aiCalls = [];
    const result = await runGenerationPipeline(
      {
        jobId: "job-1",
        attemptId: "attempt-1",
        createdBy: "tutor-1",
        studentName: "Mei Tanaka",
        subject: "maths",
        year: 8,
        resourceType: "worksheet",
        model: "claude-sonnet-4-6",
        customPrompt: "Show all steps.",
        uploadedFilePath: null,
        uploadedFileName: null,
        includeWorking: true,
      },
      {
        storage,
        anthropicApiKey: "test-key",
        clock,
        callAi: async (payload) => {
          aiCalls.push(payload);
          return {
            parsed: {
              ...worksheetJson,
              answers: [{ questionNumber: 1, partLabel: null, answer: "x = 4", workingOut: "2x + 3 = 11\n2x = 8\nx = 4" }],
            },
            raw: JSON.stringify(worksheetJson),
          };
        },
      }
    );

    assert.equal(aiCalls[0].maxTokens, 24000);
    assert.match(aiCalls[0].systemPrompt, /"workingOut": string/);
    assert.equal(
      result.outputPath,
      outputPathForJob("job-1", result.outputFileName, "attempt-1")
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
            model: "claude-sonnet-4-6",
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

describe("resource repair pipeline", () => {
  it("uses the working-output budget when repairing a working job", async () => {
    const aiCalls = [];
    await runRepairPipeline(
      {
        jobId: "job-1",
        createdBy: "tutor-1",
        studentName: "Mei Tanaka",
        subject: "maths",
        year: 8,
        resourceType: "worksheet",
        model: "claude-sonnet-4-6",
        customPrompt: "Show all steps.",
        uploadedFilePath: null,
        uploadedFileName: null,
        includeWorking: true,
        generatedJson: "{ title: 'Broken worksheet' }",
        error: "AI response was truncated",
      },
      {
        storage: fakeStorage(),
        anthropicApiKey: "test-key",
        clock,
        callAi: async (payload) => {
          aiCalls.push(payload);
          return { parsed: worksheetJson, raw: JSON.stringify(worksheetJson) };
        },
      }
    );

    assert.equal(aiCalls[0].maxTokens, 24000);
  });

  it("repairs stored model output without re-reading uploaded content", async () => {
    const storage = fakeStorage({
      "resources/uploads/tutor-1/reference.txt": Buffer.from("Do not read me"),
    });
    const aiCalls = [];

    const result = await runRepairPipeline(
      {
        jobId: "job-1",
        createdBy: "tutor-1",
        studentName: "Mei Tanaka",
        subject: "maths",
        year: 8,
        resourceType: "worksheet",
        model: "claude-sonnet-4-6",
        customPrompt: "Make it short.",
        uploadedFilePath: "resources/uploads/tutor-1/reference.txt",
        uploadedFileName: "reference.txt",
        generatedJson: "{ title: 'Broken worksheet' }",
        error: "AI response was not valid JSON",
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
    assert.equal(aiCalls[0].model, "claude-sonnet-4-6");
    assert.match(aiCalls[0].systemPrompt, /Repair mode/);
    assert.match(aiCalls[0].userMessage, /Previous model response/);
    assert.match(aiCalls[0].userMessage, /Broken worksheet/);
    assert.doesNotMatch(aiCalls[0].userMessage, /Do not read me/);
    assert.equal(result.outputPath, outputPathForJob("job-1", result.outputFileName));
    assert.equal(storage.saved.length, 1);
  });

  it("uses a focused prompt for required diagram repair", async () => {
    const aiCalls = [];
    await runRepairPipeline(
      {
        jobId: "job-1",
        studentName: "Mei Tanaka",
        subject: "maths",
        year: 8,
        resourceType: "worksheet",
        model: "claude-sonnet-4-6",
        generatedJson: JSON.stringify(worksheetJson),
        lastError: "Required diagram for Q1 could not be rendered",
        repairMode: "diagram",
      },
      {
        storage: fakeStorage(),
        anthropicApiKey: "test-key",
        clock,
        callAi: async (payload) => {
          aiCalls.push(payload);
          return { parsed: worksheetJson, raw: JSON.stringify(worksheetJson) };
        },
      }
    );

    assert.match(aiCalls[0].systemPrompt, /Diagram repair mode/);
    assert.match(aiCalls[0].systemPrompt, /Correct only the failing diagram object/);
    assert.match(aiCalls[0].userMessage, /Required diagram for Q1/);
  });

  it("requires stored generatedJson", async () => {
    await assert.rejects(
      () =>
        runRepairPipeline(
          {
            jobId: "job-1",
            resourceType: "worksheet",
            subject: "maths",
            year: 8,
            generatedJson: "",
          },
          { storage: fakeStorage(), anthropicApiKey: "test-key", clock }
        ),
      /repairable generated JSON/
    );
  });
});

describe("resource queue runner", () => {
  it("exposes the output-token budget decision", () => {
    assert.equal(maxTokensForResourceJob({ includeWorking: false }), 24000);
    assert.equal(maxTokensForResourceJob({ includeWorking: true }), 24000);
  });

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

  it("repairs fresh malformed model output before marking the job failed", async () => {
    const db = fakeQueueDb([
      { id: "job-1", createdBy: "tutor-1", status: "pending", createdAt: 1 },
    ]);
    const repaired = [];

    const outcomes = await runQueueForTutor("tutor-1", {
      db,
      clock,
      generationPipeline: async () => {
        const err = new Error("AI response was not valid JSON");
        err.rawAiText = "{ title: 'Broken' }";
        throw err;
      },
      repairPipeline: async (job) => {
        repaired.push({
          jobId: job.jobId,
          generatedJson: job.generatedJson,
          error: job.error,
        });
        return {
          outputPath: `resources/output/${job.jobId}/repaired.docx`,
          outputFileName: "repaired.docx",
          generatedJson: "{}",
        };
      },
    });

    assert.deepEqual(repaired, [
      {
        jobId: "job-1",
        generatedJson: "{ title: 'Broken' }",
        error: "AI response was not valid JSON",
      },
    ]);
    assert.equal(db.jobs[0].status, "complete");
    assert.equal(db.jobs[0].outputFileName, "repaired.docx");
    assert.equal(db.jobs[0].error, null);
    assert.deepEqual(outcomes, [{ jobId: "job-1", status: "complete", repaired: true }]);
  });

  it("selects diagram repair mode after a required diagram failure", async () => {
    const db = fakeQueueDb([
      { id: "job-1", createdBy: "tutor-1", status: "pending", createdAt: 1 },
    ]);
    const repairModes = [];

    const outcomes = await runQueueForTutor("tutor-1", {
      db,
      clock,
      generationPipeline: async () => {
        const err = new Error("Required diagram for Q1 could not be rendered");
        err.code = "DIAGRAM_LAYOUT_ERROR";
        err.rawAiText = JSON.stringify(worksheetJson);
        throw err;
      },
      repairPipeline: async (job) => {
        repairModes.push(job.repairMode);
        return {
          outputPath: `resources/output/${job.jobId}/repaired.docx`,
          outputFileName: "repaired.docx",
          generatedJson: "{}",
          warnings: [],
        };
      },
    });

    assert.deepEqual(repairModes, ["diagram"]);
    assert.equal(db.jobs[0].status, "complete");
    assert.deepEqual(outcomes, [{ jobId: "job-1", status: "complete", repaired: true }]);
  });

  it("repairs jobs with stored generatedJson before full regeneration", async () => {
    const db = fakeQueueDb([
      {
        id: "job-1",
        createdBy: "tutor-1",
        status: "pending",
        createdAt: 1,
        generatedJson: "{ title: 'Broken' }",
      },
    ]);
    const repaired = [];
    const regenerated = [];

    const outcomes = await runQueueForTutor("tutor-1", {
      db,
      clock,
      repairPipeline: async (job) => {
        repaired.push(job.jobId);
        return {
          outputPath: `resources/output/${job.jobId}/repaired.docx`,
          outputFileName: "repaired.docx",
          generatedJson: "{}",
        };
      },
      generationPipeline: async (job) => {
        regenerated.push(job.jobId);
        throw new Error("Should not regenerate");
      },
    });

    assert.deepEqual(repaired, ["job-1"]);
    assert.deepEqual(regenerated, []);
    assert.equal(db.jobs[0].status, "complete");
    assert.equal(db.jobs[0].outputFileName, "repaired.docx");
    assert.deepEqual(outcomes, [{ jobId: "job-1", status: "complete", repaired: true }]);
  });

  it("falls back to full regeneration when repair fails", async () => {
    const db = fakeQueueDb([
      {
        id: "job-1",
        createdBy: "tutor-1",
        status: "pending",
        createdAt: 1,
        generatedJson: "{ title: 'Broken' }",
      },
    ]);
    const repaired = [];
    const regenerated = [];

    const outcomes = await runQueueForTutor("tutor-1", {
      db,
      clock,
      repairPipeline: async (job) => {
        repaired.push(job.jobId);
        throw new Error("Repair failed");
      },
      generationPipeline: async (job) => {
        regenerated.push(job.jobId);
        return {
          outputPath: `resources/output/${job.jobId}/regenerated.docx`,
          outputFileName: "regenerated.docx",
          generatedJson: "{}",
        };
      },
    });

    assert.deepEqual(repaired, ["job-1"]);
    assert.deepEqual(regenerated, ["job-1"]);
    assert.equal(db.jobs[0].status, "complete");
    assert.equal(db.jobs[0].outputFileName, "regenerated.docx");
    assert.deepEqual(outcomes, [
      {
        jobId: "job-1",
        status: "complete",
        repaired: false,
        repairError: "Repair failed",
      },
    ]);
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
        errorCode: "DIAGRAM_LAYOUT_ERROR",
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
    assert.equal(db.jobs[0].errorCode, null);
    assert.equal(db.jobs[0].lastError, "Bad JSON");
    assert.equal(db.jobs[0].lastErrorCode, "DIAGRAM_LAYOUT_ERROR");
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

describe("deleteResourceJobImpl", () => {
  it("validates delete payloads", () => {
    assert.deepEqual(validateDeleteResourceJobPayload({ jobId: "job-1" }), {
      jobId: "job-1",
    });
    assert.throws(() => validateDeleteResourceJobPayload({}), /jobId/);
  });

  it("lets admins delete completed jobs, storage objects, and writes an audit log", async () => {
    const db = fakeQueueDb([
      {
        id: "job-1",
        createdBy: "tutor-1",
        studentId: "student-1",
        studentName: "Alice Able",
        status: "complete",
        resourceType: "worksheet",
        outputFileName: "worksheet.docx",
        outputPath: "resources/output/job-1/worksheet.docx",
        uploadedFiles: [
          {
            path: "resources/uploads/tutor-1/reference.pdf",
            name: "reference.pdf",
          },
          {
            path: "resources/uploads/tutor-1/scope.docx",
            name: "scope.docx",
          },
        ],
      },
    ]);
    const storage = fakeStorage();

    const result = await deleteResourceJobImpl({
      payload: { jobId: "job-1" },
      actor: {
        uid: "admin-1",
        email: "admin@example.com",
        role: "admin",
        claims: { role: "admin" },
      },
      deps: { db, storage, clock },
    });

    assert.equal(result.deleted, true);
    assert.deepEqual(db.deletes, [{ id: "job-1" }]);
    assert.equal(db.jobs.length, 0);
    assert.deepEqual(storage.deleted, [
      "resources/output/job-1/worksheet.docx",
      "resources/uploads/tutor-1/reference.pdf",
      "resources/uploads/tutor-1/scope.docx",
    ]);
    assert.equal(db.adds[0].collection, "adminAuditLogs");
    assert.equal(db.adds[0].data.action, "resource.delete");
    assert.equal(db.adds[0].data.targetId, "job-1");
    assert.equal(db.adds[0].data.actorUid, "admin-1");
  });

  it("allows admins to delete another tutor's failed jobs", async () => {
    const db = fakeQueueDb([
      { id: "job-1", createdBy: "tutor-1", status: "failed", error: "Bad JSON" },
    ]);
    const storage = fakeStorage();

    const result = await deleteResourceJobImpl({
      payload: { jobId: "job-1" },
      actor: { uid: "admin-1", role: "admin" },
      deps: { db, storage, clock },
    });

    assert.equal(result.deleted, true);
    assert.deepEqual(db.deletes, [{ id: "job-1" }]);
  });

  it("rejects deletes by another tutor", async () => {
    const db = fakeQueueDb([
      { id: "job-1", createdBy: "tutor-1", status: "complete" },
    ]);

    await assert.rejects(
      () =>
        deleteResourceJobImpl({
          payload: { jobId: "job-1" },
          actor: { uid: "tutor-2", role: "tutor" },
          deps: { db, storage: fakeStorage(), clock },
        }),
      (err) => err.code === "permission-denied"
    );
    assert.equal(db.deletes.length, 0);
  });

  it("rejects deletes by the tutor who created the job", async () => {
    const db = fakeQueueDb([
      { id: "job-1", createdBy: "tutor-1", status: "complete" },
    ]);

    await assert.rejects(
      () =>
        deleteResourceJobImpl({
          payload: { jobId: "job-1" },
          actor: { uid: "tutor-1", role: "tutor" },
          deps: { db, storage: fakeStorage(), clock },
        }),
      (err) => err.code === "permission-denied"
    );
    assert.equal(db.deletes.length, 0);
  });

  it("rejects active jobs", async () => {
    const db = fakeQueueDb([
      { id: "job-1", createdBy: "tutor-1", status: "processing" },
    ]);

    await assert.rejects(
      () =>
        deleteResourceJobImpl({
          payload: { jobId: "job-1" },
          actor: { uid: "admin-1", role: "admin" },
          deps: { db, storage: fakeStorage(), clock },
        }),
      (err) => err.code === "failed-precondition"
    );
    assert.equal(db.deletes.length, 0);
  });
});

describe("recoverStuckResourceJobsImpl", () => {
  it("resets old processing jobs and kicks each affected tutor queue", async () => {
    const db = fakeQueueDb([
      {
        id: "stuck-1",
        createdBy: "tutor-1",
        status: "processing",
        attemptId: "attempt-stuck",
        startedAt: fromDate(new Date("2026-05-23T00:00:00.000Z")),
        leaseExpiresAt: fromDate(new Date("2026-05-23T00:10:00.000Z")),
      },
      {
        id: "fresh-1",
        createdBy: "tutor-2",
        status: "processing",
        attemptId: "attempt-fresh",
        startedAt: fromDate(new Date("2026-05-23T00:07:00.000Z")),
        leaseExpiresAt: fromDate(new Date("2026-05-23T00:17:00.000Z")),
      },
      {
        id: "legacy-stuck",
        createdBy: "tutor-3",
        status: "processing",
        startedAt: fromDate(new Date("2026-05-22T23:59:00.000Z")),
      },
      {
        id: "pending-1",
        createdBy: "tutor-4",
        status: "pending",
        startedAt: null,
      },
    ]);
    const queued = [];
    const storage = fakeStorage();

    const result = await recoverStuckResourceJobsImpl({
      deps: {
        db,
        storage,
        clock: () => new Date("2026-05-23T00:11:00.000Z"),
        runQueueForTutor: async (createdBy) => {
          queued.push(createdBy);
          return [];
        },
      },
    });

    assert.deepEqual(result, {
      recoveredJobIds: ["stuck-1", "legacy-stuck"],
      tutorsQueued: ["tutor-1", "tutor-3"],
    });
    assert.equal(db.jobs[0].status, "pending");
    assert.equal(db.jobs[0].attemptId, null);
    assert.equal(db.jobs[0].lastAttemptId, "attempt-stuck");
    assert.equal(db.jobs[0].leaseExpiresAt, null);
    assert.equal(db.jobs[0].startedAt, null);
    assert.equal(db.jobs[0].error, "Job recovered after worker lease expired");
    assert.equal(db.jobs[1].status, "processing");
    assert.equal(db.jobs[2].status, "pending");
    assert.equal(db.jobs[2].attemptId, null);
    assert.deepEqual(storage.deletedPrefixes, [
      "resources/output/stuck-1/attempt-stuck_",
    ]);
    assert.deepEqual(queued, ["tutor-1", "tutor-3"]);
  });
});

describe("English stimulus sourcing in the generation pipeline", () => {
  const sourcedPoem = {
    ok: true,
    passage: "verse one\nverse two",
    selection: { title: "Real Poem", author: "Real Poet", type: "poem" },
    sourceName: "Wikisource",
    sourceUrl: "https://en.wikisource.org/wiki/x",
  };

  // Run an English generation with sourcing enabled and capture the resource
  // handed to the DOCX builder (after any sourced-stimulus overwrite). A
  // stub planner decides whether/what to source; sourceText fetches.
  async function runEnglish({ resourceType, parsed, sourceText, planStimulus, job = {}, storageFiles = {} }) {
    const storage = fakeStorage(storageFiles);
    let captured = null;
    await runGenerationPipeline(
      {
        jobId: "job-en",
        attemptId: "attempt-1",
        createdBy: "tutor-1",
        studentName: "Emily",
        subject: "english",
        year: 10,
        resourceType,
        model: "claude-sonnet-4-6",
        answerMode: "none",
        customPrompt: "growing up",
        uploadedFilePath: null,
        uploadedFileName: null,
        ...job,
      },
      {
        storage,
        anthropicApiKey: "test-key",
        clock,
        enablePdTextSourcing: true,
        planStimulus,
        sourceText,
        callAi: async () => ({ parsed, raw: JSON.stringify(parsed) }),
        buildDocx: async (_type, resource) => {
          captured = resource;
          return Buffer.from("PK");
        },
      }
    );
    return captured;
  }

  const planOnePoem = async () => ({ needed: true, texts: [{ title: "Real Poem", author: "Real Poet", type: "poem" }] });

  it("overwrites the model's stimulus with the verified text when the model presents one", async () => {
    const parsed = {
      title: "Reading Worksheet", subject: "english", year: 10, topic: "Growing up", totalMarks: 4,
      stimulus: [{ label: "Text 1", textType: "poem", title: "Model Title", author: "Tenacity Resources", source: null, body: "model invented" }],
      questions: [{ number: 1, stem: "Analyse Text 1.", marks: 4, workingLines: 4, parts: null }],
    };
    const captured = await runEnglish({ resourceType: "worksheet", parsed, planStimulus: planOnePoem, sourceText: async () => sourcedPoem });
    assert.equal(captured.stimulus.length, 1);
    assert.equal(captured.stimulus[0].body, "verse one\nverse two");
    assert.equal(captured.stimulus[0].title, "Real Poem");
  });

  it("fetches nothing and adds no stimulus when the planner says none is needed", async () => {
    const parsed = {
      title: "Apostrophes Worksheet", subject: "english", year: 10, topic: "Apostrophes", totalMarks: 4,
      questions: [{ number: 1, stem: "Add the apostrophe.", marks: 4, workingLines: 2, parts: null }],
    };
    let fetchCalls = 0;
    const captured = await runEnglish({
      resourceType: "worksheet",
      parsed,
      planStimulus: async () => ({ needed: false, texts: [] }),
      sourceText: async () => { fetchCalls += 1; return sourcedPoem; },
    });
    assert.equal(fetchCalls, 0);
    assert.ok(!captured.stimulus || captured.stimulus.length === 0);
  });

  it("still sources for a practice paper with uploaded reference files, showing them to the planner", async () => {
    // Regression: uploads (assessment notification, past paper, stimulus
    // booklet) used to disable sourcing entirely, so the model shipped
    // AI-invented stimulus texts. The planner must now run and see the uploads.
    const parsed = {
      title: "Practice Paper", subject: "english", year: 10, focus: "Growing up", totalMarks: 4, timeAllowed: "45 minutes",
      stimulus: [{ label: "Text 1", textType: "poem", title: "Invented", author: "Tenacity Resources", source: null, body: "model invented" }],
      sections: [{ title: "Section I", questions: [{ number: 1, stem: "Analyse Text 1.", marks: 4, workingLines: 4, parts: null }] }],
      markingGuide: [],
    };
    let plannerUploads = null;
    const captured = await runEnglish({
      resourceType: "practice-paper",
      parsed,
      job: {
        uploadedFiles: [{ path: "resources/uploads/tutor-1/booklet.txt", name: "booklet.txt" }],
      },
      storageFiles: {
        "resources/uploads/tutor-1/booklet.txt": Buffer.from("A poem about belonging, by A. Poet (2019)"),
      },
      planStimulus: async ({ uploadedContent }) => {
        plannerUploads = uploadedContent;
        return { needed: true, texts: [{ title: "Real Poem", author: "Real Poet", type: "poem" }] };
      },
      sourceText: async ({ selection }) => ({ ...sourcedPoem, selection }),
    });
    assert.equal(plannerUploads.length, 1);
    assert.equal(plannerUploads[0].fileName, "booklet.txt");
    assert.match(plannerUploads[0].content, /poem about belonging/);
    assert.equal(captured.stimulus.length, 1);
    assert.equal(captured.stimulus[0].body, "verse one\nverse two");
    assert.equal(captured.stimulus[0].title, "Real Poem");
  });

  it("keeps the model's stimulus when uploads exist and the planner stands down (set text)", async () => {
    const parsed = {
      title: "Practice Paper", subject: "english", year: 10, focus: "Set text", totalMarks: 4, timeAllowed: "45 minutes",
      stimulus: [{ label: "Text 1", textType: "prose", title: "Uploaded Extract", author: "Set Author", source: null, body: "from the uploaded text" }],
      sections: [{ title: "Section I", questions: [{ number: 1, stem: "Analyse Text 1.", marks: 4, workingLines: 4, parts: null }] }],
      markingGuide: [],
    };
    let fetchCalls = 0;
    const captured = await runEnglish({
      resourceType: "practice-paper",
      parsed,
      job: {
        uploadedFiles: [{ path: "resources/uploads/tutor-1/settext.txt", name: "settext.txt" }],
      },
      storageFiles: {
        "resources/uploads/tutor-1/settext.txt": Buffer.from("The set text students must study."),
      },
      planStimulus: async () => ({ needed: false, texts: [] }),
      sourceText: async () => { fetchCalls += 1; return sourcedPoem; },
    });
    assert.equal(fetchCalls, 0);
    assert.equal(captured.stimulus[0].title, "Uploaded Extract");
    assert.equal(captured.stimulus[0].body, "from the uploaded text");
  });

  it("always applies the sourced booklet for a practice paper, even if the draft omitted it", async () => {
    const parsed = {
      title: "Practice Paper", subject: "english", year: 10, focus: "Growing up", totalMarks: 4, timeAllowed: "45 minutes",
      sections: [{ title: "Section I", questions: [{ number: 1, stem: "Analyse Text 1.", marks: 4, workingLines: 4, parts: null }] }],
      markingGuide: [{ questionNumber: 1, suggestedResponse: "x", markingCriteria: ["y"], marks: 4 }],
    };
    const captured = await runEnglish({
      resourceType: "practice-paper",
      parsed,
      planStimulus: planOnePoem,
      sourceText: async ({ selection }) => ({ ...sourcedPoem, selection }),
    });
    assert.ok(Array.isArray(captured.stimulus) && captured.stimulus.length >= 1);
    assert.equal(captured.stimulus[0].body, "verse one\nverse two");
  });
});
