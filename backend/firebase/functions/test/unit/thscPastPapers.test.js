"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { fileNameFor, legacyUrl, parseArgs, parseListing, parseWorkers } = require("../../scripts/thscPastPapers");
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
    assert.throws(() => parseArgs(["--years=12"]), /No THSC listing/);
  });
});
