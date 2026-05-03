const assert = require("node:assert/strict");
const test = require("node:test");

const {
  attendanceAddedStudentIdsForNotification,
  attendanceRemovedStudentIdsForNotification,
  studentAbsentNotificationBody,
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

test("attendance added notification suppresses reschedule destination action", () => {
  assert.deepEqual(
    attendanceAddedStudentIdsForNotification(["a"], ["a", "b"], {
      type: "reschedule_to",
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

test("attendance removed notification detects removed students", () => {
  assert.deepEqual(
    attendanceRemovedStudentIdsForNotification(["a", "b"], ["a"]),
    ["b"],
  );
});

test("attendance removed notification suppresses absence and cancel actions", () => {
  assert.deepEqual(
    attendanceRemovedStudentIdsForNotification(["a", "b"], ["a"], {
      type: "notify_absence",
      studentId: "b",
    }),
    [],
  );
  assert.deepEqual(
    attendanceRemovedStudentIdsForNotification(["a", "b"], ["a"], {
      type: "cancel_student_for_week",
      studentId: "b",
    }),
    [],
  );
});

test("attendance removed notification suppresses reschedule source action", () => {
  assert.deepEqual(
    attendanceRemovedStudentIdsForNotification(["a", "b"], ["a"], {
      type: "reschedule_from",
      studentId: "b",
    }),
    [],
  );
});

test("attendance removed notification still fires for unrelated removals", () => {
  assert.deepEqual(
    attendanceRemovedStudentIdsForNotification(["a", "b", "c"], ["a"], {
      type: "cancel_student_for_week",
      studentId: "b",
    }),
    ["c"],
  );
});

test("student absent notification body matches admin copy", () => {
  assert.equal(
    studentAbsentNotificationBody({
      studentName: "Jane Student",
      classDay: "Monday",
      classTime: "4:00 pm",
      attendanceDateText: "Monday 4 May",
    }),
    "Jane Student will be absent from Monday at 4:00 pm on Monday 4 May.",
  );
});
