"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const admin = require("firebase-admin");
const { ValidationError } = require("../../src/shared/validation");
const { normaliseTermDoc } = require("../../src/terms/termSchemas");

function ts(iso) {
  return admin.firestore.Timestamp.fromDate(new Date(iso));
}

describe("normaliseTermDoc", () => {
  it("reads the app-fromMap shape (termNum/weeksNum/status:string)", () => {
    const out = normaliseTermDoc(
      {
        year: "2026",
        termNum: 2,
        weeksNum: 10,
        status: "active",
        startDate: ts("2026-04-21T00:00:00Z"),
        endDate: ts("2026-06-27T00:00:00Z"),
      },
      "2026_T2"
    );
    assert.equal(out.id, "2026_T2");
    assert.equal(out.year, "2026");
    assert.equal(out.termNum, 2);
    assert.equal(out.weeksNum, 10);
    assert.equal(out.active, true);
    assert.ok(out.startDate instanceof Date);
  });

  it("reads the app-toMap shape (termNumber/totalWeeks/isActive)", () => {
    const out = normaliseTermDoc(
      {
        year: "2026",
        termNumber: 2,
        totalWeeks: 10,
        isActive: true,
        startDate: ts("2026-04-21T00:00:00Z"),
        endDate: ts("2026-06-27T00:00:00Z"),
      },
      "2026_T2"
    );
    assert.equal(out.termNum, 2);
    assert.equal(out.weeksNum, 10);
    assert.equal(out.active, true);
  });

  it("supports boolean status (legacy)", () => {
    const out = normaliseTermDoc(
      {
        year: "2026",
        termNum: 1,
        weeksNum: 9,
        status: false,
        startDate: ts("2026-01-01T00:00:00Z"),
        endDate: ts("2026-03-01T00:00:00Z"),
      },
      "2026_T1"
    );
    assert.equal(out.active, false);
  });

  it("rejects missing termNum / weeksNum", () => {
    assert.throws(
      () =>
        normaliseTermDoc(
          {
            year: "2026",
            startDate: ts("2026-01-01T00:00:00Z"),
            endDate: ts("2026-03-01T00:00:00Z"),
          },
          "x"
        ),
      ValidationError
    );
  });

  it("rejects non-Timestamp dates", () => {
    assert.throws(
      () =>
        normaliseTermDoc(
          {
            year: "2026",
            termNum: 1,
            weeksNum: 9,
            startDate: "2026-01-01",
            endDate: ts("2026-03-01T00:00:00Z"),
          },
          "x"
        ),
      ValidationError
    );
  });
});
