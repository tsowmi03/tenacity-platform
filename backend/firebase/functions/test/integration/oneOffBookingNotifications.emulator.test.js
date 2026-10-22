"use strict";

/**
 * MOB-55: the one-off booking callable answers as soon as the seat is written.
 * The admin "student added" push comes from `onAttendanceChangeNotifyAdmins`
 * instead of being sent inside the call, and several children can be booked in
 * one call. These drive the real callable and the real trigger handler with the
 * snapshots the write actually produced.
 */

const { describe, it, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");

const {
  enrollStudentOneOff,
  onAttendanceChangeNotifyAdmins,
} = require("../../lib/notifications/attendance");
const { resetAdminTokensCache } = require("../../lib/notifications/shared");
const { enrolOneOffStudentsImpl } = require("../../src/attendance/enrolOneOffStudents");
const { getAdmin, clearCollection, clearCollectionGroup } = require("../helpers/emulator");
const { installMessagingSpy } = require("../helpers/messagingSpy");

const PARENT_ID = "parent-1";
const CLASS_ID = "class-wednesday";
const WEEK = "T4_W2";
// Far enough ahead that the 9am same-day cutoff cannot be the reason for a refusal.
const SESSION_DATE = new Date("2099-10-14T08:00:00.000Z");

describe("one-off booking notifications (emulator)", () => {
  let db;
  let spy;

  const attendanceRef = () =>
    db.collection("classes").doc(CLASS_ID).collection("attendance").doc(WEEK);

  const book = (data) =>
    enrollStudentOneOff.run({
      auth: { uid: PARENT_ID },
      data: { classId: CLASS_ID, attendanceDocId: WEEK, ...data },
    });

  // Runs the trigger on the change a write made, as Firestore would.
  async function triggerOn(write) {
    const beforeSnap = await attendanceRef().get();
    const result = await write();
    const afterSnap = await attendanceRef().get();
    await onAttendanceChangeNotifyAdmins.run({
      id: `event-${Date.now()}`,
      params: { classId: CLASS_ID, attendanceId: WEEK },
      data: { before: beforeSnap, after: afterSnap },
    });
    return result;
  }

  const pushBodies = () =>
    spy.sent.map((message) => message.notification && message.notification.body);

  // A parent books with lesson tokens: the callable takes one per child
  // added, with the seat (MOB-64).
  async function seed({ capacity = 6, attendance = ["other-1"], lessonTokens = 5 } = {}) {
    await db.collection("users").doc(PARENT_ID).set({ role: "parent", lessonTokens });
    await db.collection("users").doc("admin-1").set({ role: "admin" });
    await db
      .collection("userTokens")
      .doc("admin-1")
      .collection("tokens")
      .doc("device-1")
      .set({ token: "admin-1-token" });
    for (const [id, firstName] of [["kid-1", "Ava"], ["kid-2", "Ben"]]) {
      await db.collection("students").doc(id).set({
        firstName,
        lastName: "Lee",
        parents: [PARENT_ID],
      });
    }
    await db.collection("classes").doc(CLASS_ID).set({
      capacity,
      day: "Wednesday",
      startTime: "19:00",
      type: "stdmath11",
      enrolledStudents: [],
    });
    await attendanceRef().set({
      attendance,
      cancelled: false,
      date: admin.firestore.Timestamp.fromDate(SESSION_DATE),
    });
  }

  before(() => {
    ({ db } = getAdmin());
    spy = installMessagingSpy();
  });

  after(() => spy.restore());

  beforeEach(async () => {
    spy.reset();
    resetAdminTokensCache();
    await clearCollectionGroup(db, "attendance");
    for (const name of ["classes", "students", "users", "userTokens"]) {
      await clearCollection(db, name);
    }
  });

  it("returns before any admin push is sent", async () => {
    await seed();

    const result = await book({ studentId: "kid-1" });

    assert.equal(result.added, true);
    assert.equal(spy.sent.length, 0);
  });

  it("leaves the write for the trigger to announce, exactly once", async () => {
    await seed();
    // A marker left by an earlier write must not silence this booking.
    await attendanceRef().update({
      notificationAction: { type: "one_off_enrollment", studentId: "kid-1" },
    });

    await triggerOn(() => book({ studentId: "kid-1" }));

    assert.equal((await attendanceRef().get()).data().notificationAction, undefined);
    assert.equal(spy.sent.length, 1);
    assert.match(pushBodies()[0], /^Ava Lee has been added to Wednesday at 7:00 pm on Wednesday 14 October/);
  });

  it("books several children in one call", async () => {
    await seed();

    const result = await triggerOn(() => book({ studentIds: ["kid-1", "kid-2"] }));

    assert.deepEqual(result.enrolled, ["kid-1", "kid-2"]);
    assert.deepEqual(result.noCapacity, []);
    assert.deepEqual((await attendanceRef().get()).data().attendance, [
      "other-1",
      "kid-1",
      "kid-2",
    ]);
    assert.equal(spy.sent.length, 2);
    assert.equal(result.tokensCharged, 2);
    assert.equal(result.lessonTokens, 3);
    assert.equal((await db.collection("users").doc(PARENT_ID).get()).data().lessonTokens, 3);
  });

  it("refuses several children when there are not enough tokens for all", async () => {
    await seed({ lessonTokens: 1 });

    await assert.rejects(
      book({ studentIds: ["kid-1", "kid-2"] }),
      (error) => error.code === "failed-precondition"
    );
    assert.deepEqual((await attendanceRef().get()).data().attendance, ["other-1"]);
    assert.equal((await db.collection("users").doc(PARENT_ID).get()).data().lessonTokens, 1);
  });

  it("reports which children missed out when only some fit", async () => {
    await seed({ capacity: 2 });

    const result = await book({ studentIds: ["kid-1", "kid-2"] });

    assert.deepEqual(result.enrolled, ["kid-1"]);
    assert.deepEqual(result.noCapacity, ["kid-2"]);
    assert.equal(result.tokensCharged, 1, "only the child who got a seat pays");
  });

  it("keeps a single-child call's error for a full session", async () => {
    await seed({ capacity: 1 });

    await assert.rejects(
      book({ studentId: "kid-1" }),
      (error) => error.code === "failed-precondition"
    );
  });

  it("refuses a student list that is not a list of ids", async () => {
    await seed();

    await assert.rejects(
      book({ studentIds: ["kid-1", ""] }),
      (error) => error.code === "invalid-argument"
    );
  });

  it("still keeps the trigger quiet for the payment webhook's write", async () => {
    await seed();

    await triggerOn(() =>
      enrolOneOffStudentsImpl({
        db,
        classId: CLASS_ID,
        attendanceDocId: WEEK,
        studentIds: ["kid-1"],
        actor: { uid: "system" },
      })
    );

    assert.equal(
      (await attendanceRef().get()).data().notificationAction.type,
      "one_off_enrollment"
    );
    assert.equal(spy.sent.length, 0);
  });
});
