"use strict";

/**
 * The notification ledger against real Firestore.
 *
 * The unit tests cover the id derivation and the delivery bookkeeping with a
 * fake db. What they cannot cover is the behaviour the whole design rests on:
 * that `create()` on an id that already exists really does reject, so a
 * replayed trigger lands on its own row instead of adding a second. That is a
 * Firestore guarantee, so it is asserted here.
 *
 * Triggers are invoked the same way as in attendanceFanoutNotifications:
 * through the `.run` raw-handler hook, with no Functions emulator.
 */

const { describe, it, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");

const admin = require("firebase-admin");

const { resetAdminTokensCache } = require("../../lib/notifications/shared");
const {
  onAttendanceChangeNotifyAdmins,
} = require("../../lib/notifications/attendance");
const {
  getAdmin,
  clearCollection,
  clearCollectionGroup,
} = require("../helpers/emulator");
const { installMessagingSpy } = require("../helpers/messagingSpy");

describe("notification ledger (firestore emulator)", () => {
  let db;
  let spy;

  function ts(date) {
    return admin.firestore.Timestamp.fromDate(date);
  }

  async function clearAll() {
    await Promise.all([
      clearCollection(db, "users"),
      clearCollection(db, "students"),
      clearCollection(db, "classes"),
      clearCollection(db, "userTokens"),
      clearCollection(db, "notifications"),
      clearCollectionGroup(db, "attendance"),
      // userTokens docs live at a different path from their `tokens`
      // subcollection, so clearing the parent leaves the devices behind and
      // they bleed into the next test — the same trap the attendance fan-out
      // test hit with attendance subcollections.
      clearCollectionGroup(db, "tokens"),
    ]);
  }

  async function seedAdmin(uid, tokens) {
    await db.collection("users").doc(uid).set({
      firstName: "Ada",
      lastName: "Min",
      role: "admin",
      email: `${uid}@tenacitytutoring.com`,
    });
    for (const [i, token] of tokens.entries()) {
      await db
        .collection("userTokens")
        .doc(uid)
        .collection("tokens")
        .doc(token)
        .set({ token, platform: `device-${i}` });
    }
  }

  async function seedClassWithSession() {
    await db.collection("students").doc("s1").set({
      firstName: "Alice",
      lastName: "Nguyen",
    });
    await db.collection("classes").doc("c1").set({
      day: "Monday",
      startTime: "16:00",
      enrolledStudents: ["s1"],
    });
    await db
      .collection("classes")
      .doc("c1")
      .collection("attendance")
      .doc("2026_T2_W2")
      .set({
        date: ts(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
        attendance: ["s1"],
      });
  }

  /**
   * An unguarded removal — the one case that genuinely should notify. Passing
   * an explicit event id mirrors the CloudEvent id production supplies, which
   * is what makes the write idempotent.
   */
  async function driveUnguardedAbsence(eventId) {
    const ref = db
      .collection("classes")
      .doc("c1")
      .collection("attendance")
      .doc("2026_T2_W2");
    const before = await ref.get();
    await ref.update({
      attendance: admin.firestore.FieldValue.arrayRemove("s1"),
    });
    const after = await ref.get();
    await onAttendanceChangeNotifyAdmins.run({
      id: eventId,
      params: { classId: "c1", attendanceId: "2026_T2_W2" },
      data: { before, after },
    });
  }

  before(() => {
    ({ db } = getAdmin());
    spy = installMessagingSpy();
  });

  beforeEach(async () => {
    spy.reset();
    resetAdminTokensCache();
    await clearAll();
  });

  after(async () => {
    spy.restore();
    await clearAll();
  });

  it("writes one row per admin for a single notification", async () => {
    await seedAdmin("admin-1", ["a1-phone", "a1-tablet"]);
    await seedAdmin("admin-2", ["a2-phone"]);
    await seedClassWithSession();

    await driveUnguardedAbsence("event-abc");

    assert.equal(spy.sent.length, 1, "one push for one action");
    const rows = await db.collection("notifications").get();
    assert.equal(rows.size, 2, "one ledger row per admin, not per token");

    const byRecipient = Object.fromEntries(
      rows.docs.map((d) => [d.data().recipientId, d.data()])
    );
    assert.deepEqual(Object.keys(byRecipient).sort(), ["admin-1", "admin-2"]);
    assert.equal(byRecipient["admin-1"].type, "student_absent");
    assert.equal(byRecipient["admin-1"].recipientRole, "admin");
    assert.equal(byRecipient["admin-1"].delivery.tokenCount, 2);
    assert.equal(byRecipient["admin-2"].delivery.tokenCount, 1);
    assert.equal(byRecipient["admin-1"].readAt, null);
    assert.equal(
      byRecipient["admin-1"].source,
      "trigger:onAttendanceChangeNotifyAdmins"
    );
    assert.equal(byRecipient["admin-1"].data.studentId, "s1");
    // Written from the first row so a TTL policy can be switched on later
    // without backfilling every notification already on disk.
    assert.ok(
      byRecipient["admin-1"].expiresAt.toDate() > new Date(),
      "expiresAt is set and in the future"
    );
  });

  it("a retried trigger does not write a second row", async () => {
    // Firestore triggers are at-least-once. Before the ledger this showed up
    // as duplicate pushes; the ledger must not also grow a duplicate history.
    await seedAdmin("admin-1", ["a1-phone"]);
    await seedClassWithSession();

    await driveUnguardedAbsence("event-retry");
    const afterFirst = await db.collection("notifications").get();
    assert.equal(afterFirst.size, 1);

    // Same CloudEvent id, replayed exactly as the platform would.
    const ref = db
      .collection("classes")
      .doc("c1")
      .collection("attendance")
      .doc("2026_T2_W2");
    const before = await ref.get();
    await ref.update({ attendance: ["s1"] });
    const after = await ref.get();
    await onAttendanceChangeNotifyAdmins.run({
      id: "event-retry",
      params: { classId: "c1", attendanceId: "2026_T2_W2" },
      data: { before: after, after: before },
    });

    const afterRetry = await db.collection("notifications").get();
    assert.equal(afterRetry.size, 1, "the replay reused its own row");
  });

  it("two students changing in one write get a row each", async () => {
    // These share a CloudEvent id and go to the same admin, so only the
    // dedupe key keeps the second from being mistaken for a replay.
    await seedAdmin("admin-1", ["a1-phone"]);
    await db.collection("students").doc("s1").set({ firstName: "Alice", lastName: "N" });
    await db.collection("students").doc("s2").set({ firstName: "Bo", lastName: "M" });
    await db.collection("classes").doc("c1").set({
      day: "Monday",
      startTime: "16:00",
      enrolledStudents: ["s1", "s2"],
    });
    const ref = db
      .collection("classes")
      .doc("c1")
      .collection("attendance")
      .doc("2026_T2_W2");
    await ref.set({
      date: ts(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
      attendance: ["s1", "s2"],
    });

    const before = await ref.get();
    await ref.update({ attendance: [] });
    const after = await ref.get();
    await onAttendanceChangeNotifyAdmins.run({
      id: "event-two",
      params: { classId: "c1", attendanceId: "2026_T2_W2" },
      data: { before, after },
    });

    assert.equal(spy.sent.length, 2, "one push per student");
    const rows = await db.collection("notifications").get();
    assert.equal(rows.size, 2, "one row per student, not one collapsed row");
    assert.deepEqual(
      rows.docs.map((d) => d.data().data.studentId).sort(),
      ["s1", "s2"]
    );
  });

  it("deletes a token FCM reports as unregistered", async () => {
    await seedAdmin("admin-1", ["a1-phone", "a1-dead"]);
    await seedClassWithSession();
    spy.failToken("a1-dead");

    await driveUnguardedAbsence("event-prune");

    const remaining = await db
      .collection("userTokens")
      .doc("admin-1")
      .collection("tokens")
      .get();
    assert.deepEqual(
      remaining.docs.map((d) => d.id),
      ["a1-phone"],
      "the dead token is gone and the live one is untouched"
    );
  });

  it("records nothing extra when the fan-out guard suppresses the push", async () => {
    // The MOB-21 guard still decides whether a notification happens at all;
    // the ledger only records the ones that do.
    await seedAdmin("admin-1", ["a1-phone"]);
    await seedClassWithSession();

    const ref = db
      .collection("classes")
      .doc("c1")
      .collection("attendance")
      .doc("2026_T2_W2");
    const before = await ref.get();
    await ref.update({
      attendance: admin.firestore.FieldValue.arrayRemove("s1"),
      notificationAction: { type: "bulk_attendance_sync", studentId: "s1" },
    });
    const after = await ref.get();
    await onAttendanceChangeNotifyAdmins.run({
      id: "event-guarded",
      params: { classId: "c1", attendanceId: "2026_T2_W2" },
      data: { before, after },
    });

    assert.equal(spy.sent.length, 0);
    const rows = await db.collection("notifications").get();
    assert.equal(rows.size, 0, "a suppressed push leaves no ledger row");
  });
});
