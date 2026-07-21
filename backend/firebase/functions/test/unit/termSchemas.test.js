"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const admin = require("firebase-admin");
const { ValidationError } = require("../../src/shared/validation");
const {
  normaliseTermDoc,
  validateCreateTermsForYearPayload,
  validateUpdateTermPayload,
  buildTermDoc,
} = require("../../src/terms/termSchemas");

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

describe("term management payloads", () => {
  it("normalises a create-terms-for-year payload", () => {
    const out = validateCreateTermsForYearPayload({
      year: 2027,
      terms: [
        {
          termNum: 1,
          weeksNum: 10,
          startDate: "2027-02-01",
          endDate: "2027-04-09",
        },
        {
          termNum: 2,
          weeksNum: 10,
          startDate: "2027-04-26",
          endDate: "2027-07-02",
          status: "upcoming",
        },
      ],
    });

    assert.equal(out.year, "2027");
    assert.equal(out.terms[0].status, "upcoming");
    assert.equal(out.terms[0].startDate.toISOString(), "2027-01-31T13:00:00.000Z");
    assert.equal(out.terms[0].endDate.toISOString(), "2027-04-09T13:59:59.999Z");
  });

  it("rejects overlapping terms", () => {
    assert.throws(
      () =>
        validateCreateTermsForYearPayload({
          year: "2027",
          terms: [
            {
              termNum: 1,
              weeksNum: 10,
              startDate: "2027-02-01",
              endDate: "2027-04-09",
            },
            {
              termNum: 2,
              weeksNum: 10,
              startDate: "2027-04-09",
              endDate: "2027-07-02",
            },
          ],
        }),
      /must not overlap/
    );
  });

  it("rejects repeated term numbers", () => {
    assert.throws(
      () =>
        validateCreateTermsForYearPayload({
          year: "2027",
          terms: [
            {
              termNum: 1,
              weeksNum: 10,
              startDate: "2027-02-01",
              endDate: "2027-04-09",
            },
            {
              termNum: 1,
              weeksNum: 10,
              startDate: "2027-04-26",
              endDate: "2027-07-02",
            },
          ],
        }),
      /must not repeat termNum/
    );
  });

  it("normalises update payloads and only permits mutable fields", () => {
    const out = validateUpdateTermPayload({
      termId: "2027_T1",
      updates: {
        startDate: "2027-02-02",
        weeksNum: 9,
        status: "active",
      },
    });
    assert.equal(out.termId, "2027_T1");
    assert.equal(out.updates.weeksNum, 9);
    assert.equal(out.updates.status, "active");
    assert.equal(out.updates.startDate.toISOString(), "2027-02-01T13:00:00.000Z");
  });

  it("builds app-compatible term documents", () => {
    const payload = validateCreateTermsForYearPayload({
      year: "2027",
      terms: [
        {
          termNum: 1,
          weeksNum: 10,
          startDate: "2027-02-01",
          endDate: "2027-04-09",
        },
      ],
    });
    const doc = buildTermDoc(payload.terms[0], {
      actorUid: "admin-1",
      clock: () => new Date("2026-05-18T00:00:00Z"),
    });

    assert.equal(doc.year, "2027");
    assert.equal(doc.termNum, 1);
    assert.equal(doc.weeksNum, 10);
    assert.equal(doc.status, "upcoming");
    assert.equal(doc.createdBy, "admin-1");
    assert.equal(doc.startDate.toDate().toISOString(), "2027-01-31T13:00:00.000Z");
    assert.equal("termNumber" in doc, false);
    assert.equal("totalWeeks" in doc, false);
    assert.equal("isActive" in doc, false);
  });
});
