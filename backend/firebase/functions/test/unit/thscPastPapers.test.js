"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { fetchPaper, fileNameFor, isMissingFilePdf, legacyUrl, MissingOnThsc, paperYear, parseArgs, parseListing, parseWorkers, viewerTitle } = require("../../scripts/thscPastPapers");
const { isAnswerFile } = require("../../src/questionBank/sourceRules");

describe("thscPastPapers", () => {
  it("reads papers from a listing page", () => {
    const html = `<span class="content">
<a href="#v" onClick="pdf(this, 5098)">Baulkham Hills 2010 w. sol</a><br />
<a href="#v" onclick="pdf(this, '5098')">Baulkham Hills 2011</a><br />
<a href="/s/upload">upload files here</a></span>`;
    assert.deepEqual(parseListing(html), [
      { group: "5098", title: "Baulkham Hills 2010 w. sol" },
      { group: "5098", title: "Baulkham Hills 2011" },
    ]);
  });

  it("finds the worker pool in the viewer script", () => {
    const js = 'function selectworker(includeFallback = true) {\n  var workers = [\n    "AKfycbA1-x_",\n    "AKfycbB2"\n  ];';
    assert.deepEqual(parseWorkers(js), ["AKfycbA1-x_", "AKfycbB2"]);
    assert.deepEqual(parseWorkers("nothing here"), []);
  });

  it("names files by school, year and kind, never as solutions", () => {
    const name = fileNameFor({ title: "Baulkham Hills 2010 w. sol", year: 9, label: "Yearly" });
    assert.equal(name, "Baulkham Hills 2010 - Year 9 Yearly.pdf");
    assert.equal(isAnswerFile(name), false, "the question bank would otherwise skip it");
    assert.equal(fileNameFor({ title: "St Ives 2019: Term 2", year: 10, label: "Assessment Task" }), "St Ives 2019- Term 2 - Year 10 Assessment Task.pdf");
  });

  it("keeps English marking guideline titles so they can be paired", () => {
    assert.equal(fileNameFor({ title: "2001 Marking Guidelines", year: 12, label: "HSC" }), "2001 Marking Guidelines - Year 12 HSC.pdf");
    assert.equal(fileNameFor({ title: "Abbotsleigh 2019 P1", year: 12, label: "Trial" }), "Abbotsleigh 2019 P1 - Year 12 Trial.pdf");
  });

  it("asks a worker for the paper the way the viewer does", () => {
    const url = legacyUrl("AKfycbX", "5098", "Baulkham Hills 2010 w. sol");
    assert.equal(url.origin + url.pathname, "https://script.google.com/macros/s/AKfycbX/exec");
    assert.equal(url.searchParams.get("export"), "view");
    assert.equal(url.searchParams.get("base"), "5098");
    assert.equal(url.searchParams.get("field"), "Baulkham Hills 2010 w. sol");
    assert.match(url.searchParams.get("hash"), /^[0-9a-f]{64}$/);
  });

  it("keeps (Adv.) and (Std.) in titles, like THSC's viewer", () => {
    assert.equal(viewerTitle("Abbotsleigh 2010 P2 (Adv.)"), "Abbotsleigh 2010 P2 (Adv.)");
    assert.equal(viewerTitle("Sydney Grammar 2022 P2 (Std.)"), "Sydney Grammar 2022 P2 (Std.)");
    assert.equal(viewerTitle("2001 HSC Paper 2 (Advanced)"), "2001 HSC Paper 2 Advanced");
    assert.equal(viewerTitle("St Ives 2019: Term 2"), "St Ives 2019 Term 2");
  });

  it("treats THSC's 404 PDF as a missing file, without retrying", async () => {
    const paper = Buffer.from("%PDF-1.4 a real paper");
    assert.equal(isMissingFilePdf(paper, "404_html.pdf"), true);
    assert.equal(isMissingFilePdf(paper, "Abbotsleigh 2019 English Trial Paper 1.pdf"), false);
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      return { ok: true, json: async () => ({ name: "404_html.pdf", data: Buffer.from("%PDF-1.4").toString("base64") }) };
    };
    await assert.rejects(fetchPaper({ group: "2720", title: "2001 HSC Paper 1" }, ["AKfycbX"], { fetchImpl }), MissingOnThsc);
    assert.equal(calls, 1);
  });

  it("only takes years it has listings for", () => {
    assert.deepEqual(parseArgs(["--years=9"]).years, [9]);
    assert.deepEqual(parseArgs([]).years, [9, 10, 11, 12]);
    assert.equal(parseArgs(["--years=11,12", "--since=2022"]).since, 2022);
    assert.throws(() => parseArgs(["--years=8"]), /No THSC maths listing/);
    assert.throws(() => parseArgs(["--subject=science"]), /Unknown subject/);
  });

  it("files English under Resources/English/Past Papers, Year 12 only", () => {
    const options = parseArgs(["--subject=english"]);
    assert.deepEqual(options.years, [12]);
    assert.match(options.out, /Resources\/English\/Past Papers$/);
    assert.match(parseArgs([]).out, /Resources\/Maths\/Past Papers$/);
    assert.throws(() => parseArgs(["--subject=english", "--years=9"]), /No THSC english listing/);
  });

  // RES-69.
  it("names senior maths papers by course and kind, still never as solutions", () => {
    const listing = parseArgs(["--years=12"]).listings[12].find((l) => l.course === "Extension 1" && l.kind === "Trial Papers");
    assert.equal(listing.since, 2019, "the current syllabus by default");
    const name = fileNameFor({ title: "Abbotsleigh 2021 w. sol", year: 12, label: listing.label });
    assert.equal(name, "Abbotsleigh 2021 - Year 12 Extension 1 Trial.pdf");
    assert.equal(isAnswerFile(name), false);
  });

  it("reads the year a paper is from", () => {
    assert.equal(paperYear("Sydney Boys 2019 Trial"), 2019);
    assert.equal(paperYear("Knox 2018-2019 Task 2"), 2019);
    assert.equal(paperYear("Untitled"), null);
  });
});
