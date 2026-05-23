"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const zlib = require("node:zlib");

const {
  buildOutputFileName,
  buildResourceDocx,
} = require("../../src/resources/builder");
const { buildWorksheetDocx } = require("../../src/resources/builder/worksheet");

const sampleWorksheet = {
  title: "Linear Equations Worksheet",
  subject: "maths",
  year: 8,
  topic: "Solving linear equations",
  totalMarks: 6,
  questions: [
    {
      number: 1,
      stem: "Solve 2x + 3 = 11.",
      marks: 2,
      workingLines: 3,
      parts: null,
    },
    {
      number: 2,
      stem: "Solve each equation.",
      marks: 4,
      workingLines: 0,
      parts: [
        { label: "a", stem: "3y = 18", marks: 1, workingLines: 2 },
        { label: "b", stem: "z/4 + 5 = 9", marks: 3, workingLines: 3 },
      ],
    },
  ],
  answers: [
    { questionNumber: 1, partLabel: null, answer: "x = 4" },
    { questionNumber: 2, partLabel: "a", answer: "y = 6" },
    { questionNumber: 2, partLabel: "b", answer: "z = 16" },
  ],
};

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

function extractXmlText(buffer, name) {
  return extractZipEntry(buffer, name)
    .toString("utf8")
    .replace(/<[^>]+>/g, "");
}

describe("worksheet DOCX builder", () => {
  it("builds a branded worksheet with questions and answers", async () => {
    const buffer = await buildWorksheetDocx(sampleWorksheet, {
      studentName: "Mei Tanaka",
    });

    assert.ok(Buffer.isBuffer(buffer));
    assert.equal(buffer.subarray(0, 2).toString("utf8"), "PK");
    assert.ok(buffer.length > 10000);

    const entries = zipEntries(buffer);
    const headerName = [...entries.keys()].find((name) =>
      /^word\/header\d+\.xml$/.test(name)
    );
    const footerName = [...entries.keys()].find((name) =>
      /^word\/footer\d+\.xml$/.test(name)
    );

    assert.ok(headerName, "expected a DOCX header part");
    assert.ok(footerName, "expected a DOCX footer part");

    const documentText = extractXmlText(buffer, "word/document.xml");
    const headerText = extractXmlText(buffer, headerName);
    const footerText = extractXmlText(buffer, footerName);

    assert.match(headerText, /Linear Equations Worksheet/);
    assert.match(headerText, /Year 8 \| Maths \| Solving linear equations/);
    assert.match(documentText, /Name: Mei Tanaka/);
    assert.match(documentText, /Solve 2x \+ 3 = 11/);
    assert.match(documentText, /Q1/);
    assert.match(documentText, /x = 4/);
    assert.match(documentText, /Q2\(a\)/);
    assert.match(footerText, /Determination Meets Success/);
  });

  it("routes worksheet builds through the resource dispatcher", async () => {
    const buffer = await buildResourceDocx("worksheet", sampleWorksheet, {
      studentName: "Mei Tanaka",
    });

    assert.ok(Buffer.isBuffer(buffer));
    assert.equal(buffer.subarray(0, 2).toString("utf8"), "PK");
  });

  it("rejects resource types without implemented templates", async () => {
    await assert.rejects(
      () => buildResourceDocx("practice-paper", sampleWorksheet),
      /Unsupported resource type: practice-paper/
    );
  });

  it("builds safe output file names", () => {
    assert.equal(
      buildOutputFileName({
        resourceType: "worksheet",
        title: "Rates & ratios: intro",
        studentName: "Mei/Tanaka",
        year: 8,
        subject: "maths",
        date: new Date("2026-05-23T00:00:00.000Z"),
      }),
      "Worksheet - Mei Tanaka - Year 8 Maths - Rates and ratios intro - 2026-05-23.docx"
    );
  });
});
