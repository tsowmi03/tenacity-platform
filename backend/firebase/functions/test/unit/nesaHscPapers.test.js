"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { fileNameFor, folderFor, parseArgs, parsePdfLinks, parseYears } = require("../../scripts/nesaHscPapers");

describe("nesaHscPapers", () => {
  it("finds the year pages a course links to", () => {
    const html = `<a href="/education-and-training/nesa/curriculum/hsc-exam-papers/english-advanced/2025" title="x">
<a href="/education-and-training/nesa/curriculum/hsc-exam-papers/english-advanced/2019">
<a href="/education-and-training/nesa/curriculum/hsc-exam-papers/english-advanced/2025">
<a href="/education-and-training/nesa/curriculum/hsc-exam-papers/english-advanced-archive/2014">`;
    assert.deepEqual(parseYears(html, "english-advanced"), ["2019", "2025"]);
    assert.deepEqual(parseYears(html, "english-advanced-archive"), ["2014"]);
  });

  it("reads PDF links and drops the size note", () => {
    const html = `<a href="/sites/default/files/noindex/2025-11/2025-hsc-english-advanced-paper-1-mg.pdf" class="x">English Advanced HSC marking guidelines 2025 &ndash; paper 1 <span>(PDF 84.63KB)</span></a>
<a href="/somewhere/else">Not a PDF</a>`;
    assert.deepEqual(parsePdfLinks(html), [{
      url: "https://www.nsw.gov.au/sites/default/files/noindex/2025-11/2025-hsc-english-advanced-paper-1-mg.pdf",
      title: "English Advanced HSC marking guidelines 2025 - paper 1",
    }]);
  });

  it("keeps the title in the file name so guidelines can be paired", () => {
    assert.equal(fileNameFor("English Advanced HSC marking guidelines 2025 - paper 1"), "English Advanced HSC marking guidelines 2025 - paper 1.pdf");
    assert.equal(fileNameFor("English Standard/Advanced HSC exam 2019 Paper 1"), "English Standard-Advanced HSC exam 2019 Paper 1.pdf");
  });

  it("files the common Paper 1 once, under Standard and Advanced", () => {
    assert.equal(folderFor("English Standard/Advanced HSC exam 2019 Paper 1", "Standard"), "Standard and Advanced");
    assert.equal(folderFor("English Advanced HSC exam 2019 Paper 2", "Advanced"), "Advanced");
  });

  it("defaults to the HSC Papers folder", () => {
    assert.match(parseArgs([]).out, /Resources\/English\/Past Papers\/Year 12\/HSC Papers$/);
    assert.throws(() => parseArgs(["--nope"]), /Unknown argument/);
  });
});
