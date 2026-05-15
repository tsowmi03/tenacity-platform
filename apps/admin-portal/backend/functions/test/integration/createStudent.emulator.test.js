"use strict";

const { describe, it, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");

const { createStudentImpl } = require("../../src/students/createStudent");
const { getAdmin, clearCollection } = require("../helpers/emulator");

const actor = { uid: "admin-actor", email: "admin@tenacitytutoring.com" };

describe("createStudentImpl (firestore emulator)", () => {
  let db;

  before(() => {
    ({ db } = getAdmin());
  });

  beforeEach(async () => {
    await Promise.all([
      clearCollection(db, "students"),
      clearCollection(db, "users"),
      clearCollection(db, "adminAuditLogs"),
    ]);
  });

  after(async () => {
    await Promise.all([
      clearCollection(db, "students"),
      clearCollection(db, "users"),
      clearCollection(db, "adminAuditLogs"),
    ]);
  });

  async function seedParent(uid) {
    await db
      .collection("users")
      .doc(uid)
      .set({
        firstName: "P",
        lastName: "P",
        role: "parent",
        email: `${uid}@e.com`,
        phone: "0",
        students: [],
        fcmTokens: [],
        unreadChats: {},
        activeChats: [],
        termsAccepted: false,
        acceptedTermsVersion: null,
        acceptedTermsAt: null,
        readAnnouncements: [],
        lessonTokens: 0,
      });
  }

  it("creates an unlinked student when no parentIds", async () => {
    const out = await createStudentImpl({
      payload: {
        student: {
          firstName: "Tom",
          lastName: "Doe",
          grade: "7",
          subjects: [],
          parents: [],
        },
        parentIds: [],
      },
      actor,
      deps: { db },
    });
    const doc = (await db.collection("students").doc(out.studentId).get()).data();
    assert.deepEqual(doc.parents, []);
    assert.equal("primaryParentId" in doc, false);
  });

  it("links to existing parents and updates their students[]", async () => {
    await seedParent("p1");
    await seedParent("p2");

    const out = await createStudentImpl({
      payload: {
        student: {
          firstName: "Tom",
          lastName: "Doe",
          grade: "7",
          subjects: ["Math"],
          parents: [],
        },
        parentIds: ["p1", "p2"],
        primaryParentId: "p2",
      },
      actor,
      deps: { db },
    });
    const studentDoc = (
      await db.collection("students").doc(out.studentId).get()
    ).data();
    assert.deepEqual(studentDoc.parents.sort(), ["p1", "p2"]);
    assert.equal(studentDoc.primaryParentId, "p2");

    const p1 = (await db.collection("users").doc("p1").get()).data();
    const p2 = (await db.collection("users").doc("p2").get()).data();
    assert.ok(p1.students.includes(out.studentId));
    assert.ok(p2.students.includes(out.studentId));
  });

  it("defaults primaryParentId to first parentId when not specified", async () => {
    await seedParent("p1");
    const out = await createStudentImpl({
      payload: {
        student: { firstName: "Tom", lastName: "Doe", grade: "7", subjects: [], parents: [] },
        parentIds: ["p1"],
      },
      actor,
      deps: { db },
    });
    const doc = (await db.collection("students").doc(out.studentId).get()).data();
    assert.equal(doc.primaryParentId, "p1");
  });

  it("aborts atomically when a parent is missing", async () => {
    await seedParent("p1");
    await assert.rejects(
      () =>
        createStudentImpl({
          payload: {
            student: { firstName: "Tom", lastName: "Doe", grade: "7", subjects: [], parents: [] },
            parentIds: ["p1", "missing"],
          },
          actor,
          deps: { db },
        }),
      (err) => err.code === "not-found"
    );
    const students = await db.collection("students").get();
    assert.equal(students.size, 0);
    const p1 = (await db.collection("users").doc("p1").get()).data();
    assert.deepEqual(p1.students, []);
  });

  it("rejects linking to a non-parent user", async () => {
    await db
      .collection("users")
      .doc("t1")
      .set({ role: "tutor", firstName: "T", lastName: "U", email: "t@u.com", phone: "0" });
    await assert.rejects(
      () =>
        createStudentImpl({
          payload: {
            student: { firstName: "Tom", lastName: "Doe", grade: "7", subjects: [], parents: [] },
            parentIds: ["t1"],
          },
          actor,
          deps: { db },
        }),
      (err) => err.code === "failed-precondition"
    );
  });
});
