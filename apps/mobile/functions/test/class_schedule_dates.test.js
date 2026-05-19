const assert = require("node:assert/strict");
const test = require("node:test");

const {
  classDayNameForDate,
  classSessionDateForWeek,
  shouldProcessReminderAttendance,
} = require("../lib/class_schedule_dates");

test("classSessionDateForWeek uses configured class day inside the first term week", () => {
  const session = classSessionDateForWeek({
    termStart: new Date("2026-04-27T14:00:00.000Z"),
    classDay: "Monday",
    startTime: "16:30",
    weekNumber: 1,
  });

  assert.equal(session.toISOString(), "2026-04-27T06:30:00.000Z");
  assert.equal(classDayNameForDate(session), "Monday");
});

test("classSessionDateForWeek keeps class on term start when weekdays already match", () => {
  const session = classSessionDateForWeek({
    termStart: new Date("2026-04-27T14:00:00.000Z"),
    classDay: "Tuesday",
    startTime: "18:00",
    weekNumber: 1,
  });

  assert.equal(session.toISOString(), "2026-04-28T08:00:00.000Z");
  assert.equal(classDayNameForDate(session), "Tuesday");
});

test("classSessionDateForWeek keeps Monday-based week numbering for later term weeks", () => {
  const session = classSessionDateForWeek({
    termStart: new Date("2026-04-27T14:00:00.000Z"),
    classDay: "Monday",
    startTime: "16:30",
    weekNumber: 2,
  });

  assert.equal(session.toISOString(), "2026-05-04T06:30:00.000Z");
  assert.equal(classDayNameForDate(session), "Monday");
});

test("classSessionDateForWeek advances by full Monday-based term weeks", () => {
  const session = classSessionDateForWeek({
    termStart: new Date("2026-04-27T14:00:00.000Z"),
    classDay: "Thursday",
    startTime: "09:15",
    weekNumber: 3,
  });

  assert.equal(session.toISOString(), "2026-05-13T23:15:00.000Z");
  assert.equal(classDayNameForDate(session), "Thursday");
});

test("shouldProcessReminderAttendance skips cancelled attendance docs", () => {
  assert.equal(
    shouldProcessReminderAttendance({
      cancelled: true,
      attendanceDate: new Date("2026-04-28T08:00:00.000Z"),
      classDay: "Tuesday",
    }),
    false,
  );
});

test("shouldProcessReminderAttendance skips docs whose date does not match class day", () => {
  assert.equal(
    shouldProcessReminderAttendance({
      cancelled: false,
      attendanceDate: new Date("2026-04-28T08:00:00.000Z"),
      classDay: "Wednesday",
    }),
    false,
  );
});

test("shouldProcessReminderAttendance accepts active docs matching the class day", () => {
  assert.equal(
    shouldProcessReminderAttendance({
      cancelled: false,
      attendanceDate: new Date("2026-04-28T08:00:00.000Z"),
      classDay: "Tuesday",
    }),
    true,
  );
});
