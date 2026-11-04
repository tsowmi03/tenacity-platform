"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { lastJson, parseArgs, sourcesToRetire } = require("../../scripts/questionBankWeekly");

describe("questionBankWeekly", () => {
  it("retires the questions of removed files and of changed files due for extraction", () => {
    const retiring = sourcesToRetire([
      { id: "gone", status: "removed", path: "a.pdf" },
      { id: "changed", status: "pending", version: "v2", extractedVersion: "v1", path: "b.pdf" },
      { id: "new", status: "pending", version: "v1", path: "c.pdf" },
      { id: "same", status: "pending", version: "v1", extractedVersion: "v1", path: "d.pdf" },
      { id: "skipped", status: "skipped", version: "v2", extractedVersion: "v1", path: "e.pdf" },
    ]);
    assert.deepEqual(retiring.map((s) => [s.id, s.reason]), [["gone", "source_removed"], ["changed", "source_changed"]]);
  });

  it("keeps its own spending cap", () => {
    assert.equal(parseArgs(["--projectId=p", "--work-dir=/tmp/w"]).cap, 10);
    assert.throws(() => parseArgs(["--projectId=p", "--work-dir=/tmp/w", "--cap=500"]), /cap/);
  });

  it("reads the extract script's closing summary", () => {
    assert.deepEqual(lastJson('Prepared 1/1\n{\n  "pages": 4,\n  "questions": 9,\n  "spentUsd": 0.01\n}\n'), { pages: 4, questions: 9, spentUsd: 0.01 });
    assert.equal(lastJson("no json"), null);
  });
});
