const assert = require("node:assert/strict");
const test = require("node:test");

const {
  shouldAwardAbsenceLessonToken,
} = require("../lib/notifications/absence");

test("absence lesson token is awarded before 10am Sydney time", () => {
  const attendanceDate = new Date("2026-05-04T18:00:00+10:00");
  const now = new Date("2026-05-04T09:59:00+10:00");

  assert.equal(shouldAwardAbsenceLessonToken(attendanceDate, now), true);
});

test("absence lesson token is not awarded at or after 10am Sydney time", () => {
  const attendanceDate = new Date("2026-05-04T18:00:00+10:00");

  assert.equal(
    shouldAwardAbsenceLessonToken(attendanceDate, new Date("2026-05-04T10:00:00+10:00")),
    false,
  );
  assert.equal(
    shouldAwardAbsenceLessonToken(attendanceDate, new Date("2026-05-04T10:01:00+10:00")),
    false,
  );
});
