"use strict";

const { describe, it, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");

const { createParentImpl } = require("../../src/users/createParent");
const { getAdmin, clearCollection } = require("../helpers/emulator");

const actor = { uid: "admin-actor", email: "admin@tenacitytutoring.com" };
const sendWelcomeEmail = async () => ({ sent: true });

describe("createParentImpl (firestore + auth emulators)", () => {
  let admin;
  let db;
  let auth;

  before(() => {
    ({ admin, db, auth } = getAdmin());
  });

  beforeEach(async () => {
    await Promise.all([
      clearCollection(db, "users"),
      clearCollection(db, "students"),
      clearCollection(db, "adminAuditLogs"),
    ]);
    const list = await auth.listUsers();
    await Promise.all(list.users.map((u) => auth.deleteUser(u.uid)));
  });

  after(async () => {
    await Promise.all([
      clearCollection(db, "users"),
      clearCollection(db, "students"),
      clearCollection(db, "adminAuditLogs"),
    ]);
  });

  async function seedStudent({ id, parents = [] } = {}) {
    const ref = id ? db.collection("students").doc(id) : db.collection("students").doc();
    await ref.set({
      firstName: "Tom",
      lastName: "Doe",
      grade: "7",
      subjects: [],
      parents,
    });
    return ref.id;
  }

  it("links a new parent to existing students without overwriting other parents", async () => {
    const sid1 = await seedStudent({ parents: ["other-parent"] });
    const sid2 = await seedStudent();

    const result = await createParentImpl({
      payload: {
        user: {
          role: "parent",
          firstName: "Jane",
          lastName: "Doe",
          email: "jane@example.com",
          phone: "0400",
        },
        studentIds: [sid1, sid2],
      },
      actor,
      deps: { admin, db, sendWelcomeEmail },
    });

    assert.deepEqual(result.studentIds, [sid1, sid2]);

    const userDoc = (await db.collection("users").doc(result.uid).get()).data();
    assert.equal(userDoc.role, "parent");
    assert.deepEqual(userDoc.students.sort(), [sid1, sid2].sort());

    const s1 = (await db.collection("students").doc(sid1).get()).data();
    assert.deepEqual(s1.parents.sort(), ["other-parent", result.uid].sort());

    const s2 = (await db.collection("students").doc(sid2).get()).data();
    assert.deepEqual(s2.parents, [result.uid]);

    const authUser = await auth.getUser(result.uid);
    assert.equal(authUser.customClaims?.role, "parent");
  });

  it("aborts atomically when any studentId is missing", async () => {
    const sid1 = await seedStudent();

    await assert.rejects(
      () =>
        createParentImpl({
          payload: {
            user: {
              role: "parent",
              firstName: "Jane",
              lastName: "Doe",
              email: "jane@example.com",
              phone: "0400",
            },
            studentIds: [sid1, "does-not-exist"],
          },
          actor,
          deps: { admin, db, sendWelcomeEmail },
        }),
      (err) => err.code === "not-found"
    );

    // No partial writes: student parents untouched, no user doc.
    const s1 = (await db.collection("students").doc(sid1).get()).data();
    assert.deepEqual(s1.parents, []);
    const users = await db.collection("users").get();
    assert.equal(users.size, 0);
  });

  it("rejects when the parent already has a users doc", async () => {
    const sid = await seedStudent();
    const payload = {
      user: {
        role: "parent",
        firstName: "Jane",
        lastName: "Doe",
        email: "jane@example.com",
        phone: "0400",
      },
      studentIds: [sid],
    };
    await createParentImpl({
      payload,
      actor,
      deps: { admin, db, sendWelcomeEmail },
    });
    await assert.rejects(
      () =>
        createParentImpl({
          payload,
          actor,
          deps: { admin, db, sendWelcomeEmail },
        }),
      (err) => err.code === "already-exists"
    );
  });
});
