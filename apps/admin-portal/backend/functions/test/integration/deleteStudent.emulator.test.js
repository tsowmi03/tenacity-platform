"use strict";

const { describe, it, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");

const admin = require("firebase-admin");
const {
  deleteStudentImpl,
} = require("../../src/students/deleteStudent");
const { getAdmin, clearCollection } = require("../helpers/emulator");

const actor = { uid: "admin-actor", email: "admin@tenacitytutoring.com" };

function ts(date) {
  return admin.firestore.Timestamp.fromDate(date);
}

async function seedParent(db, uid, students = []) {
  await db
    .collection("users")
    .doc(uid)
    .set({
      firstName: "P",
      lastName: "Q",
      role: "parent",
      email: `${uid}@e.com`,
      phone: "0",
      students,
      lessonTokens: 0,
      fcmTokens: [],
      unreadChats: {},
      activeChats: [],
      termsAccepted: false,
      acceptedTermsVersion: null,
      acceptedTermsAt: null,
      readAnnouncements: [],
    });
}

async function seedStudent(db, id, { parents = [], firstName = "Tom", lastName = "Doe" } = {}) {
  await db.collection("students").doc(id).set({
    firstName,
    lastName,
    grade: "7",
    subjects: [],
    parents,
  });
}

async function seedClass(db, id, { enrolledStudents = [], attendance = [] }) {
  const ref = db.collection("classes").doc(id);
  await ref.set({
    type: "Year 7 English",
    day: "Monday",
    startTime: "16:00",
    endTime: "17:00",
    capacity: 8,
    tutors: [],
    enrolledStudents,
  });
  for (const a of attendance) {
    await ref.collection("attendance").doc(a.id).set({
      date: a.date,
      termId: a.termId || "2026_T2",
      cancelled: false,
      weekNum: a.weekNum,
      attendance: a.attendance || [],
      tutors: [],
      updatedAt: ts(new Date()),
      updatedBy: "system",
    });
  }
  return ref;
}

describe("deleteStudentImpl (firestore emulator)", () => {
  let db;

  before(() => {
    ({ db } = getAdmin());
  });

  beforeEach(async () => {
    await Promise.all([
      clearCollection(db, "users"),
      clearCollection(db, "students"),
      clearCollection(db, "classes"),
      clearCollection(db, "adminAuditLogs"),
    ]);
  });

  after(async () => {
    await Promise.all([
      clearCollection(db, "users"),
      clearCollection(db, "students"),
      clearCollection(db, "classes"),
      clearCollection(db, "adminAuditLogs"),
    ]);
  });

  it("rejects when confirmFullName does not match", async () => {
    await seedStudent(db, "s1");
    await assert.rejects(
      () =>
        deleteStudentImpl({
          payload: { studentId: "s1", confirmFullName: "Wrong Name" },
          actor,
          deps: { db },
        }),
      (err) => err.code === "failed-precondition"
    );
    assert.equal((await db.collection("students").doc("s1").get()).exists, true);
  });

  it("matches confirmFullName case-insensitively with whitespace tolerance", async () => {
    await seedStudent(db, "s1");
    const out = await deleteStudentImpl({
      payload: { studentId: "s1", confirmFullName: "  tom   DOE  " },
      actor,
      deps: { db },
    });
    assert.equal(out.studentId, "s1");
  });

  it("cascades: unlinks parents, classes, future attendance only", async () => {
    await seedParent(db, "p1", ["s1"]);
    await seedParent(db, "p2", ["s1"]);
    await seedStudent(db, "s1", { parents: ["p1", "p2"] });

    const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await seedClass(db, "c1", {
      enrolledStudents: ["s1", "other"],
      attendance: [
        {
          id: "2026_T2_W1",
          date: ts(past),
          weekNum: 1,
          attendance: ["s1", "other"],
        },
        {
          id: "2026_T2_W3",
          date: ts(future),
          weekNum: 3,
          attendance: ["s1", "other"],
        },
      ],
    });

    const out = await deleteStudentImpl({
      payload: { studentId: "s1", confirmFullName: "Tom Doe" },
      actor,
      deps: { db },
    });
    assert.deepEqual(out, {
      studentId: "s1",
      parentUnlinks: 2,
      classesUpdated: 1,
      futureAttendanceUpdated: 1,
    });

    // Student doc gone.
    assert.equal((await db.collection("students").doc("s1").get()).exists, false);
    // Parents' students arrays cleaned.
    const p1 = (await db.collection("users").doc("p1").get()).data();
    const p2 = (await db.collection("users").doc("p2").get()).data();
    assert.deepEqual(p1.students, []);
    assert.deepEqual(p2.students, []);
    // Class enrolledStudents cleaned.
    const c1 = (await db.collection("classes").doc("c1").get()).data();
    assert.deepEqual(c1.enrolledStudents, ["other"]);
    // Past attendance kept.
    const past1 = (
      await db.collection("classes").doc("c1").collection("attendance").doc("2026_T2_W1").get()
    ).data();
    assert.deepEqual(past1.attendance, ["s1", "other"]);
    // Future attendance cleaned.
    const future1 = (
      await db.collection("classes").doc("c1").collection("attendance").doc("2026_T2_W3").get()
    ).data();
    assert.deepEqual(future1.attendance, ["other"]);

    // Audit log present.
    const logs = await db.collection("adminAuditLogs").get();
    const log = logs.docs.find((d) => d.data().targetId === "s1");
    assert.ok(log);
    assert.equal(log.data().action, "student.delete");
  });

  it("not-found when student missing", async () => {
    await assert.rejects(
      () =>
        deleteStudentImpl({
          payload: { studentId: "ghost", confirmFullName: "Any Name" },
          actor,
          deps: { db },
        }),
      (err) => err.code === "not-found"
    );
  });

  it("works for an unlinked student with no classes", async () => {
    await seedStudent(db, "s1");
    const out = await deleteStudentImpl({
      payload: { studentId: "s1", confirmFullName: "Tom Doe" },
      actor,
      deps: { db },
    });
    assert.deepEqual(out, {
      studentId: "s1",
      parentUnlinks: 0,
      classesUpdated: 0,
      futureAttendanceUpdated: 0,
    });
  });
});
