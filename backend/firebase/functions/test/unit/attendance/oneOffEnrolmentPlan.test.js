"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  ENROLMENT_OUTCOME,
  outcomeFor,
  planOneOffEnrolment,
} = require("../../../src/attendance/oneOffEnrolmentPlan");

describe("planOneOffEnrolment", () => {
  it("enrols everyone when the session has room", () => {
    const plan = planOneOffEnrolment({
      currentAttendance: ["other-1"],
      capacity: 6,
      studentIds: ["student-1", "student-2"],
    });

    assert.deepEqual(plan.toEnrol, ["student-1", "student-2"]);
    assert.deepEqual(plan.alreadyEnrolled, []);
    assert.deepEqual(plan.noCapacity, []);
    assert.equal(plan.isNoOp, false);
  });

  it("treats a student already in the session as neither new nor an error", () => {
    const plan = planOneOffEnrolment({
      currentAttendance: ["student-1"],
      capacity: 6,
      studentIds: ["student-1", "student-2"],
    });

    assert.deepEqual(plan.toEnrol, ["student-2"]);
    assert.deepEqual(plan.alreadyEnrolled, ["student-1"]);
  });

  it("is a no-op when every student is already booked", () => {
    // What a webhook retry sees after the first delivery succeeded.
    const plan = planOneOffEnrolment({
      currentAttendance: ["student-1", "student-2"],
      capacity: 6,
      studentIds: ["student-1", "student-2"],
    });

    assert.deepEqual(plan.toEnrol, []);
    assert.equal(plan.isNoOp, true);
  });

  it("fills the seats that exist and reports the rest", () => {
    const plan = planOneOffEnrolment({
      currentAttendance: ["other-1", "other-2"],
      capacity: 3,
      studentIds: ["student-1", "student-2"],
    });

    assert.deepEqual(plan.toEnrol, ["student-1"]);
    assert.deepEqual(plan.noCapacity, ["student-2"]);
  });

  it("does not let two students in one request take the same last seat", () => {
    const plan = planOneOffEnrolment({
      currentAttendance: [],
      capacity: 1,
      studentIds: ["student-1", "student-2"],
    });

    assert.deepEqual(plan.toEnrol, ["student-1"]);
    assert.deepEqual(plan.noCapacity, ["student-2"]);
  });

  it("chooses the same students every time it is recomputed", () => {
    // A sweep resuming a half-finished fulfilment must not pick a different
    // child than the first attempt did.
    const input = {
      currentAttendance: ["other-1"],
      capacity: 3,
      studentIds: ["student-a", "student-b", "student-c"],
    };
    assert.deepEqual(
      planOneOffEnrolment(input).toEnrol,
      planOneOffEnrolment(input).toEnrol
    );
    assert.deepEqual(planOneOffEnrolment(input).toEnrol, ["student-a", "student-b"]);
  });

  it("enrols nobody into a full session", () => {
    const plan = planOneOffEnrolment({
      currentAttendance: ["other-1", "other-2"],
      capacity: 2,
      studentIds: ["student-1"],
    });

    assert.deepEqual(plan.toEnrol, []);
    assert.deepEqual(plan.noCapacity, ["student-1"]);
    assert.equal(plan.isNoOp, true);
  });

  it("treats an oversold session as full rather than going negative", () => {
    const plan = planOneOffEnrolment({
      currentAttendance: ["a", "b", "c"],
      capacity: 2,
      studentIds: ["student-1"],
    });

    assert.deepEqual(plan.noCapacity, ["student-1"]);
  });

  it("survives missing or malformed inputs", () => {
    const plan = planOneOffEnrolment({});
    assert.deepEqual(plan.toEnrol, []);
    assert.equal(plan.isNoOp, true);
  });
});

describe("outcomeFor", () => {
  const plan = planOneOffEnrolment({
    currentAttendance: ["student-1", "other-1"],
    capacity: 3,
    studentIds: ["student-1", "student-2", "student-3"],
  });

  it("reports each student's fate", () => {
    assert.equal(outcomeFor(plan, "student-1"), ENROLMENT_OUTCOME.ALREADY_ENROLLED);
    assert.equal(outcomeFor(plan, "student-2"), ENROLMENT_OUTCOME.ENROL);
    assert.equal(outcomeFor(plan, "student-3"), ENROLMENT_OUTCOME.NO_CAPACITY);
  });
});
