"use strict";

const { describe, it, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");

const admin = require("firebase-admin");
const {
  acceptEnrolmentImpl,
} = require("../../src/enrolments/acceptEnrolment");
const { getAdmin, clearCollection } = require("../helpers/emulator");

const actor = { uid: "admin-actor", email: "admin@tenacitytutoring.com" };

function ts(date) {
  return admin.firestore.Timestamp.fromDate(date);
}

describe("acceptEnrolmentImpl (firestore + auth emulators)", () => {
  let admin_;
  let db;
  let auth;
  let welcomeSends;
  let acceptedSends;
  let deps;

  before(() => {
    ({ admin: admin_, db, auth } = getAdmin());
  });

  beforeEach(async () => {
    welcomeSends = [];
    acceptedSends = [];
    deps = {
      admin: admin_,
      db,
      sendWelcomeEmail: async (email, firstName) => {
        welcomeSends.push({ email, firstName });
        return { sent: true };
      },
      sendAcceptedEmail: async (email, studentName, classes, subjects) => {
        acceptedSends.push({ email, studentName, classes, subjects });
        return { sent: true };
      },
    };
    await Promise.all([
      clearCollection(db, "users"),
      clearCollection(db, "students"),
      clearCollection(db, "classes"),
      clearCollection(db, "enrolments"),
      clearCollection(db, "adminAuditLogs"),
      clearCollection(db, "referrals"),
    ]);
    const list = await auth.listUsers();
    await Promise.all(list.users.map((u) => auth.deleteUser(u.uid)));
  });

  after(async () => {
    await Promise.all([
      clearCollection(db, "users"),
      clearCollection(db, "students"),
      clearCollection(db, "classes"),
      clearCollection(db, "enrolments"),
      clearCollection(db, "adminAuditLogs"),
      clearCollection(db, "referrals"),
    ]);
  });

  async function seedClass(id, { attendanceDates = [] } = {}) {
    const ref = db.collection("classes").doc(id);
    await ref.set({
      type: "Year 7 English",
      day: "Monday",
      startTime: "16:00",
      endTime: "17:00",
      capacity: 8,
      tutors: ["t1"],
      enrolledStudents: [],
    });
    for (const a of attendanceDates) {
      await ref.collection("attendance").doc(a.id).set({
        date: ts(a.date),
        termId: "2026_T2",
        cancelled: false,
        weekNum: a.weekNum,
        attendance: [],
        tutors: ["t1"],
        updatedAt: ts(new Date()),
        updatedBy: "system",
      });
    }
    return ref;
  }

  async function seedEnrolment(id, overrides = {}) {
    const doc = {
      archived: false,
      studentFirstName: "Tom",
      studentLastName: "Doe",
      studentYear: "7",
      studentSubjects: ["Math"],
      classes: [{ id: "c1", day: "Monday", startTime: "16:00" }],
      carerFirstName: "Jane",
      carerLastName: "Doe",
      carerEmail: "Jane@Example.com",
      carerPhone: "0400",
      emergencyContactFirstName: "Em",
      emergencyContactLastName: "Er",
      emergencyContactPhone: "0411",
      emergencyContactRelation: "aunt",
      allergies: "",
      permissionToLeave: false,
      additionalInfo: "",
      ...overrides,
    };
    await db.collection("enrolments").doc(id).set(doc);
    return doc;
  }

  it("accepts a fresh enrolment: creates parent, student, enrols into future attendance only", async () => {
    const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await seedClass("c1", {
      attendanceDates: [
        { id: "2026_T2_W1", date: past, weekNum: 1 },
        { id: "2026_T2_W3", date: future, weekNum: 3 },
      ],
    });
    await seedEnrolment("e1");

    const out = await acceptEnrolmentImpl({
      payload: { enrolmentId: "e1" },
      actor,
      deps,
    });

    assert.equal(out.idempotent, false);
    assert.ok(out.parentId);
    assert.ok(out.studentId);
    assert.deepEqual(out.classIds, ["c1"]);
    assert.equal(out.authUserCreated, true);
    assert.equal(out.welcomeEmail.sent, false);
    assert.equal(out.welcomeEmail.reason, "sent-on-registration");
    assert.equal(out.acceptedEmail.sent, true);

    // Parent doc created with app-required fields
    const parent = (await db.collection("users").doc(out.parentId).get()).data();
    assert.equal(parent.email, "jane@example.com");
    assert.equal(parent.role, "parent");
    assert.deepEqual(parent.students, [out.studentId]);
    assert.deepEqual(parent.fcmTokens, []);

    // Student doc linked back
    const student = (await db.collection("students").doc(out.studentId).get()).data();
    assert.equal(student.firstName, "Tom");
    assert.deepEqual(student.parents, [out.parentId]);
    assert.equal(student.primaryParentId, out.parentId);

    // Class enrolment + future-only attendance
    const cls = (await db.collection("classes").doc("c1").get()).data();
    assert.deepEqual(cls.enrolledStudents, [out.studentId]);
    const futureAtt = (
      await db.collection("classes").doc("c1").collection("attendance").doc("2026_T2_W3").get()
    ).data();
    assert.deepEqual(futureAtt.attendance, [out.studentId]);
    const pastAtt = (
      await db.collection("classes").doc("c1").collection("attendance").doc("2026_T2_W1").get()
    ).data();
    assert.deepEqual(pastAtt.attendance, [], "historical attendance untouched");

    // Enrolment lifecycle fields set
    const e1 = (await db.collection("enrolments").doc("e1").get()).data();
    assert.equal(e1.status, "accepted");
    assert.equal(e1.archived, true);
    assert.equal(e1.acceptedBy, actor.uid);
    assert.equal(e1.createdParentId, out.parentId);
    assert.equal(e1.createdStudentId, out.studentId);

    // Auth claim set
    const au = await auth.getUser(out.parentId);
    assert.equal(au.customClaims?.role, "parent");

    // Audit log
    const logs = await db.collection("adminAuditLogs").get();
    const log = logs.docs.find((d) => d.data().targetId === "e1");
    assert.ok(log);
    assert.equal(log.data().action, "enrolment.accept");
  });

  it("is idempotent: second call returns same IDs and doesn't duplicate", async () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await seedClass("c1", {
      attendanceDates: [{ id: "2026_T2_W3", date: future, weekNum: 3 }],
    });
    await seedEnrolment("e1");

    const first = await acceptEnrolmentImpl({
      payload: { enrolmentId: "e1" },
      actor,
      deps,
    });
    const second = await acceptEnrolmentImpl({
      payload: { enrolmentId: "e1" },
      actor,
      deps,
    });

    assert.equal(second.idempotent, true);
    assert.equal(second.parentId, first.parentId);
    assert.equal(second.studentId, first.studentId);

    // Only one student doc, no acceptance-time welcome email
    const students = await db.collection("students").get();
    assert.equal(students.size, 1);
    assert.equal(welcomeSends.length, 0);
    assert.equal(acceptedSends.length, 1);
  });

  it("does not send welcome email when reusing existing auth user", async () => {
    await auth.createUser({
      email: "jane@example.com",
      password: "Password123!",
    });
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await seedClass("c1", {
      attendanceDates: [{ id: "2026_T2_W3", date: future, weekNum: 3 }],
    });
    await seedEnrolment("e1");

    const out = await acceptEnrolmentImpl({
      payload: { enrolmentId: "e1" },
      actor,
      deps,
    });
    assert.equal(out.authUserCreated, false);
    assert.equal(welcomeSends.length, 0);
    assert.equal(acceptedSends.length, 1, "accepted email always sent");
  });

  it("refuses when enrolment has no carerEmail", async () => {
    await seedEnrolment("e1", { carerEmail: "" });
    await assert.rejects(
      () =>
        acceptEnrolmentImpl({
          payload: { enrolmentId: "e1" },
          actor,
          deps,
        }),
      (err) =>
        err.code === "failed-precondition" &&
        /carerEmail/.test(err.message)
    );
  });

  it("refuses when enrolment has been soft-deleted", async () => {
    await seedEnrolment("e1", { status: "deleted" });
    await assert.rejects(
      () =>
        acceptEnrolmentImpl({
          payload: { enrolmentId: "e1" },
          actor,
          deps,
        }),
      (err) => err.code === "failed-precondition"
    );
  });

  it("returns not-found for missing enrolment", async () => {
    await assert.rejects(
      () =>
        acceptEnrolmentImpl({
          payload: { enrolmentId: "ghost" },
          actor,
          deps,
        }),
      (err) => err.code === "not-found"
    );
  });

  describe("referrals", () => {
    async function seedReferrer(uid = "referrer-1", role = "parent") {
      await db.collection("users").doc(uid).set({
        role,
        firstName: "Rae",
        lastName: "Referrer",
        email: `${uid}@example.com`,
        students: [],
        referralCode: "ABC234",
      });
    }

    it("records a pending referral for an enrolment that came through a link", async () => {
      await seedClass("c1");
      await seedReferrer();
      await seedEnrolment("e1", {
        referrerParentId: "referrer-1",
        referralCode: "ABC234",
      });

      const out = await acceptEnrolmentImpl({
        payload: { enrolmentId: "e1" },
        actor,
        deps,
      });

      assert.equal(out.referralId, `referrer-1_${out.parentId}`);
      const referrals = await db.collection("referrals").get();
      assert.equal(referrals.size, 1);
      const referral = referrals.docs[0].data();
      assert.equal(referral.referrerParentId, "referrer-1");
      assert.equal(referral.newParentId, out.parentId);
      assert.deepEqual(referral.enrolmentIds, ["e1"]);
      assert.equal(referral.referralCode, "ABC234");
      assert.equal(referral.newParentExisted, false);
      assert.equal(referral.status, "pending");
      assert.equal(referral.rewardApplied, false);
      assert.equal(referral.createdBy, actor.uid);

      const logs = await db.collection("adminAuditLogs").get();
      const log = logs.docs.find((d) => d.data().targetId === "e1").data();
      assert.equal(log.payloadSummary.referralId, out.referralId);
    });

    it("does not create a second referral when accepting again", async () => {
      await seedClass("c1");
      await seedReferrer();
      await seedEnrolment("e1", { referrerParentId: "referrer-1" });

      await acceptEnrolmentImpl({ payload: { enrolmentId: "e1" }, actor, deps });
      const again = await acceptEnrolmentImpl({
        payload: { enrolmentId: "e1" },
        actor,
        deps,
      });

      assert.equal(again.idempotent, true);
      const referrals = await db.collection("referrals").get();
      assert.equal(referrals.size, 1);
    });

    it("folds a sibling's enrolment into the same referral", async () => {
      await seedClass("c1");
      await seedReferrer();
      await seedEnrolment("e1", { referrerParentId: "referrer-1" });
      await seedEnrolment("e2", {
        studentFirstName: "Sam",
        referrerParentId: "referrer-1",
      });

      const first = await acceptEnrolmentImpl({
        payload: { enrolmentId: "e1" },
        actor,
        deps,
      });
      const second = await acceptEnrolmentImpl({
        payload: { enrolmentId: "e2" },
        actor,
        deps,
      });

      assert.equal(second.parentId, first.parentId);
      assert.equal(second.referralId, first.referralId);
      const referrals = await db.collection("referrals").get();
      assert.equal(referrals.size, 1);
      const referral = referrals.docs[0].data();
      assert.deepEqual(referral.enrolmentIds.sort(), ["e1", "e2"]);
      assert.equal(referral.newParentExisted, false, "kept from the first acceptance");
    });

    it("flags a referral whose new parent was already a Tenacity family", async () => {
      await seedClass("c1");
      await seedReferrer();
      await seedEnrolment("e1");
      const existing = await acceptEnrolmentImpl({
        payload: { enrolmentId: "e1" },
        actor,
        deps,
      });
      await seedEnrolment("e2", {
        studentFirstName: "Sam",
        referrerParentId: "referrer-1",
      });

      const out = await acceptEnrolmentImpl({
        payload: { enrolmentId: "e2" },
        actor,
        deps,
      });

      assert.equal(out.parentId, existing.parentId);
      const referral = (
        await db.collection("referrals").doc(out.referralId).get()
      ).data();
      assert.equal(referral.newParentExisted, true);
    });

    it("ignores a self-referral", async () => {
      await seedClass("c1");
      await seedEnrolment("e1");
      const existing = await acceptEnrolmentImpl({
        payload: { enrolmentId: "e1" },
        actor,
        deps,
      });
      await seedEnrolment("e2", {
        studentFirstName: "Sam",
        referrerParentId: existing.parentId,
      });

      const out = await acceptEnrolmentImpl({
        payload: { enrolmentId: "e2" },
        actor,
        deps,
      });

      assert.equal(out.referralId, null);
      assert.equal((await db.collection("referrals").get()).size, 0);
    });

    it("still accepts, without a referral, when the referrer is not a parent", async () => {
      await seedClass("c1");
      await seedReferrer("tutor-1", "tutor");
      await seedEnrolment("e1", { referrerParentId: "tutor-1" });
      await seedEnrolment("e2", {
        carerEmail: "other@example.com",
        referrerParentId: "deleted-parent",
      });

      const tutorReferred = await acceptEnrolmentImpl({
        payload: { enrolmentId: "e1" },
        actor,
        deps,
      });
      const ghostReferred = await acceptEnrolmentImpl({
        payload: { enrolmentId: "e2" },
        actor,
        deps,
      });

      assert.equal(tutorReferred.referralId, null);
      assert.equal(ghostReferred.referralId, null);
      assert.ok(tutorReferred.studentId);
      assert.ok(ghostReferred.studentId);
      assert.equal((await db.collection("referrals").get()).size, 0);
    });

    it("creates no referral for an enrolment without a referrer", async () => {
      await seedClass("c1");
      await seedEnrolment("e1");

      const out = await acceptEnrolmentImpl({
        payload: { enrolmentId: "e1" },
        actor,
        deps,
      });

      assert.equal(out.referralId, null);
      assert.equal((await db.collection("referrals").get()).size, 0);
    });
  });
});
