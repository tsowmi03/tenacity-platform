"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { HttpsError } = require("firebase-functions/v2/https");
const {
  assertUploadedFilesAllowed,
  collectRevisionQuestions,
  createResourceJobImpl,
  createResourceRevisionImpl,
  detectRevisionChanges,
  isRevisionJob,
  revisionDriftWarnings,
  revisionPayloadFromSourceJob,
  runRevisionPipeline,
  validateSubmitResourceRevisionPayload,
} = require("../../src/resources");

const clock = () => new Date("2026-08-26T00:00:00Z");

const TUTOR = { uid: "tutor-1", role: "tutor", email: "t@example.com" };
const OTHER_TUTOR = { uid: "tutor-2", role: "tutor", email: "t2@example.com" };
const ADMIN = { uid: "admin-1", role: "admin", email: "a@example.com" };

function snap(data) {
  return { exists: Boolean(data), data: () => data };
}

function completedJob(overrides = {}) {
  return {
    jobId: "job-original",
    createdBy: "tutor-1",
    status: "complete",
    studentId: "student-1",
    subject: "maths",
    year: 8,
    resourceType: "worksheet",
    answerMode: "answers",
    showMarks: false,
    customPrompt: "Focus on factorising",
    modelChoice: "claude-opus-5",
    model: "claude-opus-5",
    outputPath: "resources/output/job-original/out.docx",
    generatedJson: JSON.stringify({
      title: "Factorising",
      questions: [
        { number: 1, stem: "Factorise x^2 + 5x + 6", type: "short", marks: 2 },
        { number: 2, stem: "Factorise x^2 - 9", type: "short", marks: 2 },
      ],
    }),
    uploadedFiles: [{ path: "resources/uploads/tutor-1/paper.pdf", name: "paper.pdf" }],
    uploadedFilePath: "resources/uploads/tutor-1/paper.pdf",
    uploadedFileName: "paper.pdf",
    ...overrides,
  };
}

// A db stub whose resourceJobs reads resolve from `jobs`, and which records
// every document written so a test can inspect the job that was created.
function fakeDb({ jobs = {}, student = { firstName: "Ada", lastName: "Lovelace" }, user = null } = {}) {
  const writes = [];
  let created = 0;
  return {
    writes,
    collection(name) {
      return {
        doc(id) {
          const docId = id || `generated-${++created}`;
          const ref = {
            id: docId,
            async get() {
              if (name === "students") return snap(student);
              if (name === "users") return snap(user);
              if (name === "resourceJobs") return snap(jobs[docId] || null);
              return snap(null);
            },
            async set(data) {
              writes.push({ path: `${name}/${docId}`, data });
            },
          };
          return ref;
        },
      };
    },
  };
}

describe("validateSubmitResourceRevisionPayload", () => {
  it("requires a source job and a non-empty instruction", () => {
    assert.deepEqual(
      validateSubmitResourceRevisionPayload({
        sourceJobId: "job-1",
        instruction: "Make Q3 harder",
      }),
      { sourceJobId: "job-1", instruction: "Make Q3 harder" }
    );
    assert.throws(
      () => validateSubmitResourceRevisionPayload({ sourceJobId: "job-1", instruction: "" }),
      /instruction/
    );
    assert.throws(
      () => validateSubmitResourceRevisionPayload({ instruction: "Make Q3 harder" }),
      /sourceJobId/
    );
  });
});

describe("assertUploadedFilesAllowed", () => {
  const foreign = [{ path: "resources/uploads/tutor-1/paper.pdf", name: "paper.pdf" }];

  it("rejects another user's uploads on a generation built from scratch", () => {
    assert.throws(
      () => assertUploadedFilesAllowed({ uploadedFiles: foreign, actor: ADMIN, sourceJob: null }),
      (err) => err instanceof HttpsError && err.code === "permission-denied"
    );
  });

  it("allows a replay to carry the source job's own files across owners", () => {
    assert.doesNotThrow(() =>
      assertUploadedFilesAllowed({
        uploadedFiles: foreign,
        actor: ADMIN,
        sourceJob: completedJob(),
      })
    );
  });

  it("still rejects a foreign path the source job did not have", () => {
    assert.throws(
      () =>
        assertUploadedFilesAllowed({
          uploadedFiles: [{ path: "resources/uploads/tutor-9/secret.pdf", name: "secret.pdf" }],
          actor: ADMIN,
          sourceJob: completedJob(),
        }),
      (err) => err instanceof HttpsError && err.code === "permission-denied"
    );
  });

  it("allows a caller's own uploads with no source job", () => {
    assert.doesNotThrow(() =>
      assertUploadedFilesAllowed({
        uploadedFiles: [{ path: "resources/uploads/admin-1/mine.pdf", name: "mine.pdf" }],
        actor: ADMIN,
        sourceJob: null,
      })
    );
  });
});

describe("createResourceJobImpl with a source job", () => {
  const payload = {
    studentId: "student-1",
    subject: "maths",
    year: 8,
    resourceType: "worksheet",
    modelChoice: "claude-opus-5",
    answerMode: "answers",
    showMarks: false,
    includeWorking: false,
    customPrompt: "",
    uploadedFiles: [{ path: "resources/uploads/tutor-1/paper.pdf", name: "paper.pdf" }],
    uploadedFilePath: "resources/uploads/tutor-1/paper.pdf",
    uploadedFileName: "paper.pdf",
  };

  it("lets an admin regenerate another tutor's resource that has reference files", async () => {
    const db = fakeDb({ jobs: { "job-original": completedJob() } });
    const out = await createResourceJobImpl({
      payload: { ...payload, sourceJobId: "job-original" },
      actor: ADMIN,
      deps: { db, clock },
    });

    assert.ok(out.jobId);
    const written = db.writes.at(-1).data;
    assert.equal(written.derivation, "edited-inputs");
    assert.equal(written.derivedFromJobId, "job-original");
    assert.equal(written.lineageRootId, "job-original");
    assert.deepEqual(written.uploadedFiles, payload.uploadedFiles);
  });

  it("refuses a tutor building on someone else's resource", async () => {
    const db = fakeDb({ jobs: { "job-original": completedJob() } });
    await assert.rejects(
      createResourceJobImpl({
        payload: { ...payload, sourceJobId: "job-original" },
        actor: OTHER_TUTOR,
        deps: { db, clock },
      }),
      (err) => err instanceof HttpsError && err.code === "permission-denied"
    );
  });

  it("still refuses a foreign upload path with no source job", async () => {
    const db = fakeDb();
    await assert.rejects(
      createResourceJobImpl({ payload, actor: ADMIN, deps: { db, clock } }),
      (err) => err instanceof HttpsError && err.code === "permission-denied"
    );
  });

  it("keeps the lineage root when building on an existing revision", async () => {
    const db = fakeDb({
      jobs: {
        "job-v2": completedJob({
          jobId: "job-v2",
          lineageRootId: "job-original",
          derivation: "revision",
          derivedFromJobId: "job-original",
        }),
      },
    });
    await createResourceJobImpl({
      payload: { ...payload, sourceJobId: "job-v2" },
      actor: TUTOR,
      deps: { db, clock },
    });
    assert.equal(db.writes.at(-1).data.lineageRootId, "job-original");
  });

  it("marks a generation built from scratch as its own lineage root", async () => {
    const db = fakeDb();
    await createResourceJobImpl({
      payload: { ...payload, uploadedFiles: [], uploadedFilePath: null, uploadedFileName: null },
      actor: TUTOR,
      deps: { db, clock },
    });
    const written = db.writes.at(-1).data;
    assert.equal(written.lineageRootId, written.jobId);
    assert.equal(written.derivation, null);
    assert.equal(written.derivedFromJobId, null);
  });
});

describe("createResourceRevisionImpl", () => {
  it("creates a revision that inherits the original's settings and files", async () => {
    const db = fakeDb({ jobs: { "job-original": completedJob() } });
    const out = await createResourceRevisionImpl({
      payload: { sourceJobId: "job-original", instruction: "  Replace Q2 with a harder one  " },
      actor: TUTOR,
      deps: { db, clock },
    });

    assert.ok(out.jobId);
    const written = db.writes.at(-1).data;
    assert.equal(written.derivation, "revision");
    assert.equal(written.derivedFromJobId, "job-original");
    assert.equal(written.lineageRootId, "job-original");
    assert.equal(written.revisionInstruction, "Replace Q2 with a harder one");
    assert.equal(written.status, "pending");
    assert.equal(written.answerMode, "answers");
    assert.equal(written.customPrompt, "Focus on factorising");
    assert.deepEqual(written.uploadedFiles, [
      { path: "resources/uploads/tutor-1/paper.pdf", name: "paper.pdf" },
    ]);
    // The source JSON must not be copied onto the revision: generatedJson on an
    // unfinished job means "repair this", and would divert the revision to the
    // repair pipeline.
    assert.equal(written.generatedJson, null);
  });

  it("lets an admin revise another tutor's resource", async () => {
    const db = fakeDb({ jobs: { "job-original": completedJob() } });
    await assert.doesNotReject(
      createResourceRevisionImpl({
        payload: { sourceJobId: "job-original", instruction: "Drop the diagram" },
        actor: ADMIN,
        deps: { db, clock },
      })
    );
  });

  it("refuses a tutor revising someone else's resource", async () => {
    const db = fakeDb({ jobs: { "job-original": completedJob() } });
    await assert.rejects(
      createResourceRevisionImpl({
        payload: { sourceJobId: "job-original", instruction: "Drop the diagram" },
        actor: OTHER_TUTOR,
        deps: { db, clock },
      }),
      (err) => err instanceof HttpsError && err.code === "permission-denied"
    );
  });

  it("refuses to revise a job that has not finished", async () => {
    const db = fakeDb({ jobs: { "job-original": completedJob({ status: "failed" }) } });
    await assert.rejects(
      createResourceRevisionImpl({
        payload: { sourceJobId: "job-original", instruction: "Fix Q1" },
        actor: TUTOR,
        deps: { db, clock },
      }),
      (err) => err instanceof HttpsError && err.code === "failed-precondition"
    );
  });

  it("refuses to revise a job with no stored generation", async () => {
    const db = fakeDb({ jobs: { "job-original": completedJob({ generatedJson: null }) } });
    await assert.rejects(
      createResourceRevisionImpl({
        payload: { sourceJobId: "job-original", instruction: "Fix Q1" },
        actor: TUTOR,
        deps: { db, clock },
      }),
      (err) => err instanceof HttpsError && err.code === "failed-precondition"
    );
  });

  it("reports a missing source job", async () => {
    const db = fakeDb({ jobs: {} });
    await assert.rejects(
      createResourceRevisionImpl({
        payload: { sourceJobId: "gone", instruction: "Fix Q1" },
        actor: TUTOR,
        deps: { db, clock },
      }),
      (err) => err instanceof HttpsError && err.code === "not-found"
    );
  });
});

describe("revisionPayloadFromSourceJob", () => {
  it("copies generation settings rather than accepting them from the caller", () => {
    const out = revisionPayloadFromSourceJob(
      completedJob({ answerMode: "worked", showMarks: true, year: 9 })
    );
    assert.equal(out.answerMode, "worked");
    assert.equal(out.includeWorking, true);
    assert.equal(out.showMarks, true);
    assert.equal(out.year, 9);
    assert.equal(out.resourceType, "worksheet");
    assert.equal(out.uploadedFilePath, "resources/uploads/tutor-1/paper.pdf");
  });

  it("defaults showMarks by resource type when the original never stored it", () => {
    assert.equal(
      revisionPayloadFromSourceJob(
        completedJob({ showMarks: undefined, resourceType: "practice-paper" })
      ).showMarks,
      true
    );
  });
});

describe("isRevisionJob", () => {
  it("needs both the marker and the source", () => {
    assert.equal(isRevisionJob({ derivation: "revision", derivedFromJobId: "job-1" }), true);
    assert.equal(isRevisionJob({ derivation: "revision" }), false);
    assert.equal(isRevisionJob({ derivation: "edited-inputs", derivedFromJobId: "job-1" }), false);
    assert.equal(isRevisionJob({}), false);
    assert.equal(isRevisionJob(null), false);
  });
});

describe("collectRevisionQuestions", () => {
  it("finds questions wherever the schema nests them", () => {
    const found = collectRevisionQuestions({
      sections: [
        { title: "A", questions: [{ number: 1, stem: "one", marks: 1 }] },
        { title: "B", questions: [{ number: 2, stem: "two", marks: 1 }] },
      ],
    });
    assert.deepEqual(
      [...found.values()].map((item) => item.label),
      ["Q1", "Q2"]
    );
  });

  it("folds parts into their parent question", () => {
    const found = collectRevisionQuestions({
      questions: [
        {
          number: 1,
          stem: "one",
          marks: 3,
          parts: [{ label: "a", stem: "part a", marks: 1 }],
        },
      ],
    });
    assert.equal(found.size, 1);
  });

  it("fingerprints independently of key order", () => {
    const a = collectRevisionQuestions({ questions: [{ number: 1, stem: "one", marks: 1 }] });
    const b = collectRevisionQuestions({ questions: [{ marks: 1, stem: "one", number: 1 }] });
    assert.equal([...a.values()][0].fingerprint, [...b.values()][0].fingerprint);
  });
});

describe("detectRevisionChanges", () => {
  const before = JSON.stringify({
    title: "Factorising",
    questions: [
      { number: 1, stem: "one", marks: 1 },
      { number: 2, stem: "two", marks: 1 },
      { number: 3, stem: "three", marks: 1 },
    ],
  });

  it("reports the single question a targeted revision changed", () => {
    const changes = detectRevisionChanges(before, {
      title: "Factorising",
      questions: [
        { number: 1, stem: "one", marks: 1 },
        { number: 2, stem: "two rewritten", marks: 1 },
        { number: 3, stem: "three", marks: 1 },
      ],
    });
    assert.deepEqual(changes.changed, ["Q2"]);
    assert.equal(changes.total, 1);
    assert.match(changes.summary, /changed Q2/);
  });

  it("returns nothing when the revision changed nothing", () => {
    assert.equal(detectRevisionChanges(before, JSON.parse(before)), null);
  });

  it("reports added and removed questions", () => {
    const changes = detectRevisionChanges(before, {
      title: "Factorising",
      questions: [
        { number: 1, stem: "one", marks: 1 },
        { number: 2, stem: "two", marks: 1 },
      ],
    });
    assert.deepEqual(changes.removed, ["Q3"]);
  });

  it("notices a changed title", () => {
    const changes = detectRevisionChanges(before, {
      ...JSON.parse(before),
      title: "Something else",
    });
    assert.equal(changes.titleChanged, true);
  });

  it("survives a source generation that is not parseable JSON", () => {
    assert.equal(detectRevisionChanges("not json at all", { title: "x" }), null);
  });
});

describe("revisionDriftWarnings", () => {
  it("stays quiet for a revision that changed one question", () => {
    assert.deepEqual(revisionDriftWarnings({ total: 1, summary: "x" }), []);
    assert.deepEqual(revisionDriftWarnings(null), []);
  });

  it("warns once a revision has moved more than one question", () => {
    const [warning] = revisionDriftWarnings({
      total: 3,
      summary: "This revision changed Q1, Q2, Q3.",
    });
    assert.equal(warning.code, "REVISION_CHANGED_MULTIPLE");
    assert.equal(warning.changedCount, 3);
    assert.match(warning.message, /did not ask/);
  });
});

describe("runRevisionPipeline", () => {
  const revisionJob = {
    jobId: "job-v2",
    createdBy: "tutor-1",
    derivation: "revision",
    derivedFromJobId: "job-original",
    revisionInstruction: "Replace Q2 with a harder one",
    subject: "maths",
    year: 8,
    resourceType: "worksheet",
    answerMode: "answers",
    showMarks: false,
    studentName: "Ada Lovelace",
    model: "claude-opus-5",
    modelChoice: "claude-opus-5",
    attemptId: "attempt-1",
    uploadedFiles: [{ path: "resources/uploads/tutor-1/paper.pdf", name: "paper.pdf" }],
  };

  function pipelineDeps({ aiResponse, jobs = { "job-original": completedJob() } } = {}) {
    const calls = [];
    return {
      calls,
      deps: {
        db: fakeDb({ jobs }),
        storage: {
          bucket: () => ({
            file: () => ({
              async download() {
                return [Buffer.from("past paper text")];
              },
              async save() {},
            }),
          }),
        },
        clock,
        extractText: async () => "past paper text",
        buildDocx: async () => Buffer.from("docx"),
        callAi: async (args) => {
          calls.push(args);
          return aiResponse;
        },
      },
    };
  }

  const revised = {
    title: "Factorising",
    questions: [
      { number: 1, stem: "Factorise x^2 + 5x + 6", type: "short", marks: 2 },
      { number: 2, stem: "Factorise 6x^2 + 11x - 35", type: "short", marks: 3 },
    ],
  };

  it("prompts with the instruction, the source resource and its reference text", async () => {
    const { calls, deps } = pipelineDeps({
      aiResponse: { parsed: revised, raw: JSON.stringify(revised) },
    });
    await runRevisionPipeline(revisionJob, deps);

    assert.equal(calls.length, 1);
    assert.match(calls[0].systemPrompt, /Revision mode/);
    assert.match(calls[0].systemPrompt, /only that change/);
    assert.match(calls[0].userMessage, /Replace Q2 with a harder one/);
    assert.match(calls[0].userMessage, /Factorise x\^2 - 9/);
    assert.match(calls[0].userMessage, /past paper text/);
  });

  it("records what changed and stays quiet about a single-question edit", async () => {
    const { deps } = pipelineDeps({
      aiResponse: { parsed: revised, raw: JSON.stringify(revised) },
    });
    const result = await runRevisionPipeline(revisionJob, deps);

    assert.deepEqual(result.revisionChanges.changed, ["Q2"]);
    assert.deepEqual(result.warnings, []);
    assert.ok(result.outputPath.startsWith("resources/output/job-v2/"));
  });

  it("warns when the model rewrote more than it was asked to", async () => {
    const drifted = {
      title: "Factorising",
      questions: [
        { number: 1, stem: "completely different", type: "short", marks: 5 },
        { number: 2, stem: "also different", type: "short", marks: 5 },
      ],
    };
    const { deps } = pipelineDeps({
      aiResponse: { parsed: drifted, raw: JSON.stringify(drifted) },
    });
    const result = await runRevisionPipeline(revisionJob, deps);

    assert.equal(result.warnings[0].code, "REVISION_CHANGED_MULTIPLE");
    assert.equal(result.revisionChanges.total, 2);
  });

  it("fails when the resource being revised has gone", async () => {
    const { deps } = pipelineDeps({
      aiResponse: { parsed: revised, raw: JSON.stringify(revised) },
      jobs: {},
    });
    await assert.rejects(
      runRevisionPipeline(revisionJob, deps),
      /no longer exists/
    );
  });

  it("refuses a revision job with no source", async () => {
    const { deps } = pipelineDeps({
      aiResponse: { parsed: revised, raw: JSON.stringify(revised) },
    });
    await assert.rejects(
      runRevisionPipeline({ ...revisionJob, derivedFromJobId: null }, deps),
      /missing the resource it revises/
    );
  });
});
