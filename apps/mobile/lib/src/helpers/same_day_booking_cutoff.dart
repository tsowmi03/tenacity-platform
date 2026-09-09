/// When a class running today stops accepting new bookings.
///
/// Staffing for the day is settled in the morning, so from 9am a class running
/// that same day is closed to new bookings (MOB-48). Applies to one-off
/// bookings — by card or by lesson token — and to moving into a class for a
/// single week. It does not apply to admins, who add students to today's
/// classes as the sanctioned way of saying yes to a family who rang up.
///
/// The server enforces the same rule and is the authority. This exists so the
/// option reads as unavailable with a reason, rather than looking bookable and
/// failing after the parent has committed to it.
///
/// **Device time, deliberately.** Like every other date in this app, the
/// comparison is made in the device's timezone rather than Sydney's, so a
/// phone set to another zone will draw the line at its own 9am. That is
/// consistent with the rest of the app rather than a new inconsistency, and
/// MOB-47 — which gives the app real timezone handling — corrects this along
/// with everything else. Until then the server is what makes the rule true:
/// it computes 9am in Sydney and refuses the booking whatever the phone
/// believed.
library;

/// The hour, in the centre's day, from which today's classes are closed.
const int sameDayBookingCutoffHour = 9;

/// The short form, for a class row's subtitle where the full sentence would
/// crowd out the tutor names beside it.
const String sameDayBookingCutoffNote = 'Bookings for today have closed';

/// Shown in place of the option's description once the cutoff has passed.
const String sameDayBookingCutoffHint =
    'Bookings for a class running today close at 9am. Please call us if you '
    'need a place today.';

/// Whether [sessionStartsAt] is closed to new bookings as at [now].
///
/// Closed means the session falls on today's date and it is 9am or later.
/// A session on any other day is not this rule's business, including one that
/// has already run — that is the caller's existing already-started check, and
/// answering `true` here would only confuse the reason shown to the parent.
bool sameDayBookingClosed({
  required DateTime now,
  required DateTime sessionStartsAt,
}) {
  final localNow = now.toLocal();
  final localStart = sessionStartsAt.toLocal();

  final isSameDay = localNow.year == localStart.year &&
      localNow.month == localStart.month &&
      localNow.day == localStart.day;
  if (!isSameDay) return false;

  return localNow.hour >= sameDayBookingCutoffHour;
}
