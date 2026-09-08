"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  ONE_TUTOR_ROSTER_CEILING,
  OVERSTAFFED_NOTIFICATION_TYPE,
  notifyAdminsOfOverstaffedSessions,
  overstaffedNotificationFor,
  sessionIsOverstaffed,
} = require("../../src/notifications/overstaffedSessions");

function sessionAt(hour, rosterCount, classId = "c1", tutorCount = 2) {
  return {
    classId,
    startsAt: new Date(Date.UTC(2026, 8, 9, hour, 0)),
    timeLabel: `${hour}:00 pm`,
    rosterCount,
    tutorCount,
  };
}

describe("overstaffed sessions", () => {
  it("flags a quiet session carrying two tutors", () => {
    assert.equal(sessionIsOverstaffed({ rosterCount: 2, tutorCount: 2 }), true);
  });

  it("leaves a quiet session that already has one tutor alone", () => {
    // Correctly staffed. There is nobody to stand down, so there is nothing
    // to tell an admin.
    assert.equal(sessionIsOverstaffed({ rosterCount: 2, tutorCount: 1 }), false);
  });

  it("does not report a quiet session with nobody assigned", () => {
    // Not overstaffed. An unstaffed class on the morning of the session is a
    // larger problem than this summary raises.
    assert.equal(sessionIsOverstaffed({ rosterCount: 2, tutorCount: 0 }), false);
  });

  it("flags the emptier sessions too, not just an exact two", () => {
    assert.equal(sessionIsOverstaffed({ rosterCount: 1, tutorCount: 2 }), true);
    assert.equal(sessionIsOverstaffed({ rosterCount: 0, tutorCount: 2 }), true);
  });

  it("leaves a session above the ceiling alone, however many tutors", () => {
    assert.equal(
      sessionIsOverstaffed({
        rosterCount: ONE_TUTOR_ROSTER_CEILING + 1,
        tutorCount: 3,
      }),
      false
    );
  });

  it("never flags a cancelled session", () => {
    // Nobody is standing in a room that is not running.
    assert.equal(
      sessionIsOverstaffed({ cancelled: true, rosterCount: 1, tutorCount: 2 }),
      false
    );
  });

  it("treats a missing count as unknown rather than zero", () => {
    // An attendance document without a readable roster or tutor list must not
    // be reported as a staffing mistake.
    assert.equal(sessionIsOverstaffed({}), false);
    assert.equal(sessionIsOverstaffed({ rosterCount: null, tutorCount: 2 }), false);
    assert.equal(sessionIsOverstaffed({ rosterCount: 2, tutorCount: null }), false);
    assert.equal(sessionIsOverstaffed(), false);
  });

  it("says nothing when the day has no qualifying session", () => {
    assert.equal(overstaffedNotificationFor([]), null);
    assert.equal(overstaffedNotificationFor(undefined), null);
  });

  it("names the single session rather than counting to one", () => {
    const content = overstaffedNotificationFor([sessionAt(4, 2)]);
    assert.equal(content.title, "A class today only needs one tutor");
    assert.equal(
      content.body,
      "4:00 pm (2 tutors, 2 students) — one tutor is enough."
    );
  });

  it("counts and lists the day's sessions, earliest first", () => {
    const content = overstaffedNotificationFor([
      sessionAt(6, 1, "c2"),
      sessionAt(4, 2, "c1"),
    ]);
    assert.equal(content.title, "2 classes today only need one tutor");
    assert.equal(
      content.body,
      "4:00 pm (2 tutors, 2 students), 6:00 pm (2 tutors, 1 student)."
    );
  });

  it("reads an emptied session as no students, not zero", () => {
    const content = overstaffedNotificationFor([sessionAt(4, 0)]);
    assert.match(content.body, /no students/);
  });

  it("reports the tutor count it found, not an assumed pair", () => {
    const content = overstaffedNotificationFor([sessionAt(4, 2, "c1", 3)]);
    assert.match(content.body, /3 tutors/);
  });

  it("counts the overflow instead of listing a whole day", () => {
    const content = overstaffedNotificationFor([
      sessionAt(1, 2),
      sessionAt(2, 2),
      sessionAt(3, 2),
      sessionAt(4, 2),
      sessionAt(5, 1),
      sessionAt(6, 1),
    ]);
    assert.equal(content.title, "6 classes today only need one tutor");
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

    const result = await notifyAdminsOfOverstaffedSessions(
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
    assert.equal(result.eventId, "overstaffedSessions:2026-09-09");
    assert.equal(sent.length, 1);
    assert.equal(sent[0].tokens.length, 2);
    assert.equal(sent[0].data.type, OVERSTAFFED_NOTIFICATION_TYPE);
    assert.equal(sent[0].data.classIds, "c1");
  });

  it("sends nothing when no session qualifies", async () => {
    const result = await notifyAdminsOfOverstaffedSessions(
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
    const result = await notifyAdminsOfOverstaffedSessions(
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
