"use strict";

const { fromDate, now } = require("../shared/timestamps");
const { assertString, assertNumber } = require("../shared/validation");

/**
 * Build the deterministic attendance document ID used by the Flutter app:
 *   `{termId}_W{weekNum}`, e.g. `2026_T2_W3`.
 *
 * Both arguments are required and validated — wrong types here would create
 * orphan attendance docs that the app cannot find.
 */
function makeAttendanceDocId(termId, weekNum) {
  const t = assertString(termId, "termId", { max: 40 });
  const w = assertNumber(weekNum, "weekNum", {
    min: 1,
    max: 53,
    integer: true,
  });
  return `${t}_W${w}`;
}

/**
 * Build an app-compatible `classes/{classId}/attendance/{attendanceId}` doc.
 *
 * Field choices per PLAN.md compatibility notes:
 *  - Writes `weekNum` (not `weekNumber`) so the app's `Attendance` model can
 *    parse it.
 *  - `date` is the session start instant (caller applies class startTime to
 *    the calendar date).
 *  - `attendance` is seeded from the class's `enrolledStudents`.
 *  - `tutors` is copied from the class doc.
 */
function buildAttendanceDoc(input, { actorUid, clock } = {}) {
  if (!input || typeof input !== "object") {
    throw new TypeError("buildAttendanceDoc requires a normalised input object");
  }
  if (!actorUid) {
    throw new TypeError(
      "buildAttendanceDoc requires actorUid for audit metadata"
    );
  }
  if (!(input.date instanceof Date)) {
    throw new TypeError("buildAttendanceDoc requires input.date as Date");
  }
  return {
    date: fromDate(input.date),
    termId: input.termId,
    cancelled: false,
    weekNum: input.weekNum,
    attendance: Array.isArray(input.enrolledStudents)
      ? [...input.enrolledStudents]
      : [],
    tutors: Array.isArray(input.tutors) ? [...input.tutors] : [],
    updatedAt: now(clock),
    updatedBy: actorUid,
  };
}

module.exports = { makeAttendanceDocId, buildAttendanceDoc };
