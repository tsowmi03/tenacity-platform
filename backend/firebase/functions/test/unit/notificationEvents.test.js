"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  ADMIN_NOTIFICATION_TYPES,
  NOTIFICATION_EVENTS,
  adminNotificationFor,
  emitNotificationEvent,
} = require("../../src/notifications/events");

const classPayload = {
  classId: "c1",
  studentId: "s1",
  studentName: "Alice Nguyen",
  classDay: "Monday",
  classTime: "16:00",
};

describe("notification events", () => {
  it("names an unenrolment in the admin's terms", () => {
    const content = adminNotificationFor(
      NOTIFICATION_EVENTS.STUDENT_UNENROLLED,
      classPayload
    );
    assert.equal(content.title, "Student Unenrolled");
    assert.equal(
      content.body,
      "Alice Nguyen has been unenrolled from Monday at 4:00 pm."
    );
  });

  it("falls back to the student id when the name could not be resolved", () => {
    const content = adminNotificationFor(NOTIFICATION_EVENTS.STUDENT_ENROLLED, {
      ...classPayload,
      studentName: undefined,
    });
    assert.match(content.body, /^s1 has permanently enrolled/);
  });

  it("says so rather than printing blanks when the class is unknown", () => {
    const content = adminNotificationFor(NOTIFICATION_EVENTS.STUDENT_ENROLLED, {
      studentId: "s1",
      studentName: "Alice",
    });
    assert.equal(
      content.body,
      "Alice has permanently enrolled for Unknown day at Unknown time."
    );
  });

  it("keeps the FCM types the app already knows", () => {
    // A type the mobile app does not route is a push that does nothing when
    // tapped, so these values are not free to rename.
    assert.equal(
      ADMIN_NOTIFICATION_TYPES[NOTIFICATION_EVENTS.STUDENT_ENROLLED],
      "student_enrolled"
    );
    assert.equal(
      ADMIN_NOTIFICATION_TYPES[NOTIFICATION_EVENTS.SESSION_STUDENT_ADDED],
      "student_added"
    );
    assert.equal(
      ADMIN_NOTIFICATION_TYPES[NOTIFICATION_EVENTS.SESSION_STUDENT_ABSENT],
      "student_absent"
    );
  });

  it("sends exactly one notification for one event", async () => {
    const pushes = [];
    const rows = new Map();
    const messaging = {
      sendEachForMulticast: async (message) => {
        pushes.push(message);
        return {
          successCount: message.tokens.length,
          failureCount: 0,
          responses: message.tokens.map(() => ({ success: true })),
        };
      },
    };
    const db = {
      collection: () => ({
        doc: (id) => ({ create: async (entry) => rows.set(id, entry) }),
      }),
    };

    await emitNotificationEvent(
      {
        type: NOTIFICATION_EVENTS.STUDENT_UNENROLLED,
        payload: classPayload,
        eventId: "unenrolPermanent:c1:s1",
      },
      {
        db,
        messaging,
        recipientsImpl: async () => [
          { uid: "admin-1", role: "admin", tokens: ["t1", "t2"] },
        ],
      }
    );

    assert.equal(pushes.length, 1, "one action, one push");
    assert.deepEqual(pushes[0].tokens, ["t1", "t2"]);
    assert.equal(pushes[0].data.type, "student_unenrolled");
    assert.equal(pushes[0].data.event, "student.unenrolled");
    assert.equal(rows.size, 1, "one ledger row for the one admin");
    const [row] = [...rows.values()];
    assert.equal(row.recipientId, "admin-1");
    assert.equal(row.source, "event:student.unenrolled");
  });

  it("does nothing when there are no admins to tell", async () => {
    const result = await emitNotificationEvent(
      {
        type: NOTIFICATION_EVENTS.STUDENT_UNENROLLED,
        payload: classPayload,
        eventId: "e1",
      },
      { recipientsImpl: async () => [], db: {}, messaging: {} }
    );
    assert.equal(result.noRecipients, true);
  });

  it("reports an unknown event rather than sending something empty", async () => {
    const warnings = [];
    const result = await emitNotificationEvent(
      { type: "student.teleported", payload: classPayload, eventId: "e1" },
      { logger: { warn: (m) => warnings.push(m) } }
    );
    assert.equal(result.unhandled, true);
    assert.equal(warnings.length, 1);
  });

  it("never throws, because the caller's write has already committed", async () => {
    const result = await emitNotificationEvent(
      {
        type: NOTIFICATION_EVENTS.STUDENT_UNENROLLED,
        payload: classPayload,
        eventId: "e1",
      },
      {
        recipientsImpl: async () => {
          throw new Error("firestore down");
        },
        logger: { error: () => {} },
      }
    );
    assert.equal(result.sent, false);
    assert.ok(result.error);
  });
});
