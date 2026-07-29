const assert = require("node:assert");
const { describe, it } = require("node:test");

const { marksFor } = require("../../scripts/backfillRollMarks");

const STAMPED = new Date("2026-05-05T07:00:00Z");

describe("roll marks backfill", () => {
  it("marks the stored list here and the rest of the roster away", () => {
    const marks = marksFor(
      { attendance: ["s1", "s2"], rollCompletedAt: STAMPED },
      ["s1", "s2", "s3"],
    );

    assert.deepEqual(marks, { s1: "here", s2: "here", s3: "away" });
  });

  it("skips a roll nobody finished", () => {
    // For an incomplete roll, absence from the list means "not reached yet",
    // not "away". Guessing would invent absences that never happened.
    assert.equal(marksFor({ attendance: ["s1"] }, ["s1", "s2"]), null);
  });

  it("skips a document that already has marks", () => {
    const marks = marksFor(
      {
        attendance: ["s1"],
        marks: { s1: "here", s2: "away" },
        rollCompletedAt: STAMPED,
      },
      ["s1", "s2"],
    );

    assert.equal(marks, null);
  });

  it("keeps a visitor who is not on the class roster", () => {
    const marks = marksFor(
      { attendance: ["s1", "visitor"], rollCompletedAt: STAMPED },
      ["s1"],
    );

    assert.deepEqual(marks, { s1: "here", visitor: "here" });
  });

  it("leaves a student who has since left the class unmarked", () => {
    // They are off the current roster, so nothing is known about that day.
    // No mark is honest; "away" would be fabricated.
    const marks = marksFor(
      { attendance: ["s1"], rollCompletedAt: STAMPED },
      ["s1", "s2"],
    );

    assert.deepEqual(marks, { s1: "here", s2: "away" });
    assert.equal("departed" in marks, false);
  });

  it("records everyone away when a session was empty", () => {
    const marks = marksFor(
      { attendance: [], rollCompletedAt: STAMPED },
      ["s1", "s2"],
    );

    assert.deepEqual(marks, { s1: "away", s2: "away" });
  });

  it("writes nothing for a stamped session with no roster at all", () => {
    assert.equal(marksFor({ attendance: [], rollCompletedAt: STAMPED }, []), null);
  });
});
