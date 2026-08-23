"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { sendAndRecord } = require("../../src/notifications/send");

const NOT_REGISTERED = "messaging/registration-token-not-registered";

function fakeMessaging({ failTokens = {} } = {}) {
  const sent = [];
  return {
    sent,
    sendEachForMulticast: async (message) => {
      sent.push(message);
      const responses = (message.tokens || []).map((token) =>
        failTokens[token]
          ? { success: false, error: { code: failTokens[token] } }
          : { success: true }
      );
      return {
        successCount: responses.filter((r) => r.success).length,
        failureCount: responses.filter((r) => !r.success).length,
        responses,
      };
    },
  };
}

function fakeDb() {
  const written = new Map();
  const deleted = [];
  return {
    written,
    deleted,
    collection(name) {
      if (name === "notifications") {
        return {
          doc: (id) => ({
            create: async (entry) => {
              if (written.has(id)) {
                const err = new Error("already exists");
                err.code = 6;
                throw err;
              }
              written.set(id, entry);
            },
          }),
        };
      }
      if (name === "userTokens") {
        return {
          doc: (uid) => ({
            collection: () => ({
              doc: (token) => ({
                delete: async () => deleted.push({ uid, token }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected collection ${name}`);
    },
  };
}

const payload = {
  title: "Student Absent",
  body: "Alice is away.",
  data: { type: "student_absent", classId: "c1" },
  source: "trigger:onAttendanceChangeNotifyAdmins",
  eventId: "event-1",
};

describe("sendAndRecord", () => {
  it("sends one multicast across every token but records one row per person", async () => {
    const messaging = fakeMessaging();
    const db = fakeDb();
    const result = await sendAndRecord({
      messaging,
      db,
      recipients: [
        { uid: "admin-1", role: "admin", tokens: ["a1-phone", "a1-tablet"] },
        { uid: "admin-2", role: "admin", tokens: ["a2-phone"] },
      ],
      ...payload,
    });

    assert.equal(messaging.sent.length, 1, "one FCM call, not one per person");
    assert.deepEqual(messaging.sent[0].tokens, ["a1-phone", "a1-tablet", "a2-phone"]);
    assert.equal(db.written.size, 2);
    assert.equal(result.successCount, 3);

    const rows = [...db.written.values()];
    const byRecipient = Object.fromEntries(rows.map((r) => [r.recipientId, r]));
    assert.equal(byRecipient["admin-1"].delivery.tokenCount, 2);
    assert.equal(byRecipient["admin-2"].delivery.tokenCount, 1);
  });

  it("attributes a token failure to the right person", async () => {
    // The per-token responses come back as one flat array covering every
    // recipient's tokens in order; mapping that back to owners is easy to get
    // off by one, and a wrong mapping would blame the wrong person's device.
    const messaging = fakeMessaging({ failTokens: { "a2-phone": "messaging/internal-error" } });
    const db = fakeDb();
    await sendAndRecord({
      messaging,
      db,
      recipients: [
        { uid: "admin-1", tokens: ["a1-phone", "a1-tablet"] },
        { uid: "admin-2", tokens: ["a2-phone"] },
      ],
      ...payload,
    });

    const rows = Object.fromEntries(
      [...db.written.values()].map((r) => [r.recipientId, r.delivery])
    );
    assert.deepEqual(rows["admin-1"], { tokenCount: 2, successCount: 2, failureCount: 0 });
    assert.deepEqual(rows["admin-2"], { tokenCount: 1, successCount: 0, failureCount: 1 });
  });

  it("deletes a token FCM reports as unregistered", async () => {
    const messaging = fakeMessaging({ failTokens: { "a1-tablet": NOT_REGISTERED } });
    const db = fakeDb();
    const result = await sendAndRecord({
      messaging,
      db,
      recipients: [{ uid: "admin-1", tokens: ["a1-phone", "a1-tablet"] }],
      ...payload,
    });
    assert.deepEqual(result.prunedTokens, [{ uid: "admin-1", token: "a1-tablet" }]);
    assert.deepEqual(db.deleted, [{ uid: "admin-1", token: "a1-tablet" }]);
  });

  it("leaves a token alone when the failure is transient", async () => {
    // Quota and availability errors say nothing about the token's validity.
    // Pruning on those would log people out of notifications for an outage.
    const messaging = fakeMessaging({ failTokens: { "a1-phone": "messaging/server-unavailable" } });
    const db = fakeDb();
    const result = await sendAndRecord({
      messaging,
      db,
      recipients: [{ uid: "admin-1", tokens: ["a1-phone"] }],
      ...payload,
    });
    assert.deepEqual(result.prunedTokens, []);
    assert.deepEqual(db.deleted, []);
  });

  it("does not prune on messaging/invalid-argument", async () => {
    // invalid-argument means the REQUEST was malformed (e.g. a non-string
    // value in `data`), not that any particular token is bad. A payload bug
    // can make FCM report it for every token in the batch; treating that as
    // "dead" would mass-delete every recipient's valid registration.
    const messaging = fakeMessaging({
      failTokens: { "a1-phone": "messaging/invalid-argument", "a2-phone": "messaging/invalid-argument" },
    });
    const db = fakeDb();
    const result = await sendAndRecord({
      messaging,
      db,
      recipients: [
        { uid: "admin-1", tokens: ["a1-phone"] },
        { uid: "admin-2", tokens: ["a2-phone"] },
      ],
      ...payload,
    });
    assert.deepEqual(result.prunedTokens, []);
    assert.deepEqual(db.deleted, []);
  });

  it("records a failure row per recipient when the whole multicast rejects", async () => {
    // Without this, a total FCM outage leaves no trace in the one place
    // meant to catch a dropped push.
    const messaging = {
      sendEachForMulticast: async () => {
        throw new Error("FCM unreachable");
      },
    };
    const db = fakeDb();
    const result = await sendAndRecord(
      {
        messaging,
        db,
        recipients: [
          { uid: "admin-1", tokens: ["a1-phone"] },
          { uid: "admin-2", tokens: ["a2-phone", "a2-tablet"] },
        ],
        ...payload,
      },
      { logger: { error: () => {} } }
    );
    assert.equal(result.sent, false);
    assert.equal(db.written.size, 2, "one row per recipient, even on total failure");
    const rows = Object.fromEntries(
      [...db.written.values()].map((r) => [r.recipientId, r.delivery])
    );
    assert.deepEqual(rows["admin-1"], { tokenCount: 1, successCount: 0, failureCount: 1 });
    assert.deepEqual(rows["admin-2"], { tokenCount: 2, successCount: 0, failureCount: 2 });
  });

  it("does nothing at all when nobody has a registered device", async () => {
    const messaging = fakeMessaging();
    const db = fakeDb();
    const result = await sendAndRecord({
      messaging,
      db,
      recipients: [{ uid: "admin-1", tokens: [] }],
      ...payload,
    });
    assert.equal(result.sent, false);
    assert.equal(messaging.sent.length, 0);
    assert.equal(db.written.size, 0);
  });

  it("does not throw when the whole send fails", async () => {
    // Throwing here would fail the business operation that already committed,
    // and inside a trigger it would cause a retry that re-sends everything.
    const messaging = {
      sendEachForMulticast: async () => {
        throw new Error("FCM unreachable");
      },
    };
    const db = fakeDb();
    const result = await sendAndRecord(
      {
        messaging,
        db,
        recipients: [{ uid: "admin-1", tokens: ["a1-phone"] }],
        ...payload,
      },
      { logger: { error: () => {} } }
    );
    assert.equal(result.sent, false);
    assert.ok(result.error);
  });

  it("replaying one action does not double-record", async () => {
    const db = fakeDb();
    const recipients = [{ uid: "admin-1", tokens: ["a1-phone"] }];
    await sendAndRecord({ messaging: fakeMessaging(), db, recipients, ...payload });
    await sendAndRecord({ messaging: fakeMessaging(), db, recipients, ...payload });
    assert.equal(db.written.size, 1);
  });

  it("two genuinely separate actions on the same entity do not collide", async () => {
    // Callables that can legitimately fire more than once for the same
    // student/class (cancel, re-enrol, cancel again) must not fabricate a
    // stable id from those business fields — that silently drops the second
    // notification's ledger row as a false "replay" of the first. Omitting
    // eventId (as every fixed callable call site now does) must fall back to
    // a fresh id each time, not the same one twice.
    const { eventId: _omit, ...withoutEventId } = payload;
    const db = fakeDb();
    const recipients = [{ uid: "admin-1", tokens: ["a1-phone"] }];
    const first = await sendAndRecord({ messaging: fakeMessaging(), db, recipients, ...withoutEventId });
    const second = await sendAndRecord({ messaging: fakeMessaging(), db, recipients, ...withoutEventId });
    assert.notEqual(first.eventId, second.eventId);
    assert.equal(db.written.size, 2);
  });

  it("refuses a recipient it cannot attribute", async () => {
    await assert.rejects(
      () =>
        sendAndRecord({
          messaging: fakeMessaging(),
          db: fakeDb(),
          recipients: [{ tokens: ["orphan-token"] }],
          ...payload,
        }),
      /uid/
    );
  });
});
