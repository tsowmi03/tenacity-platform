"use strict";

/**
 * Which of a group of students can take a seat in one session, and which
 * cannot.
 *
 * Split out from the enrolment transaction so the capacity rule can be tested
 * without Firestore, and so the client path, the payment webhook and the
 * reconciliation sweep all decide it the same way. Sharing one rule is what
 * stops a booking being written twice or a session being oversold — not
 * locking.
 */

const ENROLMENT_OUTCOME = Object.freeze({
  /** Not in the session yet, and there is room. */
  ENROL: "enrol",
  /** Already in the session. Not an error, and not chargeable again. */
  ALREADY_ENROLLED: "already_enrolled",
  /** Not in the session, and no room left. */
  NO_CAPACITY: "no_capacity",
});

/**
 * Plan an enrolment.
 *
 * Order matters and is deliberate: students are considered in the order given,
 * so when a session only partly fits a family the same children are chosen
 * every time the plan is recomputed. A sweep retrying a half-finished
 * fulfilment must not enrol a different child than the first attempt did.
 *
 * `capacity` is the session's total, and `currentAttendance` everyone already
 * in it — including students from other families.
 */
function planOneOffEnrolment({ currentAttendance, capacity, studentIds }) {
  const attending = Array.isArray(currentAttendance) ? currentAttendance : [];
  const seats = Number.isFinite(capacity) ? Math.max(capacity, 0) : 0;
  const requested = Array.isArray(studentIds) ? studentIds : [];

  const attendingSet = new Set(attending);
  let seatsLeft = Math.max(seats - attending.length, 0);

  const toEnrol = [];
  const alreadyEnrolled = [];
  const noCapacity = [];

  for (const studentId of requested) {
    if (attendingSet.has(studentId)) {
      alreadyEnrolled.push(studentId);
      continue;
    }
    if (seatsLeft > 0) {
      toEnrol.push(studentId);
      // Claim the seat locally so two students in one request cannot both take
      // the last one.
      attendingSet.add(studentId);
      seatsLeft -= 1;
      continue;
    }
    noCapacity.push(studentId);
  }

  return {
    toEnrol,
    alreadyEnrolled,
    noCapacity,
    /** Nothing to write. The caller can skip the transaction entirely. */
    get isNoOp() {
      return toEnrol.length === 0;
    },
  };
}

/**
 * The outcome for one student, for reporting back to a caller that asked about
 * a single enrolment.
 */
function outcomeFor(plan, studentId) {
  if (plan.toEnrol.includes(studentId)) return ENROLMENT_OUTCOME.ENROL;
  if (plan.alreadyEnrolled.includes(studentId)) {
    return ENROLMENT_OUTCOME.ALREADY_ENROLLED;
  }
  return ENROLMENT_OUTCOME.NO_CAPACITY;
}

module.exports = {
  ENROLMENT_OUTCOME,
  outcomeFor,
  planOneOffEnrolment,
};
