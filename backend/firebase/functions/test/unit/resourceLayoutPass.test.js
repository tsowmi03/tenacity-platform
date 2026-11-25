"use strict";

// RES-40. The measured layout pass: pages left with a few lines before a new
// section, found on the converted PDF and fixed by a rebuild.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const PDFDocument = require("pdfkit");

const {
  SHORT_PAGE_LINES,
  findSectionJoins,
  joinShortSections,
  pageBodies,
  pdfPageTexts,
} = require("../../src/resources/layoutPass");
const { bodyFill, readPgm, SPARSE_FILL } = require("../../scripts/lib/sparsePages");

const HEADER = ["Year 10 English Practice Paper", "English"];
const footer = (number) => `Mei Tanaka | Tenacity Tutoring - Determination Meets Success. Page ${number}`;
const page = (number, ...lines) => [...HEADER, footer(number), ...lines].join("\n");
const full = (number, first) => page(number, first, ...Array.from({ length: 30 }, (_, i) => `Body line ${i + 1}`));

describe("pageBodies", () => {
  it("drops the running header and the footer from every page", () => {
    assert.deepEqual(pageBodies([page(1, "Stimulus booklet", "Text 1"), page(2, "Section A")]), [
      ["Stimulus booklet", "Text 1"],
      ["Section A"],
    ]);
  });

  it("keeps the first lines of a single page: nothing shows they are a header", () => {
    assert.deepEqual(pageBodies([page(1, "Questions")]), [[...HEADER, "Questions"]]);
  });

  it("stops at the lines the pages really share", () => {
    const bodies = pageBodies(["Title\nfirst page text", "Title\nsecond page text"]);
    assert.deepEqual(bodies, [["first page text"], ["second page text"]]);
  });
});

describe("findSectionJoins", () => {
  it("names the heading that opens the page after a page of a few lines", () => {
    const pages = [full(1, "Stimulus booklet"), page(2, "three lines", "of text", "left over."), full(3, "Section A")];
    assert.deepEqual(findSectionJoins(pages), ["Section A"]);
  });

  it("leaves a page with real content, an empty page and the last page alone", () => {
    const busy = page(2, ...Array.from({ length: SHORT_PAGE_LINES + 1 }, (_, i) => `Line ${i}`));
    assert.deepEqual(findSectionJoins([full(1, "Questions"), busy, full(3, "Section B")]), []);
    // No text at all is a picture or ruled lines: nothing to conclude from it.
    assert.deepEqual(findSectionJoins([full(1, "Questions"), page(2), full(3, "Section B")]), []);
    assert.deepEqual(findSectionJoins([full(1, "Questions"), page(2, "one last line")]), []);
  });

  it("ignores a next page that opens with a question, not a heading", () => {
    const question = "6. In the final two sentences of Text 1, how does irony expose the limits of Laura's earlier view?";
    assert.deepEqual(findSectionJoins([full(1, "Section A"), page(2, "two lines", "left over."), full(3, question)]), []);
  });

  it("names each heading once", () => {
    const pages = [page(1, "a"), full(2, "Section A"), page(3, "b"), full(4, "Section A")];
    assert.deepEqual(findSectionJoins(pages), ["Section A"]);
  });
});

describe("joinShortSections", () => {
  const short = [full(1, "Stimulus booklet"), page(2, "left over."), full(3, "Section A")];
  const joined = [full(1, "Stimulus booklet"), full(2, "left over.")];
  const clone = (resource) => JSON.parse(JSON.stringify(resource));
  const built = () => ({ buffer: Buffer.from("first"), resource: { title: "Paper", layout: { joinBefore: ["End of Topic Quiz"] } } });

  it("rebuilds with the section joined and keeps the rebuild when it saves a page", async () => {
    const first = built();
    let rebuiltFrom = null;
    const result = await joinShortSections({
      built: first,
      pdf: Buffer.from("pdf:first"),
      clone,
      rebuild: async (resource) => { rebuiltFrom = resource; return { buffer: Buffer.from("second"), resource }; },
      convert: async (buffer) => Buffer.from(`pdf:${buffer}`),
      readPages: async (pdf) => (pdf.toString() === "pdf:first" ? short : joined),
    });
    // Earlier joins are kept, and the build it started from is left as it was.
    assert.deepEqual(rebuiltFrom.layout.joinBefore, ["End of Topic Quiz", "Section A"]);
    assert.deepEqual(first.resource.layout.joinBefore, ["End of Topic Quiz"]);
    assert.equal(result.built.buffer.toString(), "second");
    assert.equal(result.pdf.toString(), "pdf:second");
    assert.deepEqual(result.joined, ["Section A"]);
    assert.equal(result.pagesSaved, 1);
  });

  it("does not rebuild a document with no short page", async () => {
    const first = built();
    const result = await joinShortSections({
      built: first, pdf: Buffer.from("pdf"), clone,
      rebuild: async () => assert.fail("no rebuild"),
      convert: async () => assert.fail("no conversion"),
      readPages: async () => joined,
    });
    assert.equal(result.built, first);
    assert.deepEqual(result.joined, []);
  });

  it("keeps the first build when the rebuild saves no page or cannot be converted", async () => {
    const first = built();
    const args = { built: first, pdf: Buffer.from("pdf:first"), clone, rebuild: async (resource) => ({ buffer: Buffer.from("second"), resource }) };
    // The break before that heading was one that must stay (Answers, say).
    const noGain = await joinShortSections({ ...args, convert: async () => Buffer.from("pdf:second"), readPages: async () => short });
    assert.equal(noGain.built, first);
    assert.equal(noGain.pdf.toString(), "pdf:first");
    const noPdf = await joinShortSections({ ...args, convert: async () => null, readPages: async () => short });
    assert.equal(noPdf.built, first);
  });
});

describe("pdfPageTexts", () => {
  it("reads each page of a real PDF", async () => {
    const pdf = await new Promise((resolve) => {
      const doc = new PDFDocument({ size: "A4" });
      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.text("Year 10 Paper").text("left over.");
      doc.addPage().text("Year 10 Paper").text("Section A");
      doc.end();
    });
    const pages = await pdfPageTexts(pdf);
    assert.equal(pages.length, 2);
    assert.match(pages[0], /left over\./);
    assert.deepEqual(pageBodies(pages), [["left over."], ["Section A"]]);
  });
});

describe("sparse page measure (scripts/lib/sparsePages)", () => {
  // A 10 x 100 page: white, with ink on the given rows.
  const pageWithInk = (rows) => {
    const data = Buffer.alloc(10 * 100, 255);
    for (const row of rows) data[row * 10 + 4] = 0;
    return { data, width: 10, height: 100 };
  };

  it("measures how far down the body the ink reaches, ignoring header and footer", () => {
    // Rows 0-10 are the header band and 92-99 the footer band.
    assert.equal(bodyFill(pageWithInk([3, 95])).fill, 0);
    const answerLine = bodyFill(pageWithInk([3, 14, 95]));
    assert.ok(answerLine.fill < SPARSE_FILL, "one line under the header is a near-blank page");
    assert.ok(bodyFill(pageWithInk([3, 14, 60, 95])).fill > 0.5);
    assert.equal(bodyFill(pageWithInk([3, 91, 95])).fill, 1);
  });

  it("reads the greyscale image pdftoppm writes", () => {
    const image = readPgm(Buffer.concat([Buffer.from("P5\n# made by a test\n2 2\n255\n"), Buffer.from([0, 255, 128, 7])]));
    assert.deepEqual({ width: image.width, height: image.height, data: [...image.data] }, { width: 2, height: 2, data: [0, 255, 128, 7] });
    assert.throws(() => readPgm(Buffer.from("P6\n1 1\n255\n\0\0\0")), /Not a binary PGM/);
  });
});
