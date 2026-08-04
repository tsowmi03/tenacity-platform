const assert = require("node:assert");
const { describe, it } = require("node:test");

const {
  weekNumFor,
  weekFromDocId,
} = require("../../scripts/backfillAttendanceWeekNum");

describe("attendance weekNum backfill", () => {
  it("leaves a document that already has a usable weekNum alone", () => {
    // Re-running the backfill must be a no-op rather than a rewrite.
    assert.equal(weekNumFor({ weekNum: 3, weekNumber: 3 }, "2026_T2_W3"), null);
    assert.equal(weekNumFor({ weekNum: 1 }, "2026_T2_W1"), null);
  });

  it("takes the week from weekNumber when that is what was written", () => {
    // The shape the scheduled rollover produced for every term it generated.
    assert.equal(weekNumFor({ weekNumber: 7 }, "2026_T2_W7"), 7);
  });

  it("falls back to the document id when neither field is usable", () => {
    assert.equal(weekNumFor({}, "2026_T2_W4"), 4);
    assert.equal(weekNumFor({ weekNumber: null }, "2025_T1_W10"), 10);
  });

  it("prefers weekNumber over the id, since it is the value that was stored", () => {
    assert.equal(weekNumFor({ weekNumber: 2 }, "2026_T2_W9"), 2);
  });

  it("rejects a zero or negative week rather than writing it", () => {
    // `weekNum: 0` is exactly what the mobile model's `?? 0` default produced,
    // so treating it as valid would preserve the bug being fixed.
    assert.equal(weekNumFor({ weekNum: 0, weekNumber: 5 }, "2026_T2_W5"), 5);
    assert.equal(weekNumFor({ weekNumber: 0 }, "2026_T2_W6"), 6);
    assert.equal(weekNumFor({ weekNumber: -1 }, "2026_T2_W6"), 6);
  });

  it("gives up rather than guessing when the id carries no week", () => {
    assert.equal(weekNumFor({}, "not-a-week-doc"), null);
    assert.equal(weekNumFor({}, "2026_T2"), null);
    assert.equal(weekNumFor(null, "2026_T2_W1"), null);
  });

  it("parses the trailing week off a document id", () => {
    assert.equal(weekFromDocId("2026_T2_W3"), 3);
    assert.equal(weekFromDocId("2026_T2_W10"), 10);
    assert.equal(weekFromDocId("2026_T2_W0"), null);
    assert.equal(weekFromDocId("2026_T2"), null);
    assert.equal(weekFromDocId(undefined), null);
  });

  it("ignores a non-integer weekNumber", () => {
    assert.equal(weekNumFor({ weekNumber: "3" }, "2026_T2_W8"), 8);
    assert.equal(weekNumFor({ weekNumber: 2.5 }, "2026_T2_W8"), 8);
  });
});
