"use strict";

/**
 * When a class running today stops accepting new bookings.
 *
 * Staffing for the day is settled in the morning, so a booking that arrives
 * mid-afternoon lands after the roster it affects has been decided. From 9am
 * Sydney a class running that same day is closed to new bookings (MOB-48).
 *
 * Deliberately a calendar-day rule rather than a notice period: "book by 9am
 * for today" is one sentence a parent can hold, where "at least six hours
 * before" has to be recomputed per class.
 *
 * Shared so the payment path, the token path and the swap path close at the
 * same moment. Three copies of "is it past 9am" would eventually disagree,
 * and disagreeing means taking money for a booking another path refuses.
 */

const { DateTime } = require("luxon");

const SYDNEY_ZONE = "Australia/Sydney";

/** Sydney hour from which today's classes are closed. */
const SAME_DAY_CUTOFF_HOUR = 9;

/**
 * What to tell a parent who is too late. One wording, so the app, the payment
 * error and the enrolment error do not each invent their own.
 */
const SAME_DAY_CUTOFF_MESSAGE =
  "Bookings for a class running today close at 9am. Please call us if you need a place today.";

/**
 * Whether [sessionStartsAt] is closed to new bookings as at [now].
 *
 * Both are instants; the zone is applied here rather than by the caller, so a
 * caller cannot get the answer wrong by asking in its own timezone. An
 * attendance document's `date` is the session's start instant, which is what
 * this expects.
 *
 * Closed means: the session falls on today's Sydney date, and it is 9am or
 * later in Sydney. A session on any other date is not this rule's business —
 * including one that has already run, which the capacity and
 * already-started checks handle.
 *
 * Unparseable input is treated as open. A missing or malformed attendance
 * date should not silently refuse a booking that would otherwise be fine; the
 * same direction `sessionHasStarted` leans, and the callers that genuinely
 * require the document to exist check that themselves.
 */
function sameDayBookingClosed({
  sessionStartsAt,
  now = new Date(),
  cutoffHour = SAME_DAY_CUTOFF_HOUR,
  zone = SYDNEY_ZONE,
}) {
  const session = toZoned(sessionStartsAt, zone);
  const current = toZoned(now, zone);
  if (!session || !current) return false;

  if (!session.hasSame(current, "day")) return false;

  return current.hour >= cutoffHour;
}

function toZoned(value, zone) {
  const date =
    value instanceof Date
      ? value
      : typeof value?.toDate === "function"
        ? value.toDate()
        : null;
  if (!date || Number.isNaN(date.getTime())) return null;

  const zoned = DateTime.fromJSDate(date, { zone });
  return zoned.isValid ? zoned : null;
}

module.exports = {
  SAME_DAY_CUTOFF_HOUR,
  SAME_DAY_CUTOFF_MESSAGE,
  SYDNEY_ZONE,
  sameDayBookingClosed,
};
