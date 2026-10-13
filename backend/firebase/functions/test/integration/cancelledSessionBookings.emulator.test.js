"use strict";

/**
 * MOB-58: a student was swapped into a Wednesday class that an admin had
 * cancelled. The app's swap picker offered it because it had seats, and the
 * server never looked at the flag. These drive the real callables, through the
 * `.run` hook firebase-functions v2 attaches to every onCall export, against
 * documents shaped the way a cancelled week actually is: `cancelled: true`,
 * roster left in place.
 */

const { describe, it, before, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  enrollStudentOneOff,
  rescheduleStudentToDifferentClass,
} = require("../../lib/notifications/attendance");
const { CANCELLED_SESSION_MESSAGE } = require("../../src/attendance/cancelledSession");
const { getAdmin, clearCollection, clearCollectionGroup } = require("../helpers/emulator");

const PARENT_ID = "parent-1";
const ADMIN_ID = "admin-1";
const STUDENT_ID = "student-1";
const MONDAY = "class-monday";
const WEDNESDAY = "class-wednesday";
const WEEK = "T4_W2";

// Far enough ahead that neither the 9am same-day cutoff nor "already run"
// can be the reason for a refusal.
const MONDAY_DATE = new Date("2099-10-12T06:00:00.000Z");
const WEDNESDAY_DATE = new Date("2099-10-14T08:00:00.000Z");

describe("bookings into a cancelled session (emulator)", () => {
  let db;

  const attendanceRef = (classId) =>
    db.collection("classes").doc(classId).collection("attendance").doc(WEEK);

  const rollOf = async (classId) => (await attendanceRef(classId).get()).data().attendance;

  const cancelWednesday = () => attendanceRef(WEDNESDAY).update({ cancelled: true });

  const swap = (uid = PARENT_ID) =>
    rescheduleStudentToDifferentClass.run({
      auth: { uid },
      data: {
        oldClassId: MONDAY,
        oldAttendanceDocId: WEEK,
        newClassId: WEDNESDAY,
        newAttendanceDocId: WEEK,
        studentId: STUDENT_ID,
      },
    });

  const bookWednesday = (uid = PARENT_ID) =>
    enrollStudentOneOff.run({
      auth: { uid },
      data: { classId: WEDNESDAY, studentId: STUDENT_ID, attendanceDocId: WEEK },
    });

  const refusedAsCancelled = (error) =>
    error.code === "failed-precondition" && error.message === CANCELLED_SESSION_MESSAGE;

  before(() => {
    ({ db } = getAdmin());
  });

  beforeEach(async () => {
    await clearCollectionGroup(db, "attendance");
    for (const name of ["classes", "students", "users"]) {
      await clearCollection(db, name);
    }

    await db.collection("users").doc(PARENT_ID).set({ role: "parent" });
    await db.collection("users").doc(ADMIN_ID).set({ role: "admin" });
    await db.collection("students").doc(STUDENT_ID).set({
      firstName: "Sam",
      lastName: "Student",
      parents: [PARENT_ID],
    });

    await db.collection("classes").doc(MONDAY).set({
      capacity: 6,
      day: "Monday",
      startTime: "17:00",
      type: "stdmath11",
      enrolledStudents: [STUDENT_ID],
    });
    await attendanceRef(MONDAY).set({
      attendance: [STUDENT_ID],
      cancelled: false,
      date: MONDAY_DATE,
    });

    // Plenty of room: capacity is not what should stop anybody.
    await db.collection("classes").doc(WEDNESDAY).set({
      capacity: 6,
      day: "Wednesday",
      startTime: "19:00",
      type: "stdmath11",
      enrolledStudents: ["other-1"],
    });
    await attendanceRef(WEDNESDAY).set({
      attendance: ["other-1"],
      cancelled: false,
      date: WEDNESDAY_DATE,
    });
  });

  describe("one-week swap", () => {
    it("still moves a student into a session that is running", async () => {
      const result = await swap();

      assert.equal(result.added, true);
      assert.deepEqual(await rollOf(MONDAY), []);
      assert.deepEqual((await rollOf(WEDNESDAY)).sort(), ["other-1", STUDENT_ID]);
    });

    it("refuses a cancelled destination and leaves the original booking alone", async () => {
      // The screen was opened while Wednesday was still on; the admin
      // cancelled it before the parent confirmed.
      await cancelWednesday();

      await assert.rejects(swap(), refusedAsCancelled);

      assert.deepEqual(await rollOf(MONDAY), [STUDENT_ID]);
      assert.deepEqual(await rollOf(WEDNESDAY), ["other-1"]);
    });

    it("refuses an admin too", async () => {
      await cancelWednesday();

      await assert.rejects(swap(ADMIN_ID), refusedAsCancelled);

      assert.deepEqual(await rollOf(MONDAY), [STUDENT_ID]);
    });
  });

  describe("one-off booking", () => {
    it("refuses a cancelled session with seats free", async () => {
      await cancelWednesday();

      await assert.rejects(bookWednesday(), refusedAsCancelled);

      assert.deepEqual(await rollOf(WEDNESDAY), ["other-1"]);
    });

    it("still books a session that is running", async () => {
      const result = await bookWednesday();

      assert.equal(result.added, true);
      assert.ok((await rollOf(WEDNESDAY)).includes(STUDENT_ID));
    });
  });
});
