"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { pairingKey, planEnglishSources, roleOf } = require("../../src/englishBank/sourceRules");
const { ENGLISH_FIELDS, parseArgs, recordedPlans, report } = require("../../scripts/englishBankSync");
const { planSourceWrites } = require("../../src/questionBank/sourceStore");

const pdf = "application/pdf";
let nextId = 0;
function file(path, extra = {}) {
  nextId++;
  return { id: `f${nextId}`, name: path.split("/").pop(), path, mimeType: pdf, md5: `md5-${nextId}`, modifiedTime: "2026-11-05T00:00:00Z", ...extra };
}
const byPath = (plans) => Object.fromEntries(plans.map((plan) => [plan.path, plan]));

describe("English bank sources", () => {
  it("only takes the stimulus folders", () => {
    const plans = byPath(planEnglishSources([
      file("English/Past Papers/Year 12/Trial Paper 1/Abbotsleigh 2019 P1 - Year 12 Trial.pdf"),
      file("English/Comprehension/year 5 comprehension and written expression.pdf"),
      file("English/Creative/118308773.jpg", { mimeType: "image/jpeg" }),
      file("English/LitCharts/Macbeth.pdf"),
      file("English/Grammar Spelling/Commas.pdf"),
      file("English/Essay Writing.pdf"),
      file("English/Past Papers/Year 12/HSC Papers/NESA sources.json", { mimeType: "application/json" }),
    ]));
    assert.equal(plans["English/Past Papers/Year 12/Trial Paper 1/Abbotsleigh 2019 P1 - Year 12 Trial.pdf"].role, "paper");
    assert.equal(plans["English/Comprehension/year 5 comprehension and written expression.pdf"].status, "pending");
    assert.equal(plans["English/Creative/118308773.jpg"].role, "image");
    assert.equal(plans["English/LitCharts/Macbeth.pdf"].skipReason, "out_of_scope");
    assert.equal(plans["English/Grammar Spelling/Commas.pdf"].skipReason, "out_of_scope");
    assert.equal(plans["English/Essay Writing.pdf"].skipReason, "out_of_scope");
    assert.equal(plans["English/Past Papers/Year 12/HSC Papers/NESA sources.json"].skipReason, "not_document");
  });

  it("tells guides from papers", () => {
    assert.equal(roleOf({ name: "English Advanced HSC marking guidelines 2025 - paper 1.pdf" }), "guide");
    assert.equal(roleOf({ name: "Abbotsleigh 2025 Paper1 Sample Answers.docx" }), "guide");
    assert.equal(roleOf({ name: "English Advanced HSC sample writing booklet 2019 Paper 2.pdf" }), "guide");
    assert.equal(roleOf({ name: "English Advanced HSC exam paper 2025 - paper 1.pdf" }), "paper");
    assert.equal(roleOf({ name: "Basic Reading Skills Years 5 and 6.pdf" }), "paper");
  });

  it("matches a guide's name to its paper's whatever the word order", () => {
    assert.equal(pairingKey("English Advanced HSC marking guidelines 2025 - paper 1.pdf"), pairingKey("English Advanced HSC exam paper 2025 - paper 1.pdf"));
    assert.equal(pairingKey("Abbotsleigh 2025 Paper1 Sample Answers.docx"), pairingKey("Abbotsleigh 2025 English Trial Paper 1.pdf"));
    assert.notEqual(pairingKey("English Advanced HSC marking guidelines 2025 - paper 1.pdf"), pairingKey("English Advanced HSC exam paper 2025 - paper 2.pdf"));
    assert.notEqual(pairingKey("English Standard HSC exam 2018 Paper 1.pdf"), pairingKey("English Advanced HSC exam 2018 Paper 1.pdf"));
  });

  it("pairs each guide with one paper, preferring its own folder", () => {
    const plans = byPath(planEnglishSources([
      file("English/Past Papers/Year 12/HSC Papers/Advanced/English Advanced HSC exam paper 2025 - paper 2.pdf"),
      file("English/Past Papers/Year 12/HSC Papers/Advanced/English Advanced HSC marking guidelines 2025 - paper 2.pdf"),
      file("English/Past Papers/Year 12/HSC Papers/Advanced/English Advanced HSC sample writing booklet 2025 - paper 2.pdf"),
      file("English/Past Papers/Year 12/Trial Paper 1/Abbotsleigh 2025 P1 - Year 12 Trial.pdf"),
      file("English/Comprehension/Abbotsleigh 2025 English Trial Paper 1.pdf"),
      file("English/Comprehension/Abbotsleigh 2025 Paper1 Sample Answers.docx"),
      file("English/Comprehension/Mystery marking guide.pdf"),
    ]));
    const paper2 = plans["English/Past Papers/Year 12/HSC Papers/Advanced/English Advanced HSC exam paper 2025 - paper 2.pdf"];
    assert.equal(plans["English/Past Papers/Year 12/HSC Papers/Advanced/English Advanced HSC marking guidelines 2025 - paper 2.pdf"].pairedWith, paper2.id);
    assert.equal(plans["English/Past Papers/Year 12/HSC Papers/Advanced/English Advanced HSC sample writing booklet 2025 - paper 2.pdf"].pairedWith, paper2.id);
    assert.equal(plans["English/Comprehension/Abbotsleigh 2025 Paper1 Sample Answers.docx"].pairedWith, plans["English/Comprehension/Abbotsleigh 2025 English Trial Paper 1.pdf"].id);
    assert.equal(plans["English/Comprehension/Mystery marking guide.pdf"].pairedWith, null);
    assert.equal(paper2.pairedWith, null);
  });

  it("skips byte-identical copies across folders", () => {
    const plans = planEnglishSources([
      file("English/Past Papers/Year 12/Trial Paper 1/Sydney Grammar 2024 P1 - Year 12 Trial.pdf", { md5: "same" }),
      file("English/Comprehension/Sydney Grammar 2024 English Trial Paper 1.pdf", { md5: "same" }),
    ]);
    assert.deepEqual(plans.map((plan) => plan.status).sort(), ["pending", "skipped"]);
    assert.equal(plans.find((plan) => plan.status === "skipped").skipReason, "duplicate");
  });

  it("records role and pairing, and reports unpaired guides", () => {
    const plans = planEnglishSources([
      file("English/Comprehension/Basic Reading Skills Years 5 and 6.pdf"),
      file("English/Comprehension/Orphan Answers.pdf"),
    ]);
    const writes = planSourceWrites(new Map(), plans, { fields: ENGLISH_FIELDS });
    assert.deepEqual(writes.map((write) => [write.data.role, write.data.pairedWith]).sort(), [["guide", null], ["paper", null]]);
    const summary = report(plans);
    assert.equal(summary.toExtract, 2);
    assert.deepEqual(summary.unpairedGuides, ["English/Comprehension/Orphan Answers.pdf"]);
    assert.deepEqual(summary.byFolderAndRole, { "Comprehension / paper": 1, "Comprehension / guide": 1 });
  });

  it("records only the stimulus folders", () => {
    const plans = planEnglishSources([
      file("English/Comprehension/Basic Reading Skills Years 5 and 6.pdf"),
      file("English/Comprehension/notes.json", { mimeType: "application/json" }),
      file("English/LitCharts/Macbeth.pdf"),
    ]);
    assert.deepEqual(recordedPlans(plans).map((plan) => plan.name).sort(), ["Basic Reading Skills Years 5 and 6.pdf", "notes.json"]);
  });

  it("needs a project", () => {
    assert.throws(() => parseArgs([]), /--projectId is required/);
    assert.equal(parseArgs(["--projectId=p", "--commit", "--yes"]).commit, true);
  });
});
