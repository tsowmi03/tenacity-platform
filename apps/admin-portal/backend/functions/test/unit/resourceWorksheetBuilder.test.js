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
    assert.match(headerText, /Maths/);
    assert.doesNotMatch(headerText, /Year 8 \| Maths \| Solving linear equations/);
    assert.match(documentText, /Name: Mei Tanaka/);
    assert.match(documentText, /Solve 2x \+ 3 = 11/);
    assert.match(documentText, /Q1/);
    assert.match(documentText, /x = 4/);
    assert.match(documentText, /Q2\(a\)/);
    assert.match(footerText, /Determination Meets Success/);
  });

  it("keeps a space after maths question numbers and renders equations as Word math", async () => {
    const worksheet = {
      ...sampleWorksheet,
      questions: [
        {
          number: 1,
          stem: "Solve 5x = 20, then simplify z/4 + 2/3, expand x^2, and state -3 <= x.",
          marks: 3,
          workingLines: 2,
          parts: null,
        },
      ],
      answers: [{ questionNumber: 1, partLabel: null, answer: "x = 4; z/4 + 2/3 + x^2; 2*3 != 5 -> true" }],
    };

    const buffer = await buildWorksheetDocx(worksheet, {
      studentName: "Mei Tanaka",
    });
    const documentXml = extractZipEntry(buffer, "word/document.xml").toString("utf8");
    const documentText = extractXmlText(buffer, "word/document.xml");

    assert.match(documentXml, /<w:t xml:space="preserve">1\. <\/w:t>/);
    assert.match(documentText, /1\. Solve/);
    assert.match(documentXml, /<m:f>/);
    assert.match(documentXml, /<m:sSup>/);
    assert.match(documentXml, /<m:t>5x = 20<\/m:t>/);
    assert.match(documentXml, /<m:t>x = 4<\/m:t>/);
    assert.match(documentXml, /<m:t>−3 ≤ x<\/m:t>/);
    assert.match(documentXml, /<m:t>2×3 ≠ 5 → true<\/m:t>/);
    assert.doesNotMatch(documentXml, /<w:t>z\/4<\/w:t>/);
  });

  it("renders markdown tables in question stems as native fixed Word tables", async () => {
    const worksheet = {
      ...sampleWorksheet,
      questions: [
        {
          number: 1,
          stem: "Use the table of values below.\n| x | -1 | 0 | 1 |\n|---|---:|---:|---:|\n| y | -3 | -1 | 1 |",
          marks: 2,
          workingLines: 2,
          parts: null,
        },
      ],
      answers: [{ questionNumber: 1, partLabel: null, answer: "y = 2x - 1" }],
    };

    const buffer = await buildWorksheetDocx(worksheet, {
      studentName: "Mei Tanaka",
    });
    const documentXml = extractZipEntry(buffer, "word/document.xml").toString("utf8");
    const documentText = extractXmlText(buffer, "word/document.xml");

    assert.match(documentText, /Use the table of values below/);
    assert.doesNotMatch(documentText, /\| x \|/);
    assert.match(documentXml, /<w:tblLayout w:type="fixed"\/>/);
    assert.match(documentXml, /<w:t(?: [^>]*)?>x<\/w:t>/);
    assert.match(documentXml, /<w:t(?: [^>]*)?>y<\/w:t>/);
  });

  it("embeds generated diagram images and native two-way tables", async () => {
    const worksheet = {
      ...sampleWorksheet,
      questions: [
        {
          number: 1,
          stem: "Mark the solution on the number line.",
          marks: 2,
          workingLines: 3,
          diagram: {
            type: "number-line",
            min: -3,
            max: 5,
            step: 1,
            marks: [{ value: 2, label: "x", open: false }],
          },
          parts: null,
        },
        {
          number: 2,
          stem: "Use the table.",
          marks: 2,
          workingLines: 0,
          parts: [
            {
              label: "a",
              stem: "How many Year 9 students prefer Soccer?",
              marks: 1,
              workingLines: 2,
              diagram: {
                type: "two-way-table",
                colHeader: "Preferred sport",
                rowHeader: "Year group",
                cols: ["Soccer", "Tennis"],
                rows: ["Year 9", "Year 10"],
                data: [
                  [12, 8],
                  [10, 15],
                ],
                totals: true,
              },
            },
          ],
        },
        {
          number: 3,
          stem: "Calculate the area of the rectangle.",
          marks: 2,
          workingLines: 2,
          diagram: {
            type: "rectangle",
            dimensions: { width: 12, height: 7 },
            unit: "cm",
          },
          parts: null,
        },
        {
          number: 4,
          stem: "Calculate the area of the rectangle-triangle composite shape.",
          marks: 3,
          workingLines: 3,
          diagram: {
            type: "rect-triangle",
            dimensions: {
              width: 10,
              rectangleHeight: 4,
              triangleHeight: 3,
            },
            unit: "cm",
          },
          parts: null,
        },
        {
          number: 5,
          stem: "Calculate the area of the rectangle-semicircle composite shape.",
          marks: 3,
          workingLines: 3,
          diagram: {
            type: "rect-semicircle",
            dimensions: {
              rectangleWidth: 8,
              diameter: 6,
            },
            unit: "cm",
          },
          parts: null,
        },
        {
          number: 6,
          stem: "Calculate the area of the right triangle.",
          marks: 2,
          workingLines: 2,
          diagram: {
            type: "right-triangle",
            dimensions: {
              base: 8,
              height: 6,
              hypotenuse: 10,
            },
            unit: "cm",
          },
          parts: null,
        },
        {
          number: 7,
          stem: "Calculate the area of the triangle.",
          marks: 2,
          workingLines: 2,
          diagram: {
            type: "triangle",
            dimensions: {
              base: 10,
              height: 6,
            },
            unit: "cm",
          },
          parts: null,
        },
        {
          number: 8,
          stem: "Calculate the area of the circle.",
          marks: 2,
          workingLines: 2,
          diagram: {
            type: "circle",
            dimensions: {
              radius: 5,
            },
            unit: "cm",
          },
          parts: null,
        },
        {
          number: 9,
          stem: "Calculate the area of the sector.",
          marks: 3,
          workingLines: 3,
          diagram: {
            type: "circle-sector",
            dimensions: {
              radius: 6,
              angle: 120,
            },
            unit: "cm",
          },
          parts: null,
        },
        {
          number: 10,
          stem: "Calculate the volume of the rectangular prism.",
          marks: 2,
          workingLines: 2,
          diagram: {
            type: "prism-rect",
            dimensions: {
              length: 10,
              width: 5,
              height: 4,
            },
            unit: "cm",
          },
          parts: null,
        },
        {
          number: 11,
          stem: "Calculate the volume of the triangular prism.",
          marks: 3,
          workingLines: 3,
          diagram: {
            type: "prism-tri",
            dimensions: {
              triangleBase: 8,
              triangleHeight: 5,
              length: 12,
            },
            unit: "cm",
          },
          parts: null,
        },
        {
          number: 12,
          stem: "Calculate the volume of the cylinder.",
          marks: 3,
          workingLines: 3,
          diagram: {
            type: "cylinder",
            dimensions: {
              radius: 5,
              height: 12,
            },
            unit: "cm",
          },
          parts: null,
        },
      ],
      answers: [
        { questionNumber: 1, partLabel: null, answer: "x = 2" },
        { questionNumber: 2, partLabel: "a", answer: "12" },
        { questionNumber: 3, partLabel: null, answer: "84 cm^2" },
        { questionNumber: 4, partLabel: null, answer: "55 cm^2" },
        { questionNumber: 5, partLabel: null, answer: "48 cm^2 + 4.5pi cm^2" },
        { questionNumber: 6, partLabel: null, answer: "24 cm^2" },
        { questionNumber: 7, partLabel: null, answer: "30 cm^2" },
        { questionNumber: 8, partLabel: null, answer: "25pi cm^2" },
        { questionNumber: 9, partLabel: null, answer: "12pi cm^2" },
        { questionNumber: 10, partLabel: null, answer: "200 cm^3" },
        { questionNumber: 11, partLabel: null, answer: "240 cm^3" },
        { questionNumber: 12, partLabel: null, answer: "300pi cm^3" },
      ],
    };

    const buffer = await buildWorksheetDocx(worksheet, {
      studentName: "Mei Tanaka",
    });
    const entries = zipEntries(buffer);
    const pngEntries = [...entries.keys()].filter((name) =>
      /^word\/media\/.+\.png$/.test(name)
    );
    const documentText = extractXmlText(buffer, "word/document.xml");

    assert.ok(
      pngEntries.length >= 11,
      "expected number-line, polygon, composite-shape, circle, sector, and solid PNG diagrams"
    );
    assert.match(documentText, /Preferred sport/);
    assert.match(documentText, /Year group/);
    assert.match(documentText, /Soccer/);
    assert.match(documentText, /45/);
  });

  it("fails the DOCX build when a required diagram cannot be laid out safely", async () => {
    const worksheet = {
      ...sampleWorksheet,
      questions: [
        {
          number: 1,
          stem: "Calculate the area of the rectangle.",
          marks: 2,
          workingLines: 2,
          diagram: {
            type: "rectangle",
            dimensions: { width: 12, height: 7 },
            dimensionLabels: {
              width: "This dimension label is intentionally too long to fit safely ".repeat(8),
              height: "7 cm",
            },
          },
          parts: null,
        },
      ],
      answers: [{ questionNumber: 1, partLabel: null, answer: "84 cm^2" }],
    };

    await assert.rejects(
      () => buildWorksheetDocx(worksheet, { studentName: "Mei Tanaka" }),
      /rectangle diagram layout failed for width label/
    );
  });

  it("renders English worksheets with a marking guide", async () => {
    const worksheet = {
      title: "Persuasive Language Worksheet",
      subject: "english",
      year: 8,
      topic: "Persuasive language",
      totalMarks: 2,
      questions: [
        {
          number: 1,
          stem: "Identify one persuasive technique in the sentence.",
          marks: 2,
          workingLines: 4,
          parts: null,
        },
      ],
      markingGuide: [
        {
          questionNumber: 1,
          suggestedResponse: "The student identifies a technique and explains its effect.",
          markingCriteria: ["Names a relevant technique.", "Explains how it positions the audience."],
        },
      ],
    };

    const buffer = await buildWorksheetDocx(worksheet, {
      studentName: "Mei Tanaka",
    });
    const documentText = extractXmlText(buffer, "word/document.xml");

    assert.match(documentText, /Marking Guide/);
    assert.match(documentText, /Suggested Response/);
    assert.match(documentText, /Names a relevant technique/);
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
      () => buildResourceDocx("unknown-resource", sampleWorksheet),
      /Unsupported resource type: unknown-resource/
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
