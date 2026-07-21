"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  extractTextFromBuffer,
  inferFileType,
  normalizeExtractedText,
} = require("../../src/resources/fileExtractor");
const { buildWorksheetDocx } = require("../../src/resources/builder/worksheet");

describe("resource file extractor", () => {
  it("infers supported file types from mime type or extension", () => {
    assert.equal(inferFileType({ mimeType: "application/pdf" }), "pdf");
    assert.equal(inferFileType({ fileName: "assessment.docx" }), "docx");
    assert.equal(inferFileType({ fileName: "notes.txt" }), "text");
    assert.equal(inferFileType({ fileName: "unknown.bin" }), "text");
  });

  it("normalises extracted text", () => {
    assert.equal(normalizeExtractedText(" One\r\nTwo\u0000 "), "One\nTwo");
  });

  it("extracts plain text buffers", async () => {
    const text = await extractTextFromBuffer(Buffer.from("Tutor notes\n"), {
      fileName: "notes.txt",
    });
    assert.equal(text, "Tutor notes");
  });

  it("routes PDF extraction through the PDF extractor", async () => {
    const text = await extractTextFromBuffer(
      Buffer.from("%PDF test"),
      { fileName: "past-paper.pdf" },
      { extractPdfText: async () => "PDF text" }
    );
    assert.equal(text, "PDF text");
  });

  it("extracts raw text from generated DOCX buffers", async () => {
    const docxBuffer = await buildWorksheetDocx({
      title: "Extraction Test",
      subject: "maths",
      year: 8,
      topic: "Equations",
      totalMarks: 1,
      questions: [
        {
          number: 1,
          stem: "Solve x + 1 = 3.",
          marks: 1,
          workingLines: 1,
          parts: null,
        },
      ],
      answers: [{ questionNumber: 1, partLabel: null, answer: "x = 2" }],
    });

    const text = await extractTextFromBuffer(docxBuffer, {
      fileName: "worksheet.docx",
    });

    assert.match(text, /Solve x \+ 1 = 3/);
    assert.match(text, /x = 2/);
  });
});
