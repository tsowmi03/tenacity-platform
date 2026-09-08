"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  ONE_TUTOR_NOTIFICATION_TYPE,
  ONE_TUTOR_ROSTER_CEILING,
  notifyAdminsOfOneTutorSessions,
  oneTutorNotificationFor,
  sessionNeedsOneTutorOnly,
} = require("../../src/notifications/oneTutorSessions");

function sessionAt(hour, rosterCount, classId = "c1") {
  return {
    classId,
    startsAt: new Date(Date.UTC(2026, 8, 9, hour, 0)),
    timeLabel: `${hour}:00 pm`,
    rosterCount,
  };
}

describe("one-tutor sessions", () => {
  it("flags a session at the ceiling", () => {
    assert.equal(sessionNeedsOneTutorOnly({ rosterCount: 2 }), true);
  });

  it("flags the emptier sessions too, not just an exact two", () => {
    // A session down to one student, or emptied by absences, needs one tutor
    // at most as well. Matching exactly two would leave these unmarked.
    assert.equal(sessionNeedsOneTutorOnly({ rosterCount: 1 }), true);
    assert.equal(sessionNeedsOneTutorOnly({ rosterCount: 0 }), true);
  });

  it("leaves a session above the ceiling alone", () => {
    assert.equal(
      sessionNeedsOneTutorOnly({ rosterCount: ONE_TUTOR_ROSTER_CEILING + 1 }),
      false
    );
  });

  it("never flags a cancelled session", () => {
    // Nobody is allocated to a class that is not running.
    assert.equal(
      sessionNeedsOneTutorOnly({ cancelled: true, rosterCount: 1 }),
      false
    );
  });

  it("treats a missing count as unknown rather than empty", () => {
    // An attendance document without a readable roster must not be reported
    // as a class nobody needs to staff.
    assert.equal(sessionNeedsOneTutorOnly({}), false);
    assert.equal(sessionNeedsOneTutorOnly({ rosterCount: null }), false);
    assert.equal(sessionNeedsOneTutorOnly(), false);
  });

  it("says nothing when the day has no qualifying session", () => {
    assert.equal(oneTutorNotificationFor([]), null);
    assert.equal(oneTutorNotificationFor(undefined), null);
  });

  it("names the single session rather than counting to one", () => {
    const content = oneTutorNotificationFor([sessionAt(4, 2)]);
    assert.equal(content.title, "One tutor is enough today");
    assert.equal(content.body, "4:00 pm (2 students) — one tutor covers it.");
  });

  it("counts and lists the day's sessions, earliest first", () => {
    const content = oneTutorNotificationFor([
      sessionAt(6, 1, "c2"),
      sessionAt(4, 2, "c1"),
    ]);
    assert.equal(content.title, "2 classes need one tutor today");
    assert.equal(content.body, "4:00 pm (2 students), 6:00 pm (1 student).");
  });

  it("reads an emptied session as no students, not zero", () => {
    const content = oneTutorNotificationFor([sessionAt(4, 0)]);
    assert.match(content.body, /no students/);
  });

  it("counts the overflow instead of listing a whole day", () => {
    const content = oneTutorNotificationFor([
      sessionAt(1, 2),
      sessionAt(2, 2),
      sessionAt(3, 2),
      sessionAt(4, 2),
      sessionAt(5, 1),
      sessionAt(6, 1),
    ]);
    assert.equal(content.title, "6 classes need one tutor today");
    assert.match(content.body, /and 2 more\.$/);
    assert.equal(content.body.includes("5:00 pm"), false);
  });

  it("sends one summary to every admin, keyed to the day", async () => {
    const sent = [];
    const messaging = {
      sendEachForMulticast: async ({ notification, data, tokens }) => {
        sent.push({ notification, data, tokens });
        return {
          successCount: tokens.length,
          failureCount: 0,
          responses: tokens.map(() => ({ success: true })),
        };
      },
    };

    const result = await notifyAdminsOfOneTutorSessions(
      { sessions: [sessionAt(4, 2)], sweepDate: "2026-09-09" },
      {
        db: fakeDb(),
        messaging,
        recipientsImpl: async () => [
          { uid: "admin1", role: "admin", tokens: ["t1", "t2"] },
        ],
      }
    );

    assert.equal(result.sent, true);
    assert.equal(result.eventId, "oneTutorSessions:2026-09-09");
    assert.equal(sent.length, 1);
    assert.equal(sent[0].tokens.length, 2);
    assert.equal(sent[0].data.type, ONE_TUTOR_NOTIFICATION_TYPE);
    assert.equal(sent[0].data.classIds, "c1");
  });

  it("sends nothing when no session qualifies", async () => {
    const result = await notifyAdminsOfOneTutorSessions(
      { sessions: [], sweepDate: "2026-09-09" },
      {
        db: fakeDb(),
        messaging: {
          sendEachForMulticast: async () => {
            assert.fail("should not send an empty summary");
          },
        },
        recipientsImpl: async () => {
          assert.fail("should not resolve recipients with nothing to say");
        },
      }
    );

    assert.deepEqual(result, { sent: false, noSessions: true });
  });

  it("reports a failed send instead of throwing into the sweep", async () => {
    // The summary runs after the day's tutor and parent reminders have gone
    // out. Throwing here retries the whole schedule and re-sends those.
    const logged = [];
    const result = await notifyAdminsOfOneTutorSessions(
      { sessions: [sessionAt(4, 2)], sweepDate: "2026-09-09" },
      {
        db: fakeDb(),
        messaging: {},
        recipientsImpl: async () => {
          throw new Error("firestore unavailable");
        },
        logger: { error: (...args) => logged.push(args) },
      }
    );

    assert.equal(result.sent, false);
    assert.equal(result.error.message, "firestore unavailable");
    assert.equal(logged.length, 1);
  });
});

/**
 * Enough of Firestore for `sendAndRecord` to write its ledger rows and prune
 * dead tokens — the same shape `notificationSend.test.js` uses.
 */
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
            create: async (entry) => written.set(id, entry),
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
