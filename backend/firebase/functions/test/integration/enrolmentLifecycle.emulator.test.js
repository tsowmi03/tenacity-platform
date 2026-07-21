"use strict";

const { describe, it, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");

const { archiveImpl } = require("../../src/enrolments/archiveEnrolment");
const {
  softDeleteImpl,
  purgeImpl,
} = require("../../src/enrolments/deleteEnrolment");
const {
  updateEnrolmentImpl,
} = require("../../src/enrolments/updateEnrolment");
const { getAdmin, clearCollection } = require("../helpers/emulator");

const actor = { uid: "admin-actor", email: "admin@tenacitytutoring.com" };

async function seed(db, id, extra = {}) {
  await db
    .collection("enrolments")
    .doc(id)
    .set({
      archived: false,
      studentFirstName: "Tom",
      studentLastName: "Doe",
      studentYear: "7",
      studentSubjects: ["Math"],
      classes: [{ id: "c1" }],
      carerFirstName: "Jane",
      carerLastName: "Doe",
      carerEmail: "jane@example.com",
      carerPhone: "0400",
      allergies: "",
      permissionToLeave: false,
      additionalInfo: "",
      ...extra,
    });
}

describe("enrolment lifecycle (firestore emulator)", () => {
  let db;

  before(() => {
    ({ db } = getAdmin());
  });

  beforeEach(async () => {
    await Promise.all([
      clearCollection(db, "enrolments"),
      clearCollection(db, "adminAuditLogs"),
    ]);
  });

  after(async () => {
    await Promise.all([
      clearCollection(db, "enrolments"),
      clearCollection(db, "adminAuditLogs"),
    ]);
  });

  describe("archive / unarchive", () => {
    it("archives a pending enrolment", async () => {
      await seed(db, "e1");
      const out = await archiveImpl({
        payload: { enrolmentId: "e1" },
        actor,
        mode: "archive",
        deps: { db },
      });
      assert.equal(out.status, "archived");
      assert.equal(out.archived, true);
      const e = (await db.collection("enrolments").doc("e1").get()).data();
      assert.equal(e.status, "archived");
      assert.equal(e.archivedBy, actor.uid);
    });

    it("refuses to archive an accepted enrolment", async () => {
      await seed(db, "e1", { status: "accepted", archived: true });
      await assert.rejects(
        () =>
          archiveImpl({
            payload: { enrolmentId: "e1" },
            actor,
            mode: "archive",
            deps: { db },
          }),
        (err) => err.code === "failed-precondition"
      );
    });

    it("unarchives an archived enrolment back to pending", async () => {
      await seed(db, "e1");
      await archiveImpl({
        payload: { enrolmentId: "e1" },
        actor,
        mode: "archive",
        deps: { db },
      });
      const out = await archiveImpl({
        payload: { enrolmentId: "e1" },
        actor,
        mode: "unarchive",
        deps: { db },
      });
      assert.equal(out.status, "pending");
      assert.equal(out.archived, false);
    });

    it("refuses to unarchive a pending or accepted enrolment", async () => {
      await seed(db, "e1");
      await assert.rejects(
        () =>
          archiveImpl({
            payload: { enrolmentId: "e1" },
            actor,
            mode: "unarchive",
            deps: { db },
          }),
        (err) => err.code === "failed-precondition"
      );
    });
  });

  describe("soft delete", () => {
    it("sets deleted lifecycle fields", async () => {
      await seed(db, "e1");
      const out = await softDeleteImpl({
        payload: { enrolmentId: "e1", reason: "duplicate" },
        actor,
        deps: { db },
      });
      assert.equal(out.status, "deleted");
      const e = (await db.collection("enrolments").doc("e1").get()).data();
      assert.equal(e.status, "deleted");
      assert.equal(e.deleteReason, "duplicate");
      assert.equal(e.deletedBy, actor.uid);
    });

    it("refuses to re-delete an already-deleted enrolment", async () => {
      await seed(db, "e1", { status: "deleted" });
      await assert.rejects(
        () =>
          softDeleteImpl({
            payload: { enrolmentId: "e1" },
            actor,
            deps: { db },
          }),
        (err) => err.code === "failed-precondition"
      );
    });
  });

  describe("purge (hard delete)", () => {
    it("removes the doc when no downstream records", async () => {
      await seed(db, "e1");
      const out = await purgeImpl({
        payload: { enrolmentId: "e1", confirmId: "e1", reason: "spam" },
        actor,
        deps: { db },
      });
      assert.equal(out.purged, true);
      assert.equal(
        (await db.collection("enrolments").doc("e1").get()).exists,
        false
      );
    });

    it("refuses when confirmId mismatches", async () => {
      await seed(db, "e1");
      await assert.rejects(
        () =>
          purgeImpl({
            payload: { enrolmentId: "e1", confirmId: "e2" },
            actor,
            deps: { db },
          }),
        (err) => err.code === "failed-precondition"
      );
    });

    it("refuses when createdParentId/createdStudentId is set", async () => {
      await seed(db, "e1", {
        status: "accepted",
        createdParentId: "p1",
        createdStudentId: "s1",
      });
      await assert.rejects(
        () =>
          purgeImpl({
            payload: { enrolmentId: "e1", confirmId: "e1" },
            actor,
            deps: { db },
          }),
        (err) =>
          err.code === "failed-precondition" &&
          /downstream records/.test(err.message)
      );
    });
  });

  describe("update (pre-accept only)", () => {
    it("updates a pending enrolment", async () => {
      await seed(db, "e1");
      const out = await updateEnrolmentImpl({
        payload: {
          enrolmentId: "e1",
          updates: { allergies: "peanuts", carerPhone: "0411" },
        },
        actor,
        deps: { db },
      });
      assert.deepEqual(
        out.updatedFields.sort(),
        ["allergies", "carerPhone"].sort()
      );
      const e = (await db.collection("enrolments").doc("e1").get()).data();
      assert.equal(e.allergies, "peanuts");
      assert.equal(e.carerPhone, "0411");
      assert.equal(e.updatedBy, actor.uid);
    });

    it("refuses to update an accepted enrolment", async () => {
      await seed(db, "e1", { status: "accepted" });
      await assert.rejects(
        () =>
          updateEnrolmentImpl({
            payload: {
              enrolmentId: "e1",
              updates: { allergies: "peanuts" },
            },
            actor,
            deps: { db },
          }),
        (err) =>
          err.code === "failed-precondition" &&
          /frozen/i.test(err.message)
      );
    });

    it("refuses to update a deleted enrolment", async () => {
      await seed(db, "e1", { status: "deleted" });
      await assert.rejects(
        () =>
          updateEnrolmentImpl({
            payload: { enrolmentId: "e1", updates: { allergies: "x" } },
            actor,
            deps: { db },
          }),
        (err) => err.code === "failed-precondition"
      );
    });
  });
});
