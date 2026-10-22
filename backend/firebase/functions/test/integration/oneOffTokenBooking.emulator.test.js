"use strict";

/**
 * MOB-64: a parent's one-off booked with a lesson token kept the token. The
 * app took it afterwards, from the device, and Firestore rules refused every
 * one of those writes. The token is now taken by `enrollStudentOneOff`, in the
 * same transaction as the seat, so neither can happen without the other.
 */

const { describe, it, before, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const { enrollStudentOneOff } = require("../../lib/notifications/attendance");
const { getAdmin, clearCollection, clearCollectionGroup } = require("../helpers/emulator");

const PARENT_ID = "parent-1";
const ADMIN_ID = "admin-1";
const STUDENT_ID = "student-1";
const SIBLING_ID = "student-2";
const CLASS_ID = "class-wednesday";
const WEEK = "T4_W2";
const SESSION_DATE = new Date("2099-10-14T08:00:00.000Z");

describe("one-off booking with lesson tokens (emulator)", () => {
  let db;

  const attendanceRef = () =>
    db.collection("classes").doc(CLASS_ID).collection("attendance").doc(WEEK);
  const roll = async () => (await attendanceRef().get()).data().attendance;
  const tokens = async () =>
    (await db.collection("users").doc(PARENT_ID).get()).data().lessonTokens;
  const setTokens = (n) =>
    db.collection("users").doc(PARENT_ID).update({ lessonTokens: n });

  const book = (studentId = STUDENT_ID, uid = PARENT_ID) =>
    enrollStudentOneOff.run({
      auth: { uid },
      data: { classId: CLASS_ID, studentId, attendanceDocId: WEEK },
    });

  const tokenAudits = async () =>
    (await db.collection("adminAuditLogs")
      .where("action", "==", "user.adjust_lesson_tokens")
      .get()).docs.map((d) => d.data());

  before(() => {
    ({ db } = getAdmin());
  });

  beforeEach(async () => {
    await clearCollectionGroup(db, "attendance");
    for (const name of ["classes", "students", "users", "adminAuditLogs"]) {
      await clearCollection(db, name);
    }
    await db.collection("users").doc(PARENT_ID).set({
      role: "parent",
      firstName: "Pat",
      lastName: "Parent",
      lessonTokens: 1,
    });
    await db.collection("users").doc(ADMIN_ID).set({ role: "admin" });
    for (const id of [STUDENT_ID, SIBLING_ID]) {
      await db.collection("students").doc(id).set({ parents: [PARENT_ID] });
    }
    await db.collection("classes").doc(CLASS_ID).set({
      capacity: 2,
      day: "Wednesday",
      startTime: "19:00",
      enrolledStudents: [],
    });
    await attendanceRef().set({ attendance: [], cancelled: false, date: SESSION_DATE });
  });

  it("takes one token with the seat, and records it", async () => {
    const result = await book();

    assert.equal(result.added, true);
    assert.equal(result.tokensCharged, 1);
    assert.equal(result.lessonTokens, 0);
    assert.deepEqual(await roll(), [STUDENT_ID]);
    assert.equal(await tokens(), 0);

    const audits = await tokenAudits();
    assert.equal(audits.length, 1);
    assert.equal(audits[0].targetId, PARENT_ID);
    assert.equal(audits[0].payloadSummary.reason, "one_off_booking");
    assert.equal(audits[0].payloadSummary.value, -1);
    assert.deepEqual(audits[0].before, { lessonTokens: 1 });
    assert.deepEqual(audits[0].after, { lessonTokens: 0 });
  });

  it("refuses a booking without a token and writes nothing", async () => {
    await setTokens(0);

    await assert.rejects(book(), (error) => error.code === "failed-precondition");

    assert.deepEqual(await roll(), []);
    assert.equal(await tokens(), 0);
    assert.equal((await tokenAudits()).length, 0);
  });

  it("charges each child separately, and stops when the tokens run out", async () => {
    await book(STUDENT_ID);
    await assert.rejects(book(SIBLING_ID), (error) => error.code === "failed-precondition");

    assert.deepEqual(await roll(), [STUDENT_ID]);
    assert.equal(await tokens(), 0);
  });

  it("does not charge again for a student already booked", async () => {
    await setTokens(2);
    await book();
    const retry = await book();

    assert.equal(retry.added, false);
    assert.equal(retry.alreadyEnrolled, true);
    assert.equal(retry.tokensCharged, 0);
    assert.equal(await tokens(), 1);
    assert.equal((await tokenAudits()).length, 1);
  });

  it("does not charge when the session is full", async () => {
    await attendanceRef().update({ attendance: ["other-1", "other-2"] });

    await assert.rejects(book(), (error) => error.code === "failed-precondition");

    assert.equal(await tokens(), 1);
  });

  it("lets an admin book without using the family's tokens", async () => {
    await setTokens(0);

    const result = await book(STUDENT_ID, ADMIN_ID);

    assert.equal(result.added, true);
    assert.equal(result.tokensCharged, 0);
    assert.equal(await tokens(), 0);
  });
});
