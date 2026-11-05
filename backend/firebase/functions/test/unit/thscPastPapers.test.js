"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { fileNameFor, legacyUrl, paperYear, parseArgs, parseListing, parseWorkers } = require("../../scripts/thscPastPapers");
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
    const name = fileNameFor({ title: "Baulkham Hills 2010 w. sol", year: 9, kind: "Yearly Papers" });
    assert.equal(name, "Baulkham Hills 2010 - Year 9 Yearly.pdf");
    assert.equal(isAnswerFile(name), false, "the question bank would otherwise skip it");
    assert.equal(fileNameFor({ title: "St Ives 2019: Term 2", year: 10, kind: "Assessment Tasks" }), "St Ives 2019- Term 2 - Year 10 Assessment Task.pdf");
  });

  it("asks a worker for the paper the way the viewer does", () => {
    const url = legacyUrl("AKfycbX", "5098", "Baulkham Hills 2010 w. sol");
    assert.equal(url.origin + url.pathname, "https://script.google.com/macros/s/AKfycbX/exec");
    assert.equal(url.searchParams.get("export"), "view");
    assert.equal(url.searchParams.get("base"), "5098");
    assert.equal(url.searchParams.get("field"), "Baulkham Hills 2010 w. sol");
    assert.match(url.searchParams.get("hash"), /^[0-9a-f]{64}$/);
  });

  it("only takes years it has listings for", () => {
    assert.deepEqual(parseArgs(["--years=9"]).years, [9]);
    assert.deepEqual(parseArgs(["--years=11,12", "--since=2019"]), { ...parseArgs([]), years: [11, 12], since: 2019 });
    assert.throws(() => parseArgs(["--years=8"]), /No THSC listing/);
  });

  it("names senior papers by course and kind, still never as solutions", () => {
    const name = fileNameFor({ title: "Abbotsleigh 2021 w. sol", year: 12, kind: "Trial Papers", course: "Extension 1" });
    assert.equal(name, "Abbotsleigh 2021 - Year 12 Extension 1 Trial.pdf");
    assert.equal(isAnswerFile(name), false);
    assert.equal(fileNameFor({ title: "Baulko 2020", year: 11, kind: "Prelim Papers", course: "Standard" }), "Baulko 2020 - Year 11 Standard Prelim.pdf");
  });

  it("reads the year a paper is from", () => {
    assert.equal(paperYear("Sydney Boys 2019 Trial"), 2019);
    assert.equal(paperYear("Knox 2018-2019 Task 2"), 2019);
    assert.equal(paperYear("Untitled"), null);
  });
});
