"use strict";

/**
 * Whether a session has been called off, and what to say when somebody tries
 * to book into one.
 *
 * An admin cancelling a week sets `cancelled: true` on that week's attendance
 * document and changes nothing else: the permanent roster stays on it, so
 * restoring the week puts the roll back exactly as it was. What the flag has
 * to stop is new arrivals. The app only refused a cancelled class when its
 * card was tapped, and the one-week swap picker offered it anyway, so a family
 * swapped into a class that was not running (MOB-58).
 *
 * Shared so the swap, the token booking and the payment path refuse the same
 * sessions. The app's checks are a convenience; these are the guard, since a
 * screen opened before the admin cancelled still shows the class as open.
 */

/**
 * What to tell somebody who tries to book a cancelled session. One wording,
 * so the swap, the booking and the payment errors do not each invent their
 * own.
 */
const CANCELLED_SESSION_MESSAGE =
  "This session has been cancelled. Please choose another class.";

/**
 * Whether the attendance document [attendanceData] is a cancelled session.
 *
 * Only an explicit `true` counts, matching how the app reads the flag.
 * Documents written before the flag existed have no field at all, and those
 * sessions are running.
 */
function sessionIsCancelled(attendanceData) {
  return attendanceData?.cancelled === true;
}

module.exports = {
  CANCELLED_SESSION_MESSAGE,
  sessionIsCancelled,
};
