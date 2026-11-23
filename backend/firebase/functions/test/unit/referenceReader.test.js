"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const {
  MAX_GIF_FRAMES,
  MAX_REFERENCE_BYTES,
  ReferenceFileError,
  classifyReference,
  readReferenceFile,
  sniffKind,
} = require("../../src/resources/referenceReader");
const { describeResourceFailure, classifyResourceFailure } = require("../../src/resources/failure");

// A ZIP of empty, uncompressed entries, with its central directory: enough
// for sniffing.
function storedZip(names) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const name of names) {
    const nameBytes = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(names.length, 8);
  end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const fixture = (name) => fs.readFileSync(path.join(__dirname, "../fixtures/references", name));

// A stand-in for Claude: transcribes each page it is sent as "text of page N",
// or as the legibility given for that page.
function fakeVision(legibility = {}) {
  const calls = [];
  const callAi = async (request) => {
    calls.push(request);
    const pages = request.messages[0].content
      .filter((block) => block.type === "text" && /^(Page) \d+:$/.test(block.text))
      .map((block) => Number(block.text.match(/\d+/)[0]));
    return {
      parsed: {
        pages: pages.map((page) => ({
          page,
          text: legibility[page] === "none" ? "" : `text of page ${page}`,
          legibility: legibility[page] || "full",
        })),
      },
    };
  };
  return { callAi, calls };
}

function memoryBucket() {
  const files = new Map();
  return {
    files,
    file(key) {
      return {
        async download() {
          if (!files.has(key)) throw Object.assign(new Error("No such object"), { code: 404 });
          return [files.get(key)];
        },
        async save(data) {
          files.set(key, Buffer.from(data));
        },
      };
    },
  };
}

async function png(width = 120, height = 80) {
  return sharp({ create: { width, height, channels: 3, background: "#ffffff" } }).png().toBuffer();
}

async function rejectsWith(promise, code) {
  await assert.rejects(promise, (err) => {
    assert.ok(err instanceof ReferenceFileError, `expected ReferenceFileError, got ${err?.name}: ${err?.message}`);
    assert.equal(err.code, code);
    return true;
  });
}

describe("reference file sniffing", () => {
  it("recognises each supported format from its contents", async () => {
    assert.equal(sniffKind(fixture("text.pdf")), "pdf");
    assert.equal(sniffKind(await png()), "image");
    assert.equal(sniffKind(await sharp(await png()).jpeg().toBuffer()), "image");
    assert.equal(sniffKind(await sharp(await png()).webp().toBuffer()), "image");
    assert.equal(sniffKind(await sharp(await png()).gif().toBuffer()), "image");
    assert.equal(sniffKind(fixture("three-page.tiff")), "image");
    assert.equal(sniffKind(fixture("scan.bmp")), "image");
    assert.equal(sniffKind(fixture("photo.heic")), "image");
    assert.equal(sniffKind(Buffer.from("# Notes\n\nPythagoras")), "text");
    assert.equal(sniffKind(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0])), "ole");
    assert.equal(sniffKind(Buffer.from("{\\rtf1\\ansi hello}")), "rtf");
    assert.equal(sniffKind(Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe])), "unknown");
  });

  it("tells DOCX, PPTX and XLSX apart from other ZIPs", () => {
    assert.equal(sniffKind(storedZip(["[Content_Types].xml", "word/document.xml"])), "docx");
    assert.equal(sniffKind(storedZip(["[Content_Types].xml", "ppt/presentation.xml"])), "pptx");
    assert.equal(sniffKind(storedZip(["[Content_Types].xml", "xl/workbook.xml"])), "xlsx");
    assert.equal(sniffKind(storedZip(["photos/a.jpg"])), "zip");
  });
});

describe("reference file validation", () => {
  it("refuses unsupported types, naming the supported ones", async () => {
    const err = await readReferenceFile(Buffer.from("hello"), { fileName: "song.mp3" }).catch((e) => e);
    assert.equal(err.code, "REFERENCE_UNSUPPORTED");
    assert.match(err.tutorMessage, /song\.mp3/);
    assert.match(err.tutorMessage, /HEIC/);
  });

  it("refuses a file whose contents aren't what its name says", async () => {
    await rejectsWith(readReferenceFile(await png(), { fileName: "paper.pdf" }), "REFERENCE_TYPE_MISMATCH");
    await rejectsWith(readReferenceFile(fixture("text.pdf"), { fileName: "notes.txt" }), "REFERENCE_TYPE_MISMATCH");
    await rejectsWith(readReferenceFile(Buffer.from([0x00, 0x01, 0xff]), { fileName: "notes.docx" }), "REFERENCE_TYPE_MISMATCH");
  });

  it("reads an image by its real format whatever its image extension", async () => {
    const { callAi } = fakeVision();
    const result = await readReferenceFile(fixture("photo.heic"), { fileName: "IMG_0042.jpg" }, { callAi, model: "claude-test" });
    assert.equal(result.content, "text of page 1");
  });

  it("says a password-protected Office file is locked, not damaged", async () => {
    const ole = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(512)]);
    await rejectsWith(readReferenceFile(ole, { fileName: "worksheet.docx" }), "REFERENCE_ENCRYPTED");
  });

  it("refuses files over the size limit and empty files", () => {
    const big = { length: MAX_REFERENCE_BYTES + 1 };
    assert.throws(() => classifyReference(big, "huge.pdf"), (err) => err.code === "REFERENCE_TOO_LARGE" && /50 MB/.test(err.tutorMessage));
    assert.throws(() => classifyReference(Buffer.alloc(0), "empty.pdf"), (err) => err.code === "REFERENCE_EMPTY");
  });

  it("reports a damaged PDF and a damaged image as unreadable", async () => {
    await rejectsWith(readReferenceFile(Buffer.from("%PDF-1.4 not really"), { fileName: "broken.pdf" }), "REFERENCE_UNREADABLE");
    const truncated = (await png(400, 400)).subarray(0, 60);
    const { callAi } = fakeVision();
    await rejectsWith(readReferenceFile(truncated, { fileName: "broken.png" }, { callAi, model: "claude-test" }), "REFERENCE_UNREADABLE");
  });

  it("says a password-protected PDF needs its password removed", async () => {
    await rejectsWith(readReferenceFile(fixture("password.pdf"), { fileName: "locked.pdf" }), "REFERENCE_ENCRYPTED");
  });
});

describe("reading reference files", () => {
  it("reads text, Markdown and CSV as they are", async () => {
    for (const [name, body] of [["notes.txt", "Tutor notes\r\n"], ["outcomes.md", "# Outcomes\n- Analyse"], ["marks.csv", "q,marks\n1,2"]]) {
      const result = await readReferenceFile(Buffer.from(body), { fileName: name });
      assert.equal(result.content, body.replace(/\r\n/g, "\n").trim());
      assert.deepEqual(result.warnings, []);
    }
  });

  it("reads a text PDF locally, without Claude", async () => {
    const { callAi, calls } = fakeVision();
    const result = await readReferenceFile(fixture("text.pdf"), { fileName: "index-laws.pdf" }, { callAi, model: "claude-test" });
    assert.match(result.content, /Index laws/);
    assert.equal(calls.length, 0);
    assert.equal(result.visionPages, 0);
  });

  it("sends only the scanned pages of a PDF to Claude and keeps page order", async () => {
    const { callAi, calls } = fakeVision();
    const result = await readReferenceFile(fixture("mixed.pdf"), { fileName: "paper.pdf" }, { callAi, model: "claude-test" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].messages[0].content.filter((b) => b.type === "image").length, 1);
    assert.equal(calls[0].model, "claude-test");
    assert.match(result.content, /\[Page 1\]\nQuestion 1\. Solve 2x \+ 3 = 11[\s\S]*\[Page 2\]\ntext of page 2/);
    assert.equal(result.visionPages, 1);
  });

  it("reads a print-locked PDF that has no password to open it", async () => {
    const { callAi } = fakeVision();
    const result = await readReferenceFile(fixture("print-locked.pdf"), { fileName: "past-paper.pdf" }, { callAi, model: "claude-test" });
    assert.match(result.content, /text of page 1/);
  });

  it("reads every page of a multi-page TIFF", async () => {
    const { callAi, calls } = fakeVision();
    const result = await readReferenceFile(fixture("three-page.tiff"), { fileName: "scan.tiff" }, { callAi, model: "claude-test" });
    assert.equal(calls[0].messages[0].content.filter((b) => b.type === "image").length, 3);
    assert.match(result.content, /\[Page 1\][\s\S]*\[Page 2\][\s\S]*\[Page 3\]/);
  });

  it("reads a spread of frames from a long animated GIF and says so", async () => {
    const gif = fixture("steps.gif");
    const { callAi, calls } = fakeVision();
    const result = await readReferenceFile(gif, { fileName: "steps.gif" }, { callAi, model: "claude-test" });
    assert.equal(calls.flatMap((c) => c.messages[0].content.filter((b) => b.type === "image")).length, MAX_GIF_FRAMES);
    assert.ok(result.warnings.some((w) => w.code === "REFERENCE_PAGE_LIMIT" && /25 frames/.test(w.message)));
  });

  it("reads BMP and WebP images, shrunk to Claude's size", async () => {
    const { callAi, calls } = fakeVision();
    await readReferenceFile(fixture("scan.bmp"), { fileName: "scan.bmp" }, { callAi, model: "claude-test" });
    const bmp = await sharp(Buffer.from(calls[0].messages[0].content.find((b) => b.type === "image").source.data, "base64")).metadata();
    assert.deepEqual([bmp.width, bmp.height], [40, 30]);
    const big = await sharp(await png(4000, 3000)).webp().toBuffer();
    await readReferenceFile(big, { fileName: "board.webp" }, { callAi, model: "claude-test" });
    const sent = Buffer.from(calls[1].messages[0].content.find((b) => b.type === "image").source.data, "base64");
    const meta = await sharp(sent).metadata();
    assert.equal(meta.format, "jpeg");
    assert.ok(Math.max(meta.width, meta.height) <= 1568);
  });

  it("warns about pages that couldn't be read instead of claiming them", async () => {
    const { callAi } = fakeVision({ 2: "none", 3: "partial" });
    const result = await readReferenceFile(fixture("three-page.tiff"), { fileName: "scan.tiff" }, { callAi, model: "claude-test" });
    assert.doesNotMatch(result.content, /text of page 2/);
    assert.ok(result.warnings.some((w) => /Nothing could be read on page 2/.test(w.message)));
    assert.ok(result.warnings.some((w) => /Parts of page 3/.test(w.message)));
  });

  it("fails when nothing at all could be read", async () => {
    const { callAi } = fakeVision({ 1: "none" });
    await rejectsWith(readReferenceFile(await png(), { fileName: "blank.png" }, { callAi, model: "claude-test" }), "REFERENCE_NO_CONTENT");
  });

  it("needs Claude for images and fully scanned PDFs, but not for a part-scanned one", async () => {
    await rejectsWith(readReferenceFile(await png(), { fileName: "photo.png" }), "REFERENCE_VISION_UNAVAILABLE");
    await rejectsWith(readReferenceFile(fixture("scanned.pdf"), { fileName: "scan.pdf" }), "REFERENCE_VISION_UNAVAILABLE");
    const result = await readReferenceFile(fixture("mixed.pdf"), { fileName: "paper.pdf" });
    assert.match(result.content, /Question 1/);
    assert.ok(result.warnings.some((w) => /Scanned page 2/.test(w.message)));
  });

  it("caches what Claude read by file contents, under the new file name", async () => {
    const bucket = memoryBucket();
    const first = fakeVision({ 1: "partial" });
    const buffer = fixture("scanned.pdf");
    await readReferenceFile(buffer, { fileName: "week1.pdf" }, { callAi: first.callAi, model: "claude-test", bucket });
    const second = fakeVision();
    const again = await readReferenceFile(buffer, { fileName: "week1-copy.pdf" }, { callAi: second.callAi, model: "claude-test", bucket });
    assert.equal(second.calls.length, 0);
    assert.match(again.content, /text of page 1/);
    assert.match(again.warnings[0].message, /week1-copy\.pdf/);
  });
});

// The Gotenberg converter, faked: returns a prepared PDF and records what it
// was sent.
function fakeConverter(pdfName = "text.pdf") {
  const requests = [];
  const convertToPdf = async (request) => {
    requests.push(request);
    return fixture(pdfName);
  };
  return { convertToPdf, requests };
}

describe("Office reference files", () => {
  it("recognises each Office format from its contents", () => {
    assert.equal(sniffKind(fixture("deck.pptx")), "pptx");
    assert.equal(sniffKind(fixture("deck.ppsx")), "pptx");
    assert.equal(sniffKind(fixture("marks.xlsx")), "xlsx");
    assert.equal(sniffKind(fixture("lesson.odt")), "odt");
    assert.equal(sniffKind(fixture("lesson.rtf")), "rtf");
    assert.equal(sniffKind(fixture("lesson.doc")), "ole");
    assert.equal(sniffKind(fixture("marks.xls")), "ole");
  });

  for (const [file, kind] of [["lesson.doc", "ole"], ["lesson.odt", "odt"], ["lesson.rtf", "rtf"], ["marks.xls", "ole"], ["marks.xlsx", "xlsx"]]) {
    it(`converts ${file} to PDF and reads its text`, async () => {
      const { convertToPdf, requests } = fakeConverter("text.pdf");
      const { callAi, calls } = fakeVision();
      const result = await readReferenceFile(fixture(file), { fileName: file }, { convertToPdf, callAi, model: "claude-test" });
      assert.equal(result.kind, kind);
      assert.equal(requests[0].fileName, file);
      assert.ok(Buffer.isBuffer(requests[0].buffer));
      assert.match(result.content, /Index laws/);
      assert.equal(calls.length, 0);
    });
  }

  it("asks for one page per sheet and labels spreadsheet pages as sheets", async () => {
    const { convertToPdf, requests } = fakeConverter("text.pdf");
    const result = await readReferenceFile(fixture("marks.xlsx"), { fileName: "marks.xlsx" }, { convertToPdf });
    assert.equal(requests[0].singlePageSheets, true);
    assert.match(result.content, /^\[Sheet 1\]/);
    const doc = fakeConverter("text.pdf");
    await readReferenceFile(fixture("lesson.doc"), { fileName: "lesson.doc" }, { convertToPdf: doc.convertToPdf });
    assert.equal(doc.requests[0].singlePageSheets, false);
  });

  it("reads every slide as a picture, keeping slide text if a picture can't be read", async () => {
    const { convertToPdf } = fakeConverter("mixed.pdf");
    const { callAi, calls } = fakeVision({ 1: "none" });
    const result = await readReferenceFile(fixture("deck.pptx"), { fileName: "deck.pptx" }, { convertToPdf, callAi, model: "claude-test" });
    assert.deepEqual(calls.flatMap((c) => c.messages[0].content.filter((b) => b.type === "image")).length, 2);
    assert.match(result.content, /\[Slide 1\]\nQuestion 1\. Solve 2x \+ 3 = 11[\s\S]*\[Slide 2\]\ntext of page 2/);
    assert.ok(result.warnings.some((w) => /Parts of slide 1/.test(w.message)));
  });

  it("treats an old .ppt as slides too", async () => {
    const { convertToPdf } = fakeConverter("mixed.pdf");
    const { callAi, calls } = fakeVision();
    const result = await readReferenceFile(fixture("lesson.doc"), { fileName: "week3.ppt" }, { convertToPdf, callAi, model: "claude-test" });
    assert.equal(calls.length, 1);
    assert.match(result.content, /\[Slide 2\]/);
  });

  it("reads slide text alone, with a warning, when Claude isn't available", async () => {
    const { convertToPdf } = fakeConverter("text.pdf");
    const result = await readReferenceFile(fixture("deck.pptx"), { fileName: "deck.pptx" }, { convertToPdf });
    assert.match(result.content, /Index laws/);
    assert.ok(result.warnings.some((w) => /Pictures and diagrams on the slides/.test(w.message)));
  });

  it("accepts a .doc that is really RTF or DOCX, and refuses one that is a PDF", async () => {
    const { convertToPdf } = fakeConverter("text.pdf");
    assert.equal((await readReferenceFile(fixture("lesson.rtf"), { fileName: "old.doc" }, { convertToPdf })).kind, "rtf");
    await rejectsWith(readReferenceFile(fixture("text.pdf"), { fileName: "old.doc" }, { convertToPdf }), "REFERENCE_TYPE_MISMATCH");
    await rejectsWith(readReferenceFile(fixture("marks.xlsx"), { fileName: "deck.pptx" }, { convertToPdf }), "REFERENCE_TYPE_MISMATCH");
  });

  it("refuses Office files over 30 MB, which the converter can't take", () => {
    const big = Buffer.concat([fixture("lesson.rtf"), Buffer.alloc(30 * 1024 * 1024)]);
    assert.throws(() => classifyReference(big, "huge.rtf"), (err) => err.code === "REFERENCE_TOO_LARGE" && /save a larger one as a PDF/.test(err.tutorMessage));
  });

  it("says when the converter isn't set up, refuses a file, is locked or is down", async () => {
    await rejectsWith(readReferenceFile(fixture("lesson.odt"), { fileName: "lesson.odt" }), "REFERENCE_CONVERTER_UNAVAILABLE");
    const failing = (message) => async () => { throw new Error(message); };
    await rejectsWith(readReferenceFile(fixture("lesson.odt"), { fileName: "lesson.odt" }, { convertToPdf: failing("PDF converter responded 400: LibreOffice failed to process a document") }), "REFERENCE_UNREADABLE");
    await rejectsWith(readReferenceFile(fixture("marks.xls"), { fileName: "marks.xls" }, { convertToPdf: failing("PDF converter responded 500: the document is password protected") }), "REFERENCE_ENCRYPTED");
    const down = await readReferenceFile(fixture("lesson.odt"), { fileName: "lesson.odt" }, { convertToPdf: failing("PDF converter responded 503: Service Unavailable") }).catch((e) => e);
    assert.equal(down.code, "REFERENCE_CONVERTER_UNAVAILABLE");
    assert.match(down.tutorMessage, /Press Retry/);
  });

  it("caches a converted read so the converter isn't called again", async () => {
    const bucket = memoryBucket();
    const first = fakeConverter("text.pdf");
    await readReferenceFile(fixture("lesson.odt"), { fileName: "lesson.odt" }, { convertToPdf: first.convertToPdf, bucket });
    const second = fakeConverter("text.pdf");
    const again = await readReferenceFile(fixture("lesson.odt"), { fileName: "lesson.odt" }, { convertToPdf: second.convertToPdf, bucket });
    assert.equal(second.requests.length, 0);
    assert.match(again.content, /Index laws/);
  });
});

describe("reference file failures", () => {
  it("shows the tutor the file's own problem and keeps it off the backup model", async () => {
    const err = await readReferenceFile(fixture("password.pdf"), { fileName: "locked.pdf" }).catch((e) => e);
    const described = describeResourceFailure(err);
    assert.match(described.message, /“locked\.pdf” is password-protected/);
    const classified = classifyResourceFailure(err);
    assert.equal(classified.reasonCode, "REFERENCE_ENCRYPTED");
    assert.equal(classified.failoverEligible, false);
  });
});
