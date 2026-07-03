"use strict";

// Regression tests for inline math-span detection in maths documents
// (builder/shared.js). Found by rendering fixture DOCX files to PDF: the
// term-operator-term span regex used to (a) swallow the first letter of the
// word after an expression ("= 0 by factorising" became "= 0 b" + "y
// factorising") and (b) typeset prose joined by an operator ("Diagnostic Test
// - for tutor use", "the ± gives") as math. These tests assert on the raw
// word/document.xml, because stripping tags re-joins the severed letters and
// hides the bug from plain-text assertions.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const zlib = require("node:zlib");

const { buildResourceDocx } = require("../../src/resources/builder");

function extractZipEntry(buffer, name) {
  const eocdSig = 0x06054b50;
  let eocdOffset = -1;
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === eocdSig) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("ZIP end of central directory not found");

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  let cursor = buffer.readUInt32LE(eocdOffset + 16);
  for (let i = 0; i < entryCount; i += 1) {
    assert.equal(buffer.readUInt32LE(cursor), 0x02014b50);
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const entryName = buffer
      .subarray(cursor + 46, cursor + 46 + fileNameLength)
      .toString("utf8");
    if (entryName === name) {
      const fileNameLen = buffer.readUInt16LE(localHeaderOffset + 26);
      const extraLen = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataOffset = localHeaderOffset + 30 + fileNameLen + extraLen;
      const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
      if (method === 0) return compressed;
      if (method === 8) return zlib.inflateRawSync(compressed);
      throw new Error(`Unsupported ZIP compression method: ${method}`);
    }
    cursor += 46 + fileNameLength + extraLength + commentLength;
  }
  throw new Error(`ZIP entry not found: ${name}`);
}

async function documentXmlForWorksheet(stems) {
  const buffer = await buildResourceDocx(
    "worksheet",
    {
      title: "Span Regression Worksheet",
      subject: "maths",
      year: 9,
      topic: "Algebra",
      totalMarks: stems.length,
      questions: stems.map((stem, i) => ({
        number: i + 1,
        stem,
        marks: 1,
        workingLines: 1,
        parts: null,
        diagramRequired: false,
      })),
      answers: stems.map((_, i) => ({
        questionNumber: i + 1,
        partLabel: null,
        answer: "x = 2 or x = 3",
      })),
    },
    { studentName: "Test Student", subject: "maths", year: 9, answerMode: "included" }
  );
  return extractZipEntry(buffer, "word/document.xml").toString("utf8");
}

// Matches `needle` inside a single plain-text node, i.e. not split across a
// math run boundary.
function inOneTextNode(needle) {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`<w:t[^>]*>[^<]*${escaped}`);
}

describe("maths inline span detection", () => {
  it("does not bite the first letter off the word after an expression", async () => {
    const xml = await documentXmlForWorksheet([
      "Solve x^2 - 5x + 6 = 0 by factorising.",
      "Rewrite x^2 - 5x + 6 as a product of two factors.",
    ]);

    assert.match(xml, inOneTextNode("by factorising"));
    assert.match(xml, inOneTextNode("as a product"));
    // The equations themselves must still be typeset as math.
    assert.match(xml, /<m:oMath>/);
    assert.match(xml, /<m:sSup>/); // x^2 superscript
  });

  it("keeps connective words between expressions out of math runs", async () => {
    const xml = await documentXmlForWorksheet([
      "If a product ab = 0 then a = 0 or b = 0.",
    ]);

    assert.match(xml, inOneTextNode(" then "));
    assert.match(xml, inOneTextNode(" or "));
    // Two-letter products like ab are algebra and stay math.
    assert.match(xml, /<m:t[^>]*>[^<]*ab/);
  });

  it("leaves prose that straddles an operator as plain text", async () => {
    const xml = await documentXmlForWorksheet([
      "Forgetting the ± gives only one root.",
    ]);

    assert.match(xml, inOneTextNode("the ± gives only one root"));
  });

  it("still finds a genuine expression after rejected prose in the same sentence", async () => {
    const xml = await documentXmlForWorksheet([
      "Remember the ± sign matters when x = 2 is squared.",
    ]);

    assert.match(xml, inOneTextNode("sign matters"));
    assert.match(xml, /<m:t[^>]*>[^<]*x\s*=\s*2/);
  });

  it("keeps a trailing lone variable inside the expression", async () => {
    const xml = await documentXmlForWorksheet(["Sketch y = 5 x"]);

    assert.match(xml, /<m:t[^>]*>[^<]*5 x/);
  });

  it("renders the diagnostic tutor-use label as plain text", async () => {
    const buffer = await buildResourceDocx(
      "diagnostic-test",
      {
        title: "Span Regression Diagnostic",
        subject: "maths",
        year: 9,
        topics: ["Algebra"],
        totalMarks: 1,
        instructions: "Answer all questions.",
        questions: [
          {
            number: 1,
            stem: "Solve x + 1 = 2.",
            marks: 1,
            workingLines: 1,
            parts: null,
            subTopic: "Algebra",
            type: "calculation",
            options: null,
          },
        ],
        answers: [{ questionNumber: 1, subTopic: "Algebra", answer: "x = 1", note: null }],
      },
      { studentName: "Test Student", subject: "maths", year: 9, answerMode: "included" }
    );
    const xml = extractZipEntry(buffer, "word/document.xml").toString("utf8");

    assert.match(xml, inOneTextNode("Diagnostic Test - for tutor use"));
  });
});
