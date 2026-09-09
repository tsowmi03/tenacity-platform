"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  SAME_DAY_CUTOFF_HOUR,
  sameDayBookingClosed,
} = require("../../../src/attendance/sameDayBookingCutoff");

/** An instant expressed as a Sydney wall-clock time. */
function sydney(iso) {
  // Sydney is UTC+10, or UTC+11 under daylight saving (Oct-Apr). The offsets
  // are written out rather than computed so a test failure points at the rule
  // rather than at the helper.
  return new Date(iso);
}

// 2026-09-09 is a Wednesday in AEST (UTC+10).
const NINE_AM = sydney("2026-09-08T23:00:00Z"); // 09:00 Sydney, 9 Sep
const EIGHT_FIFTY_NINE = sydney("2026-09-08T22:59:00Z"); // 08:59 Sydney, 9 Sep
const NINE_OH_ONE = sydney("2026-09-08T23:01:00Z"); // 09:01 Sydney, 9 Sep

const CLASS_TODAY_4_30PM = sydney("2026-09-09T06:30:00Z"); // 16:30 Sydney, 9 Sep
const CLASS_TODAY_7AM = sydney("2026-09-08T21:00:00Z"); // 07:00 Sydney, 9 Sep
const CLASS_TOMORROW = sydney("2026-09-10T06:30:00Z"); // 16:30 Sydney, 10 Sep
const CLASS_YESTERDAY = sydney("2026-09-08T06:30:00Z"); // 16:30 Sydney, 8 Sep

describe("sameDayBookingClosed", () => {
  it("is open before 9am for a class later the same day", () => {
    assert.equal(
      sameDayBookingClosed({
        sessionStartsAt: CLASS_TODAY_4_30PM,
        now: EIGHT_FIFTY_NINE,
      }),
      false
    );
  });

  it("is closed from exactly 9am", () => {
    // The boundary belongs to the closed side: "bookings close at 9am" means
    // 9am is too late, not the last minute that works.
    assert.equal(
      sameDayBookingClosed({
        sessionStartsAt: CLASS_TODAY_4_30PM,
        now: NINE_AM,
      }),
      true
    );
  });

  it("is closed after 9am for a class later the same day", () => {
    assert.equal(
      sameDayBookingClosed({
        sessionStartsAt: CLASS_TODAY_4_30PM,
        now: NINE_OH_ONE,
      }),
      true
    );
  });

  it("leaves tomorrow's classes open however late it is today", () => {
    assert.equal(
      sameDayBookingClosed({
        sessionStartsAt: CLASS_TOMORROW,
        now: sydney("2026-09-09T12:00:00Z"), // 22:00 Sydney
      }),
      false
    );
  });

  it("does not claim a class that has already run", () => {
    // Yesterday's session is somebody else's problem — the already-started
    // check refuses it, and this rule must not be the reason.
    assert.equal(
      sameDayBookingClosed({
        sessionStartsAt: CLASS_YESTERDAY,
        now: NINE_OH_ONE,
      }),
      false
    );
  });

  it("closes an early class the same way once 9am passes", () => {
    // A 7am class today is already over at 9:01, but the rule is about the
    // calendar day, so it answers closed rather than open.
    assert.equal(
      sameDayBookingClosed({
        sessionStartsAt: CLASS_TODAY_7AM,
        now: NINE_OH_ONE,
      }),
      true
    );
  });

  it("answers in Sydney time whatever the server's own timezone is", () => {
    // The whole point of the module: a caller in another zone must not get a
    // different answer. 23:30 UTC on 8 Sep is 09:30 Sydney on 9 Sep, so a
    // class on 9 Sep is closed even though it is "yesterday" in UTC.
    assert.equal(
      sameDayBookingClosed({
        sessionStartsAt: CLASS_TODAY_4_30PM,
        now: sydney("2026-09-08T23:30:00Z"),
      }),
      true
    );
  });

  it("holds across daylight saving, when Sydney is UTC+11", () => {
    // 2026-12-02, AEDT. 22:30 UTC on 1 Dec is 09:30 Sydney on 2 Dec.
    assert.equal(
      sameDayBookingClosed({
        sessionStartsAt: new Date("2026-12-02T06:00:00Z"), // 17:00 Sydney
        now: new Date("2026-12-01T22:30:00Z"),
      }),
      true
    );
    assert.equal(
      sameDayBookingClosed({
        sessionStartsAt: new Date("2026-12-02T06:00:00Z"),
        now: new Date("2026-12-01T21:30:00Z"), // 08:30 Sydney
      }),
      false
    );
  });

  it("accepts a Firestore timestamp as the session start", () => {
    const timestamp = { toDate: () => CLASS_TODAY_4_30PM };
    assert.equal(
      sameDayBookingClosed({ sessionStartsAt: timestamp, now: NINE_OH_ONE }),
      true
    );
  });

  it("treats an unusable session date as open rather than refusing", () => {
    for (const value of [null, undefined, "not a date", new Date("nope"), {}]) {
      assert.equal(
        sameDayBookingClosed({ sessionStartsAt: value, now: NINE_OH_ONE }),
        false,
        `expected ${String(value)} to be treated as open`
      );
    }
  });

  it("publishes the hour it closes at", () => {
    assert.equal(SAME_DAY_CUTOFF_HOUR, 9);
  });
});
