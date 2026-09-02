"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  permanentEnrolmentSkippedWeeksMessage,
} = require("../../lib/notifications/permanent_enrollment_action");

const base = {
  studentName: "Ella Smith",
  classDay: "Monday",
  classTime: "4:00 pm",
};

describe("permanentEnrolmentSkippedWeeksMessage", () => {
  it("is null when nothing was skipped, so the caller can skip the send", () => {
    assert.equal(
      permanentEnrolmentSkippedWeeksMessage({ ...base, skipped: [] }),
      null
    );
  });

  it("names a single skipped week", () => {
    const message = permanentEnrolmentSkippedWeeksMessage({
      ...base,
      skipped: [{ id: "w1", date: "2026-09-03" }],
    });

    assert.equal(message.title, "Enrolment Skipped Full Weeks");
    assert.equal(
      message.body,
      "Ella Smith is permanently enrolled for Monday at 4:00 pm, but 3 Sep was already full. Not added to those rolls."
    );
  });

  it("joins two skipped weeks with 'and'", () => {
    const message = permanentEnrolmentSkippedWeeksMessage({
      ...base,
      skipped: [
        { id: "w1", date: "2026-09-03" },
        { id: "w2", date: "2026-09-10" },
      ],
    });

    assert.match(message.body, /3 Sep and 10 Sep were already full/);
  });

  it("uses a serial comma list for three", () => {
    const message = permanentEnrolmentSkippedWeeksMessage({
      ...base,
      skipped: [
        { date: "2026-09-03" },
        { date: "2026-09-10" },
        { date: "2026-09-17" },
      ],
    });

    assert.match(message.body, /3 Sep, 10 Sep and 17 Sep were already full/);
  });

  it("summarises the tail rather than listing every week", () => {
    // A push notification gets truncated by the phone, so a long term's worth
    // of skipped weeks must not push the point off the end.
    const message = permanentEnrolmentSkippedWeeksMessage({
      ...base,
      skipped: [
        { date: "2026-09-03" },
        { date: "2026-09-10" },
        { date: "2026-09-17" },
        { date: "2026-09-24" },
        { date: "2026-10-01" },
      ],
    });

    assert.match(message.body, /3 Sep, 10 Sep, 17 Sep and 2 more weeks were already full/);
  });

  it("says '1 more week' rather than '1 more weeks'", () => {
    const message = permanentEnrolmentSkippedWeeksMessage({
      ...base,
      skipped: [
        { date: "2026-09-03" },
        { date: "2026-09-10" },
        { date: "2026-09-17" },
        { date: "2026-09-24" },
      ],
    });

    assert.match(message.body, /17 Sep and 1 more week were already full/);
  });

  it("ignores entries with no usable date", () => {
    const message = permanentEnrolmentSkippedWeeksMessage({
      ...base,
      skipped: [{ id: "w1", date: null }],
    });

    assert.equal(message, null);
  });
});
