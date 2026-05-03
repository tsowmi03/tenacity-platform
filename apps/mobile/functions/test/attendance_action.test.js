const assert = require("node:assert/strict");
const test = require("node:test");

const {
  attendanceAddedStudentIdsForNotification,
  studentAddedNotificationBody,
} = require("../lib/notifications/attendance_action");

test("attendance added notification detects added students", () => {
  assert.deepEqual(
    attendanceAddedStudentIdsForNotification(["a"], ["a", "b"]),
    ["b"],
  );
});

test("attendance added notification suppresses one-off enrollment action", () => {
  assert.deepEqual(
    attendanceAddedStudentIdsForNotification(["a"], ["a", "b"], {
      type: "one_off_enrollment",
      studentId: "b",
    }),
    [],
  );
});

test("attendance added notification still fires for unrelated added students", () => {
  assert.deepEqual(
    attendanceAddedStudentIdsForNotification(["a"], ["a", "b", "c"], {
      type: "one_off_enrollment",
      studentId: "b",
    }),
    ["c"],
  );
});

test("student added notification body matches admin copy", () => {
  assert.equal(
    studentAddedNotificationBody({
      studentName: "Jane Student",
      classDay: "Monday",
      classTime: "4:00 pm",
      attendanceDateText: "Monday 4 May",
    }),
    "Jane Student has been added to Monday at 4:00 pm on Monday 4 May.",
  );
});
