"use strict";

const { describe, it, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");

const admin = require("firebase-admin");
const {
  createTermsForYearImpl,
  updateTermImpl,
} = require("../../src/terms/manageTerms");
const { getAdmin, clearCollection } = require("../helpers/emulator");

const actor = { uid: "admin-actor", email: "admin@tenacitytutoring.com" };
const clock = () => new Date("2026-05-18T00:00:00Z");

function ts(iso) {
  return admin.firestore.Timestamp.fromDate(new Date(iso));
}

describe("term management (firestore emulator)", () => {
  let db;

  before(() => {
    ({ db } = getAdmin());
  });

  beforeEach(async () => {
    await Promise.all([
      clearCollection(db, "terms"),
      clearCollection(db, "adminAuditLogs"),
    ]);
  });

  after(async () => {
    await Promise.all([
      clearCollection(db, "terms"),
      clearCollection(db, "adminAuditLogs"),
    ]);
  });

  it("creates a set of yearly terms with deterministic IDs and audit log", async () => {
    const out = await createTermsForYearImpl({
      payload: {
        year: "2027",
        terms: [
          {
            termNum: 1,
            weeksNum: 10,
            startDate: new Date("2027-01-31T13:00:00.000Z"),
            endDate: new Date("2027-04-09T13:59:59.999Z"),
            status: "upcoming",
          },
          {
            termNum: 2,
            weeksNum: 10,
            startDate: new Date("2027-04-25T14:00:00.000Z"),
            endDate: new Date("2027-07-02T13:59:59.999Z"),
            status: "upcoming",
          },
        ],
      },
      actor,
      deps: { db, clock },
    });

    assert.deepEqual(out.terms.map((term) => term.id), ["2027_T1", "2027_T2"]);
    const term = (await db.collection("terms").doc("2027_T1").get()).data();
    assert.equal(term.year, "2027");
    assert.equal(term.termNum, 1);
    assert.equal(term.weeksNum, 10);
    assert.equal(term.status, "upcoming");
    assert.equal(term.createdBy, actor.uid);
    assert.equal(term.startDate.toDate().toISOString(), "2027-01-31T13:00:00.000Z");

    const audit = await db.collection("adminAuditLogs").get();
    assert.equal(audit.size, 1);
    const entry = audit.docs[0].data();
    assert.equal(entry.action, "terms.createForYear");
    assert.equal(entry.targetId, "2027");
    assert.deepEqual(entry.payloadSummary.termIds, ["2027_T1", "2027_T2"]);
  });

  it("refuses to overwrite an existing term", async () => {
    await db.collection("terms").doc("2027_T1").set({
      year: "2027",
      termNum: 1,
      weeksNum: 10,
      status: "upcoming",
      startDate: ts("2027-01-31T13:00:00.000Z"),
      endDate: ts("2027-04-09T13:59:59.999Z"),
    });

    await assert.rejects(
      () =>
        createTermsForYearImpl({
          payload: {
            year: "2027",
            terms: [
              {
                termNum: 1,
                weeksNum: 10,
                startDate: new Date("2027-01-31T13:00:00.000Z"),
                endDate: new Date("2027-04-09T13:59:59.999Z"),
                status: "upcoming",
              },
            ],
          },
          actor,
          deps: { db, clock },
        }),
      (err) => err.code === "already-exists"
    );
  });

  it("updates mutable term fields and writes an audit entry", async () => {
    await db.collection("terms").doc("2027_T1").set({
      year: "2027",
      termNum: 1,
      weeksNum: 10,
      status: "upcoming",
      startDate: ts("2027-01-31T13:00:00.000Z"),
      endDate: ts("2027-04-09T13:59:59.999Z"),
    });

    const out = await updateTermImpl({
      payload: {
        termId: "2027_T1",
        updates: {
          weeksNum: 9,
          status: "active",
        },
      },
      actor,
      deps: { db, clock },
    });

    assert.equal(out.term.status, "active");
    assert.equal(out.term.weeksNum, 9);
    const term = (await db.collection("terms").doc("2027_T1").get()).data();
    assert.equal(term.status, "active");
    assert.equal(term.weeksNum, 9);
    assert.equal(term.updatedBy, actor.uid);

    const audit = await db.collection("adminAuditLogs").get();
    assert.equal(audit.size, 1);
    const entry = audit.docs[0].data();
    assert.equal(entry.action, "term.update");
    assert.equal(entry.targetId, "2027_T1");
    assert.deepEqual(entry.payloadSummary.fields, ["weeksNum", "status"]);
    assert.equal(entry.before.status, "upcoming");
    assert.equal(entry.after.status, "active");
  });
});
