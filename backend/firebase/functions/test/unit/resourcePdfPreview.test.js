"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createPdfPreviewConverter } = require("../../src/resources/pdfPreview");
const { outputPathForJob, runGenerationPipeline } = require("../../src/resources");

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

describe("generation pipeline PDF previews", () => {
  it("stores a sibling PDF and returns previewPath when the converter succeeds", async () => {
    const storage = fakeStorage();
    const result = await runGenerationPipeline(worksheetJob(), {
      storage,
      anthropicApiKey: "test-key",
      clock,
      callAi,
      pdfConverter: {
        convert: async ({ docxBuffer }) => {
          assert.equal(docxBuffer.subarray(0, 2).toString("utf8"), "PK");
          return Buffer.from("%PDF-1.7 preview");
        },
      },
    });

    assert.equal(
      result.previewPath,
      outputPathForJob("job-1", result.outputFileName, "attempt-1").replace(
        /\.docx$/,
        ".pdf"
      )
    );
    const pdfSave = storage.saved.find((item) => item.path === result.previewPath);
    assert.ok(pdfSave, "expected the preview PDF to be saved to storage");
    assert.equal(pdfSave.options.metadata.contentType, "application/pdf");
    assert.equal(pdfSave.buffer.subarray(0, 4).toString("utf8"), "%PDF");
  });

  it("completes without a preview when conversion fails", async () => {
    const storage = fakeStorage();
    const result = await runGenerationPipeline(worksheetJob("job-2"), {
      storage,
      anthropicApiKey: "test-key",
      clock,
      callAi,
      pdfConverter: {
        convert: async () => {
          throw new Error("converter unreachable");
        },
      },
    });

    assert.equal(result.previewPath, null);
    assert.equal(storage.saved.length, 1, "only the DOCX should be saved");
    assert.equal(storage.saved[0].path, result.outputPath);
  });

  it("returns previewPath null when no converter is configured", async () => {
    const storage = fakeStorage();
    const result = await runGenerationPipeline(worksheetJob("job-3"), {
      storage,
      anthropicApiKey: "test-key",
      clock,
      callAi,
    });

    assert.equal(result.previewPath, null);
    assert.equal(storage.saved.length, 1);
  });
});
