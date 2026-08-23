"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  notificationIdFor,
  recordNotification,
} = require("../../src/notifications/ledger");

/**
 * Minimal stand-in for the admin SDK's `db.collection(...).doc(...).create()`.
 * `create` rejects with an ALREADY_EXISTS error when the id has been written
 * before, which is exactly the Firestore behaviour the dedupe relies on.
 */
function fakeDb({ existingIds = new Set(), failWith } = {}) {
  const written = new Map();
  return {
    written,
    collection(name) {
      assert.equal(name, "notifications");
      return {
        doc(id) {
          return {
            async create(entry) {
              if (failWith) throw failWith;
              if (existingIds.has(id) || written.has(id)) {
                const err = new Error("already exists");
                err.code = 6;
                throw err;
              }
              written.set(id, entry);
            },
          };
        },
      };
    },
  };
}

const base = {
  recipientId: "user-1",
  type: "student_absent",
  title: "Student Absent",
  body: "Alice is away.",
  source: "trigger:onAttendanceChangeNotifyAdmins",
  eventId: "event-1",
};

describe("notification ledger", () => {
  it("derives the same id for the same event and recipient", () => {
    assert.equal(
      notificationIdFor("event-1", "user-1"),
      notificationIdFor("event-1", "user-1")
    );
  });

  it("gives different recipients of one event different ids", () => {
    assert.notEqual(
      notificationIdFor("event-1", "user-1"),
      notificationIdFor("event-1", "user-2")
    );
  });

  it("separates two notifications from one event by their dedupe key", async () => {
    // A single attendance write can add two students, sending the same admin
    // two distinct pushes. They share an eventId but must not share a row.
    const db = fakeDb();
    await recordNotification(db, {
      ...base,
      dedupeKey: "event-1:student_added:s1",
    });
    await recordNotification(db, {
      ...base,
      dedupeKey: "event-1:student_added:s2",
    });
    assert.equal(db.written.size, 2);
  });

  it("treats a replay of the same notification as a duplicate, not a new row", async () => {
    const db = fakeDb();
    const first = await recordNotification(db, base);
    const second = await recordNotification(db, base);
    assert.equal(first.duplicate, undefined);
    assert.equal(second.duplicate, true);
    assert.equal(db.written.size, 1);
  });

  it("records the delivery summary and leaves the notification unread", async () => {
    const db = fakeDb();
    const { id } = await recordNotification(db, {
      ...base,
      recipientRole: "admin",
      data: { type: "student_absent", classId: "c1" },
      delivery: { tokenCount: 2, successCount: 1, failureCount: 1 },
    });
    const entry = db.written.get(id);
    assert.equal(entry.recipientRole, "admin");
    assert.equal(entry.readAt, null);
    assert.deepEqual(entry.delivery, {
      tokenCount: 2,
      successCount: 1,
      failureCount: 1,
    });
    assert.deepEqual(entry.data, { type: "student_absent", classId: "c1" });
  });

  it("swallows a write failure so a ledger problem cannot fail a delivered push", async () => {
    const warnings = [];
    const db = fakeDb({ failWith: new Error("firestore down") });
    const result = await recordNotification(db, base, {
      logger: { warn: (...args) => warnings.push(args) },
    });
    assert.equal(result.id, null);
    assert.ok(result.error);
    assert.equal(warnings.length, 1);
  });

  it("rethrows for tests that need to assert the write happened", async () => {
    const db = fakeDb({ failWith: new Error("firestore down") });
    await assert.rejects(
      () => recordNotification(db, base, { throwOnError: true }),
      /firestore down/
    );
  });

  it("refuses to record a notification it cannot attribute or replay safely", async () => {
    const db = fakeDb();
    await assert.rejects(
      () => recordNotification(db, { ...base, recipientId: undefined }),
      /recipientId/
    );
    await assert.rejects(
      () => recordNotification(db, { ...base, eventId: undefined }),
      /eventId/
    );
    await assert.rejects(
      () => recordNotification(db, { ...base, source: undefined }),
      /source/
    );
  });
});
