"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const zlib = require("node:zlib");

const { buildResourceDocx } = require("../../src/resources/builder");
const { buildWorksheetDocx } = require("../../src/resources/builder/worksheet");

// --- Minimal DOCX (ZIP) reader, mirroring resourceWorksheetBuilder.test.js ---
function zipEntries(buffer) {
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
  const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = new Map();
  let cursor = centralDirOffset;

  for (let i = 0; i < entryCount; i += 1) {
    assert.equal(buffer.readUInt32LE(cursor), 0x02014b50);
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer
      .subarray(cursor + 46, cursor + 46 + fileNameLength)
      .toString("utf8");

    entries.set(name, { compressedSize, localHeaderOffset, method, name });
    cursor += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function extractZipEntry(buffer, name) {
  const entries = zipEntries(buffer);
  const entry = entries.get(name);
  if (!entry) throw new Error(`ZIP entry not found: ${name}`);
  const localOffset = entry.localHeaderOffset;
  assert.equal(buffer.readUInt32LE(localOffset), 0x04034b50);
  const fileNameLength = buffer.readUInt16LE(localOffset + 26);
  const extraLength = buffer.readUInt16LE(localOffset + 28);
  const dataOffset = localOffset + 30 + fileNameLength + extraLength;
  const compressed = buffer.subarray(dataOffset, dataOffset + entry.compressedSize);
  if (entry.method === 0) return compressed;
  if (entry.method === 8) return zlib.inflateRawSync(compressed);
  throw new Error(`Unsupported ZIP compression method: ${entry.method}`);
}

function documentXml(buffer) {
  return extractZipEntry(buffer, "word/document.xml").toString("utf8");
}

function documentText(buffer) {
  return documentXml(buffer).replace(/<[^>]+>/g, "");
}

// Prose lifted from the real Macbeth practice paper that triggered the bug:
// "Repetition/anaphora" and "cowardly/hesitant" rendered as fractions, and
// "well-structured"/"surface-level" rendered as subtractions.
const englishPaper = {
  title: "Macbeth — Year 10 English Practice Paper",
  subject: "english",
  year: 10,
  totalMarks: 20,
  timeAllowed: "40 minutes",
  sections: [
    {
      title: "Section A — Techniques",
      questions: [
        {
          number: 1,
          stem: "Identify the technique: Repetition/anaphora builds intensity across the act/Of the soliloquy.",
          marks: 5,
          workingLines: 4,
        },
        {
          number: 2,
          stem: "Explain how Macbeth is shown as cowardly/hesitant, using a well-structured, well-supported response that avoids surface-level analysis.",
          marks: 15,
          workingLines: 8,
        },
      ],
    },
  ],
};

const mathsWorksheet = {
  title: "Fractions Worksheet",
  subject: "maths",
  year: 8,
  topic: "Fractions",
  totalMarks: 4,
  questions: [
    {
      number: 1,
      stem: "Simplify 3/4 + 1/2 and expand x^2.",
      marks: 4,
      workingLines: 3,
      parts: null,
    },
  ],
  answers: [{ questionNumber: 1, partLabel: null, answer: "5/4; x^2" }],
};

describe("English documents skip the math pipeline", () => {
  it("renders English prose with slashes and hyphens as plain text, not math", async () => {
    const buffer = await buildResourceDocx("practice-paper", englishPaper, {
      studentName: "Mikaela Abboud",
      answerMode: "none",
    });
    const xml = documentXml(buffer);
    const text = documentText(buffer);

    // No Office Math at all in an English document.
    assert.doesNotMatch(xml, /<m:oMath/);
    assert.doesNotMatch(xml, /<m:f>/);

    // Slashes stay slashes (no numerator/denominator split) ...
    assert.match(text, /Repetition\/anaphora/);
    assert.match(text, /cowardly\/hesitant/);
    assert.match(text, /act\/Of/);
    // ... and hyphens stay hyphens (not converted to a minus sign U+2212).
    assert.match(text, /well-structured/);
    assert.match(text, /surface-level/);
    assert.doesNotMatch(text, /well−structured/);
  });

  it("still typesets maths resources as Word math (no regression)", async () => {
    const buffer = await buildResourceDocx("worksheet", mathsWorksheet, {
      studentName: "Mei Tanaka",
    });
    const xml = documentXml(buffer);

    assert.match(xml, /<m:f>/);
    assert.match(xml, /<m:sSup>/);
  });

  it("leaves the math pipeline on when a builder is called directly", async () => {
    // No ambient context → defaults to enabled, preserving prior behaviour.
    const buffer = await buildWorksheetDocx(mathsWorksheet, {
      studentName: "Mei Tanaka",
    });
    assert.match(documentXml(buffer), /<m:f>/);
  });
});
