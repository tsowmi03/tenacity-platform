"use strict";

const { describe, it, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");

const admin = require("firebase-admin");
const { createClassImpl } = require("../../src/classes/createClass");
const { updateClassImpl } = require("../../src/classes/updateClass");
const { deleteClassImpl } = require("../../src/classes/deleteClass");
const {
  generateAttendanceForClassImpl,
  regenerateAttendanceForTermImpl,
} = require("../../src/classes/attendanceGeneration");
const { getAdmin, clearCollection } = require("../helpers/emulator");

const actor = { uid: "admin-actor", email: "admin@tenacitytutoring.com" };
const clock = () => new Date("2026-05-13T00:00:00Z");

function ts(iso) {
  return admin.firestore.Timestamp.fromDate(new Date(iso));
}

async function seedTerm(db, id = "2026_T2", extra = {}) {
  await db
    .collection("terms")
    .doc(id)
    .set({
      year: "2026",
      termNum: 2,
      weeksNum: 3,
      status: "active",
      startDate: ts("2026-05-11T00:00:00+10:00"),
      endDate: ts("2026-05-31T23:59:59+10:00"),
      ...extra,
    });
}

async function seedClass(db, id, extra = {}) {
  await db
    .collection("classes")
    .doc(id)
    .set({
      type: "Year 7 Maths",
      day: "Monday",
      startTime: "16:00",
      endTime: "17:00",
      capacity: 8,
      tutors: ["t1"],
      enrolledStudents: ["s1"],
      ...extra,
    });
}

async function clearClassTrees(db, ids) {
  await Promise.all(
    ids.map(async (id) => {
      const ref = db.collection("classes").doc(id);
      const attendance = await ref.collection("attendance").get();
      await Promise.all(attendance.docs.map((d) => d.ref.delete()));
      await ref.delete();
    })
  );
}

describe("class management (firestore emulator)", () => {
  let db;

  before(() => {
    ({ db } = getAdmin());
  });

  beforeEach(async () => {
    await Promise.all([
      clearClassTrees(db, [
        "phase4-create",
        "phase4-update",
        "phase4-delete",
        "phase4-regenerate",
      ]),
      clearCollection(db, "terms"),
      clearCollection(db, "waitlistEntries"),
      clearCollection(db, "adminAuditLogs"),
    ]);
  });

  after(async () => {
    await Promise.all([
      clearClassTrees(db, [
        "phase4-create",
        "phase4-update",
        "phase4-delete",
        "phase4-regenerate",
      ]),
      clearCollection(db, "terms"),
      clearCollection(db, "waitlistEntries"),
      clearCollection(db, "adminAuditLogs"),
    ]);
  });

  it("creates a class and generates app-compatible attendance docs", async () => {
    await seedTerm(db);

    const out = await createClassImpl({
      payload: {
        id: "phase4-create",
        type: "Year 7 Maths",
        day: "Monday",
        startTime: "16:00",
        endTime: "17:00",
        capacity: 8,
        tutors: ["t1"],
        enrolledStudents: ["s1", "s2"],
        termIds: ["2026_T2"],
        generateAttendance: true,
        attendanceFromDate: new Date("2026-05-18T00:00:00.000Z"),
      },
      actor,
      deps: { db, clock },
    });

    assert.equal(out.classId, "phase4-create");
    assert.equal(out.attendance.written, 2);

    const cls = (await db.collection("classes").doc("phase4-create").get()).data();
    assert.equal(cls.day, "Monday");
    assert.equal(cls.createdBy, actor.uid);

    const w2 = (
      await db
        .collection("classes")
        .doc("phase4-create")
        .collection("attendance")
        .doc("2026_T2_W2")
        .get()
    ).data();
    assert.equal(w2.weekNum, 2);
    assert.equal("weekNumber" in w2, false);
    assert.equal(w2.date.toDate().toISOString(), "2026-05-18T06:00:00.000Z");
    assert.deepEqual(w2.attendance, ["s1", "s2"]);
    assert.deepEqual(w2.tutors, ["t1"]);
    assert.equal(
      (
        await db
          .collection("classes")
          .doc("phase4-create")
          .collection("attendance")
          .doc("2026_T2_W1")
          .get()
      ).exists,
      false
    );
  });

  it("updates future attendance when permanent tutors/students change", async () => {
    await seedClass(db, "phase4-update");
    const ref = db.collection("classes").doc("phase4-update");
    await ref.collection("attendance").doc("2026_T2_W1").set({
      date: ts("2026-05-11T06:00:00.000Z"),
      termId: "2026_T2",
      weekNum: 1,
      attendance: ["s1"],
      tutors: ["t1"],
    });
    await ref.collection("attendance").doc("2026_T2_W2").set({
      date: ts("2026-05-18T06:00:00.000Z"),
      termId: "2026_T2",
      weekNum: 2,
      attendance: ["s1"],
      tutors: ["t1"],
    });

    const out = await updateClassImpl({
      payload: {
        classId: "phase4-update",
        updates: { tutors: ["t2"], enrolledStudents: ["s2"] },
        propagation: { propagateAttendance: true },
      },
      actor,
      deps: { db, clock },
    });

    assert.equal(out.futureAttendanceUpdated, 1);
    const past = (await ref.collection("attendance").doc("2026_T2_W1").get()).data();
    const future = (await ref.collection("attendance").doc("2026_T2_W2").get()).data();
    assert.deepEqual(past.attendance, ["s1"]);
    assert.deepEqual(past.tutors, ["t1"]);
    assert.deepEqual(future.attendance, ["s2"]);
    assert.deepEqual(future.tutors, ["t2"]);
  });

  it("updates future attendance dates when class day/time changes", async () => {
    await seedTerm(db);
    await seedClass(db, "phase4-update");
    const ref = db.collection("classes").doc("phase4-update");
    await ref.collection("attendance").doc("2026_T2_W2").set({
      date: ts("2026-05-18T06:00:00.000Z"),
      termId: "2026_T2",
      weekNum: 2,
      attendance: ["s1"],
      tutors: ["t1"],
    });

    await updateClassImpl({
      payload: {
        classId: "phase4-update",
        updates: { day: "Tuesday", startTime: "17:30", endTime: "18:30" },
        propagation: { propagateAttendance: true },
      },
      actor,
      deps: { db, clock },
    });

    const future = (await ref.collection("attendance").doc("2026_T2_W2").get()).data();
    assert.equal(future.date.toDate().toISOString(), "2026-05-19T07:30:00.000Z");
  });

  it("regenerates a term for selected classes from today forward", async () => {
    await seedTerm(db);
    await seedClass(db, "phase4-regenerate");
    const ref = db.collection("classes").doc("phase4-regenerate");
    await ref.collection("attendance").doc("2026_T2_W1").set({
      date: ts("2026-05-11T06:00:00.000Z"),
      termId: "2026_T2",
      weekNum: 1,
      attendance: ["old"],
      tutors: ["old"],
    });

    const out = await regenerateAttendanceForTermImpl({
      payload: { termId: "2026_T2", classIds: ["phase4-regenerate"], overwrite: true },
      actor,
      deps: { db, clock },
    });

    assert.equal(out.considered, 2);
    assert.equal(out.written, 2);
    const w1 = (await ref.collection("attendance").doc("2026_T2_W1").get()).data();
    const w2 = (await ref.collection("attendance").doc("2026_T2_W2").get()).data();
    assert.deepEqual(w1.attendance, ["old"]);
    assert.deepEqual(w2.attendance, ["s1"]);
  });

  it("does not overwrite existing attendance when generate overwrite=false", async () => {
    await seedTerm(db);
    await seedClass(db, "phase4-regenerate");
    const ref = db.collection("classes").doc("phase4-regenerate");
    await ref.collection("attendance").doc("2026_T2_W2").set({
      date: ts("2026-05-18T06:00:00.000Z"),
      termId: "2026_T2",
      weekNum: 2,
      attendance: ["custom"],
      tutors: ["custom"],
    });

    const out = await generateAttendanceForClassImpl({
      payload: {
        classId: "phase4-regenerate",
        termIds: ["2026_T2"],
        overwrite: false,
      },
      actor,
      deps: { db, clock },
    });

    assert.equal(out.considered, 3);
    assert.equal(out.written, 2);
    assert.equal(out.skippedExisting, 1);
    const w2 = (await ref.collection("attendance").doc("2026_T2_W2").get()).data();
    assert.deepEqual(w2.attendance, ["custom"]);
  });

  it("guards class deletion and deletes attendance for an empty class", async () => {
    await seedClass(db, "phase4-delete", { enrolledStudents: ["s1"] });
    await assert.rejects(
      () =>
        deleteClassImpl({
          payload: {
            classId: "phase4-delete",
            confirmClassId: "phase4-delete",
            deleteAttendance: true,
          },
          actor,
          deps: { db, clock },
        }),
      (err) => err.code === "failed-precondition"
    );

    await seedClass(db, "phase4-delete", { enrolledStudents: [] });
    await db.collection("waitlistEntries").doc("wl1").set({ classId: "phase4-delete" });
    await assert.rejects(
      () =>
        deleteClassImpl({
          payload: {
            classId: "phase4-delete",
            confirmClassId: "phase4-delete",
            deleteAttendance: true,
          },
          actor,
          deps: { db, clock },
        }),
      (err) => err.code === "failed-precondition"
    );

    await db.collection("waitlistEntries").doc("wl1").delete();
    await db
      .collection("classes")
      .doc("phase4-delete")
      .collection("attendance")
      .doc("2026_T2_W1")
      .set({ date: ts("2026-05-11T06:00:00.000Z") });

    const out = await deleteClassImpl({
      payload: {
        classId: "phase4-delete",
        confirmClassId: "phase4-delete",
        deleteAttendance: true,
      },
      actor,
      deps: { db, clock },
    });

    assert.equal(out.attendanceDeleted, 1);
    assert.equal((await db.collection("classes").doc("phase4-delete").get()).exists, false);
  });
});
