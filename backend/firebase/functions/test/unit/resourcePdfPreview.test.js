"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createPdfPreviewConverter } = require("../../src/resources/pdfPreview");
const {
  generateResourcePreview,
  runGenerationPipeline,
  shouldGeneratePreview,
} = require("../../src/resources");

const clock = () => new Date("2026-07-03T00:00:00.000Z");

function fakeStorage(downloads = {}) {
  const saved = [];
  const deleted = [];
  return {
    saved,
    deleted,
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
            async delete() {
              deleted.push(path);
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

function worksheetJob(jobId = "job-1") {
  return {
    jobId,
    attemptId: "attempt-1",
    createdBy: "tutor-1",
    studentName: "Mei Tanaka",
    subject: "maths",
    year: 8,
    resourceType: "worksheet",
    model: "claude-sonnet-4-6",
    customPrompt: "",
    uploadedFilePath: null,
    uploadedFileName: null,
  };
}

const callAi = async () => ({
  parsed: worksheetJson,
  raw: JSON.stringify(worksheetJson),
});

describe("createPdfPreviewConverter", () => {
  it("returns null when no converter URL is configured", () => {
    assert.equal(createPdfPreviewConverter({ url: "" }), null);
    assert.equal(createPdfPreviewConverter({ url: "   " }), null);
    assert.equal(createPdfPreviewConverter(), null);
  });

  it("posts the DOCX to the Gotenberg convert route and returns the PDF", async () => {
    const requests = [];
    const converter = createPdfPreviewConverter({
      url: "https://converter.example.com/",
      getAuthHeader: async () => "Bearer test-token",
      fetchImpl: async (requestUrl, init) => {
        requests.push({ requestUrl, init });
        return {
          ok: true,
          async arrayBuffer() {
            // Copy out of Node's shared buffer pool so the ArrayBuffer holds
            // exactly the fake PDF bytes.
            const bytes = Buffer.from("%PDF-1.7 fake");
            return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
          },
        };
      },
    });

    const pdf = await converter.convert({
      docxBuffer: Buffer.from("PK docx bytes"),
      fileName: "Worksheet - Mei.docx",
    });

    assert.equal(requests.length, 1);
    assert.equal(
      requests[0].requestUrl,
      "https://converter.example.com/forms/libreoffice/convert"
    );
    assert.equal(requests[0].init.method, "POST");
    assert.equal(requests[0].init.headers.Authorization, "Bearer test-token");
    const file = requests[0].init.body.get("files");
    assert.equal(file.name, "Worksheet - Mei.docx");
    assert.equal(pdf.subarray(0, 4).toString("utf8"), "%PDF");
  });

  it("throws on a non-OK converter response", async () => {
    const converter = createPdfPreviewConverter({
      url: "https://converter.example.com",
      getAuthHeader: async () => null,
      fetchImpl: async () => ({
        ok: false,
        status: 503,
        async text() {
          return "overloaded";
        },
      }),
    });

    await assert.rejects(
      converter.convert({ docxBuffer: Buffer.from("PK"), fileName: "a.docx" }),
      /503.*overloaded/
    );
  });

  it("throws when the converter returns an empty document", async () => {
    const converter = createPdfPreviewConverter({
      url: "https://converter.example.com",
      getAuthHeader: async () => null,
      fetchImpl: async () => ({
        ok: true,
        async arrayBuffer() {
          return new ArrayBuffer(0);
        },
      }),
    });

    await assert.rejects(
      converter.convert({ docxBuffer: Buffer.from("PK"), fileName: "a.docx" }),
      /empty document/
    );
  });
});

// Preview generation deliberately does NOT happen inside the generation
// pipeline any more — conversion is an external HTTP call with a 60s timeout,
// and the generation function only gets 540s in total. It now runs afterwards,
// against the already-uploaded DOCX, via generateResourcePreview().
function fakeJobDb(job, { transactionError = null } = {}) {
  const updates = [];
  return {
    updates,
    current: job,
    collection() {
      return { doc: (id) => ({ id }) };
    },
    async runTransaction(fn) {
      if (transactionError) throw transactionError;
      return fn({
        get: async () => ({ exists: Boolean(this.current), data: () => this.current }),
        update: (_ref, patch) => {
          updates.push(patch);
          this.current = { ...this.current, ...patch };
        },
      });
    },
  };
}

describe("generation pipeline PDF previews", () => {
  it("leaves the preview to be generated after the job completes", async () => {
    const storage = fakeStorage();
    const result = await runGenerationPipeline(worksheetJob(), {
      storage,
      anthropicApiKey: "test-key",
      clock,
      callAi,
    });

    assert.equal(result.previewPath, null);
    assert.equal(storage.saved.length, 1, "only the DOCX should be saved inline");
    assert.equal(storage.saved[0].path, result.outputPath);
  });
});

describe("out-of-band PDF preview generation", () => {
  const outputPath = "resources/output/job-1/attempt-1/worksheet.docx";
  const pdfPath = "resources/output/job-1/attempt-1/worksheet.pdf";
  const completeJob = () => ({
    jobId: "job-1",
    status: "complete",
    outputPath,
    outputFileName: "worksheet.docx",
  });

  it("converts the stored DOCX and attaches the preview", async () => {
    const storage = fakeStorage({ [outputPath]: Buffer.from("PK docx bytes") });
    const db = fakeJobDb(completeJob());

    const result = await generateResourcePreview({
      job: completeJob(),
      db,
      storage,
      pdfConverter: {
        convert: async ({ docxBuffer }) => {
          assert.equal(docxBuffer.toString("utf8"), "PK docx bytes");
          return Buffer.from("%PDF-1.7 preview");
        },
      },
    });

    assert.equal(result, pdfPath);
    const pdfSave = storage.saved.find((item) => item.path === pdfPath);
    assert.ok(pdfSave, "expected the preview PDF to be saved");
    assert.equal(pdfSave.options.metadata.contentType, "application/pdf");
    assert.deepEqual(db.updates, [{ previewPath: pdfPath }]);
  });

  it("leaves the job complete without a preview when conversion fails", async () => {
    const storage = fakeStorage({ [outputPath]: Buffer.from("PK docx bytes") });
    const db = fakeJobDb(completeJob());

    const result = await generateResourcePreview({
      job: completeJob(),
      db,
      storage,
      pdfConverter: {
        convert: async () => {
          throw new Error("converter unreachable");
        },
      },
    });

    assert.equal(result, null);
    assert.equal(storage.saved.length, 0);
    assert.deepEqual(db.updates, []);
  });

  it("does nothing when no converter is configured", async () => {
    const storage = fakeStorage();
    const db = fakeJobDb(completeJob());

    assert.equal(
      await generateResourcePreview({ job: completeJob(), db, storage, pdfConverter: null }),
      null
    );
    assert.deepEqual(db.updates, []);
  });

  // A retry between conversion starting and finishing would otherwise point the
  // fresh job at the superseded attempt's PDF.
  it("discards the preview when the job was retried mid-conversion", async () => {
    const storage = fakeStorage({ [outputPath]: Buffer.from("PK docx bytes") });
    const db = fakeJobDb({
      ...completeJob(),
      outputPath: "resources/output/job-1/attempt-2/worksheet.docx",
    });

    const result = await generateResourcePreview({
      job: completeJob(),
      db,
      storage,
      pdfConverter: { convert: async () => Buffer.from("%PDF-1.7 preview") },
    });

    assert.equal(result, null);
    assert.deepEqual(db.updates, [], "must not attach a superseded preview");
    assert.deepEqual(storage.deleted, [pdfPath], "orphaned PDF should be removed");
  });

  // The trigger fires only on the transition into complete (see the "preview
  // trigger guard" tests below), so once a job is complete there is no later
  // update that will ever retry this. A transient Firestore error while
  // attaching the preview must not leave the just-uploaded PDF permanently
  // orphaned with nothing to clean it up.
  it("discards the uploaded PDF when attaching the preview throws", async () => {
    const storage = fakeStorage({ [outputPath]: Buffer.from("PK docx bytes") });
    const db = fakeJobDb(completeJob(), {
      transactionError: new Error("Firestore unavailable"),
    });

    const result = await generateResourcePreview({
      job: completeJob(),
      db,
      storage,
      pdfConverter: { convert: async () => Buffer.from("%PDF-1.7 preview") },
    });

    assert.equal(result, null);
    assert.deepEqual(db.updates, []);
    assert.deepEqual(storage.deleted, [pdfPath], "orphaned PDF should be removed");
  });
});

describe("preview trigger guard", () => {
  const complete = { status: "complete", outputPath: "a.docx" };

  it("fires on the transition into complete", () => {
    assert.equal(shouldGeneratePreview({ status: "processing" }, complete), true);
  });

  // The trigger's own write sets previewPath; without this it would re-enter.
  it("does not re-fire once a preview is attached", () => {
    assert.equal(
      shouldGeneratePreview(complete, { ...complete, previewPath: "a.pdf" }),
      false
    );
  });

  it("ignores updates to an already-complete job", () => {
    assert.equal(shouldGeneratePreview(complete, { ...complete, title: "edited" }), false);
  });

  it("ignores jobs that are not complete or have no output", () => {
    assert.equal(shouldGeneratePreview({ status: "pending" }, { status: "failed" }), false);
    assert.equal(
      shouldGeneratePreview({ status: "processing" }, { status: "complete" }),
      false
    );
  });
});
