"use strict";

/**
 * Regression coverage for the class-swap notification storm (MOB-21).
 *
 * Every future-attendance-doc fan-out loop (class swap/enrol/unenrol,
 * waitlist promotion, enrolment acceptance, student deletion, and the
 * admin-portal roster overwrite) used to write to N future attendance docs
 * with no notificationAction guard, so onAttendanceChangeNotifyAdmins fired
 * once per write instead of once per human action. This drives the real
 * production write path against the Firestore emulator, then feeds the
 * exact before/after snapshots through the real exported trigger handler
 * via `.run` — the raw-handler hook firebase-functions v2 attaches to every
 * onDocumentUpdated export specifically for this kind of direct invocation
 * (see node_modules/firebase-functions/lib/v2/providers/firestore.js,
 * onChangedOperation: `func.run = handler`). No Functions/Eventarc emulator
 * is needed for this — only firestore (+auth, for acceptEnrolmentImpl).
 */

const { describe, it, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");

const admin = require("firebase-admin");

const {
  addStudentToFutureAttendanceDocs,
  removeStudentFromFutureAttendanceDocs,
  resetAdminTokensCache,
} = require("../../lib/notifications/shared");
const {
  onAttendanceChangeNotifyAdmins,
} = require("../../lib/notifications/attendance");
const { deleteStudentImpl } = require("../../src/students/deleteStudent");
const {
  acceptEnrolmentImpl,
} = require("../../src/enrolments/acceptEnrolment");
const {
  planFutureAttendanceUpdates,
} = require("../../src/classes/attendanceGeneration");
const {
  getAdmin,
  clearCollection,
  clearCollectionGroup,
} = require("../helpers/emulator");
const { installMessagingSpy } = require("../helpers/messagingSpy");

const actor = { uid: "admin-actor", email: "admin@tenacitytutoring.com" };

function ts(date) {
  return admin.firestore.Timestamp.fromDate(date);
}

function daysFromNow(n) {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}

function futureAttendanceDocs(n, { prefix = "W" } = {}) {
  return Array.from({ length: n }, (_, i) => ({
    id: `2026_T2_${prefix}${i + 2}`,
    date: daysFromNow((i + 1) * 7),
    weekNum: i + 2,
  }));
}

describe("attendance fan-out stays one notification per action (firestore + auth emulators)", () => {
  let db;
  let auth;
  let sentMessages;
  let spy;

  before(() => {
    ({ db, auth } = getAdmin());
    spy = installMessagingSpy();
    sentMessages = spy.sent;
  });

  // clearCollection only deletes the class docs themselves — it doesn't
  // touch their "attendance" subcollections, since those are independent
  // documents at a different path. Without also clearing the collection
  // group, a leftover future attendance doc from one test (e.g. class "c1"'s
  // week 2) can survive into a later test/file that reuses the same class
  // id, inflating any "how many future docs did this touch" count it makes.
  async function clearAll() {
    await Promise.all([
      clearCollection(db, "users"),
      clearCollection(db, "students"),
      clearCollection(db, "classes"),
      clearCollection(db, "enrolments"),
      clearCollection(db, "userTokens"),
      clearCollection(db, "adminAuditLogs"),
      clearCollectionGroup(db, "attendance"),
    ]);
  }

  after(async () => {
    spy.restore();
    await clearAll();
  });

  beforeEach(async () => {
    spy.reset();
    resetAdminTokensCache();
    await clearAll();
    const list = await auth.listUsers();
    await Promise.all(list.users.map((u) => auth.deleteUser(u.uid)));
    await seedAdminWithToken("admin-1", "admin-1-token");
  });

  async function seedAdminWithToken(uid, token) {
    await db.collection("users").doc(uid).set({
      firstName: "Ada",
      lastName: "Min",
      role: "admin",
      email: `${uid}@tenacitytutoring.com`,
    });
    await db
      .collection("userTokens")
      .doc(uid)
      .collection("tokens")
      .doc("device-1")
      .set({ token });
  }

  async function seedStudent(id, { firstName = "Tom", lastName = "Doe" } = {}) {
    await db.collection("students").doc(id).set({
      firstName,
      lastName,
      grade: "7",
      subjects: [],
      parents: [],
    });
  }

  async function seedClass(
    id,
    { enrolledStudents = [], attendance = [], capacity = 8 } = {}
  ) {
    const ref = db.collection("classes").doc(id);
    await ref.set({
      type: "Year 7 English",
      day: "Monday",
      startTime: "16:00",
      endTime: "17:00",
      capacity,
      tutors: ["t1"],
      enrolledStudents,
    });
    for (const a of attendance) {
      await ref.collection("attendance").doc(a.id).set({
        date: ts(a.date),
        termId: "2026_T2",
        cancelled: false,
        weekNum: a.weekNum,
        attendance: a.attendance || [],
        tutors: ["t1"],
        updatedAt: ts(new Date()),
        updatedBy: "system",
      });
    }
    return ref;
  }

  /**
   * Reads a before-snapshot for each attendance doc, runs `mutate` (the
   * real production write), reads the after-snapshot, then feeds every
   * before/after pair through the real onAttendanceChangeNotifyAdmins
   * handler — exactly what Cloud Functions would do per write, without
   * needing the Functions emulator.
   */
  async function driveAttendanceTrigger(classId, attendanceIds, mutate) {
    const refs = attendanceIds.map((id) =>
      db.collection("classes").doc(classId).collection("attendance").doc(id)
    );
    const beforeSnaps = await Promise.all(refs.map((ref) => ref.get()));
    await mutate();
    const afterSnaps = await Promise.all(refs.map((ref) => ref.get()));
    for (let i = 0; i < refs.length; i += 1) {
      await onAttendanceChangeNotifyAdmins.run({
        params: { classId, attendanceId: attendanceIds[i] },
        data: { before: beforeSnaps[i], after: afterSnaps[i] },
      });
    }
  }

  it("a permanent class swap sends zero admin pushes across every future week", async () => {
    await seedStudent("s1");
    const oldDocs = futureAttendanceDocs(3, { prefix: "OLD" });
    const newDocs = futureAttendanceDocs(3, { prefix: "NEW" });
    await seedClass("old-class", {
      attendance: oldDocs.map((d) => ({ ...d, attendance: ["s1"] })),
    });
    await seedClass("new-class", {
      attendance: newDocs.map((d) => ({ ...d, attendance: [] })),
    });

    // unenrollStudentPermanent's half of the swap
    await driveAttendanceTrigger(
      "old-class",
      oldDocs.map((d) => d.id),
      () =>
        removeStudentFromFutureAttendanceDocs({
          classId: "old-class",
          studentId: "s1",
          updatedBy: actor.uid,
        })
    );
    // enrollStudentPermanent's half of the swap
    await driveAttendanceTrigger(
      "new-class",
      newDocs.map((d) => d.id),
      () =>
        addStudentToFutureAttendanceDocs({
          classId: "new-class",
          studentId: "s1",
          updatedBy: actor.uid,
        })
    );

    assert.equal(
      sentMessages.length,
      0,
      `expected the swap's 6 future-week writes to send 0 admin pushes, got ${sentMessages.length}`
    );
  });

  it("skips a future week a one-off visitor has already filled", async () => {
    // MOB-38, reproduced. Capacity 4, three permanent students, and a one-off
    // visitor in the first week only. The permanent roster says there is a
    // spot; the first week's room does not.
    await seedStudent("newcomer");
    const docs = futureAttendanceDocs(2, { prefix: "CAP" });
    await seedClass("capacity-class", {
      capacity: 4,
      enrolledStudents: ["p1", "p2", "p3"],
      attendance: [
        { ...docs[0], attendance: ["p1", "p2", "p3", "v1"] },
        { ...docs[1], attendance: ["p1", "p2", "p3"] },
      ],
    });

    const result = await addStudentToFutureAttendanceDocs({
      classId: "capacity-class",
      studentId: "newcomer",
      updatedBy: actor.uid,
    });

    const attendanceFor = async (docId) => {
      const snap = await db
        .collection("classes")
        .doc("capacity-class")
        .collection("attendance")
        .doc(docId)
        .get();
      return snap.data().attendance;
    };

    assert.deepEqual(
      await attendanceFor(docs[0].id),
      ["p1", "p2", "p3", "v1"],
      "the full week must be left exactly as it was, visitor included"
    );
    assert.ok(
      (await attendanceFor(docs[1].id)).includes("newcomer"),
      "the week with room must still take the student"
    );
    assert.deepEqual(
      result.skipped.map((entry) => entry.id),
      [docs[0].id],
      "the skipped week must be reported so an admin can be told"
    );
  });

  it("a swap keeps the student in the old class for weeks the new one is full", async () => {
    // MOB-38, the swap half. Ben moves from Monday to Wednesday. Wednesday is
    // full in week one because a paid one-off visitor is in it. Without the
    // keep list he would come off Monday and never join Wednesday, leaving him
    // with no class at all that week.
    await seedStudent("ben");
    // Both classes use the same ids on purpose. Attendance documents are keyed
    // `{termId}_W{weekNum}`, so week two is `2026_T2_W2` in every class — which
    // is what lets the weeks the new class skipped be looked up in the old one.
    const oldDocs = futureAttendanceDocs(2);
    const newDocs = futureAttendanceDocs(2);
    await seedClass("monday", {
      capacity: 4,
      enrolledStudents: ["ben"],
      attendance: oldDocs.map((d) => ({ ...d, attendance: ["ben"] })),
    });
    await seedClass("wednesday", {
      capacity: 4,
      enrolledStudents: ["p1", "p2", "p3"],
      attendance: [
        { ...newDocs[0], attendance: ["p1", "p2", "p3", "visitor"] },
        { ...newDocs[1], attendance: ["p1", "p2", "p3"] },
      ],
    });

    // The swap's real order: take the new place first, then give up the old
    // one, keeping the weeks the new class could not take.
    const enrol = await addStudentToFutureAttendanceDocs({
      classId: "wednesday",
      studentId: "ben",
      updatedBy: actor.uid,
    });
    const unenrol = await removeStudentFromFutureAttendanceDocs({
      classId: "monday",
      studentId: "ben",
      updatedBy: actor.uid,
      keepSessionIds: enrol.skipped.map((entry) => entry.id),
    });

    const attendanceFor = async (classId, docId) => {
      const snap = await db
        .collection("classes")
        .doc(classId)
        .collection("attendance")
        .doc(docId)
        .get();
      return snap.data().attendance;
    };

    // Week one: Wednesday was full, so Ben keeps his Monday seat.
    assert.ok(
      (await attendanceFor("monday", oldDocs[0].id)).includes("ben"),
      "Ben must keep his old seat for the week the new class could not take"
    );
    assert.ok(
      !(await attendanceFor("wednesday", newDocs[0].id)).includes("ben"),
      "the full week must not be overfilled"
    );

    // Week two: Wednesday had room, so the move happens as normal.
    assert.ok(
      !(await attendanceFor("monday", oldDocs[1].id)).includes("ben"),
      "Ben must leave the old class for weeks the new one can take him"
    );
    assert.ok(
      (await attendanceFor("wednesday", newDocs[1].id)).includes("ben"),
      "Ben must join the new class for weeks that have room"
    );

    assert.deepEqual(
      unenrol.kept.map((entry) => entry.id),
      [oldDocs[0].id],
      "the kept week must be reported so the family can be told"
    );
  });

  it("enrolment acceptance's future-attendance sync sends zero admin pushes", async () => {
    const docs = futureAttendanceDocs(2);
    await seedClass("c1", { attendance: docs });
    await db.collection("enrolments").doc("e1").set({
      archived: false,
      studentFirstName: "Tom",
      studentLastName: "Doe",
      studentYear: "7",
      studentSubjects: ["Math"],
      classes: [{ id: "c1", day: "Monday", startTime: "16:00" }],
      carerFirstName: "Jane",
      carerLastName: "Doe",
      carerEmail: "jane-accept@example.com",
      carerPhone: "0400",
      emergencyContactFirstName: "Em",
      emergencyContactLastName: "Er",
      emergencyContactPhone: "0411",
      emergencyContactRelation: "aunt",
      allergies: "",
      permissionToLeave: false,
      additionalInfo: "",
    });

    await driveAttendanceTrigger(
      "c1",
      docs.map((d) => d.id),
      () =>
        acceptEnrolmentImpl({
          payload: { enrolmentId: "e1" },
          actor,
          deps: {
            admin,
            db,
            sendAcceptedEmail: async () => ({ sent: true }),
          },
        })
    );

    assert.equal(sentMessages.length, 0);
  });

  it("student deletion's future-attendance cleanup sends zero admin pushes", async () => {
    const docs = futureAttendanceDocs(2);
    await seedStudent("s1");
    await seedClass("c1", {
      enrolledStudents: ["s1"],
      attendance: docs.map((d) => ({ ...d, attendance: ["s1"] })),
    });

    await driveAttendanceTrigger(
      "c1",
      docs.map((d) => d.id),
      () =>
        deleteStudentImpl({
          payload: { studentId: "s1", confirmFullName: "Tom Doe" },
          actor,
          deps: { db },
        })
    );

    assert.equal(sentMessages.length, 0);
  });

  it("an admin-portal roster overwrite suppresses the whole diff, even with several students changing at once", async () => {
    const docs = futureAttendanceDocs(2);
    await seedStudent("s1");
    await seedStudent("s2", { firstName: "Amy", lastName: "Lee" });
    await seedClass("c1", {
      enrolledStudents: ["s2"],
      attendance: docs.map((d) => ({ ...d, attendance: ["s1"] })),
    });

    await driveAttendanceTrigger(
      "c1",
      docs.map((d) => d.id),
      async () => {
        // s1 drops off the roster, s2 joins it — one write, two students
        // changing in opposite directions on the same doc.
        const writes = await planFutureAttendanceUpdates({
          db,
          classId: "c1",
          classData: { enrolledStudents: ["s2"], tutors: ["t1"] },
          actor,
          clock: () => new Date(),
          updateStudents: true,
        });
        const batch = db.batch();
        writes.forEach(({ ref, patch }) => batch.update(ref, patch));
        await batch.commit();
      }
    );

    assert.equal(sentMessages.length, 0);
  });

  it("an attendance write with no notificationAction still notifies admins exactly once", async () => {
    // Sanity check that the guard suppresses only what it's supposed to —
    // a genuinely unguarded change must still reach admins.
    await seedStudent("s1");
    const [doc] = futureAttendanceDocs(1);
    await seedClass("c1", { attendance: [{ ...doc, attendance: ["s1"] }] });

    await driveAttendanceTrigger("c1", [doc.id], () =>
      db
        .collection("classes")
        .doc("c1")
        .collection("attendance")
        .doc(doc.id)
        .update({ attendance: admin.firestore.FieldValue.arrayRemove("s1") })
    );

    assert.equal(sentMessages.length, 1);
    assert.equal(sentMessages[0].data.type, "student_absent");
    assert.equal(sentMessages[0].data.studentId, "s1");
    assert.deepEqual(sentMessages[0].tokens, ["admin-1-token"]);
  });
});
