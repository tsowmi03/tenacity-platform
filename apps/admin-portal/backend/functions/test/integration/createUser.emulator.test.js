"use strict";

const { describe, it, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");

const { createUserImpl } = require("../../src/users/createUser");
const { getAdmin, clearCollection } = require("../helpers/emulator");

const actor = { uid: "admin-actor", email: "admin@tenacitytutoring.com" };

describe("createUserImpl (firestore + auth emulators)", () => {
  let admin;
  let db;
  let auth;
  let emails;
  let sendWelcomeEmail;

  before(() => {
    ({ admin, db, auth } = getAdmin());
  });

  beforeEach(async () => {
    emails = [];
    sendWelcomeEmail = async (email, firstName) => {
      emails.push({ email, firstName });
      return { sent: true };
    };
    await Promise.all([
      clearCollection(db, "users"),
      clearCollection(db, "students"),
      clearCollection(db, "adminAuditLogs"),
    ]);
    // Clear auth users
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

  it("creates a parent with bundled students and links them both ways", async () => {
    const result = await createUserImpl({
      payload: {
        user: {
          role: "parent",
          firstName: "Jane",
          lastName: "Doe",
          email: "jane@example.com",
          phone: "0400",
        },
        students: [
          { firstName: "Tom", lastName: "Doe", grade: "7", subjects: ["Math"], parents: [] },
          { firstName: "Sam", lastName: "Doe", grade: "9", subjects: [], parents: [] },
        ],
      },
      actor,
      deps: { admin, db, sendWelcomeEmail },
    });

    assert.equal(result.role, "parent");
    assert.equal(result.studentIds.length, 2);
    assert.equal(result.authUserCreated, true);
    assert.equal(result.welcomeEmail.sent, true);
    assert.equal(emails.length, 1);

    // users/{uid}: app-required fields all present
    const userDoc = (await db.collection("users").doc(result.uid).get()).data();
    assert.equal(userDoc.role, "parent");
    assert.equal(userDoc.email, "jane@example.com");
    assert.deepEqual(userDoc.fcmTokens, []);
    assert.deepEqual(userDoc.unreadChats, {});
    assert.equal(userDoc.termsAccepted, false);
    assert.equal(userDoc.acceptedTermsVersion, null);
    assert.deepEqual(userDoc.students.sort(), [...result.studentIds].sort());

    // students/{id}: parents includes the new uid
    for (const sid of result.studentIds) {
      const sDoc = (await db.collection("students").doc(sid).get()).data();
      assert.deepEqual(sDoc.parents, [result.uid]);
      assert.equal(sDoc.primaryParentId, result.uid);
    }

    // Auth: user exists with admin claim role
    const authUser = await auth.getUser(result.uid);
    assert.equal(authUser.email, "jane@example.com");
    assert.equal(authUser.customClaims?.role, "parent");

    // Audit log entry
    const allLogs = await db.collection("adminAuditLogs").get();
    const matchingLog = allLogs.docs.find(
      (d) => d.data().targetId === result.uid
    );
    assert.ok(
      matchingLog,
      `expected an audit log for ${result.uid}, got ${allLogs.size} total: ${JSON.stringify(allLogs.docs.map((d) => d.data()))}`
    );
    assert.equal(matchingLog.data().action, "user.create");
  });

  it("creates a tutor with no students field on the doc", async () => {
    const result = await createUserImpl({
      payload: {
        user: {
          role: "tutor",
          firstName: "Tina",
          lastName: "Tutor",
          email: "tina@example.com",
          phone: "0401",
        },
        students: [],
      },
      actor,
      deps: { admin, db, sendWelcomeEmail },
    });
    const userDoc = (await db.collection("users").doc(result.uid).get()).data();
    assert.equal(userDoc.role, "tutor");
    assert.equal("students" in userDoc, false);
    assert.equal("lessonTokens" in userDoc, false);
    const authUser = await auth.getUser(result.uid);
    assert.equal(authUser.customClaims?.role, "tutor");
  });

  it("rejects when the user doc already exists for that email", async () => {
    const payload = {
      user: {
        role: "parent",
        firstName: "Jane",
        lastName: "Doe",
        email: "jane@example.com",
        phone: "0400",
      },
      students: [],
    };
    const first = await createUserImpl({
      payload,
      actor,
      deps: { admin, db, sendWelcomeEmail },
    });
    assert.ok(first.uid);

    await assert.rejects(
      () =>
        createUserImpl({
          payload,
          actor,
          deps: { admin, db, sendWelcomeEmail },
        }),
      (err) => err.code === "already-exists"
    );
  });

  it("reuses an existing auth user but still creates the firestore doc and skips welcome email", async () => {
    // Pre-create an auth user without a firestore doc.
    const preCreated = await auth.createUser({
      email: "preexisting@example.com",
      password: "Password123!",
    });

    const result = await createUserImpl({
      payload: {
        user: {
          role: "tutor",
          firstName: "Pre",
          lastName: "Existing",
          email: "preexisting@example.com",
          phone: "0",
        },
        students: [],
      },
      actor,
      deps: { admin, db, sendWelcomeEmail },
    });

    assert.equal(result.uid, preCreated.uid);
    assert.equal(result.authUserCreated, false);
    assert.equal(result.welcomeEmail.sent, false); // default opt-in only when created=true
    assert.equal(emails.length, 0);
    const userDoc = (await db.collection("users").doc(result.uid).get()).data();
    assert.equal(userDoc.email, "preexisting@example.com");
  });

  it("sends welcome email when sendWelcomeEmail=true, even on auth reuse", async () => {
    await auth.createUser({
      email: "optin@example.com",
      password: "Password123!",
    });

    const result = await createUserImpl({
      payload: {
        user: {
          role: "tutor",
          firstName: "Opt",
          lastName: "In",
          email: "optin@example.com",
          phone: "0",
          sendWelcomeEmail: true,
        },
        students: [],
      },
      actor,
      deps: { admin, db, sendWelcomeEmail },
    });
    assert.equal(result.authUserCreated, false);
    assert.equal(emails.length, 1);
    assert.equal(emails[0].email, "optin@example.com");
  });
});
