"use strict";

const { describe, it, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");

const admin = require("firebase-admin");
const { deleteUserImpl } = require("../../src/users/deleteUser");
const { getAdmin, clearCollection } = require("../helpers/emulator");

const actor = { uid: "admin-actor", email: "admin@tenacitytutoring.com" };

function ts(date) {
  return admin.firestore.Timestamp.fromDate(date);
}

describe("deleteUserImpl (firestore + auth emulators)", () => {
  let admin_;
  let db;
  let auth;

  before(() => {
    ({ admin: admin_, db, auth } = getAdmin());
  });

  beforeEach(async () => {
    await Promise.all([
      clearCollection(db, "users"),
      clearCollection(db, "students"),
      clearCollection(db, "classes"),
      clearCollection(db, "userTokens"),
      clearCollection(db, "adminAuditLogs"),
    ]);
    const list = await auth.listUsers();
    await Promise.all(list.users.map((u) => auth.deleteUser(u.uid)));
  });

  after(async () => {
    await Promise.all([
      clearCollection(db, "users"),
      clearCollection(db, "students"),
      clearCollection(db, "classes"),
      clearCollection(db, "userTokens"),
      clearCollection(db, "adminAuditLogs"),
    ]);
  });

  async function seedAuthAndUser({ uid, email, role, extra = {} }) {
    await auth.createUser({ uid, email, password: "Password123!" });
    await db
      .collection("users")
      .doc(uid)
      .set({
        firstName: "F",
        lastName: "L",
        role,
        email,
        phone: "0",
        fcmTokens: [],
        unreadChats: {},
        activeChats: [],
        termsAccepted: false,
        acceptedTermsVersion: null,
        acceptedTermsAt: null,
        readAnnouncements: [],
        ...(role === "parent" ? { students: [], lessonTokens: 0 } : {}),
        ...extra,
      });
  }

  async function seedClass({ id, tutors = [], enrolledStudents = [], attendance = [] }) {
    const ref = id ? db.collection("classes").doc(id) : db.collection("classes").doc();
    await ref.set({
      type: "Year 7 English",
      day: "Monday",
      startTime: "16:00",
      endTime: "17:00",
      capacity: 8,
      tutors,
      enrolledStudents,
    });
    for (const a of attendance) {
      await ref.collection("attendance").doc(a.id).set({
        date: a.date,
        termId: a.termId || "2026_T2",
        cancelled: false,
        weekNum: a.weekNum,
        attendance: a.attendance || [],
        tutors: a.tutors || [],
        updatedAt: ts(new Date()),
        updatedBy: "system",
      });
    }
    return ref;
  }

  it("rejects when confirmEmail does not match", async () => {
    await seedAuthAndUser({
      uid: "u1",
      email: "real@example.com",
      role: "tutor",
    });
    await assert.rejects(
      () =>
        deleteUserImpl({
          payload: { uid: "u1", confirmEmail: "wrong@example.com" },
          actor,
          deps: { admin: admin_, db },
        }),
      (err) => err.code === "failed-precondition"
    );
    // Nothing removed
    const stillThere = await db.collection("users").doc("u1").get();
    assert.equal(stillThere.exists, true);
  });

  it("refuses to delete a parent with linked students", async () => {
    await seedAuthAndUser({
      uid: "p1",
      email: "p@e.com",
      role: "parent",
      extra: { students: ["s1"] },
    });
    await assert.rejects(
      () =>
        deleteUserImpl({
          payload: { uid: "p1", confirmEmail: "p@e.com" },
          actor,
          deps: { admin: admin_, db },
        }),
      (err) =>
        err.code === "failed-precondition" &&
        /linked student/i.test(err.message)
    );
  });

  it("deletes a parent with no students (firestore + auth + tokens)", async () => {
    await seedAuthAndUser({
      uid: "p1",
      email: "p@e.com",
      role: "parent",
    });
    await db.collection("userTokens").doc("p1").set({ tokens: ["fcm-1"] });

    const out = await deleteUserImpl({
      payload: { uid: "p1", confirmEmail: "p@e.com" },
      actor,
      deps: { admin: admin_, db },
    });

    assert.deepEqual(out, {
      uid: "p1",
      role: "parent",
      classesUpdated: 0,
      futureAttendanceUpdated: 0,
      authDeleted: true,
      tokensCleaned: true,
    });
    assert.equal((await db.collection("users").doc("p1").get()).exists, false);
    assert.equal(
      (await db.collection("userTokens").doc("p1").get()).exists,
      false
    );
    await assert.rejects(() => auth.getUser("p1"));
  });

  it("future-only cleanup for tutor: leaves historical attendance intact", async () => {
    const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await seedAuthAndUser({
      uid: "t1",
      email: "tina@e.com",
      role: "tutor",
    });
    await seedClass({
      id: "c1",
      tutors: ["t1", "t2"],
      attendance: [
        {
          id: "2026_T2_W1",
          date: ts(past),
          weekNum: 1,
          tutors: ["t1", "t2"],
          attendance: ["s1"],
        },
        {
          id: "2026_T2_W3",
          date: ts(future),
          weekNum: 3,
          tutors: ["t1", "t2"],
          attendance: ["s1"],
        },
      ],
    });
    await seedClass({
      id: "c2",
      tutors: ["other-tutor"],
      attendance: [],
    });

    const out = await deleteUserImpl({
      payload: { uid: "t1", confirmEmail: "tina@e.com" },
      actor,
      deps: { admin: admin_, db },
    });
    assert.equal(out.classesUpdated, 1);
    assert.equal(out.futureAttendanceUpdated, 1);

    const c1 = (await db.collection("classes").doc("c1").get()).data();
    assert.deepEqual(c1.tutors, ["t2"]);

    const past1 = (
      await db.collection("classes").doc("c1").collection("attendance").doc("2026_T2_W1").get()
    ).data();
    assert.deepEqual(past1.tutors, ["t1", "t2"], "historical attendance kept");

    const future1 = (
      await db.collection("classes").doc("c1").collection("attendance").doc("2026_T2_W3").get()
    ).data();
    assert.deepEqual(future1.tutors, ["t2"], "future attendance cleaned");

    const c2 = (await db.collection("classes").doc("c2").get()).data();
    assert.deepEqual(c2.tutors, ["other-tutor"], "untouched");
  });

  it("admin self-delete is refused", async () => {
    await assert.rejects(
      () =>
        deleteUserImpl({
          payload: { uid: actor.uid, confirmEmail: "anything@x.com" },
          actor,
          deps: { admin: admin_, db },
        }),
      (err) =>
        err.code === "failed-precondition" &&
        /cannot delete themselves/i.test(err.message)
    );
  });

  it("not-found when user doc missing", async () => {
    await assert.rejects(
      () =>
        deleteUserImpl({
          payload: { uid: "ghost", confirmEmail: "x@y.com" },
          actor,
          deps: { admin: admin_, db },
        }),
      (err) => err.code === "not-found"
    );
  });
});
