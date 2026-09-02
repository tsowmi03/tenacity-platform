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
 * The week number inside an attendance session id.
 *
 * Ids are `{termId}_W{weekNum}` — the same week is the same id in either
 * class, which is what lets a swap line two classes up week by week. Returns
 * null for anything that does not carry a week, so a malformed id is never
 * silently read as week zero.
 */
function weekNumberFromSessionId(sessionId) {
  if (typeof sessionId !== "string") return null;
  const match = /_W(\d+)$/.exec(sessionId);
  if (!match) return null;
  const week = Number(match[1]);
  return Number.isInteger(week) && week > 0 ? week : null;
}

/**
 * The sessions from [startWeek] onward, for a swap the family asked to start
 * later than the next session (MOB-39).
 *
 * Without a start week this is every session, which is the immediate swap
 * every parent got before. A session whose id carries no week number is kept
 * rather than dropped: it cannot be placed relative to the start week, and
 * dropping it would quietly leave the student out of a session they are
 * entitled to.
 */
function sessionsFromWeek({ sessions, startWeek }) {
  const all = Array.isArray(sessions) ? sessions : [];
  if (!Number.isInteger(startWeek) || startWeek <= 1) return all;

  return all.filter(session => {
    const week = weekNumberFromSessionId(session && session.id);
    return week === null || week >= startWeek;
  });
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

/**
 * Which sessions of the class a student is leaving they should stay booked
 * into, because the class they are moving to does not have them that week.
 *
 * Derived here rather than taken from the caller. The unenrol endpoint is
 * reachable by any parent for their own child, and session ids are guessable
 * — `{termId}_W{weekNum}` — so a supplied list would let somebody give up the
 * permanent spot, freeing it for the waitlist, while staying booked into every
 * remaining week. Every condition below is checked against stored data.
 *
 * A session is kept only when all of these hold:
 *
 * - The student is on the destination class's permanent roster, so the move
 *   actually happened rather than being asserted by the caller.
 * - The destination runs that same week. Ids are week-derived, so the same
 *   week is the same id in either class.
 * - The destination's session does not hold the student.
 *
 * That last condition used to read "the destination's session is full". The
 * two agreed while every swap started from the next session, because a full
 * week was the only reason the destination could lack the student. A swap the
 * family asked to start later is a second reason (MOB-39), and asking what the
 * destination actually holds answers both — it is also the safer question,
 * since a week the enrolment failed to write now keeps the student in the
 * class they came from rather than dropping them from both.
 *
 * Keeping a seat cannot overfill the class being left: it is a seat the
 * student already occupied. The freed roster spot stays safe because anyone
 * promoted into it runs through `planPermanentAttendanceSync`, which will not
 * add them to a week that is already full.
 */
function planSwapKeptSessions({
  leavingSessions,
  destinationSessions,
  destinationEnrolledStudents,
  studentId,
}) {
  const roster = Array.isArray(destinationEnrolledStudents)
    ? destinationEnrolledStudents
    : [];
  if (!studentId || !roster.includes(studentId)) return [];

  const leaving = Array.isArray(leavingSessions) ? leavingSessions : [];
  const destinationById = new Map(
    (Array.isArray(destinationSessions) ? destinationSessions : [])
      .filter(session => session && typeof session === "object")
      .map(session => [session.id, session])
  );

  const kept = [];
  for (const session of leaving) {
    if (!session || typeof session !== "object") continue;
    const destination = destinationById.get(session.id);
    if (!destination) continue;

    const destinationAttendance = Array.isArray(destination.attendance)
      ? destination.attendance
      : [];
    if (destinationAttendance.includes(studentId)) continue;

    kept.push(session.id);
  }
  return kept;
}

module.exports = {
  hasPermanentRoom,
  permanentSpotsRemaining,
  planPermanentAttendanceSync,
  planSwapKeptSessions,
  sessionsFromWeek,
  weekNumberFromSessionId,
};
