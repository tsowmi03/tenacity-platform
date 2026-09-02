"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  hasPermanentRoom,
  permanentSpotsRemaining,
  planPermanentAttendanceSync,
  planSwapKeptSessions,
  sessionsFromWeek,
  weekNumberFromSessionId,
} = require("../../../src/attendance/permanentEnrolmentCapacity");

describe("permanentSpotsRemaining", () => {
  it("counts the permanent roster against capacity", () => {
    assert.equal(
      permanentSpotsRemaining({ capacity: 4, enrolledStudents: ["a", "b"] }),
      2
    );
  });

  it("reports an overfilled class as zero spots, not negative", () => {
    // An admin overfilled, or somebody lowered the capacity of a full class.
    assert.equal(
      permanentSpotsRemaining({ capacity: 2, enrolledStudents: ["a", "b", "c"] }),
      0
    );
  });

  it("treats a missing capacity as no seats rather than infinite ones", () => {
    assert.equal(permanentSpotsRemaining({ enrolledStudents: [] }), 0);
  });
});

describe("hasPermanentRoom", () => {
  it("allows a student in when a spot is free", () => {
    assert.equal(
      hasPermanentRoom({
        capacity: 4,
        enrolledStudents: ["a", "b"],
        studentId: "c",
      }),
      true
    );
  });

  it("refuses a student when the permanent roster is full", () => {
    assert.equal(
      hasPermanentRoom({
        capacity: 2,
        enrolledStudents: ["a", "b"],
        studentId: "c",
      }),
      false
    );
  });

  it("still has room for somebody already on the roster", () => {
    // A retried swap must not start failing once the class fills up.
    assert.equal(
      hasPermanentRoom({
        capacity: 2,
        enrolledStudents: ["a", "b"],
        studentId: "b",
      }),
      true
    );
  });
});

describe("planPermanentAttendanceSync", () => {
  it("adds the student to every future session with room", () => {
    const plan = planPermanentAttendanceSync({
      sessions: [
        { id: "w1", date: "2026-09-03", attendance: ["p1", "p2"] },
        { id: "w2", date: "2026-09-10", attendance: ["p1", "p2"] },
      ],
      capacity: 4,
      studentId: "new",
    });

    assert.deepEqual(plan.toAdd, ["w1", "w2"]);
    assert.deepEqual(plan.skipped, []);
    assert.equal(plan.isNoOp, false);
  });

  it("skips a week that a one-off visitor has already filled", () => {
    // MOB-38. Two permanent students and one visitor in a class of four: the
    // permanent roster says there is room, the room itself does not.
    const plan = planPermanentAttendanceSync({
      sessions: [
        { id: "w1", date: "2026-09-03", attendance: ["p1", "p2", "v1", "a"] },
        { id: "w2", date: "2026-09-10", attendance: ["p1", "p2", "a"] },
      ],
      capacity: 4,
      studentId: "b",
    });

    assert.deepEqual(plan.toAdd, ["w2"]);
    assert.deepEqual(plan.skipped, [{ id: "w1", date: "2026-09-03" }]);
  });

  it("does not count a student already in the week as an addition or a skip", () => {
    const plan = planPermanentAttendanceSync({
      sessions: [
        { id: "w1", date: "2026-09-03", attendance: ["p1", "p2", "v1", "b"] },
      ],
      capacity: 4,
      studentId: "b",
    });

    assert.deepEqual(plan.toAdd, []);
    assert.deepEqual(plan.skipped, []);
    assert.equal(plan.isNoOp, true);
  });

  it("treats an over-capacity week as full rather than as owing seats", () => {
    const plan = planPermanentAttendanceSync({
      sessions: [
        { id: "w1", date: "2026-09-03", attendance: ["a", "b", "c", "d", "e"] },
      ],
      capacity: 4,
      studentId: "new",
    });

    assert.deepEqual(plan.toAdd, []);
    assert.equal(plan.skipped.length, 1);
  });

  it("preserves the order it was given, so skipped weeks read chronologically", () => {
    const plan = planPermanentAttendanceSync({
      sessions: [
        { id: "w1", date: "2026-09-03", attendance: ["a", "b"] },
        { id: "w2", date: "2026-09-10", attendance: ["a", "b"] },
        { id: "w3", date: "2026-09-17", attendance: ["a", "b"] },
      ],
      capacity: 2,
      studentId: "new",
    });

    assert.deepEqual(plan.skipped.map(entry => entry.date), [
      "2026-09-03",
      "2026-09-10",
      "2026-09-17",
    ]);
  });

  it("survives a session document with no attendance array", () => {
    const plan = planPermanentAttendanceSync({
      sessions: [{ id: "w1", date: "2026-09-03" }],
      capacity: 4,
      studentId: "new",
    });

    assert.deepEqual(plan.toAdd, ["w1"]);
  });

  it("is a no-op when there are no future sessions at all", () => {
    const plan = planPermanentAttendanceSync({
      sessions: [],
      capacity: 4,
      studentId: "new",
    });

    assert.equal(plan.isNoOp, true);
    assert.deepEqual(plan.skipped, []);
  });
});

describe("planSwapKeptSessions", () => {
  const leaving = [
    { id: "2026_T2_W2", attendance: ["ben", "x"] },
    { id: "2026_T2_W3", attendance: ["ben", "x"] },
  ];

  it("keeps the weeks the destination is too full to take", () => {
    const kept = planSwapKeptSessions({
      leavingSessions: leaving,
      destinationSessions: [
        { id: "2026_T2_W2", attendance: ["p1", "p2", "p3", "visitor"] },
        { id: "2026_T2_W3", attendance: ["p1", "p2", "p3", "ben"] },
      ],
      destinationEnrolledStudents: ["p1", "p2", "p3", "ben"],
      studentId: "ben",
    });

    assert.deepEqual(kept, ["2026_T2_W2"]);
  });

  it("keeps nothing when the student is not on the destination roster", () => {
    // The exploit this guards: without it, unenrolling while naming a full
    // class would free the permanent spot and keep every remaining week.
    const kept = planSwapKeptSessions({
      leavingSessions: leaving,
      destinationSessions: [
        { id: "2026_T2_W2", attendance: ["p1", "p2", "p3", "p4"] },
        { id: "2026_T2_W3", attendance: ["p1", "p2", "p3", "p4"] },
      ],
      destinationEnrolledStudents: ["p1", "p2", "p3", "p4"],
      studentId: "ben",
    });

    assert.deepEqual(kept, []);
  });

  it("keeps the weeks a deferred swap has not started in yet", () => {
    // The destination has room in both weeks and still does not hold the
    // student, which is what a swap starting in a later week looks like: the
    // enrolment skipped these on purpose. They stay in the class they came
    // from until the switch rather than being dropped from both (MOB-39).
    const kept = planSwapKeptSessions({
      leavingSessions: leaving,
      destinationSessions: [
        { id: "2026_T2_W2", attendance: ["p1"] },
        { id: "2026_T2_W3", attendance: ["p1"] },
      ],
      destinationEnrolledStudents: ["p1", "ben"],
      studentId: "ben",
    });

    assert.deepEqual(kept, ["2026_T2_W2", "2026_T2_W3"]);
  });

  it("keeps only the weeks before the start once the swap has begun", () => {
    // The shape of a swap deferred to week 3: week 2 belongs to the old
    // class, week 3 onward to the new one.
    const kept = planSwapKeptSessions({
      leavingSessions: leaving,
      destinationSessions: [
        { id: "2026_T2_W2", attendance: ["p1"] },
        { id: "2026_T2_W3", attendance: ["p1", "ben"] },
      ],
      destinationEnrolledStudents: ["p1", "ben"],
      studentId: "ben",
    });

    assert.deepEqual(kept, ["2026_T2_W2"]);
  });

  it("keeps nothing for a week the destination already has them in", () => {
    const kept = planSwapKeptSessions({
      leavingSessions: leaving,
      destinationSessions: [
        { id: "2026_T2_W2", attendance: ["p1", "p2", "p3", "ben"] },
        { id: "2026_T2_W3", attendance: ["p1", "p2", "p3", "ben"] },
      ],
      destinationEnrolledStudents: ["p1", "p2", "p3", "ben"],
      studentId: "ben",
    });

    assert.deepEqual(kept, []);
  });

  it("ignores a week the destination class does not run", () => {
    const kept = planSwapKeptSessions({
      leavingSessions: leaving,
      destinationSessions: [
        { id: "2026_T2_W2", attendance: ["p1", "p2", "p3", "visitor"] },
      ],
      destinationEnrolledStudents: ["ben"],
      studentId: "ben",
    });

    assert.deepEqual(kept, ["2026_T2_W2"]);
  });

  it("keeps nothing without a student id", () => {
    const kept = planSwapKeptSessions({
      leavingSessions: leaving,
      destinationSessions: leaving,
      destinationEnrolledStudents: ["ben"],
      studentId: null,
    });

    assert.deepEqual(kept, []);
  });
});

describe("weekNumberFromSessionId", () => {
  it("reads the week out of a session id", () => {
    assert.equal(weekNumberFromSessionId("2026_T2_W7"), 7);
  });

  it("reads a two-digit week", () => {
    assert.equal(weekNumberFromSessionId("2026_T2_W10"), 10);
  });

  it("returns null for an id carrying no week", () => {
    // Never read as week zero, which would sort ahead of every real week and
    // quietly include a session in every start-week comparison.
    assert.equal(weekNumberFromSessionId("2026_T2"), null);
    assert.equal(weekNumberFromSessionId("2026_T2_W"), null);
    assert.equal(weekNumberFromSessionId("2026_T2_W0"), null);
    assert.equal(weekNumberFromSessionId(undefined), null);
  });
});

describe("sessionsFromWeek", () => {
  const sessions = [
    { id: "2026_T2_W2", attendance: [] },
    { id: "2026_T2_W3", attendance: [] },
    { id: "2026_T2_W4", attendance: [] },
  ];

  it("drops the weeks before the swap starts", () => {
    assert.deepEqual(
      sessionsFromWeek({ sessions, startWeek: 3 }).map(s => s.id),
      ["2026_T2_W3", "2026_T2_W4"]
    );
  });

  it("keeps everything without a start week", () => {
    // The immediate swap every parent got before MOB-39, and still the
    // default.
    assert.deepEqual(sessionsFromWeek({ sessions }).map(s => s.id), [
      "2026_T2_W2",
      "2026_T2_W3",
      "2026_T2_W4",
    ]);
    assert.deepEqual(
      sessionsFromWeek({ sessions, startWeek: 1 }).map(s => s.id),
      ["2026_T2_W2", "2026_T2_W3", "2026_T2_W4"]
    );
  });

  it("keeps a session whose id carries no week", () => {
    // It cannot be placed against the start week, and dropping it would leave
    // the student out of a session they are entitled to.
    assert.deepEqual(
      sessionsFromWeek({
        sessions: [{ id: "legacy-session" }, ...sessions],
        startWeek: 4,
      }).map(s => s.id),
      ["legacy-session", "2026_T2_W4"]
    );
  });

  it("returns nothing when the start week is past the last session", () => {
    // What `firstSessionFromWeek` turns into a rejection: enrolling here would
    // seat the student in no week at all.
    assert.deepEqual(sessionsFromWeek({ sessions, startWeek: 9 }), []);
  });
});
