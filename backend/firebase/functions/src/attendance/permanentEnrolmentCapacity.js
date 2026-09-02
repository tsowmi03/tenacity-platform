"use strict";

/**
 * Whether a permanent enrolment may go ahead, and which of a class's future
 * sessions can actually seat the student.
 *
 * Two questions, deliberately answered in one place because they are halves of
 * the same rule and the gap between them is the bug this module exists to
 * close:
 *
 * - Permanent room is about the class. `capacity` against `enrolledStudents`.
 * - Session room is about one week. `capacity` against everyone booked that
 *   week — permanent students and one-off visitors alike.
 *
 * A one-off visitor holds a real seat for one week without ever appearing in
 * `enrolledStudents`. So a class can have a permanent spot free while a
 * particular week has no room at all, and enrolling on the permanent number
 * alone put five students in a room built for four (MOB-38).
 *
 * `oneOffEnrolmentPlan` already answers the session question for one-off
 * bookings. This is the permanent side of the same rule, and the two agree on
 * what a full session means: `attendance.length >= capacity`.
 */

/**
 * Permanent spots left in a class.
 *
 * Never negative. A class can legitimately hold more permanent students than
 * its capacity — an admin may overfill deliberately, and lowering the capacity
 * of a full class does the same thing — and that reads as zero spots left, not
 * as spots owed.
 */
function permanentSpotsRemaining({ capacity, enrolledStudents }) {
  const seats = Number.isFinite(capacity) ? Math.max(capacity, 0) : 0;
  const enrolled = Array.isArray(enrolledStudents) ? enrolledStudents : [];
  return Math.max(seats - enrolled.length, 0);
}

/**
 * Whether one more student can take a permanent spot.
 *
 * A student already on the roster always has room: re-running an enrolment
 * that already happened must not start failing once the class fills up, or a
 * retry turns a completed swap into an error.
 */
function hasPermanentRoom({ capacity, enrolledStudents, studentId }) {
  const enrolled = Array.isArray(enrolledStudents) ? enrolledStudents : [];
  if (studentId && enrolled.includes(studentId)) return true;
  return permanentSpotsRemaining({ capacity, enrolledStudents }) > 0;
}

/**
 * Which future sessions can seat a newly permanent student, and which are
 * already full.
 *
 * `sessions` is every future session of the class, each `{ id, date,
 * attendance }`. Order is preserved so the caller reports skipped weeks in
 * date order rather than Firestore's.
 *
 * A full session is skipped, not bumped. The one-off visitor sitting in that
 * seat paid for it, and taking it back to seat a permanent student who is
 * still enrolling would be the platform reversing a completed sale. The
 * student becomes permanent from the first week with room instead, and the
 * skipped weeks are reported so an admin can be told.
 */
function planPermanentAttendanceSync({ sessions, capacity, studentId }) {
  const seats = Number.isFinite(capacity) ? Math.max(capacity, 0) : 0;
  const all = Array.isArray(sessions) ? sessions : [];

  const toAdd = [];
  const skipped = [];

  for (const session of all) {
    if (!session || typeof session !== "object") continue;
    const attendance = Array.isArray(session.attendance)
      ? session.attendance
      : [];

    // Already in this week's list. Nothing to write, and it cannot be a skip:
    // the seat is theirs already.
    if (studentId && attendance.includes(studentId)) continue;

    if (attendance.length >= seats) {
      skipped.push({ id: session.id, date: session.date ?? null });
      continue;
    }
    toAdd.push(session.id);
  }

  return {
    toAdd,
    skipped,
    /** Nothing to write. The caller can skip the fan-out entirely. */
    get isNoOp() {
      return toAdd.length === 0;
    },
  };
}

module.exports = {
  hasPermanentRoom,
  permanentSpotsRemaining,
  planPermanentAttendanceSync,
};
