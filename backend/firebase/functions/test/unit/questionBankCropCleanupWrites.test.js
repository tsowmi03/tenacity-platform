"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { CLEANUP_ACTOR, cleanedPathOf, planQuestionWrite, planRollback } = require("../../src/questionBank/cropCleanupWrites");
const { keepAdminChanges } = require("../../src/questionBank/adminChanges");
const { cropsFromRecords, openRun, outcomeOf, parseArgs } = require("../../scripts/questionBankCropCleanup");

const AT = "2026-11-11T00:00:00Z";
const A = "questionBank/diagrams/q1_1.png";
const B = "questionBank/diagrams/q1_2.png";

describe("cleanedPathOf", () => {
  it("puts the cleaned file beside the original", () => {
    assert.equal(cleanedPathOf(A), "questionBank/diagrams/q1_1_bw1.png");
    assert.equal(cleanedPathOf(A, 2), "questionBank/diagrams/q1_1_bw2.png");
  });

  it("refuses anything but a PNG", () => {
    assert.throws(() => cleanedPathOf("questionBank/diagrams/q1_1.jpg"), /Not a PNG/);
  });
});

describe("planQuestionWrite", () => {
  const live = { status: "live", figures: [{ storagePath: A, type: "graph", box: [1, 2, 3, 4] }, { storagePath: B }] };

  it("points the matching figure at the cleaned file and keeps the original path", () => {
    const update = planQuestionWrite(live, { replacements: new Map([[A, cleanedPathOf(A)]]), at: AT });
    assert.deepEqual(update, {
      figures: [
        { storagePath: cleanedPathOf(A), originalStoragePath: A, cleanupVersion: 1, type: "graph", box: [1, 2, 3, 4] },
        { storagePath: B },
      ],
    });
  });

  it("changes nothing when no figure uses the crop any more", () => {
    assert.equal(planQuestionWrite(live, { replacements: new Map([["questionBank/diagrams/other.png", "x_bw1.png"]]), at: AT }), null);
  });

  it("moves a hidden question's figures too, without touching its status", () => {
    const update = planQuestionWrite({ ...live, status: "hidden", hiddenBy: "admin1" }, { replacements: new Map([[B, cleanedPathOf(B)]]), at: AT });
    assert.equal(update.status, undefined);
    assert.equal(update.figures[1].storagePath, cleanedPathOf(B));
  });

  it("hides a live question whose crop cannot be used, stamped as this clean-up", () => {
    assert.deepEqual(planQuestionWrite(live, { hides: new Map([[B, "handwriting"]]), at: AT }), {
      status: "hidden", hiddenBy: CLEANUP_ACTOR, hiddenAt: AT, hiddenWith: null, hiddenReason: "handwriting",
    });
  });

  it("leaves an already hidden question's stamp alone", () => {
    assert.equal(planQuestionWrite({ ...live, status: "hidden", hiddenBy: "admin1" }, { hides: new Map([[A, "unusable"]]), at: AT }), null);
  });
});

describe("planRollback", () => {
  it("puts cleaned figures back and restores this clean-up's hides", () => {
    const written = { status: "live", figures: [{ storagePath: A }, { storagePath: B }] };
    const cleaned = { ...written, ...planQuestionWrite(written, { replacements: new Map([[A, cleanedPathOf(A)]]), at: AT }) };
    const hidden = { ...cleaned, ...planQuestionWrite(cleaned, { hides: new Map([[B, "wrong_symbols"]]), at: AT }) };
    const update = planRollback(hidden);
    assert.deepEqual(update.figures, written.figures);
    assert.deepEqual({ ...hidden, ...update }, { ...written, hiddenBy: null, hiddenAt: null, hiddenWith: null, hiddenReason: null });
  });

  it("keeps an admin's own hide", () => {
    assert.equal(planRollback({ status: "hidden", hiddenBy: "admin1", figures: [{ storagePath: A }] }), null);
  });

  it("leaves a question an admin has restored since", () => {
    assert.equal(planRollback({ status: "live", hiddenBy: null, hiddenReason: "handwriting", figures: [{ storagePath: A }] }), null);
  });
});

describe("keepAdminChanges", () => {
  it("keeps a clean-up hide and its reason when the record is extracted again", () => {
    const kept = keepAdminChanges({ status: "live", text: "new" }, { status: "hidden", hiddenBy: CLEANUP_ACTOR, hiddenReason: "unusable" });
    assert.equal(kept.status, "hidden");
    assert.equal(kept.hiddenReason, "unusable");
  });
});

describe("cropsFromRecords", () => {
  const owner = (overrides = {}) => ({ status: "live", stem: "Find", text: "x", sourceId: "s1", sourcePath: "a/b.pdf", pageNumber: 3, pageSize: { width: 600 }, figures: [{ storagePath: A, type: "graph", description: "a graph" }], ...overrides });

  it("lists a shared crop once, with every question that uses it", () => {
    const crops = cropsFromRecords([
      { id: "q1", data: owner() },
      { id: "q2", data: { status: "live", figures: [{ storagePath: A, sharedFrom: "q1" }] } },
    ]);
    assert.equal(crops.length, 1);
    assert.deepEqual(crops[0].questionIds, ["q1", "q2"]);
    assert.equal(crops[0].questionId, "q1");
    assert.equal(crops[0].questionText, "Find x");
    assert.equal(crops[0].pageWidth, 600);
  });

  it("leaves out a crop only hidden questions use, but lists hidden users of a live crop", () => {
    const crops = cropsFromRecords([
      { id: "q1", data: owner({ status: "hidden", figures: [{ storagePath: B }] }) },
      { id: "q2", data: owner({ status: "hidden" }) },
      { id: "q3", data: { status: "live", figures: [{ storagePath: A, sharedFrom: "q2" }] } },
    ]);
    assert.deepEqual(crops.map((c) => c.storagePath), [A]);
    assert.deepEqual(crops[0].questionIds, ["q2", "q3"]);
  });

  it("drops a crop whose owning record is missing", () => {
    assert.deepEqual(cropsFromRecords([{ id: "q2", data: { status: "live", figures: [{ storagePath: A, sharedFrom: "gone" }] } }]), []);
  });
});

describe("outcomeOf", () => {
  const check = { missingLabels: [], missingShapes: [], unreadableLabels: [], wronglyFilled: [], mergedRegions: [], wrongSymbols: false };

  it("follows a crop through the stages", () => {
    assert.equal(outcomeOf({}), "not_classified");
    assert.equal(outcomeOf({ report: {} }), "not_cleaned");
    assert.equal(outcomeOf({ report: {}, plan: { outcome: "hide" } }), "hide");
    assert.equal(outcomeOf({ report: {}, plan: { outcome: "clean" } }), "not_verified");
    assert.equal(outcomeOf({ report: {}, plan: { outcome: "clean" }, check }), "passed");
    assert.equal(outcomeOf({ report: {}, plan: { outcome: "clean" }, check: { ...check, missingLabels: ["4 cm"] } }), "failed");
    assert.equal(outcomeOf({ report: {}, plan: { outcome: "clean" }, check, tintLeft: true }), "failed");
    assert.equal(outcomeOf({ report: {}, cleanError: "boom" }), "clean_error");
  });
});

describe("parseArgs", () => {
  it("needs a work dir except to roll back", () => {
    assert.throws(() => parseArgs(["--stage=select"]), /work-dir/);
    assert.equal(parseArgs(["--stage=rollback"]).stage, "rollback");
  });

  it("reads limits and caps as numbers", () => {
    const options = parseArgs(["--stage=all", "--work-dir=/tmp/x", "--limit=2000", "--cap=5", "--commit", "--yes"]);
    assert.equal(options.limit, 2000);
    assert.equal(options.cap, 5);
    assert.equal(options.commit && options.yes, true);
    assert.throws(() => parseArgs(["--stage=all", "--work-dir=/tmp/x", "--cap=lots"]), /cap/);
    assert.equal(options.hides, true);
    assert.equal(parseArgs(["--stage=write", "--work-dir=/tmp/x", "--no-hides"]).hides, false);
  });
});

describe("openRun", () => {
  it("picks up where it stopped, and retries a failed write", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qb-clean-run-"));
    try {
      const first = openRun(dir);
      first.setCrops([{ id: "k0", storagePath: A, questionIds: ["q1"] }, { id: "k1", storagePath: B, questionIds: ["q1"] }]);
      first.record(first.byId.get("k0"), "classify", { report: { usable: true } });
      first.record(first.byId.get("k1"), "writeFailed", { writeError: "timeout" });
      const second = openRun(dir);
      assert.equal(second.crops.length, 2);
      assert.deepEqual(second.byId.get("k0").report, { usable: true });
      assert.equal(second.byId.get("k0").classifyDone, true);
      assert.equal(second.byId.get("k1").writeDone, undefined);
      assert.equal(second.byId.get("k1").writeError, "timeout");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
