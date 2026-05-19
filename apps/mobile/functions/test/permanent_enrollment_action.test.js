const assert = require("node:assert/strict");
const test = require("node:test");

const {
  canAcceptParentPermanentEnrollment,
  canPerformPermanentEnrollmentAction,
  classEnrollmentState,
  permanentSpotsRemaining,
} = require("../lib/notifications/permanent_enrollment_action");

test("class enrollment state is full when no permanent spots remain", () => {
  const state = classEnrollmentState({
    capacity: 2,
    minStudentsToOpen: 2,
    enrolledStudents: ["a", "b"],
  });

  assert.equal(state, "full");
  assert.equal(canAcceptParentPermanentEnrollment({
    capacity: 2,
    minStudentsToOpen: 2,
    enrolledStudents: ["a", "b"],
  }), false);
});

test("permanent spots remaining never goes below zero", () => {
  assert.equal(permanentSpotsRemaining({
    capacity: 2,
    enrolledStudents: ["a", "b", "c"],
  }), 0);
});

test("permanent enrollment action can be performed by admins or linked parents", () => {
  const studentData = {
    parents: ["parentA"],
    primaryParentId: "parentB",
  };

  assert.equal(canPerformPermanentEnrollmentAction("adminA", { role: "admin" }, studentData), true);
  assert.equal(canPerformPermanentEnrollmentAction("parentA", { role: "parent" }, studentData), true);
  assert.equal(canPerformPermanentEnrollmentAction("parentB", { role: "parent" }, studentData), true);
  assert.equal(canPerformPermanentEnrollmentAction("parentC", { role: "parent" }, studentData), false);
});

test("class enrollment state is pending below the opening minimum", () => {
  const classData = {
    capacity: 5,
    minStudentsToOpen: 2,
    enrolledStudents: ["a"],
  };

  assert.equal(classEnrollmentState(classData), "pending");
  assert.equal(canAcceptParentPermanentEnrollment(classData), false);
});

test("class enrollment state is open when minimum is met and capacity remains", () => {
  const classData = {
    capacity: 5,
    minStudentsToOpen: 2,
    enrolledStudents: ["a", "b"],
  };

  assert.equal(classEnrollmentState(classData), "open");
  assert.equal(canAcceptParentPermanentEnrollment(classData), true);
});
