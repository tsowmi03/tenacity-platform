const assert = require("node:assert/strict");
const test = require("node:test");

const {
  attendanceTermIdForDoc,
  attendanceWeekNumberForDoc,
  buildAttendanceDateBackfillPlan,
} = require("../lib/attendance_doc_dates");

test("attendanceTermIdForDoc prefers explicit termId", () => {
  assert.equal(
    attendanceTermIdForDoc("ignored_W3", { termId: "2026_T2" }),
    "2026_T2",
  );
});

test("attendanceTermIdForDoc falls back to document id", () => {
  assert.equal(
    attendanceTermIdForDoc("2026_T2_W3", {}),
    "2026_T2",
  );
});

test("attendanceWeekNumberForDoc supports legacy and server fields", () => {
  assert.equal(attendanceWeekNumberForDoc("ignored", { weekNum: 4 }), 4);
  assert.equal(attendanceWeekNumberForDoc("ignored", { weekNumber: 5 }), 5);
});

test("attendanceWeekNumberForDoc falls back to document id", () => {
  assert.equal(attendanceWeekNumberForDoc("2026_T2_W6", {}), 6);
});

test("buildAttendanceDateBackfillPlan updates future misdated docs", () => {
  const plan = buildAttendanceDateBackfillPlan({
    existingDate: new Date("2026-05-05T06:30:00.000Z"),
    termStart: new Date("2026-04-27T14:00:00.000Z"),
    classDay: "Monday",
    startTime: "16:30",
    weekNumber: 2,
    fromDate: new Date("2026-05-01T00:00:00.000Z"),
  });

  assert.equal(plan.action, "update");
  assert.equal(plan.correctedDate.toISOString(), "2026-05-04T06:30:00.000Z");
});

test("buildAttendanceDateBackfillPlan skips already-correct docs", () => {
  const plan = buildAttendanceDateBackfillPlan({
    existingDate: new Date("2026-05-04T06:30:00.000Z"),
    termStart: new Date("2026-04-27T14:00:00.000Z"),
    classDay: "Monday",
    startTime: "16:30",
    weekNumber: 2,
    fromDate: new Date("2026-05-01T00:00:00.000Z"),
  });

  assert.deepEqual(plan, { action: "skip", reason: "already-correct" });
});

test("buildAttendanceDateBackfillPlan skips fully past docs", () => {
  const plan = buildAttendanceDateBackfillPlan({
    existingDate: new Date("2026-04-21T08:00:00.000Z"),
    termStart: new Date("2026-04-20T14:00:00.000Z"),
    classDay: "Tuesday",
    startTime: "18:00",
    weekNumber: 1,
    fromDate: new Date("2026-05-01T00:00:00.000Z"),
  });

  assert.deepEqual(plan, { action: "skip", reason: "past" });
});

test("buildAttendanceDateBackfillPlan skips invalid class schedule data", () => {
  assert.deepEqual(
    buildAttendanceDateBackfillPlan({
      existingDate: new Date("2026-05-05T06:30:00.000Z"),
      termStart: new Date("2026-04-27T14:00:00.000Z"),
      classDay: "Funday",
      startTime: "16:30",
      weekNumber: 2,
      fromDate: new Date("2026-05-01T00:00:00.000Z"),
    }),
    { action: "skip", reason: "invalid-class-day" },
  );

  assert.deepEqual(
    buildAttendanceDateBackfillPlan({
      existingDate: new Date("2026-05-05T06:30:00.000Z"),
      termStart: new Date("2026-04-27T14:00:00.000Z"),
      classDay: "Monday",
      startTime: "25:99",
      weekNumber: 2,
      fromDate: new Date("2026-05-01T00:00:00.000Z"),
    }),
    { action: "skip", reason: "invalid-start-time" },
  );
});
