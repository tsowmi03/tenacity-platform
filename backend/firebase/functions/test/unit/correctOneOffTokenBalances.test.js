"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  CORRECTION_REASON,
  planTokenCorrections,
} = require("../../src/users/correctOneOffTokenBalances");

const at = (iso) => ({ toMillis: () => Date.parse(iso) });

const booking = (parentId, studentId, iso, week = "T3_W1") => ({
  action: "class.book_one_off",
  actorRole: "parent",
  actorUid: parentId,
  targetId: week,
  createdAt: at(iso),
  payloadSummary: { studentId, classId: "class-1" },
});

const plan = ({ auditLogs = [], invoices = [], fulfilments = [], parents = {} }) =>
  planTokenCorrections({
    auditLogs,
    invoices,
    fulfilments,
    parents: new Map(Object.entries(parents)),
  });

describe("planTokenCorrections", () => {
  it("counts each uncharged token booking against the parent", () => {
    const [p] = plan({
      auditLogs: [
        booking("p1", "s1", "2026-06-01T00:00:00Z", "W1"),
        booking("p1", "s1", "2026-06-08T00:00:00Z", "W2"),
      ],
      parents: { p1: { lessonTokens: 5 } },
    });
    assert.equal(p.tokenBookings, 2);
    assert.equal(p.target, 3);
    assert.equal(p.writtenOff, 0);
  });

  it("never goes below zero, and reports what it writes off", () => {
    const [p] = plan({
      auditLogs: [
        booking("p1", "s1", "2026-06-01T00:00:00Z", "W1"),
        booking("p1", "s1", "2026-06-08T00:00:00Z", "W2"),
        booking("p1", "s1", "2026-06-15T00:00:00Z", "W3"),
      ],
      parents: { p1: { lessonTokens: 1 } },
    });
    assert.equal(p.target, 0);
    assert.equal(p.writtenOff, 2);
  });

  it("ignores bookings from before the rules were locked, when deductions worked", () => {
    assert.deepEqual(
      plan({
        auditLogs: [booking("p1", "s1", "2026-05-20T00:00:00Z")],
        parents: { p1: { lessonTokens: 2 } },
      }),
      []
    );
  });

  it("does not count a booking paid by invoice", () => {
    const result = plan({
      auditLogs: [booking("p1", "s1", "2026-06-01T00:00:00Z")],
      invoices: [
        {
          id: "inv-1",
          parentId: "p1",
          studentIds: ["s1"],
          weeks: 1,
          lineItems: [{ description: "One-off class: Sam" }],
          createdAt: at("2026-06-01T00:05:00Z"),
        },
      ],
      parents: { p1: { lessonTokens: 2 } },
    });
    assert.deepEqual(result, []);
  });

  it("matches each invoice to one booking only", () => {
    const [p] = plan({
      auditLogs: [
        booking("p1", "s1", "2026-06-01T00:00:00Z", "W1"),
        booking("p1", "s1", "2026-06-01T00:10:00Z", "W2"),
      ],
      invoices: [
        {
          id: "inv-1",
          parentId: "p1",
          studentIds: ["s1"],
          weeks: 1,
          lineItems: [{ description: "One-off class: Sam" }],
          createdAt: at("2026-06-01T00:05:00Z"),
        },
      ],
      parents: { p1: { lessonTokens: 2 } },
    });
    assert.equal(p.tokenBookings, 1);
  });

  it("does not count a booking the payment webhook fulfilled", () => {
    const result = plan({
      auditLogs: [booking("p1", "s1", "2026-09-01T00:00:00Z", "W5")],
      fulfilments: [
        {
          parentId: "p1",
          booking: { classId: "class-1", attendanceDocId: "W5" },
          enrolledStudentIds: ["s1"],
        },
      ],
      parents: { p1: { lessonTokens: 2 } },
    });
    assert.deepEqual(result, []);
  });

  it("does not count a booking the server already charged a token for", () => {
    const result = plan({
      auditLogs: [
        booking("p1", "s1", "2026-11-01T00:00:00Z", "W5"),
        {
          action: "user.adjust_lesson_tokens",
          targetId: "p1",
          payloadSummary: {
            reason: "one_off_booking",
            classId: "class-1",
            attendanceDocId: "W5",
            studentId: "s1",
          },
        },
      ],
      parents: { p1: { lessonTokens: 2 } },
    });
    assert.deepEqual(result, []);
  });

  it("ignores admin bookings", () => {
    const adminBooking = { ...booking("a1", "s1", "2026-06-01T00:00:00Z"), actorRole: "admin" };
    assert.deepEqual(plan({ auditLogs: [adminBooking] }), []);
  });

  it("marks a parent already corrected", () => {
    const [p] = plan({
      auditLogs: [
        booking("p1", "s1", "2026-06-01T00:00:00Z"),
        {
          action: "user.adjust_lesson_tokens",
          targetId: "p1",
          payloadSummary: { reason: CORRECTION_REASON },
        },
      ],
      parents: { p1: { lessonTokens: 0 } },
    });
    assert.equal(p.alreadyCorrected, true);
  });
});
