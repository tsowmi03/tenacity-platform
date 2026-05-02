const assert = require("node:assert/strict");
const test = require("node:test");

const {
  canAcceptParentPermanentEnrollment,
  classEnrollmentState,
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
