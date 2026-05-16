"use strict";

const { describe, it, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");

const { updateUserImpl } = require("../../src/users/updateUser");
const {
  updateStudentImpl,
} = require("../../src/students/updateStudent");
const { getAdmin, clearCollection } = require("../helpers/emulator");

const actor = { uid: "admin-actor", email: "admin@tenacitytutoring.com" };

async function seedParent(db, uid) {
  await db.collection("users").doc(uid).set({
    firstName: "P",
    lastName: "Q",
    role: "parent",
    email: `${uid}@e.com`,
    phone: "0",
    students: [],
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

async function seedTutor(db, uid) {
  await db.collection("users").doc(uid).set({
    firstName: "T",
    lastName: "U",
    role: "tutor",
    email: `${uid}@e.com`,
    phone: "0",
    fcmTokens: [],
    unreadChats: {},
    activeChats: [],
    termsAccepted: false,
    acceptedTermsVersion: null,
    acceptedTermsAt: null,
    readAnnouncements: [],
  });
}

describe("updateUserImpl + updateStudentImpl (firestore emulator)", () => {
  let db;

  before(() => {
    ({ db } = getAdmin());
  });

  beforeEach(async () => {
    await Promise.all([
      clearCollection(db, "users"),
      clearCollection(db, "students"),
      clearCollection(db, "adminAuditLogs"),
    ]);
  });

  after(async () => {
    await Promise.all([
      clearCollection(db, "users"),
      clearCollection(db, "students"),
      clearCollection(db, "adminAuditLogs"),
    ]);
  });

  it("updates user fields and writes an audit log with before/after", async () => {
    await seedParent(db, "p1");
    const out = await updateUserImpl({
      payload: { uid: "p1", updates: { firstName: "Patricia", phone: "0411" } },
      actor,
      deps: { db },
    });
    assert.deepEqual(out.updatedFields.sort(), ["firstName", "phone"]);
    const doc = (await db.collection("users").doc("p1").get()).data();
    assert.equal(doc.firstName, "Patricia");
    assert.equal(doc.phone, "0411");
    assert.equal(doc.updatedBy, actor.uid);

    const logs = await db.collection("adminAuditLogs").get();
    const log = logs.docs.find((d) => d.data().targetId === "p1");
    assert.ok(log);
    assert.equal(log.data().before.firstName, "P");
    assert.equal(log.data().after.firstName, "Patricia");
  });

  it("rejects lessonTokens on a non-parent", async () => {
    await seedTutor(db, "t1");
    await assert.rejects(
      () =>
        updateUserImpl({
          payload: { uid: "t1", updates: { lessonTokens: 5 } },
          actor,
          deps: { db },
        }),
      (err) => err.code === "failed-precondition"
    );
  });

  it("returns not-found for missing user", async () => {
    await assert.rejects(
      () =>
        updateUserImpl({
          payload: { uid: "ghost", updates: { firstName: "X" } },
          actor,
          deps: { db },
        }),
      (err) => err.code === "not-found"
    );
  });

  it("updates student fields", async () => {
    const ref = db.collection("students").doc();
    await ref.set({
      firstName: "Tom",
      lastName: "Doe",
      grade: "7",
      subjects: ["Math"],
      parents: ["p1"],
    });
    const out = await updateStudentImpl({
      payload: {
        studentId: ref.id,
        updates: { grade: "8", subjects: ["Math", "English"] },
      },
      actor,
      deps: { db },
    });
    assert.deepEqual(out.updatedFields.sort(), ["grade", "subjects"]);
    const doc = (await ref.get()).data();
    assert.equal(doc.grade, "8");
    assert.deepEqual(doc.subjects, ["Math", "English"]);
  });

  it("rejects primaryParentId not in current parents", async () => {
    const ref = db.collection("students").doc();
    await ref.set({
      firstName: "Tom",
      lastName: "Doe",
      grade: "7",
      subjects: [],
      parents: ["p1"],
    });
    await assert.rejects(
      () =>
        updateStudentImpl({
          payload: { studentId: ref.id, updates: { primaryParentId: "p2" } },
          actor,
          deps: { db },
        }),
      (err) => err.code === "failed-precondition"
    );
  });
});
