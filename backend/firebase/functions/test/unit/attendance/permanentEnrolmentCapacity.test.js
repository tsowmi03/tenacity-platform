"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  hasPermanentRoom,
  permanentSpotsRemaining,
  planPermanentAttendanceSync,
  planSwapKeptSessions,
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
      destinationCapacity: 4,
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
      destinationCapacity: 4,
      destinationEnrolledStudents: ["p1", "p2", "p3", "p4"],
      studentId: "ben",
    });

    assert.deepEqual(kept, []);
  });

  it("keeps nothing for a week the destination has room in", () => {
    // The student belongs in the destination that week. Keeping the old seat
    // would put them in two classes at once.
    const kept = planSwapKeptSessions({
      leavingSessions: leaving,
      destinationSessions: [
        { id: "2026_T2_W2", attendance: ["p1"] },
        { id: "2026_T2_W3", attendance: ["p1"] },
      ],
      destinationCapacity: 4,
      destinationEnrolledStudents: ["p1", "ben"],
      studentId: "ben",
    });

    assert.deepEqual(kept, []);
  });

  it("keeps nothing for a week the destination already has them in", () => {
    const kept = planSwapKeptSessions({
      leavingSessions: leaving,
      destinationSessions: [
        { id: "2026_T2_W2", attendance: ["p1", "p2", "p3", "ben"] },
        { id: "2026_T2_W3", attendance: ["p1", "p2", "p3", "ben"] },
      ],
      destinationCapacity: 4,
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
      destinationCapacity: 4,
      destinationEnrolledStudents: ["ben"],
      studentId: "ben",
    });

    assert.deepEqual(kept, ["2026_T2_W2"]);
  });

  it("keeps nothing without a student id", () => {
    const kept = planSwapKeptSessions({
      leavingSessions: leaving,
      destinationSessions: leaving,
      destinationCapacity: 4,
      destinationEnrolledStudents: ["ben"],
      studentId: null,
    });

    assert.deepEqual(kept, []);
  });
});
