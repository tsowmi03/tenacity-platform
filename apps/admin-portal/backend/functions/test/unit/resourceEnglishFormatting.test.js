"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const zlib = require("node:zlib");

const { buildResourceDocx } = require("../../src/resources/builder");

// --- Minimal DOCX (ZIP) reader, mirroring resourceEnglishNoMath.test.js ---
function zipEntries(buffer) {
  let eocdOffset = -1;
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
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

function documentXml(buffer) {
  const entry = zipEntries(buffer).get("word/document.xml");
  const localOffset = entry.localHeaderOffset;
  const fileNameLength = buffer.readUInt16LE(localOffset + 26);
  const extraLength = buffer.readUInt16LE(localOffset + 28);
  const dataOffset = localOffset + 30 + fileNameLength + extraLength;
  const compressed = buffer.subarray(dataOffset, dataOffset + entry.compressedSize);
  if (entry.method === 0) return compressed.toString("utf8");
  return zlib.inflateRawSync(compressed).toString("utf8");
}

function documentText(buffer) {
  return documentXml(buffer).replace(/<[^>]+>/g, "");
}

function firstTableXml(xml) {
  return xml.slice(xml.indexOf("<w:tbl>"), xml.indexOf("</w:tbl>"));
}

const annotationTask = {
  title: "Persuasive Language Annotation",
  subject: "english",
  year: 9,
  passageTitle: "The Last Bell",
  passageAuthor: "J. Rivera",
  passageSource: "Selected Stories (2021)",
  // Three paragraphs separated by blank lines — the body the AI produces.
  passageText:
    "The bell rang across the empty courtyard.\n\n" +
    "Nobody moved, and the silence stretched until even the pigeons held their breath.\n\n" +
    "Then, slowly, a single door opened.",
  tasks: [
    { number: 1, instruction: "Identify one image and explain its effect.", type: "analyse", marks: 3, focusQuote: null, responseLines: 4 },
  ],
};

const englishStudyGuide = {
  title: "Persuasive Techniques",
  subject: "english",
  year: 9,
  topics: ["Persuasive language"],
  sections: [
    {
      title: "Techniques",
      // Mixed/markdown list markers embedded in a prose field.
      summary: "Key techniques to revise:\n- Rhetorical questions\n* Emotive language\n1. Inclusive language",
      // Items that already carry their own markers must not be double-marked.
      keyPoints: ["- Always link technique to effect", "1. Use evidence from the text", "Vary sentence length"],
    },
  ],
};

describe("English resource formatting", () => {
  it("renders the annotation passage as structured paragraphs, not a run-on block", async () => {
    const buffer = await buildResourceDocx("annotation-task", annotationTask, {
      answerMode: "none",
      studentName: "Mei Tanaka",
    });
    const xml = documentXml(buffer);
    const text = documentText(buffer);

    // Title and attribution are present and rendered distinctly.
    assert.match(text, /The Last Bell/);
    assert.match(text, /Author: J\. Rivera/);
    assert.match(text, /Source: Selected Stories/);

    // Every body paragraph survives — the breaks are no longer flattened away.
    assert.match(text, /The bell rang across the empty courtyard\./);
    assert.match(text, /Nobody moved/);
    assert.match(text, /a single door opened\./);

    // The shaded passage box holds title + attribution + 3 body paragraphs as
    // separate paragraphs rather than one collapsed line.
    const passageBox = firstTableXml(xml);
    const paragraphCount = (passageBox.match(/<w:p[ >]/g) || []).length;
    assert.ok(
      paragraphCount >= 5,
      `expected the passage box to keep its paragraph breaks, saw ${paragraphCount}`
    );
  });

  it("renders bullet and numbered lists consistently without doubling markers", async () => {
    const buffer = await buildResourceDocx("study-guide", englishStudyGuide, {
      answerMode: "none",
      studentName: "Mei Tanaka",
    });
    const xml = documentXml(buffer);
    const text = documentText(buffer);

    // A consistent bullet glyph is used, and ordered items keep their numbers.
    assert.match(text, /•/);
    assert.match(text, /1\./);

    // No doubled markers and no literal marker left dangling in front of text.
    assert.doesNotMatch(text, /- -/);
    assert.doesNotMatch(text, /- Always link technique/);

    // List items use a hanging indent so wrapped lines align under the text.
    assert.match(xml, /w:hanging="280"/);
  });

  it("strips em-dashes and curly quotes from the rendered passage", async () => {
    const buffer = await buildResourceDocx("annotation-task", {
      ...annotationTask,
      passageTitle: "The Last Bell — a study",
      passageText: "The bell rang — loudly — and “everyone” paused.",
    }, { answerMode: "none", studentName: "Mei Tanaka" });
    const text = documentText(buffer);

    assert.doesNotMatch(text, /—/);
    assert.doesNotMatch(text, /[“”]/);
    assert.match(text, /The Last Bell, a study/);
    // Straight quotes are XML-escaped to &quot; in the document; curly quotes
    // would survive as literal characters, so this also proves the swap ran.
    assert.match(text, /The bell rang, loudly, and &quot;everyone&quot; paused\./);
  });

  it("credits an unattributed generated passage to Tenacity Resources", async () => {
    const { passageAuthor, ...withoutAuthor } = annotationTask;
    const buffer = await buildResourceDocx("annotation-task", {
      ...withoutAuthor,
      passageSource: null,
    }, { answerMode: "none", studentName: "Mei Tanaka" });
    const text = documentText(buffer);

    assert.match(text, /Author: Tenacity Resources/);
  });

  it("keeps the real author for an attributed public-domain passage", async () => {
    const buffer = await buildResourceDocx("annotation-task", {
      ...annotationTask,
      passageTitle: "Sonnet 18",
      passageAuthor: "William Shakespeare",
      passageSource: "Shakespeare's Sonnets (1609)",
    }, { answerMode: "none", studentName: "Mei Tanaka" });
    const text = documentText(buffer);

    assert.match(text, /Author: William Shakespeare/);
    assert.doesNotMatch(text, /Tenacity Resources/);
  });
});

// Live-generation finding (2026-07-03): the de-AI punctuation backstop was
// rewriting verified public-domain texts too. Frost's "wood, and I—" lost its
// em-dash in the booklet while a generated question asked about that very
// dash. Bodies flagged verbatim by the pipeline keep their original bytes;
// everything else (our headings, the model's own text) stays cleaned.
describe("verbatim sourced texts keep their original punctuation", () => {
  const frostLines = "Two roads diverged in a wood, and I—\nI took the one less travelled by";

  it("keeps an em-dash and curly quotes in a verbatim annotation passage", async () => {
    const buffer = await buildResourceDocx("annotation-task", {
      ...annotationTask,
      passageTitle: "The Road Not Taken",
      passageAuthor: "Robert Frost",
      passageText: `${frostLines}\n\n‘Shall I compare thee’ stays curly`,
      passageVerbatim: true,
      tasks: [
        { number: 1, instruction: "Explain the pause — the dash — in the final stanza.", type: "analyse", marks: 3, focusQuote: null, responseLines: 4 },
      ],
    }, { answerMode: "none", studentName: "Mei Tanaka" });
    const text = documentText(buffer);

    assert.match(text, /wood, and I—/);
    assert.match(text, /‘Shall I compare thee’/);
    // Our own composed text and the model's task text stay de-AI'd.
    assert.match(text, /the pause, the dash, in the final stanza/);
    assert.doesNotMatch(text, /pause — the dash/);
  });

  it("still cleans the passage when the verbatim flag is absent", async () => {
    const buffer = await buildResourceDocx("annotation-task", {
      ...annotationTask,
      passageText: frostLines,
    }, { answerMode: "none", studentName: "Mei Tanaka" });
    const text = documentText(buffer);

    // The line-final dash is dropped by the backstop (this is exactly the
    // behaviour the verbatim flag exists to bypass for sourced texts).
    assert.match(text, /wood, and I/);
    assert.doesNotMatch(text, /—/);
  });

  it("applies the exemption per stimulus text, not per booklet", async () => {
    const buffer = await buildResourceDocx("study-guide", {
      ...englishStudyGuide,
      stimulus: [
        {
          label: "Text 1",
          textType: "poem",
          title: "The Road Not Taken",
          author: "Robert Frost",
          source: "Wikisource (https://en.wikisource.org/wiki/x)",
          body: frostLines,
          verbatim: true,
        },
        {
          label: "Text 2",
          textType: "prose",
          title: "A fork in the road",
          author: "Tenacity Resources",
          body: "Marcus stopped — the path was new.",
        },
      ],
    }, { answerMode: "none", studentName: "Mei Tanaka", subject: "english", year: 9 });
    const text = documentText(buffer);

    assert.match(text, /wood, and I—/);
    assert.match(text, /Marcus stopped, the path was new\./);
    assert.doesNotMatch(text, /stopped —/);
  });
});
