"use strict";

const { describe, it, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");

const { linkImpl } = require("../../src/users/linkStudent");
const {
  adjustLessonTokensImpl,
} = require("../../src/users/adjustLessonTokens");
const { getAdmin, clearCollection } = require("../helpers/emulator");

const actor = { uid: "admin-actor", email: "admin@tenacitytutoring.com" };

async function seedParent(db, uid, students = [], extra = {}) {
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
      ...extra,
    });
}

async function seedStudent(db, id, parents = [], primaryParentId) {
  const doc = {
    firstName: "Tom",
    lastName: "Doe",
    grade: "7",
    subjects: [],
    parents,
  };
  if (primaryParentId) doc.primaryParentId = primaryParentId;
  await db.collection("students").doc(id).set(doc);
}

describe("link/unlink + lessonTokens (firestore emulator)", () => {
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

  it("link adds to both sides idempotently", async () => {
    await seedParent(db, "p1");
    await seedStudent(db, "s1");

    await linkImpl({
      payload: { parentId: "p1", studentId: "s1" },
      actor,
      mode: "link",
      deps: { db },
    });
    await linkImpl({
      payload: { parentId: "p1", studentId: "s1" },
      actor,
      mode: "link",
      deps: { db },
    });

    const p = (await db.collection("users").doc("p1").get()).data();
    const s = (await db.collection("students").doc("s1").get()).data();
    assert.deepEqual(p.students, ["s1"]);
    assert.deepEqual(s.parents, ["p1"]);
  });

  it("unlink removes from both sides and rotates primaryParentId", async () => {
    await seedParent(db, "p1", ["s1"]);
    await seedParent(db, "p2", ["s1"]);
    await seedStudent(db, "s1", ["p1", "p2"], "p1");

    await linkImpl({
      payload: { parentId: "p1", studentId: "s1" },
      actor,
      mode: "unlink",
      deps: { db },
    });

    const s = (await db.collection("students").doc("s1").get()).data();
    assert.deepEqual(s.parents, ["p2"]);
    assert.equal(s.primaryParentId, "p2");
    const p1 = (await db.collection("users").doc("p1").get()).data();
    assert.deepEqual(p1.students, []);
  });

  it("unlink clears primaryParentId to null when no parents remain", async () => {
    await seedParent(db, "p1", ["s1"]);
    await seedStudent(db, "s1", ["p1"], "p1");

    await linkImpl({
      payload: { parentId: "p1", studentId: "s1" },
      actor,
      mode: "unlink",
      deps: { db },
    });
    const s = (await db.collection("students").doc("s1").get()).data();
    assert.deepEqual(s.parents, []);
    assert.equal(s.primaryParentId, null);
  });

  it("link rejects when user is not a parent", async () => {
    await db
      .collection("users")
      .doc("t1")
      .set({ role: "tutor", firstName: "T", lastName: "U", email: "t@u.com", phone: "0" });
    await seedStudent(db, "s1");
    await assert.rejects(
      () =>
        linkImpl({
          payload: { parentId: "t1", studentId: "s1" },
          actor,
          mode: "link",
          deps: { db },
        }),
      (err) => err.code === "failed-precondition"
    );
  });

  it("adjustLessonTokens delta + set", async () => {
    await seedParent(db, "p1", [], { lessonTokens: 4 });

    let out = await adjustLessonTokensImpl({
      payload: { uid: "p1", mode: "delta", value: 3, reason: "gift" },
      actor,
      deps: { db },
    });
    assert.deepEqual(out, { uid: "p1", before: 4, after: 7 });

    out = await adjustLessonTokensImpl({
      payload: { uid: "p1", mode: "set", value: 10 },
      actor,
      deps: { db },
    });
    assert.deepEqual(out, { uid: "p1", before: 7, after: 10 });

    const doc = (await db.collection("users").doc("p1").get()).data();
    assert.equal(doc.lessonTokens, 10);
  });

  it("adjustLessonTokens rejects negative result", async () => {
    await seedParent(db, "p1", [], { lessonTokens: 2 });
    await assert.rejects(
      () =>
        adjustLessonTokensImpl({
          payload: { uid: "p1", mode: "delta", value: -5 },
          actor,
          deps: { db },
        }),
      (err) => err.code === "failed-precondition"
    );
  });

  it("adjustLessonTokens rejects non-parent", async () => {
    await db
      .collection("users")
      .doc("t1")
      .set({ role: "tutor", firstName: "T", lastName: "U", email: "t@u.com", phone: "0" });
    await assert.rejects(
      () =>
        adjustLessonTokensImpl({
          payload: { uid: "t1", mode: "delta", value: 1 },
          actor,
          deps: { db },
        }),
      (err) => err.code === "failed-precondition"
    );
  });
});
